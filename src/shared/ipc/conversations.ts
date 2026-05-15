// IPC channels for conversations CRUD.

import type {
  Conversation,
  CreateConversationInput,
  UpdateConversationInput
} from '../types/conversations'
import type { IpcResult } from './envelope'

export const IPC_CONVERSATIONS_LIST_BY_PROJECT = 'conversations:list-by-project'
export const IPC_CONVERSATIONS_CREATE = 'conversations:create'
export const IPC_CONVERSATIONS_UPDATE = 'conversations:update'
export const IPC_CONVERSATIONS_DELETE = 'conversations:delete'
export const IPC_CONVERSATIONS_CHANGED = 'conversations:changed' // broadcast

export interface ConversationsListRequest {
  readonly projectId: number
}
export interface ConversationsListResponse {
  readonly conversations: readonly Conversation[]
}
export interface ConversationsCreateRequest {
  readonly input: CreateConversationInput
}
export interface ConversationsCreateResponse {
  readonly conversation: Conversation
}
export interface ConversationsUpdateRequest {
  readonly input: UpdateConversationInput
}
export interface ConversationsUpdateResponse {
  readonly conversation: Conversation
}
export interface ConversationsDeleteRequest {
  readonly id: number
}
export interface ConversationsDeleteResponse {
  readonly id: number
}

export type ConversationsListResult = IpcResult<ConversationsListResponse>
export type ConversationsCreateResult = IpcResult<ConversationsCreateResponse>
export type ConversationsUpdateResult = IpcResult<ConversationsUpdateResponse>
export type ConversationsDeleteResult = IpcResult<ConversationsDeleteResponse>

export const IPC_CONVERSATIONS_BRANCH = 'conversations:branch'

export interface ConversationsBranchRequest {
  readonly parentConversationId: number
}
export interface ConversationsBranchResponse {
  readonly conversation: Conversation
}

export type ConversationsBranchResult = IpcResult<ConversationsBranchResponse>
