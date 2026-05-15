import type { IpcResult } from './envelope'
import type { GearConfigs, GearResult } from '../types/gearing'

export const IPC_GEARING_GEAR = 'gearing:gear'

export interface GearingGearRequest {
  // Nullable: gearing is a pure Anthropic API call and doesn't require an
  // active PTY conversation. Phase 5B may use conversationId for rolling-
  // summary context — until then it's a tracing/logging tag only.
  readonly conversationId: number | null
  readonly originalPrompt: string
  readonly configs: GearConfigs
}

export type GearingGearResult = IpcResult<{ result: GearResult }>
