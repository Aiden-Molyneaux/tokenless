import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { app, shell } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'

import {
  IPC_PATHS_CHECK_DIR,
  IPC_PATHS_GET_APP_PATHS,
  IPC_PATHS_OPEN_FOLDER,
  type PathsCheckDirRequest,
  type PathsCheckDirResult,
  type PathsGetAppPathsResult,
  type PathsOpenFolderRequest,
  type PathsOpenFolderResult
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

  getAppPaths = async (): Promise<PathsGetAppPathsResult> =>
    withIpcResult(this.logger, 'fs', 'paths-get-app-paths', async () => {
      const userData = app.getPath('userData')
      return { userData, logs: join(userData, 'logs'), db: join(userData, 'tokenless.db') }
    })

  openFolder = async (req: PathsOpenFolderRequest): Promise<PathsOpenFolderResult> =>
    withIpcResult(this.logger, 'fs', 'paths-open-folder', async () => {
      const err = await shell.openPath(req.path)
      if (err) {
        const e = new Error(`Could not open path: ${err}`) as Error & { code?: string }
        e.code = 'OPEN_FAILED'
        throw e
      }
      return { ok: true as const }
    })

  install(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_PATHS_CHECK_DIR, async (_e: IpcMainInvokeEvent, req: PathsCheckDirRequest) =>
      this.checkDir(req)
    )
    this.installedHandlers.push(IPC_PATHS_CHECK_DIR)

    ipcMain.handle(IPC_PATHS_GET_APP_PATHS, async () =>
      this.getAppPaths()
    )
    this.installedHandlers.push(IPC_PATHS_GET_APP_PATHS)

    ipcMain.handle(IPC_PATHS_OPEN_FOLDER, async (_e: IpcMainInvokeEvent, req: PathsOpenFolderRequest) =>
      this.openFolder(req)
    )
    this.installedHandlers.push(IPC_PATHS_OPEN_FOLDER)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
