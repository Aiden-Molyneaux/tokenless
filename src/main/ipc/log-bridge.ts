import type { IpcMain } from 'electron'
import type { Logger } from '@main/observability'
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

// Function that broadcasts a payload to all renderer windows.
// In production this wraps:
//   BrowserWindow.getAllWindows().forEach(w => w.webContents.send(channel, payload))
// In tests we inject a spy so we can assert calls.
export type Broadcast = (channel: string, payload: unknown) => void

export class LogBridge {
  private unsubscribe: (() => void) | null = null

  constructor(
    private readonly logger: Logger,
    private readonly ipcMain: IpcMain,
    private readonly broadcast: Broadcast
  ) {}

  install(): void {
    // Renderer-to-main: ingest log events
    this.ipcMain.on(IPC_LOG_FROM_RENDERER, (_event, payload: LogFromRendererPayload) => {
      this.logger.ingestFromRenderer(payload.record)
    })

    // Renderer-to-main request/response: getRecent
    this.ipcMain.handle(IPC_LOG_GET_RECENT, (_event, payload: LogGetRecentRequest): LogGetRecentResponse => {
      return { records: this.logger.getRecent(payload?.count) }
    })

    // Main-to-renderer broadcast: subscribe to logger and forward to all windows
    this.unsubscribe = this.logger.subscribe((record: LogRecord) => {
      const payload: LogToRendererPayload = { record }
      this.broadcast(IPC_LOG_TO_RENDERER, payload)
    })
  }

  uninstall(): void {
    this.ipcMain.removeAllListeners(IPC_LOG_FROM_RENDERER)
    this.ipcMain.removeHandler(IPC_LOG_GET_RECENT)
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
  }
}
