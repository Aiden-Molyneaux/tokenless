// Single registration point for all IPC handlers. The DB-backed handlers
// receive the live Database connection from main/index.ts.

import type { IpcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import type { Logger } from '@main/observability'

import { LogBridge, type Broadcast } from './log-bridge'
import { AccountsHandler } from './accounts-handler'
import { ProjectsHandler } from './projects-handler'
import { ConversationsHandler } from './conversations-handler'

export interface IpcRegistration {
  logBridge: LogBridge
  accountsHandler: AccountsHandler
  projectsHandler: ProjectsHandler
  conversationsHandler: ConversationsHandler
  uninstallAll: () => void
}

export function registerIpcHandlers(
  ipcMain: IpcMain,
  logger: Logger,
  broadcast: Broadcast,
  db: Database
): IpcRegistration {
  const logBridge = new LogBridge(logger, ipcMain, broadcast)
  logBridge.install()

  const accountsHandler = new AccountsHandler(db, logger, broadcast)
  accountsHandler.install(ipcMain)

  const projectsHandler = new ProjectsHandler(db, logger, broadcast)
  projectsHandler.install(ipcMain)

  const conversationsHandler = new ConversationsHandler(db, logger, broadcast)
  conversationsHandler.install(ipcMain)

  return {
    logBridge,
    accountsHandler,
    projectsHandler,
    conversationsHandler,
    uninstallAll: () => {
      logBridge.uninstall()
      accountsHandler.uninstall(ipcMain)
      projectsHandler.uninstall(ipcMain)
      conversationsHandler.uninstall(ipcMain)
    }
  }
}
