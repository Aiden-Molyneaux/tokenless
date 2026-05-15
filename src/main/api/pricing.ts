// Per-model pricing — dollars per million tokens. Pricing rates are
// approximations as of 2026-05-15; refresh when anthropic.com/pricing updates.
//
// The keys ('haiku', 'sonnet', 'opus') are stable internal slugs used by our
// config selectors. The `apiModel` field is the literal identifier sent to
// the Anthropic API — update these when Anthropic ships new model versions.

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
    apiModel: 'claude-haiku-4-5-20251001',
    displayName: 'Haiku 4.5',
    inputPerMillion: 1.00,
    outputPerMillion: 5.00
  },
  sonnet: {
    apiModel: 'claude-sonnet-4-6',
    displayName: 'Sonnet 4.6',
    inputPerMillion: 3.00,
    outputPerMillion: 15.00
  },
  opus: {
    apiModel: 'claude-opus-4-7',
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
