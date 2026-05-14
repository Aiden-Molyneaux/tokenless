// Typed IPC contract surface. Specific channel sets now live under
// src/shared/ipc/*.ts (accounts, projects, conversations, envelope).
// This file remains the place for the original log-bridge channels.

import type { LogRecord } from './observability'

export const IPC_LOG_FROM_RENDERER = 'log:event-from-renderer'
export const IPC_LOG_TO_RENDERER = 'log:event-to-renderer'
export const IPC_LOG_GET_RECENT = 'log:get-recent'

export interface LogFromRendererPayload {
  record: LogRecord
}
export interface LogToRendererPayload {
  record: LogRecord
}
export interface LogGetRecentRequest {
  count?: number
}
export interface LogGetRecentResponse {
  records: readonly LogRecord[]
}

// Re-export new domain channel constants for ergonomic single imports.
export {
  IPC_ACCOUNTS_LIST,
  IPC_ACCOUNTS_CREATE,
  IPC_ACCOUNTS_CHANGED,
  type AccountsListResult,
  type AccountsCreateResult,
  type AccountsListResponse,
  type AccountsCreateRequest,
  type AccountsCreateResponse
} from './ipc/accounts'

export {
  IPC_PROJECTS_LIST,
  IPC_PROJECTS_CREATE,
  IPC_PROJECTS_UPDATE,
  IPC_PROJECTS_DELETE,
  IPC_PROJECTS_CHANGED,
  type ProjectsListResult,
  type ProjectsCreateResult,
  type ProjectsUpdateResult,
  type ProjectsDeleteResult,
  type ProjectsListResponse,
  type ProjectsCreateRequest,
  type ProjectsCreateResponse,
  type ProjectsUpdateRequest,
  type ProjectsUpdateResponse,
  type ProjectsDeleteRequest,
  type ProjectsDeleteResponse
} from './ipc/projects'

export {
  IPC_CONVERSATIONS_LIST_BY_PROJECT,
  IPC_CONVERSATIONS_CREATE,
  IPC_CONVERSATIONS_UPDATE,
  IPC_CONVERSATIONS_DELETE,
  IPC_CONVERSATIONS_CHANGED,
  type ConversationsListResult,
  type ConversationsCreateResult,
  type ConversationsUpdateResult,
  type ConversationsDeleteResult,
  type ConversationsListRequest,
  type ConversationsListResponse,
  type ConversationsCreateRequest,
  type ConversationsCreateResponse,
  type ConversationsUpdateRequest,
  type ConversationsUpdateResponse,
  type ConversationsDeleteRequest,
  type ConversationsDeleteResponse
} from './ipc/conversations'

export {
  IPC_CC_START,
  IPC_CC_SEND,
  IPC_CC_RESIZE,
  IPC_CC_OUTPUT_CHUNK,
  IPC_CC_EXIT,
  IPC_CC_EVENT,
  IPC_CC_STOP,
  IPC_CC_RESUME,
  IPC_CC_CRASHED,
  IPC_CC_HUNG,
  type CcStartRequest,
  type CcStartResponse,
  type CcStartResult,
  type CcSendRequest,
  type CcSendResponse,
  type CcSendResult,
  type CcResizeRequest,
  type CcResizeResult,
  type CcOutputChunkPayload,
  type CcExitPayload,
  type CcEventPayload,
  type CcStopRequest,
  type CcStopResult,
  type CcResumeRequest,
  type CcResumeResponse,
  type CcResumeResult,
  type CcCrashedPayload,
  type CcHungPayload
} from './ipc/cc'

export type { IpcResult, IpcOk, IpcError } from './ipc/envelope'

export {
  IPC_TELEMETRY_TICK,
  type TelemetryTickPayload,
  type TelemetryTick
} from './ipc/telemetry'

export type IpcChannelName =
  | typeof IPC_LOG_FROM_RENDERER
  | typeof IPC_LOG_TO_RENDERER
  | typeof IPC_LOG_GET_RECENT
  | 'accounts:list'
  | 'accounts:create'
  | 'accounts:changed'
  | 'projects:list'
  | 'projects:create'
  | 'projects:update'
  | 'projects:delete'
  | 'projects:changed'
  | 'conversations:list-by-project'
  | 'conversations:create'
  | 'conversations:update'
  | 'conversations:delete'
  | 'conversations:changed'
  | 'cc:start'
  | 'cc:send'
  | 'cc:resize'
  | 'cc:output-chunk'
  | 'cc:exit'
  | 'cc:event'
  | 'cc:stop'
  | 'cc:resume'
  | 'cc:crashed'
  | 'cc:hung'
  | 'telemetry:tick'
