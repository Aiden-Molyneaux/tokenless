import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Database } from 'better-sqlite3'

import { SettingsDao } from '../db'
import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'

import {
  IPC_SETTINGS_GET,
  IPC_SETTINGS_SET,
  type SettingsGetRequest,
  type SettingsGetResult,
  type SettingsSetRequest,
  type SettingsSetResult
} from '@shared/ipc/settings'

export class SettingsHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly db: Database,
    private readonly logger: Logger
  ) {}

  get = async (req: SettingsGetRequest): Promise<SettingsGetResult> =>
    withIpcResult(this.logger, 'db', 'settings-get', async () => {
      return { value: SettingsDao.getSetting(this.db, req.key) }
    })

  set = async (req: SettingsSetRequest): Promise<SettingsSetResult> =>
    withIpcResult(this.logger, 'db', 'settings-set', async () => {
      SettingsDao.setSetting(this.db, req.key, req.value)
      return { ok: true as const }
    })

  install(ipcMain: IpcMain): void {
    const wrap = <Req, Res>(channel: string, fn: (req: Req) => Promise<Res>): void => {
      ipcMain.handle(channel, async (_e: IpcMainInvokeEvent, req: Req) => fn(req))
      this.installedHandlers.push(channel)
    }
    wrap<SettingsGetRequest, SettingsGetResult>(IPC_SETTINGS_GET, this.get)
    wrap<SettingsSetRequest, SettingsSetResult>(IPC_SETTINGS_SET, this.set)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
