import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Database } from 'better-sqlite3'

import { TurnsDao } from '../db'
import { computeTelemetrySummary, type PricingFn } from '../telemetry/summary'
import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'

import {
  IPC_TELEMETRY_GET_SUMMARY,
  type TelemetryGetSummaryRequest,
  type TelemetryGetSummaryResult
} from '@shared/ipc/telemetry-summary'

export class TelemetrySummaryHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
    private readonly pricing: PricingFn,
    private readonly haikuKey: string
  ) {}

  getSummary = async (req: TelemetryGetSummaryRequest): Promise<TelemetryGetSummaryResult> =>
    withIpcResult(this.logger, 'db', 'telemetry-summary', async () => {
      const tokens = TurnsDao.getTokenSummary(this.db, req.sinceMs ?? undefined)
      const summary = computeTelemetrySummary(tokens, req.sinceMs ?? null, this.pricing, this.haikuKey)
      return { summary }
    })

  install(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_TELEMETRY_GET_SUMMARY, async (_e: IpcMainInvokeEvent, req: TelemetryGetSummaryRequest) =>
      this.getSummary(req)
    )
    this.installedHandlers.push(IPC_TELEMETRY_GET_SUMMARY)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
