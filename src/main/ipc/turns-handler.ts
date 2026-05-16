import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Database } from 'better-sqlite3'

import { TurnsDao } from '../db'
import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'

import {
  IPC_TURNS_LIST_BY_CONVERSATION,
  type TurnsListRequest,
  type TurnsListResult
} from '@shared/ipc/turns'

export class TurnsHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly db: Database,
    private readonly logger: Logger
  ) {}

  listByConversation = async (req: TurnsListRequest): Promise<TurnsListResult> =>
    withIpcResult(this.logger, 'db', 'turn-list-by-conversation', async () => ({
      turns: TurnsDao.listByConversation(this.db, req.conversationId)
    }))

  install(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_TURNS_LIST_BY_CONVERSATION, async (_e: IpcMainInvokeEvent, req: TurnsListRequest) =>
      this.listByConversation(req)
    )
    this.installedHandlers.push(IPC_TURNS_LIST_BY_CONVERSATION)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
