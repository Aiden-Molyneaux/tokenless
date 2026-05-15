import type { TelemetrySummary } from '../types/telemetry-summary'
import type { IpcResult } from './envelope'

export const IPC_TELEMETRY_GET_SUMMARY = 'telemetry:get-summary'

export interface TelemetryGetSummaryRequest {
  readonly sinceMs: number | null
}
export interface TelemetryGetSummaryResponse {
  readonly summary: TelemetrySummary
}

export type TelemetryGetSummaryResult = IpcResult<TelemetryGetSummaryResponse>
