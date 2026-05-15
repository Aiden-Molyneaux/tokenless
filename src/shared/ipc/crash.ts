import type { CrashReport } from '../types/crash-report'
import type { IpcResult } from './envelope'

export const IPC_CRASH_SHOW = 'crash:show'             // main → renderer broadcast
export const IPC_CRASH_RESTART = 'crash:restart'       // renderer → main invoke
export const IPC_CRASH_GET_REPORT = 'crash:get-report' // renderer → main invoke

export interface CrashShowPayload {
  readonly report: CrashReport
}

export interface CrashGetReportRequest {
  readonly source: 'main' | 'renderer'
  readonly message: string
  readonly stack: string | null
}
export interface CrashGetReportResponse {
  readonly report: CrashReport
}

export interface CrashRestartResponse {
  readonly ok: true
}

export type CrashGetReportResult = IpcResult<CrashGetReportResponse>
export type CrashRestartResult = IpcResult<CrashRestartResponse>
