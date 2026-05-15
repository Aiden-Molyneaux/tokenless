import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { existsSync, statSync } from 'node:fs'

import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'

import {
  IPC_PATHS_CHECK_DIR,
  type PathsCheckDirRequest,
  type PathsCheckDirResult
} from '@shared/ipc/paths'

export class PathsHandler {
  private installedHandlers: string[] = []

  constructor(private readonly logger: Logger) {}

  checkDir = async (req: PathsCheckDirRequest): Promise<PathsCheckDirResult> =>
    withIpcResult(this.logger, 'fs', 'paths-check-dir', async () => {
      if (!existsSync(req.path)) return { exists: false, isDirectory: false }
      try {
        const s = statSync(req.path)
        return { exists: true, isDirectory: s.isDirectory() }
      } catch {
        return { exists: false, isDirectory: false }
      }
    })

  install(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_PATHS_CHECK_DIR, async (_e: IpcMainInvokeEvent, req: PathsCheckDirRequest) =>
      this.checkDir(req)
    )
    this.installedHandlers.push(IPC_PATHS_CHECK_DIR)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
