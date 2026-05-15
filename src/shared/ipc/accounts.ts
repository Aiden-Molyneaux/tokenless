// IPC channels for accounts CRUD.

import type { Account, CreateAccountInput, UpdateAccountInput } from '../types/accounts'
import type { IpcResult } from './envelope'

export const IPC_ACCOUNTS_LIST = 'accounts:list'
export const IPC_ACCOUNTS_CREATE = 'accounts:create'
export const IPC_ACCOUNTS_CHANGED = 'accounts:changed'

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

export const IPC_ACCOUNTS_UPDATE = 'accounts:update'
export const IPC_ACCOUNTS_DELETE = 'accounts:delete'

export interface AccountsUpdateRequest {
  readonly input: UpdateAccountInput
}
export interface AccountsUpdateResponse {
  readonly account: Account
}
export interface AccountsDeleteRequest {
  readonly id: number
}
export interface AccountsDeleteResponse {
  readonly id: number
}

export type AccountsUpdateResult = IpcResult<AccountsUpdateResponse>
export type AccountsDeleteResult = IpcResult<AccountsDeleteResponse>
