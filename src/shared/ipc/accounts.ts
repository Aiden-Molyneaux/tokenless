// IPC channels for accounts CRUD.

import type { Account, CreateAccountInput } from '../types/accounts'
import type { IpcResult } from './envelope'

export const IPC_ACCOUNTS_LIST = 'accounts:list'
export const IPC_ACCOUNTS_CREATE = 'accounts:create'

export interface AccountsListResponse {
  readonly accounts: readonly Account[]
}

export interface AccountsCreateRequest {
  readonly input: CreateAccountInput
}

export interface AccountsCreateResponse {
  readonly account: Account
}

export type AccountsListResult = IpcResult<AccountsListResponse>
export type AccountsCreateResult = IpcResult<AccountsCreateResponse>
