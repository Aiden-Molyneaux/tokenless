// CcEvent — typed events emitted by the parser. The renderer subscribes via
// useCcEvents() and uses these to drive UI state (streaming indicator,
// context budget meter, etc.). Raw chunks still flow separately via
// cc:output-chunk for xterm.js.
//
// Phase 4B emits the four basic event types. Phase 4D will add quota / auth /
// resume-failed events from output-pattern matching.

export interface CcEventPromptReady {
  readonly kind: 'prompt-ready'
}

export interface CcEventToolCall {
  readonly kind: 'tool-call'
  readonly name: string
  readonly summary: string
}

export interface CcEventResponseComplete {
  readonly kind: 'response-complete'
}

export interface CcEventTokensUsed {
  readonly kind: 'tokens-used'
  readonly used: number
  readonly total: number
}

export type CcEvent =
  | CcEventPromptReady
  | CcEventToolCall
  | CcEventResponseComplete
  | CcEventTokensUsed
