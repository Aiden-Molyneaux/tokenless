export interface PerModelSummary {
  readonly model: string
  readonly haikuMetaTokens: number
  readonly originalInputTokens: number
  readonly gearedInputTokens: number
  readonly responseOutputTokens: number
  readonly inputCostDollars: number
  readonly outputCostDollars: number
  readonly savingsDollars: number
}

export interface TelemetrySummary {
  readonly sinceMs: number | null
  readonly haikuMetaTokens: number
  readonly originalInputTokens: number
  readonly gearedInputTokens: number
  readonly responseOutputTokens: number
  readonly haikuCostDollars: number
  readonly spendDollars: number
  readonly grossSavingsDollars: number
  readonly netSavingsDollars: number
  readonly byModel: readonly PerModelSummary[]
}
