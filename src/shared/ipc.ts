// Typed IPC contract between main and renderer.
// Phase 1B populates this with the Logger bridge channels.
// Subsequent phases add cc:*, gear:*, projects:*, etc.

import type { LogRecord } from './observability'

// Channels: renderer -> main (fire-and-forget, ipcRenderer.send / ipcMain.on)
export const IPC_LOG_FROM_RENDERER = 'log:event-from-renderer'

// Channels: main -> renderer (push to all windows, webContents.send / ipcRenderer.on)
export const IPC_LOG_TO_RENDERER = 'log:event-to-renderer'

// Channels: renderer -> main (request/response, ipcRenderer.invoke / ipcMain.handle)
export const IPC_LOG_GET_RECENT = 'log:get-recent'

// Payload types for each channel
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

// Phase 0 placeholder — preserved for backward compat; remove when a
// real non-log channel takes its place (Phase 2+).
export type IpcChannelName =
  | 'phase-0:ping'
  | typeof IPC_LOG_FROM_RENDERER
  | typeof IPC_LOG_TO_RENDERER
  | typeof IPC_LOG_GET_RECENT
