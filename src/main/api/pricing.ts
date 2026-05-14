// Per-model pricing — dollars per million tokens. Source: anthropic.com/pricing
// as of 2026-05-14. Cached here as a versioned table; Phase 5B may add a
// "refresh from registry" path if pricing changes.
//
// The keys match the model labels used in our config selectors ('haiku',
// 'sonnet', 'opus'). The actual API model identifiers are looked up by these
// keys (anthropic uses claude-3-5-haiku-latest, etc.).

export interface ModelPricing {
  readonly inputPerMillion: number
  readonly outputPerMillion: number
  // Canonical API identifier sent to anthropic.com.
  readonly apiModel: string
  // Human-readable label for UI.
  readonly displayName: string
}

export const PRICING: Record<string, ModelPricing> = {
  haiku: {
    apiModel: 'claude-3-5-haiku-latest',
    displayName: 'Haiku 3.5',
    inputPerMillion: 1.00,
    outputPerMillion: 5.00
  },
  sonnet: {
    apiModel: 'claude-sonnet-4-7-latest',
    displayName: 'Sonnet 4.7',
    inputPerMillion: 3.00,
    outputPerMillion: 15.00
  },
  opus: {
    apiModel: 'claude-opus-4-7-latest',
    displayName: 'Opus 4.7',
    inputPerMillion: 15.00,
    outputPerMillion: 75.00
  }
}

// The gearing engine itself ALWAYS uses Haiku (the cheap, fast model) —
// regardless of which model the user will send the geared prompt to.
export const GEARING_MODEL = 'haiku' as const

export function pricingFor(modelKey: string): ModelPricing | null {
  return PRICING[modelKey] ?? null
}
