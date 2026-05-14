// CcHandler — IPC class for the claude subprocess. start spawns + persists
// cc_session_id; send appends a turn row + writes to PTY stdin; resize
// forwards to the lifecycle. PTY chunks + exits are broadcast via the
// lifecycle's callback into IPC events.

import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Database } from 'better-sqlite3'

import { AccountsDao, ConversationsDao } from '../db'
import { CcLifecycle } from '../cc/lifecycle'
import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'
import {
  IPC_CC_START,
  IPC_CC_SEND,
  IPC_CC_RESIZE,
  IPC_CC_STOP,
  type CcStartRequest,
  type CcStartResult,
  type CcSendRequest,
  type CcSendResult,
  type CcResizeRequest,
  type CcResizeResult,
  type CcStopRequest,
  type CcStopResult
} from '@shared/ipc/cc'

interface NotFoundError extends Error {
  code?: string
}

function notFound(message: string): NotFoundError {
  const e = new Error(message) as NotFoundError
  e.code = 'NOT_FOUND'
  return e
}

export class CcHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
    private readonly lifecycle: CcLifecycle
  ) {}

  start = async (req: CcStartRequest): Promise<CcStartResult> =>
    withIpcResult(this.logger, 'cc', 'cc-start', async () => {
      const account = AccountsDao.getAccountById(this.db, req.accountId)
      if (!account) throw notFound(`account ${req.accountId} not found`)
      const conv = ConversationsDao.getConversationById(this.db, req.conversationId)
      if (!conv) throw notFound(`conversation ${req.conversationId} not found`)

      const { sessionId, pid } = this.lifecycle.start({
        conversationId: req.conversationId,
        cwd: req.cwd,
        cols: req.cols,
        rows: req.rows,
        env: {
          CLAUDE_CONFIG_DIR: account.configDir,
          ...(account.apiKeyRef ? { ANTHROPIC_API_KEY: account.apiKeyRef } : {})
        }
      })

      ConversationsDao.updateConversation(this.db, {
        id: req.conversationId,
        ccSessionId: sessionId
      })

      this.logger.info('cc', 'cc-start', 'claude subprocess started', {
        conversationId: req.conversationId,
        sessionId,
        pid
      })

      return { sessionId, pid }
    })

  send = async (req: CcSendRequest): Promise<CcSendResult> =>
    withIpcResult(this.logger, 'cc', 'cc-send', async () => {
      const handle = this.lifecycle.get(req.conversationId)
      if (!handle) throw notFound(`no active PTY for conversation ${req.conversationId}`)

      const now = Date.now()
      const result = this.db
        .prepare(
          `INSERT INTO turns (
            conversation_id, role, original_prompt, model_used, status, sent_at
          ) VALUES (?, 'user', ?, ?, 'complete', ?)`
        )
        .run(req.conversationId, req.prompt, req.model, now)
      const turnId = Number(result.lastInsertRowid)

      this.lifecycle.write(req.conversationId, req.prompt)

      // Bump conversation updated_at + clear any draft (drafts table is wired
      // in Task 11 — for now we just no-op if the draft doesn't exist).
      this.db.prepare('DELETE FROM drafts WHERE conversation_id = ?').run(req.conversationId)
      this.db
        .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
        .run(now, req.conversationId)

      return { turnId }
    })

  resize = async (req: CcResizeRequest): Promise<CcResizeResult> =>
    withIpcResult(this.logger, 'cc', 'cc-resize', async () => {
      this.lifecycle.resize(req.conversationId, req.cols, req.rows)
      return { ok: true }
    })

  stop = async (req: CcStopRequest): Promise<CcStopResult> =>
    withIpcResult(this.logger, 'cc', 'cc-stop', async () => {
      const handle = this.lifecycle.get(req.conversationId)
      if (!handle) {
        // Idempotent: unknown/dead conversationId is a no-op.
        return { ok: true as const }
      }
      this.lifecycle.stop(req.conversationId, 'SIGINT')
      this.db
        .prepare(
          `UPDATE turns SET status = 'stopped' WHERE id = (
            SELECT id FROM turns
            WHERE conversation_id = ?
            ORDER BY id DESC
            LIMIT 1
          )`
        )
        .run(req.conversationId)
      this.logger.info('cc', 'cc-stop', 'claude subprocess stopped', {
        conversationId: req.conversationId
      })
      return { ok: true as const }
    })

  install(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_CC_START, async (_e: IpcMainInvokeEvent, req: CcStartRequest) =>
      this.start(req)
    )
    this.installedHandlers.push(IPC_CC_START)
    ipcMain.handle(IPC_CC_SEND, async (_e: IpcMainInvokeEvent, req: CcSendRequest) =>
      this.send(req)
    )
    this.installedHandlers.push(IPC_CC_SEND)
    ipcMain.handle(IPC_CC_RESIZE, async (_e: IpcMainInvokeEvent, req: CcResizeRequest) =>
      this.resize(req)
    )
    this.installedHandlers.push(IPC_CC_RESIZE)
    ipcMain.handle(IPC_CC_STOP, async (_e: IpcMainInvokeEvent, req: CcStopRequest) =>
      this.stop(req)
    )
    this.installedHandlers.push(IPC_CC_STOP)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
