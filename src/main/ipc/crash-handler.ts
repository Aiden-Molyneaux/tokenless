import { app } from 'electron'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'

import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'
import type { Broadcast } from './log-bridge'

import {
  IPC_CRASH_SHOW,
  IPC_CRASH_RESTART,
  IPC_CRASH_GET_REPORT,
  type CrashShowPayload,
  type CrashGetReportRequest,
  type CrashGetReportResult,
  type CrashRestartResult
} from '@shared/ipc/crash'
import type { CrashReport } from '@shared/types/crash-report'

declare const __APP_VERSION__: string

export class CrashHandler {
  private installedHandlers: string[] = []
  private uninstallUncaught: (() => void) | null = null

  constructor(
    private readonly logger: Logger,
    private readonly broadcast: Broadcast
  ) {}

  buildReport(input: CrashGetReportRequest): CrashReport {
    return {
      source: input.source,
      message: input.message,
      stack: input.stack,
      timestamp: Date.now(),
      recentLogs: this.logger.getRecent(100),
      system: {
        platform: process.platform,
        electronVersion: process.versions.electron ?? 'unknown',
        nodeVersion: process.versions.node ?? 'unknown',
        appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown'
      }
    }
  }

  getReport = async (req: CrashGetReportRequest): Promise<CrashGetReportResult> =>
    withIpcResult(this.logger, 'observability', 'crash-get-report', async () => ({
      report: this.buildReport(req)
    }))

  restart = async (): Promise<CrashRestartResult> =>
    withIpcResult(this.logger, 'observability', 'crash-restart', async () => {
      app.relaunch()
      app.exit(0)
      return { ok: true as const }
    })

  installUncaughtHandlers(): void {
    const onException = (err: Error): void => {
      this.logger.fatal('observability', 'uncaught-exception', err.message, { name: err.name }, err.stack)
      const payload: CrashShowPayload = {
        report: this.buildReport({
          source: 'main',
          message: err.message,
          stack: err.stack ?? null
        })
      }
      this.broadcast(IPC_CRASH_SHOW, payload)
    }
    const onRejection = (reason: unknown): void => {
      const err = reason instanceof Error ? reason : new Error(String(reason))
      this.logger.fatal('observability', 'unhandled-rejection', err.message, { reasonString: String(reason) }, err.stack)
      const payload: CrashShowPayload = {
        report: this.buildReport({
          source: 'main',
          message: err.message,
          stack: err.stack ?? null
        })
      }
      this.broadcast(IPC_CRASH_SHOW, payload)
    }
    process.on('uncaughtException', onException)
    process.on('unhandledRejection', onRejection)
    this.uninstallUncaught = () => {
      process.off('uncaughtException', onException)
      process.off('unhandledRejection', onRejection)
    }
  }

  install(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_CRASH_GET_REPORT, async (_e: IpcMainInvokeEvent, req: CrashGetReportRequest) =>
      this.getReport(req)
    )
    this.installedHandlers.push(IPC_CRASH_GET_REPORT)
    ipcMain.handle(IPC_CRASH_RESTART, () => this.restart())
    this.installedHandlers.push(IPC_CRASH_RESTART)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
    if (this.uninstallUncaught) {
      this.uninstallUncaught()
      this.uninstallUncaught = null
    }
  }
}
