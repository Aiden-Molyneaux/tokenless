// Mock telemetry values for cost previews. Phase 5 replaces with real
// Anthropic-SDK-driven cost estimates. Phase 4C replaced context budget with
// real values parsed from Claude Code's output via useTelemetry.

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
