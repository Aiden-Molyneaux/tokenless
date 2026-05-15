import type { LogRecord } from '@shared/observability'
import type {
  TelemetryTick,
  GearingGearRequest,
  GearingGearResult,
  ApiRetryAttemptPayload,
  DraftsSaveRequest,
  DraftsSaveResult,
  DraftsGetRequest,
  DraftsGetResult,
  DraftsClearRequest,
  DraftsClearResult,
  SettingsGetRequest,
  SettingsGetResult,
  SettingsSetRequest,
  SettingsSetResult,
  PathsCheckDirRequest,
  PathsCheckDirResult
} from '@shared/ipc'
import type {
  AccountsListResult,
  AccountsCreateRequest,
  AccountsCreateResult,
  AccountsUpdateRequest,
  AccountsUpdateResult,
  AccountsDeleteRequest,
  AccountsDeleteResult,
  ProjectsListResult,
  ProjectsCreateRequest,
  ProjectsCreateResult,
  ProjectsUpdateRequest,
  ProjectsUpdateResult,
  ProjectsDeleteRequest,
  ProjectsDeleteResult,
  ConversationsListRequest,
  ConversationsListResult,
  ConversationsCreateRequest,
  ConversationsCreateResult,
  ConversationsUpdateRequest,
  ConversationsUpdateResult,
  ConversationsDeleteRequest,
  ConversationsDeleteResult,
  CcStartRequest,
  CcStartResult,
  CcSendRequest,
  CcSendResult,
  CcResizeRequest,
  CcResizeResult,
  CcOutputChunkPayload,
  CcExitPayload,
  CcEventPayload,
  CcStopRequest,
  CcStopResult,
  CcResumeRequest,
  CcResumeResult,
  CcCrashedPayload,
  CcHungPayload
} from '@shared/ipc'

export interface TokenlessApi {
  readonly version: string
  readonly log: {
    send(record: LogRecord): void
    subscribe(fn: (record: LogRecord) => void): () => void
    getRecent(count?: number): Promise<readonly LogRecord[]>
  }
  readonly accounts: {
    list(): Promise<AccountsListResult>
    create(req: AccountsCreateRequest): Promise<AccountsCreateResult>
    update(req: AccountsUpdateRequest): Promise<AccountsUpdateResult>
    delete(req: AccountsDeleteRequest): Promise<AccountsDeleteResult>
    onChanged(fn: () => void): () => void
  }
  readonly projects: {
    list(): Promise<ProjectsListResult>
    create(req: ProjectsCreateRequest): Promise<ProjectsCreateResult>
    update(req: ProjectsUpdateRequest): Promise<ProjectsUpdateResult>
    delete(req: ProjectsDeleteRequest): Promise<ProjectsDeleteResult>
    onChanged(fn: () => void): () => void
  }
  readonly conversations: {
    listByProject(req: ConversationsListRequest): Promise<ConversationsListResult>
    create(req: ConversationsCreateRequest): Promise<ConversationsCreateResult>
    update(req: ConversationsUpdateRequest): Promise<ConversationsUpdateResult>
    delete(req: ConversationsDeleteRequest): Promise<ConversationsDeleteResult>
    onChanged(fn: () => void): () => void
  }
  readonly cc: {
    start(req: CcStartRequest): Promise<CcStartResult>
    send(req: CcSendRequest): Promise<CcSendResult>
    resize(req: CcResizeRequest): Promise<CcResizeResult>
    onOutputChunk(fn: (payload: CcOutputChunkPayload) => void): () => void
    onExit(fn: (payload: CcExitPayload) => void): () => void
    onEvent(fn: (payload: CcEventPayload) => void): () => void
    stop(req: CcStopRequest): Promise<CcStopResult>
    resume(req: CcResumeRequest): Promise<CcResumeResult>
    onCrashed(fn: (payload: CcCrashedPayload) => void): () => void
    onHung(fn: (payload: CcHungPayload) => void): () => void
  }
  readonly telemetry: {
    onTick(fn: (tick: TelemetryTick) => void): () => void
  }
  readonly gearing: {
    gear(req: GearingGearRequest): Promise<GearingGearResult>
  }
  readonly api: {
    onRetryAttempt(fn: (payload: ApiRetryAttemptPayload) => void): () => void
  }
  readonly drafts: {
    save(req: DraftsSaveRequest): Promise<DraftsSaveResult>
    get(req: DraftsGetRequest): Promise<DraftsGetResult>
    clear(req: DraftsClearRequest): Promise<DraftsClearResult>
  }
  readonly settings: {
    get(req: SettingsGetRequest): Promise<SettingsGetResult>
    set(req: SettingsSetRequest): Promise<SettingsSetResult>
  }
  readonly paths: {
    checkDir(req: PathsCheckDirRequest): Promise<PathsCheckDirResult>
  }
}

declare global {
  interface Window {
    readonly tokenless: TokenlessApi
  }
}

export {}
