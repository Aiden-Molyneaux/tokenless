// AccountsHandler — wraps AccountsDao with withIpcResult and converts
// throws into IpcResult envelopes.
//
// Phase 3 only needs list (for the AccountSwitcher dropdown source) and
// create (for the onboarding skeleton). Full Account CRUD lands in Phase 6.

import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Database } from 'better-sqlite3'

import { AccountsDao } from '../db'
import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'
import {
  IPC_ACCOUNTS_LIST,
  IPC_ACCOUNTS_CREATE,
  IPC_ACCOUNTS_CHANGED,
  type AccountsCreateRequest,
  type AccountsListResult,
  type AccountsCreateResult
} from '@shared/ipc/accounts'

export type Broadcast = (channel: string, payload: unknown) => void

export class AccountsHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
    private readonly broadcast: Broadcast
  ) {}

  list = async (): Promise<AccountsListResult> =>
    withIpcResult(this.logger, 'db', 'accounts-list', async () => ({
      accounts: AccountsDao.listAccounts(this.db)
    }))

  create = async (req: AccountsCreateRequest): Promise<AccountsCreateResult> =>
    withIpcResult(this.logger, 'db', 'accounts-create', async () => {
      const account = AccountsDao.createAccount(this.db, req.input)
      this.broadcast(IPC_ACCOUNTS_CHANGED, undefined)
      return { account }
    })

  install(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_ACCOUNTS_LIST, () => this.list())
    this.installedHandlers.push(IPC_ACCOUNTS_LIST)
    ipcMain.handle(IPC_ACCOUNTS_CREATE, async (_e: IpcMainInvokeEvent, req: AccountsCreateRequest) =>
      this.create(req)
    )
    this.installedHandlers.push(IPC_ACCOUNTS_CREATE)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
