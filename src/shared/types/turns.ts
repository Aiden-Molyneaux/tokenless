export type TurnStatus = 'complete' | 'stopped' | 'error'

// Captured at Send-from-GearReviewPane time; allows the user-turn row to
// preserve the full original/geared pair + token counts. Null for plain Send
// (where original == geared by definition).
export interface GearMeta {
  readonly originalPrompt: string
  readonly gearedPrompt: string
  readonly originalTokens: number | null
  readonly gearedTokens: number | null
  readonly haikuMetaTokens: number | null
  readonly critiqueFlags: readonly string[]
}

export interface Turn {
  readonly id: number
  readonly conversationId: number
  readonly originalPrompt: string | null
  readonly gearedPrompt: string | null
  readonly originalTokens: number | null
  readonly gearedTokens: number | null
  readonly haikuMetaTokens: number | null
  readonly modelUsed: string | null
  readonly critiqueFlagsJson: string | null
  readonly status: TurnStatus
  readonly sentAt: number
}
