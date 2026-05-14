// Single registration point for all IPC handlers.
// Phase 1B: just the log bridge.
// Subsequent phases extend this to register cc, gearing, projects, etc.

import type { IpcMain } from 'electron'
import type { Logger } from '@main/observability'
import { LogBridge, type Broadcast } from './log-bridge'

export interface IpcRegistration {
  logBridge: LogBridge
  uninstallAll: () => void
}

export function registerIpcHandlers(
  ipcMain: IpcMain,
  logger: Logger,
  broadcast: Broadcast
): IpcRegistration {
  const logBridge = new LogBridge(logger, ipcMain, broadcast)
  logBridge.install()

  return {
    logBridge,
    uninstallAll: () => {
      logBridge.uninstall()
    }
  }
}
