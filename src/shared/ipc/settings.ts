import type { IpcResult } from './envelope'

export const IPC_SETTINGS_GET = 'settings:get'
export const IPC_SETTINGS_SET = 'settings:set'

export interface SettingsGetRequest { readonly key: string }
export interface SettingsGetResponse { readonly value: string | null }
export interface SettingsSetRequest { readonly key: string; readonly value: string }
export interface SettingsSetResponse { readonly ok: true }

export type SettingsGetResult = IpcResult<SettingsGetResponse>
export type SettingsSetResult = IpcResult<SettingsSetResponse>
