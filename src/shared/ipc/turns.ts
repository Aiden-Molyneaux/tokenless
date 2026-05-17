import type { Turn } from '../types/turns'
import type { IpcResult } from './envelope'

export const IPC_TURNS_LIST_BY_CONVERSATION = 'turns:list-by-conversation'
export const IPC_TURNS_CHANGED = 'turns:changed'

export interface TurnsListRequest {
  readonly conversationId: number
}
export interface TurnsListResponse {
  readonly turns: readonly Turn[]
}

export type TurnsListResult = IpcResult<TurnsListResponse>
