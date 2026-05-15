import type { IpcResult } from './envelope'

export interface PricingEntry {
  readonly key: string
  readonly apiModel: string
  readonly displayName: string
  readonly description: string
  readonly inputPerMillion: number
  readonly outputPerMillion: number
}

export const IPC_PRICING_LIST = 'pricing:list'
export interface PricingListResponse { readonly entries: readonly PricingEntry[] }
export type PricingListResult = IpcResult<PricingListResponse>
