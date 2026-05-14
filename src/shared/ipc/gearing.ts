import type { IpcResult } from './envelope'
import type { GearConfigs, GearResult } from '../types/gearing'

export const IPC_GEARING_GEAR = 'gearing:gear'

export interface GearingGearRequest {
  readonly conversationId: number
  readonly originalPrompt: string
  readonly configs: GearConfigs
}

export type GearingGearResult = IpcResult<{ result: GearResult }>
