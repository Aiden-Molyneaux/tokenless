// Single registration point for all IPC handlers. The DB-backed handlers
// receive the live Database connection from main/index.ts.

import type { IpcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import type { Logger } from '@main/observability'
import * as pty from 'node-pty'

import { LogBridge, type Broadcast } from './log-bridge'
import { AccountsHandler } from './accounts-handler'
import { ProjectsHandler } from './projects-handler'
import { ConversationsHandler } from './conversations-handler'
import { CcHandler } from './cc-handler'
import { CcLifecycle } from '@main/cc'
import type { PtySpawnFn, PtyHandle } from '@main/cc'

export interface IpcRegistration {
  logBridge: LogBridge
  accountsHandler: AccountsHandler
  projectsHandler: ProjectsHandler
  conversationsHandler: ConversationsHandler
  ccHandler: CcHandler
  ccLifecycle: CcLifecycle
  uninstallAll: () => void
}

// Production PtySpawnFn — adapter from our PtyHandle shape to node-pty's IPty.
// node-pty's IPty is structurally compatible; we just type-narrow.
const productionPtyFactory: PtySpawnFn = (binary, args, opts) =>
  pty.spawn(binary, args.slice(), opts) as PtyHandle

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

  const ccLifecycle = new CcLifecycle(productionPtyFactory, {
    onChunk: (e) => broadcast('cc:output-chunk', e),
    onExit: (e) => broadcast('cc:exit', e),
    onEvent: (_e) => { /* cc:event broadcast wired in Task 6 */ }
  })
  const ccHandler = new CcHandler(db, logger, ccLifecycle)
  ccHandler.install(ipcMain)

  return {
    logBridge,
    accountsHandler,
    projectsHandler,
    conversationsHandler,
    ccHandler,
    ccLifecycle,
    uninstallAll: () => {
      logBridge.uninstall()
      accountsHandler.uninstall(ipcMain)
      projectsHandler.uninstall(ipcMain)
      conversationsHandler.uninstall(ipcMain)
      ccHandler.uninstall(ipcMain)
      ccLifecycle.closeAll()
    }
  }
}
