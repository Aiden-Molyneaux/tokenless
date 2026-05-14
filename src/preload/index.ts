import { contextBridge, ipcRenderer } from 'electron'
import type { LogRecord } from '@shared/observability'
import {
  IPC_LOG_FROM_RENDERER,
  IPC_LOG_GET_RECENT,
  IPC_LOG_TO_RENDERER,
  type LogFromRendererPayload,
  type LogGetRecentRequest,
  type LogGetRecentResponse,
  type LogToRendererPayload
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
