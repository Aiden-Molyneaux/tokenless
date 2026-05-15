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
import { AnthropicClientRegistry } from '@main/api'
import {
  IPC_ACCOUNTS_LIST,
  IPC_ACCOUNTS_CREATE,
  IPC_ACCOUNTS_UPDATE,
  IPC_ACCOUNTS_DELETE,
  IPC_ACCOUNTS_CHANGED,
  type AccountsCreateRequest,
  type AccountsUpdateRequest,
  type AccountsDeleteRequest,
  type AccountsListResult,
  type AccountsCreateResult,
  type AccountsUpdateResult,
  type AccountsDeleteResult
} from '@shared/ipc/accounts'

export type Broadcast = (channel: string, payload: unknown) => void

export class AccountsHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
    private readonly broadcast: Broadcast,
    private readonly clientRegistry: AnthropicClientRegistry
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

  update = async (req: AccountsUpdateRequest): Promise<AccountsUpdateResult> =>
    withIpcResult(this.logger, 'db', 'accounts-update', async () => {
      const account = AccountsDao.updateAccount(this.db, req.input)
      if (!account) {
        const e = new Error('Account not found') as Error & { code?: string }
        e.code = 'NOT_FOUND'
        throw e
      }
      this.clientRegistry.invalidate(account.id)
      this.broadcast(IPC_ACCOUNTS_CHANGED, undefined)
      return { account }
    })

  delete = async (req: AccountsDeleteRequest): Promise<AccountsDeleteResult> =>
    withIpcResult(this.logger, 'db', 'accounts-delete', async () => {
      const removed = AccountsDao.deleteAccount(this.db, req.id)
      if (!removed) {
        const e = new Error('Account not found') as Error & { code?: string }
        e.code = 'NOT_FOUND'
        throw e
      }
      this.clientRegistry.invalidate(req.id)
      this.broadcast(IPC_ACCOUNTS_CHANGED, undefined)
      return { id: req.id }
    })

  install(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_ACCOUNTS_LIST, () => this.list())
    this.installedHandlers.push(IPC_ACCOUNTS_LIST)
    ipcMain.handle(IPC_ACCOUNTS_CREATE, async (_e: IpcMainInvokeEvent, req: AccountsCreateRequest) =>
      this.create(req)
    )
    this.installedHandlers.push(IPC_ACCOUNTS_CREATE)
    ipcMain.handle(IPC_ACCOUNTS_UPDATE, async (_e: IpcMainInvokeEvent, req: AccountsUpdateRequest) =>
      this.update(req)
    )
    this.installedHandlers.push(IPC_ACCOUNTS_UPDATE)
    ipcMain.handle(IPC_ACCOUNTS_DELETE, async (_e: IpcMainInvokeEvent, req: AccountsDeleteRequest) =>
      this.delete(req)
    )
    this.installedHandlers.push(IPC_ACCOUNTS_DELETE)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
