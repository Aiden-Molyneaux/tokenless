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
  IPC_ACCOUNTS_UPDATE,
  IPC_ACCOUNTS_DELETE,
  IPC_ACCOUNTS_CHANGED,
  type AccountsListResult,
  type AccountsCreateResult,
  type AccountsUpdateResult,
  type AccountsDeleteResult,
  type AccountsListResponse,
  type AccountsCreateRequest,
  type AccountsCreateResponse,
  type AccountsUpdateRequest,
  type AccountsUpdateResponse,
  type AccountsDeleteRequest,
  type AccountsDeleteResponse
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
  IPC_CONVERSATIONS_BRANCH,
  type ConversationsListResult,
  type ConversationsCreateResult,
  type ConversationsUpdateResult,
  type ConversationsDeleteResult,
  type ConversationsBranchResult,
  type ConversationsListRequest,
  type ConversationsListResponse,
  type ConversationsCreateRequest,
  type ConversationsCreateResponse,
  type ConversationsUpdateRequest,
  type ConversationsUpdateResponse,
  type ConversationsDeleteRequest,
  type ConversationsDeleteResponse,
  type ConversationsBranchRequest,
  type ConversationsBranchResponse
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

export {
  IPC_TELEMETRY_GET_SUMMARY,
  type TelemetryGetSummaryRequest,
  type TelemetryGetSummaryResponse,
  type TelemetryGetSummaryResult
} from './ipc/telemetry-summary'

export {
  IPC_GEARING_GEAR,
  type GearingGearRequest,
  type GearingGearResult
} from './ipc/gearing'

export {
  IPC_API_RETRY_ATTEMPT,
  type ApiRetryAttemptPayload
} from './ipc/api-events'

export {
  IPC_DRAFTS_SAVE,
  IPC_DRAFTS_GET,
  IPC_DRAFTS_CLEAR,
  type DraftsSaveRequest,
  type DraftsSaveResponse,
  type DraftsSaveResult,
  type DraftsGetRequest,
  type DraftsGetResponse,
  type DraftsGetResult,
  type DraftsClearRequest,
  type DraftsClearResponse,
  type DraftsClearResult
} from './ipc/drafts'

export {
  IPC_SETTINGS_GET,
  IPC_SETTINGS_SET,
  type SettingsGetRequest,
  type SettingsGetResponse,
  type SettingsGetResult,
  type SettingsSetRequest,
  type SettingsSetResponse,
  type SettingsSetResult
} from './ipc/settings'

export {
  IPC_PATHS_CHECK_DIR,
  type PathsCheckDirRequest,
  type PathsCheckDirResponse,
  type PathsCheckDirResult
} from './ipc/paths'

export {
  IPC_SKILLS_LIST,
  IPC_SKILLS_TOGGLE_FAVORITE,
  IPC_SKILLS_TOGGLE_HIDDEN,
  IPC_SKILLS_RESCAN,
  IPC_SKILLS_CHANGED,
  type SkillsListResult,
  type SkillsListResponse,
  type SkillsToggleFavoriteRequest,
  type SkillsToggleFavoriteResult,
  type SkillsToggleFavoriteResponse,
  type SkillsToggleHiddenRequest,
  type SkillsToggleHiddenResult,
  type SkillsToggleHiddenResponse,
  type SkillsRescanResult,
  type SkillsRescanResponse
} from './ipc/skills'

export {
  IPC_TURNS_LIST_BY_CONVERSATION,
  IPC_TURNS_UPDATE_FEEDBACK,
  IPC_TURNS_FEEDBACK_SUMMARY,
  IPC_TURNS_CHANGED,
  type TurnsListRequest,
  type TurnsListResponse,
  type TurnsListResult,
  type TurnsUpdateFeedbackRequest,
  type TurnsUpdateFeedbackResponse,
  type TurnsUpdateFeedbackResult,
  type TurnsFeedbackSummaryResponse,
  type TurnsFeedbackSummaryResult
} from './ipc/turns'

export {
  IPC_TEMPLATES_LIST,
  IPC_TEMPLATES_CREATE,
  IPC_TEMPLATES_UPDATE,
  IPC_TEMPLATES_DELETE,
  IPC_TEMPLATES_CHANGED,
  type TemplatesListResult,
  type TemplatesListResponse,
  type TemplatesCreateRequest,
  type TemplatesCreateResponse,
  type TemplatesCreateResult,
  type TemplatesUpdateRequest,
  type TemplatesUpdateResponse,
  type TemplatesUpdateResult,
  type TemplatesDeleteRequest,
  type TemplatesDeleteResponse,
  type TemplatesDeleteResult
} from './ipc/templates'

export type IpcChannelName =
  | typeof IPC_LOG_FROM_RENDERER
  | typeof IPC_LOG_TO_RENDERER
  | typeof IPC_LOG_GET_RECENT
  | 'accounts:list'
  | 'accounts:create'
  | 'accounts:update'
  | 'accounts:delete'
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
  | 'conversations:branch'
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
  | 'telemetry:get-summary'
  | 'gearing:gear'
  | 'api:retry-attempt'
  | 'drafts:save'
  | 'drafts:get'
  | 'drafts:clear'
  | 'settings:get'
  | 'settings:set'
  | 'paths:check-dir'
  | 'skills:list'
  | 'skills:toggle-favorite'
  | 'skills:toggle-hidden'
  | 'skills:rescan'
  | 'skills:changed'
  | 'templates:list'
  | 'templates:create'
  | 'templates:update'
  | 'templates:delete'
  | 'templates:changed'
  | 'turns:list-by-conversation'
  | 'turns:update-feedback'
  | 'turns:feedback-summary'
  | 'turns:changed'
