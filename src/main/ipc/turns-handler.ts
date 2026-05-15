import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Database } from 'better-sqlite3'

import { TurnsDao } from '../db'
import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'
import type { Broadcast } from './log-bridge'

import {
  IPC_TURNS_LIST_BY_CONVERSATION,
  IPC_TURNS_UPDATE_FEEDBACK,
  IPC_TURNS_FEEDBACK_SUMMARY,
  IPC_TURNS_CHANGED,
  type TurnsListRequest,
  type TurnsListResult,
  type TurnsUpdateFeedbackRequest,
  type TurnsUpdateFeedbackResult,
  type TurnsFeedbackSummaryResult
} from '@shared/ipc/turns'

export class TurnsHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
    private readonly broadcast: Broadcast
  ) {}

  listByConversation = async (req: TurnsListRequest): Promise<TurnsListResult> =>
    withIpcResult(this.logger, 'db', 'turn-list-by-conversation', async () => ({
      turns: TurnsDao.listByConversation(this.db, req.conversationId)
    }))

  updateFeedback = async (req: TurnsUpdateFeedbackRequest): Promise<TurnsUpdateFeedbackResult> =>
    withIpcResult(this.logger, 'db', 'turn-update-feedback', async () => {
      const ok = TurnsDao.updateFeedback(this.db, req.id, req.feedback)
      if (!ok) {
        const e = new Error('Turn not found or not an assistant turn') as Error & { code?: string }
        e.code = 'NOT_FOUND'
        throw e
      }
      this.broadcast(IPC_TURNS_CHANGED, undefined)
      return { id: req.id, feedback: req.feedback }
    })

  getFeedbackSummary = async (): Promise<TurnsFeedbackSummaryResult> =>
    withIpcResult(this.logger, 'db', 'turn-feedback-summary', async () => ({
      summary: TurnsDao.getFeedbackSummary(this.db)
    }))

  install(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_TURNS_LIST_BY_CONVERSATION, async (_e: IpcMainInvokeEvent, req: TurnsListRequest) =>
      this.listByConversation(req)
    )
    this.installedHandlers.push(IPC_TURNS_LIST_BY_CONVERSATION)
    ipcMain.handle(IPC_TURNS_UPDATE_FEEDBACK, async (_e: IpcMainInvokeEvent, req: TurnsUpdateFeedbackRequest) =>
      this.updateFeedback(req)
    )
    this.installedHandlers.push(IPC_TURNS_UPDATE_FEEDBACK)
    ipcMain.handle(IPC_TURNS_FEEDBACK_SUMMARY, () => this.getFeedbackSummary())
    this.installedHandlers.push(IPC_TURNS_FEEDBACK_SUMMARY)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
