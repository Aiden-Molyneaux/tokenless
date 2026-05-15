// CcHandler — IPC class for the claude subprocess. start spawns + persists
// cc_session_id; send appends a turn row + writes to PTY stdin; resize
// forwards to the lifecycle. PTY chunks + exits are broadcast via the
// lifecycle's callback into IPC events.

import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Database } from 'better-sqlite3'

import { AccountsDao, ConversationsDao, TurnsDao } from '../db'
import { CcLifecycle } from '../cc/lifecycle'
import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'
import {
  IPC_CC_START,
  IPC_CC_SEND,
  IPC_CC_RESIZE,
  IPC_CC_STOP,
  IPC_CC_RESUME,
  IPC_CC_INPUT,
  type CcStartRequest,
  type CcStartResult,
  type CcSendRequest,
  type CcSendResult,
  type CcResizeRequest,
  type CcResizeResult,
  type CcStopRequest,
  type CcStopResult,
  type CcResumeRequest,
  type CcResumeResult,
  type CcInputRequest,
  type CcInputResult
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
          ...(account.apiKey ? { ANTHROPIC_API_KEY: account.apiKey } : {})
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

      const userTurn = TurnsDao.createUserTurn(this.db, {
        conversationId: req.conversationId,
        originalPrompt: req.prompt,
        modelUsed: req.model,
        gearMeta: req.gearMeta ?? null
      })
      const turnId = userTurn.id

      this.lifecycle.markUserSend(req.conversationId)
      this.lifecycle.write(req.conversationId, req.prompt)

      // Bump conversation updated_at + clear any draft (drafts table is wired
      // in Task 11 — for now we just no-op if the draft doesn't exist).
      this.db.prepare('DELETE FROM drafts WHERE conversation_id = ?').run(req.conversationId)
      this.db
        .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
        .run(Date.now(), req.conversationId)

      return { turnId }
    })

  input = async (req: CcInputRequest): Promise<CcInputResult> =>
    withIpcResult(this.logger, 'cc', 'cc-input', async () => {
      const handle = this.lifecycle.get(req.conversationId)
      if (!handle) {
        const e = new Error(`no active PTY for conversation ${req.conversationId}`) as Error & { code?: string }
        e.code = 'NOT_FOUND'
        throw e
      }
      // Write raw bytes directly to the PTY without appending \r — xterm
      // onData already includes \r when the user presses Enter.
      handle.write(req.data)
      return { ok: true as const }
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

  resume = async (req: CcResumeRequest): Promise<CcResumeResult> =>
    withIpcResult(this.logger, 'cc', 'cc-resume', async () => {
      const account = AccountsDao.getAccountById(this.db, req.accountId)
      if (!account) throw notFound(`account ${req.accountId} not found`)
      const conv = ConversationsDao.getConversationById(this.db, req.conversationId)
      if (!conv) throw notFound(`conversation ${req.conversationId} not found`)
      if (!conv.ccSessionId) {
        throw notFound(`conversation ${req.conversationId} has no stored cc_session_id`)
      }

      try {
        const { sessionId, pid } = this.lifecycle.resume({
          conversationId: req.conversationId,
          sessionId: conv.ccSessionId,
          cwd: req.cwd,
          cols: req.cols,
          rows: req.rows,
          env: {
            CLAUDE_CONFIG_DIR: account.configDir,
            ...(account.apiKey ? { ANTHROPIC_API_KEY: account.apiKey } : {})
          }
        })
        this.logger.info('cc', 'cc-resume', 'Resumed claude subprocess', {
          conversationId: req.conversationId,
          sessionId,
          pid
        })
        return { sessionId, pid }
      } catch (err) {
        if (err instanceof Error && err.message.includes('already active')) {
          const handle = this.lifecycle.get(req.conversationId)
          const existingSessionId = this.lifecycle.getSessionId(req.conversationId)
          if (handle && existingSessionId) {
            return { sessionId: existingSessionId, pid: handle.pid }
          }
        }
        throw err
      }
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
    ipcMain.handle(IPC_CC_RESUME, async (_e: IpcMainInvokeEvent, req: CcResumeRequest) =>
      this.resume(req)
    )
    this.installedHandlers.push(IPC_CC_RESUME)
    ipcMain.handle(IPC_CC_INPUT, async (_e: IpcMainInvokeEvent, req: CcInputRequest) =>
      this.input(req)
    )
    this.installedHandlers.push(IPC_CC_INPUT)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
