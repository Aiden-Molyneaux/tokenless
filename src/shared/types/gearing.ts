// Gearing types crossing the IPC boundary. The renderer treats these as
// opaque — main builds them, renderer renders them.

export interface CritiqueFlag {
  readonly severity: 'info' | 'warn'
  readonly message: string
}

export interface GearTokenBreakdown {
  // Input + output token counts as reported by the Anthropic API for the
  // Haiku gearing call itself (the "meta" tokens we spend to get gearing).
  readonly haikuInputTokens: number
  readonly haikuOutputTokens: number
  // Pre-send estimate: how many input tokens we expect the user's geared
  // prompt to use when sent to the model (cheaper than haikuInput).
  readonly gearedInputEstimate: number
  // For comparison: how many tokens the original prompt would have used.
  readonly originalInputEstimate: number
}

export interface CostPreview {
  // Dollar estimate for the geared prompt's full round-trip (input + output).
  // Output tokens are an estimate based on configs (breadth/format).
  readonly expectedDollars: number
  readonly expectedInputTokens: number
  readonly expectedOutputTokens: number
  readonly modelLabel: string
  // Haiku meta cost — typically <$0.001 — surfaced separately so the user
  // can see "Gearing cost: $0.0003" vs "Expected total: $0.04".
  readonly haikuMetaDollars: number
}

export interface GearConfigs {
  readonly model: string         // 'haiku' | 'sonnet' | 'opus'
  readonly breadth: string       // 'terse' | 'normal' | 'thorough'
  readonly format: string        // 'prose' | 'bullets' | 'code' | 'json'
  readonly skill: string | null  // skill id, or null
}

export interface GearResult {
  readonly originalPrompt: string
  readonly gearedPrompt: string
  readonly critiqueFlags: readonly CritiqueFlag[]
  readonly tokenBreakdown: GearTokenBreakdown
  readonly costPreview: CostPreview
}

// Error codes returned in the IpcResult envelope's `error.code` field.
// These propagate from the AnthropicClient classification through the engine
// and the GearingHandler.
export type GearErrorCode =
  | 'API_AUTH_FAILED'
  | 'API_RATE_LIMITED'
  | 'API_SERVER_ERROR'
  | 'API_NETWORK_DOWN'
  | 'API_TIMEOUT'
  | 'GEAR_PARSE_FAILED'     // Haiku returned non-JSON or wrong shape
  | 'API_UNKNOWN'
