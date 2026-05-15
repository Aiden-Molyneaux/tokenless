import type { IpcResult } from './envelope'
import type { Draft } from '../types/drafts'

export const IPC_DRAFTS_SAVE = 'drafts:save'
export const IPC_DRAFTS_GET = 'drafts:get'
export const IPC_DRAFTS_CLEAR = 'drafts:clear'

export interface DraftsSaveRequest {
  readonly conversationId: number
  readonly body: string
}
export interface DraftsSaveResponse {
  readonly draft: Draft
}

export interface DraftsGetRequest {
  readonly conversationId: number
}
export interface DraftsGetResponse {
  readonly draft: Draft | null
}

export interface DraftsClearRequest {
  readonly conversationId: number
}
export interface DraftsClearResponse {
  readonly cleared: boolean
}

export type DraftsSaveResult = IpcResult<DraftsSaveResponse>
export type DraftsGetResult = IpcResult<DraftsGetResponse>
export type DraftsClearResult = IpcResult<DraftsClearResponse>
