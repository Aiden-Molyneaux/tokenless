import { contextBridge, ipcRenderer } from 'electron'
import type { LogRecord } from '@shared/observability'
import {
  IPC_LOG_FROM_RENDERER,
  IPC_LOG_GET_RECENT,
  IPC_LOG_TO_RENDERER,
  IPC_ACCOUNTS_LIST,
  IPC_ACCOUNTS_CREATE,
  IPC_ACCOUNTS_UPDATE,
  IPC_ACCOUNTS_DELETE,
  IPC_ACCOUNTS_CHANGED,
  IPC_PROJECTS_LIST,
  IPC_PROJECTS_CREATE,
  IPC_PROJECTS_UPDATE,
  IPC_PROJECTS_DELETE,
  IPC_PROJECTS_CHANGED,
  IPC_CONVERSATIONS_LIST_BY_PROJECT,
  IPC_CONVERSATIONS_CREATE,
  IPC_CONVERSATIONS_UPDATE,
  IPC_CONVERSATIONS_DELETE,
  IPC_CONVERSATIONS_CHANGED,
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
  IPC_TELEMETRY_TICK,
  type TelemetryTick,
  type LogFromRendererPayload,
  type LogGetRecentRequest,
  type LogGetRecentResponse,
  type LogToRendererPayload,
  type AccountsListResult,
  type AccountsCreateRequest,
  type AccountsCreateResult,
  type AccountsUpdateRequest,
  type AccountsUpdateResult,
  type AccountsDeleteRequest,
  type AccountsDeleteResult,
  type ProjectsListResult,
  type ProjectsCreateRequest,
  type ProjectsCreateResult,
  type ProjectsUpdateRequest,
  type ProjectsUpdateResult,
  type ProjectsDeleteRequest,
  type ProjectsDeleteResult,
  type ConversationsListRequest,
  type ConversationsListResult,
  type ConversationsCreateRequest,
  type ConversationsCreateResult,
  type ConversationsUpdateRequest,
  type ConversationsUpdateResult,
  type ConversationsDeleteRequest,
  type ConversationsDeleteResult,
  type CcStartRequest,
  type CcStartResult,
  type CcSendRequest,
  type CcSendResult,
  type CcResizeRequest,
  type CcResizeResult,
  type CcOutputChunkPayload,
  type CcExitPayload,
  type CcEventPayload,
  type CcStopRequest,
  type CcStopResult,
  type CcResumeRequest,
  type CcResumeResult,
  type CcCrashedPayload,
  type CcHungPayload,
  IPC_GEARING_GEAR,
  type GearingGearRequest,
  type GearingGearResult,
  IPC_API_RETRY_ATTEMPT,
  type ApiRetryAttemptPayload,
  IPC_DRAFTS_SAVE,
  IPC_DRAFTS_GET,
  IPC_DRAFTS_CLEAR,
  type DraftsSaveRequest,
  type DraftsSaveResult,
  type DraftsGetRequest,
  type DraftsGetResult,
  type DraftsClearRequest,
  type DraftsClearResult,
  IPC_SETTINGS_GET,
  IPC_SETTINGS_SET,
  type SettingsGetRequest,
  type SettingsGetResult,
  type SettingsSetRequest,
  type SettingsSetResult,
  IPC_PATHS_CHECK_DIR,
  type PathsCheckDirRequest,
  type PathsCheckDirResult
} from '@shared/ipc'

const api = {
  version: '0.0.1',
  log: {
    send(record: LogRecord): void {
      const payload: LogFromRendererPayload = { record }
      ipcRenderer.send(IPC_LOG_FROM_RENDERER, payload)
    },
    subscribe(fn: (record: LogRecord) => void): () => void {
      const listener = (_event: unknown, payload: LogToRendererPayload): void => {
        fn(payload.record)
      }
      ipcRenderer.on(IPC_LOG_TO_RENDERER, listener as never)
      return () => {
        ipcRenderer.removeListener(IPC_LOG_TO_RENDERER, listener as never)
      }
    },
    async getRecent(count?: number): Promise<readonly LogRecord[]> {
      const req: LogGetRecentRequest = { count }
      const response = await ipcRenderer.invoke(IPC_LOG_GET_RECENT, req)
      return (response as LogGetRecentResponse).records
    }
  },
  accounts: {
    list(): Promise<AccountsListResult> {
      return ipcRenderer.invoke(IPC_ACCOUNTS_LIST) as Promise<AccountsListResult>
    },
    create(req: AccountsCreateRequest): Promise<AccountsCreateResult> {
      return ipcRenderer.invoke(IPC_ACCOUNTS_CREATE, req) as Promise<AccountsCreateResult>
    },
    update(req: AccountsUpdateRequest): Promise<AccountsUpdateResult> {
      return ipcRenderer.invoke(IPC_ACCOUNTS_UPDATE, req) as Promise<AccountsUpdateResult>
    },
    delete(req: AccountsDeleteRequest): Promise<AccountsDeleteResult> {
      return ipcRenderer.invoke(IPC_ACCOUNTS_DELETE, req) as Promise<AccountsDeleteResult>
    },
    onChanged(fn: () => void): () => void {
      const listener = (): void => fn()
      ipcRenderer.on(IPC_ACCOUNTS_CHANGED, listener as never)
      return () => ipcRenderer.removeListener(IPC_ACCOUNTS_CHANGED, listener as never)
    }
  },
  projects: {
    list(): Promise<ProjectsListResult> {
      return ipcRenderer.invoke(IPC_PROJECTS_LIST) as Promise<ProjectsListResult>
    },
    create(req: ProjectsCreateRequest): Promise<ProjectsCreateResult> {
      return ipcRenderer.invoke(IPC_PROJECTS_CREATE, req) as Promise<ProjectsCreateResult>
    },
    update(req: ProjectsUpdateRequest): Promise<ProjectsUpdateResult> {
      return ipcRenderer.invoke(IPC_PROJECTS_UPDATE, req) as Promise<ProjectsUpdateResult>
    },
    delete(req: ProjectsDeleteRequest): Promise<ProjectsDeleteResult> {
      return ipcRenderer.invoke(IPC_PROJECTS_DELETE, req) as Promise<ProjectsDeleteResult>
    },
    onChanged(fn: () => void): () => void {
      const listener = (): void => fn()
      ipcRenderer.on(IPC_PROJECTS_CHANGED, listener as never)
      return () => ipcRenderer.removeListener(IPC_PROJECTS_CHANGED, listener as never)
    }
  },
  conversations: {
    listByProject(req: ConversationsListRequest): Promise<ConversationsListResult> {
      return ipcRenderer.invoke(IPC_CONVERSATIONS_LIST_BY_PROJECT, req) as Promise<ConversationsListResult>
    },
    create(req: ConversationsCreateRequest): Promise<ConversationsCreateResult> {
      return ipcRenderer.invoke(IPC_CONVERSATIONS_CREATE, req) as Promise<ConversationsCreateResult>
    },
    update(req: ConversationsUpdateRequest): Promise<ConversationsUpdateResult> {
      return ipcRenderer.invoke(IPC_CONVERSATIONS_UPDATE, req) as Promise<ConversationsUpdateResult>
    },
    delete(req: ConversationsDeleteRequest): Promise<ConversationsDeleteResult> {
      return ipcRenderer.invoke(IPC_CONVERSATIONS_DELETE, req) as Promise<ConversationsDeleteResult>
    },
    onChanged(fn: () => void): () => void {
      const listener = (): void => fn()
      ipcRenderer.on(IPC_CONVERSATIONS_CHANGED, listener as never)
      return () => ipcRenderer.removeListener(IPC_CONVERSATIONS_CHANGED, listener as never)
    }
  },
  cc: {
    start(req: CcStartRequest): Promise<CcStartResult> {
      return ipcRenderer.invoke(IPC_CC_START, req) as Promise<CcStartResult>
    },
    send(req: CcSendRequest): Promise<CcSendResult> {
      return ipcRenderer.invoke(IPC_CC_SEND, req) as Promise<CcSendResult>
    },
    resize(req: CcResizeRequest): Promise<CcResizeResult> {
      return ipcRenderer.invoke(IPC_CC_RESIZE, req) as Promise<CcResizeResult>
    },
    onOutputChunk(fn: (payload: CcOutputChunkPayload) => void): () => void {
      const listener = (_e: unknown, payload: CcOutputChunkPayload): void => fn(payload)
      ipcRenderer.on(IPC_CC_OUTPUT_CHUNK, listener as never)
      return () => ipcRenderer.removeListener(IPC_CC_OUTPUT_CHUNK, listener as never)
    },
    onExit(fn: (payload: CcExitPayload) => void): () => void {
      const listener = (_e: unknown, payload: CcExitPayload): void => fn(payload)
      ipcRenderer.on(IPC_CC_EXIT, listener as never)
      return () => ipcRenderer.removeListener(IPC_CC_EXIT, listener as never)
    },
    onEvent(fn: (payload: CcEventPayload) => void): () => void {
      const listener = (_e: unknown, payload: CcEventPayload): void => fn(payload)
      ipcRenderer.on(IPC_CC_EVENT, listener as never)
      return () => ipcRenderer.removeListener(IPC_CC_EVENT, listener as never)
    },
    stop(req: CcStopRequest): Promise<CcStopResult> {
      return ipcRenderer.invoke(IPC_CC_STOP, req) as Promise<CcStopResult>
    },
    resume(req: CcResumeRequest): Promise<CcResumeResult> {
      return ipcRenderer.invoke(IPC_CC_RESUME, req) as Promise<CcResumeResult>
    },
    onCrashed(fn: (payload: CcCrashedPayload) => void): () => void {
      const listener = (_e: unknown, payload: CcCrashedPayload): void => fn(payload)
      ipcRenderer.on(IPC_CC_CRASHED, listener as never)
      return () => ipcRenderer.removeListener(IPC_CC_CRASHED, listener as never)
    },
    onHung(fn: (payload: CcHungPayload) => void): () => void {
      const listener = (_e: unknown, payload: CcHungPayload): void => fn(payload)
      ipcRenderer.on(IPC_CC_HUNG, listener as never)
      return () => ipcRenderer.removeListener(IPC_CC_HUNG, listener as never)
    }
  },
  telemetry: {
    onTick(fn: (tick: TelemetryTick) => void): () => void {
      const listener = (_e: unknown, payload: { tick: TelemetryTick }): void => fn(payload.tick)
      ipcRenderer.on(IPC_TELEMETRY_TICK, listener as never)
      return () => ipcRenderer.removeListener(IPC_TELEMETRY_TICK, listener as never)
    }
  },
  gearing: {
    gear(req: GearingGearRequest): Promise<GearingGearResult> {
      return ipcRenderer.invoke(IPC_GEARING_GEAR, req) as Promise<GearingGearResult>
    }
  },
  api: {
    onRetryAttempt(fn: (payload: ApiRetryAttemptPayload) => void): () => void {
      const listener = (_e: unknown, payload: ApiRetryAttemptPayload): void => fn(payload)
      ipcRenderer.on(IPC_API_RETRY_ATTEMPT, listener as never)
      return () => ipcRenderer.removeListener(IPC_API_RETRY_ATTEMPT, listener as never)
    }
  },
  drafts: {
    save(req: DraftsSaveRequest): Promise<DraftsSaveResult> {
      return ipcRenderer.invoke(IPC_DRAFTS_SAVE, req) as Promise<DraftsSaveResult>
    },
    get(req: DraftsGetRequest): Promise<DraftsGetResult> {
      return ipcRenderer.invoke(IPC_DRAFTS_GET, req) as Promise<DraftsGetResult>
    },
    clear(req: DraftsClearRequest): Promise<DraftsClearResult> {
      return ipcRenderer.invoke(IPC_DRAFTS_CLEAR, req) as Promise<DraftsClearResult>
    }
  },
  settings: {
    get(req: SettingsGetRequest): Promise<SettingsGetResult> {
      return ipcRenderer.invoke(IPC_SETTINGS_GET, req) as Promise<SettingsGetResult>
    },
    set(req: SettingsSetRequest): Promise<SettingsSetResult> {
      return ipcRenderer.invoke(IPC_SETTINGS_SET, req) as Promise<SettingsSetResult>
    }
  },
  paths: {
    checkDir(req: PathsCheckDirRequest): Promise<PathsCheckDirResult> {
      return ipcRenderer.invoke(IPC_PATHS_CHECK_DIR, req) as Promise<PathsCheckDirResult>
    }
  }
}

// Minimal in-preload log fallback for errors that happen during contextBridge
// setup itself — we can't use the api.log we're about to expose because it
// hasn't been exposed yet. Ship the record straight through ipcRenderer.
function logPreloadError(message: string, err: unknown): void {
  const stack = err instanceof Error ? err.stack : undefined
  const record: LogRecord = {
    id: `preload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    ts: Date.now(),
    severity: 'error',
    category: 'observability',
    event: 'preload-contextbridge-failed',
    message,
    context: { errorString: String(err) },
    stack,
    fingerprint: 'preload-bootstrap',
    source: 'renderer'
  }
  try {
    ipcRenderer.send(IPC_LOG_FROM_RENDERER, { record })
  } catch {
    // last-resort: if ipc itself isn't working, we have no recovery. Silent
    // failure is appropriate here — better than crashing the preload entirely.
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('tokenless', api)
  } catch (error) {
    logPreloadError('contextBridge.exposeInMainWorld failed', error)
  }
} else {
  window.tokenless = api
}
