export interface TelemetryTick {
  readonly conversationId: number
  // Context budget — pulled from the latest 'tokens-used' parser event for
  // this conversation. null when no tokens-used event has fired yet.
  readonly contextUsed: number | null
  readonly contextTotal: number | null
  readonly contextPercent: number | null
  // Phase 5 will add cost fields here ($ spent so far, model usage breakdown).
  readonly tickAt: number
}
