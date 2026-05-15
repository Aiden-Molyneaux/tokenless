import type { LogRecord } from '@shared/observability'
import type {
  TelemetryTick,
  TelemetryGetSummaryRequest,
  TelemetryGetSummaryResult,
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
  PathsCheckDirResult,
  PathsGetAppPathsResult,
  PathsOpenFolderRequest,
  PathsOpenFolderResult,
  SkillsListResult,
  SkillsToggleFavoriteRequest,
  SkillsToggleFavoriteResult,
  SkillsToggleHiddenRequest,
  SkillsToggleHiddenResult,
  SkillsRescanResult,
  TemplatesListResult,
  TemplatesCreateRequest,
  TemplatesCreateResult,
  TemplatesUpdateRequest,
  TemplatesUpdateResult,
  TemplatesDeleteRequest,
  TemplatesDeleteResult,
  TurnsListRequest,
  TurnsListResult,
  TurnsUpdateFeedbackRequest,
  TurnsUpdateFeedbackResult,
  TurnsFeedbackSummaryResult,
  PricingListResult,
  AiAnalyzeErrorRequest,
  AiAnalyzeErrorResult
} from '@shared/ipc'
import type {
  CrashShowPayload,
  CrashGetReportRequest,
  CrashGetReportResult,
  CrashRestartResult
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
  ConversationsBranchRequest,
  ConversationsBranchResult,
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
  CcHungPayload,
  CcInputRequest,
  CcInputResult
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
    branch(req: ConversationsBranchRequest): Promise<ConversationsBranchResult>
    onChanged(fn: () => void): () => void
  }
  readonly skills: {
    list(): Promise<SkillsListResult>
    toggleFavorite(req: SkillsToggleFavoriteRequest): Promise<SkillsToggleFavoriteResult>
    toggleHidden(req: SkillsToggleHiddenRequest): Promise<SkillsToggleHiddenResult>
    rescan(): Promise<SkillsRescanResult>
    onChanged(fn: () => void): () => void
  }
  readonly templates: {
    list(): Promise<TemplatesListResult>
    create(req: TemplatesCreateRequest): Promise<TemplatesCreateResult>
    update(req: TemplatesUpdateRequest): Promise<TemplatesUpdateResult>
    delete(req: TemplatesDeleteRequest): Promise<TemplatesDeleteResult>
    onChanged(fn: () => void): () => void
  }
  readonly turns: {
    listByConversation(req: TurnsListRequest): Promise<TurnsListResult>
    updateFeedback(req: TurnsUpdateFeedbackRequest): Promise<TurnsUpdateFeedbackResult>
    getFeedbackSummary(): Promise<TurnsFeedbackSummaryResult>
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
    input(req: CcInputRequest): Promise<CcInputResult>
  }
  readonly telemetry: {
    onTick(fn: (tick: TelemetryTick) => void): () => void
    getSummary(req: TelemetryGetSummaryRequest): Promise<TelemetryGetSummaryResult>
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
    getAppPaths(): Promise<PathsGetAppPathsResult>
    openFolder(req: PathsOpenFolderRequest): Promise<PathsOpenFolderResult>
  }
  readonly pricing: {
    list(): Promise<PricingListResult>
  }
  readonly ai: {
    analyzeError(req: AiAnalyzeErrorRequest): Promise<AiAnalyzeErrorResult>
  }
  readonly crash: {
    getReport(req: CrashGetReportRequest): Promise<CrashGetReportResult>
    restart(): Promise<CrashRestartResult>
    onCrash(fn: (payload: CrashShowPayload) => void): () => void
  }
}

declare global {
  interface Window {
    readonly tokenless: TokenlessApi
  }
}

export {}
