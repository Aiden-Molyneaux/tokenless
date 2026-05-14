import { contextBridge, ipcRenderer } from 'electron'
import type { LogRecord } from '@shared/observability'
import {
  IPC_LOG_FROM_RENDERER,
  IPC_LOG_GET_RECENT,
  IPC_LOG_TO_RENDERER,
  IPC_ACCOUNTS_LIST,
  IPC_ACCOUNTS_CREATE,
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
  type LogFromRendererPayload,
  type LogGetRecentRequest,
  type LogGetRecentResponse,
  type LogToRendererPayload,
  type AccountsListResult,
  type AccountsCreateRequest,
  type AccountsCreateResult,
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
  type ConversationsDeleteResult
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
