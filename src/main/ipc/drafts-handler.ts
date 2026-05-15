import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Database } from 'better-sqlite3'

import { DraftsDao } from '../db'
import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'

import {
  IPC_DRAFTS_SAVE,
  IPC_DRAFTS_GET,
  IPC_DRAFTS_CLEAR,
  type DraftsSaveRequest,
  type DraftsSaveResult,
  type DraftsGetRequest,
  type DraftsGetResult,
  type DraftsClearRequest,
  type DraftsClearResult
} from '@shared/ipc/drafts'

export class DraftsHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly db: Database,
    private readonly logger: Logger
  ) {}

  save = async (req: DraftsSaveRequest): Promise<DraftsSaveResult> =>
    withIpcResult(this.logger, 'db', 'drafts-save', async () => {
      const draft = DraftsDao.upsertDraft(this.db, req.conversationId, req.body)
      return { draft }
    })

  get = async (req: DraftsGetRequest): Promise<DraftsGetResult> =>
    withIpcResult(this.logger, 'db', 'drafts-get', async () => {
      const draft = DraftsDao.getDraft(this.db, req.conversationId)
      return { draft }
    })

  clear = async (req: DraftsClearRequest): Promise<DraftsClearResult> =>
    withIpcResult(this.logger, 'db', 'drafts-clear', async () => {
      const cleared = DraftsDao.clearDraft(this.db, req.conversationId)
      return { cleared }
    })

  install(ipcMain: IpcMain): void {
    const wrap = <Req, Res>(channel: string, fn: (req: Req) => Promise<Res>): void => {
      ipcMain.handle(channel, async (_e: IpcMainInvokeEvent, req: Req) => fn(req))
      this.installedHandlers.push(channel)
    }
    wrap<DraftsSaveRequest, DraftsSaveResult>(IPC_DRAFTS_SAVE, this.save)
    wrap<DraftsGetRequest, DraftsGetResult>(IPC_DRAFTS_GET, this.get)
    wrap<DraftsClearRequest, DraftsClearResult>(IPC_DRAFTS_CLEAR, this.clear)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
