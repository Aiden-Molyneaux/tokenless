// Mock telemetry values for TelemetryStrip + ContextBudgetMeter. Phase 5
// replaces with real Anthropic-SDK-driven cost estimates; Phase 4 replaces
// the context budget with real values parsed from Claude Code's output.

export interface MockCostPreview {
  expectedDollars: number
  expectedInputTokens: number
  expectedOutputTokens: number
  modelLabel: string
}

export const MOCK_COST_PREVIEW: MockCostPreview = {
  expectedDollars: 0.04,
  expectedInputTokens: 3_000,
  expectedOutputTokens: 1_000,
  modelLabel: 'Opus 4.7'
}

export interface MockContextBudget {
  usedTokens: number
  totalTokens: number
  percentUsed: number
}

export const MOCK_CONTEXT_BUDGET: MockContextBudget = {
  usedTokens: 84_000,
  totalTokens: 200_000,
  percentUsed: 42
}
