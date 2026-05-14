import type { TelemetryTick } from '../types/telemetry'

export const IPC_TELEMETRY_TICK = 'telemetry:tick'

export interface TelemetryTickPayload {
  readonly tick: TelemetryTick
}

export type { TelemetryTick }
