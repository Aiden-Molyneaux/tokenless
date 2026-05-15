import type { CcEvent } from '@shared/types/cc-events'

export interface AccumulatedResponse {
  readonly text: string
  readonly responseTokens: number | null
}

// Per-conversation buffer for assistant response text. Reset between user
// sends. Driven by parser events: response-chunk accumulates text;
// tokens-used updates the last-seen token count; response-complete returns
// the accumulated payload (and the caller MUST call drain() before the next
// startCollecting()).
export class ResponseAccumulator {
  private buffer: string[] = []
  private lastTokens: number | null = null
  private collecting = false

  // Call when the user fires a send — starts collecting.
  startCollecting(): void {
    this.buffer = []
    this.lastTokens = null
    this.collecting = true
  }

  // Returns true when the accumulator should be drained (response-complete
  // fired). Caller is responsible for calling drain() afterward.
  handle(event: CcEvent): boolean {
    if (!this.collecting) return false
    if (event.kind === 'response-chunk') {
      this.buffer.push(event.text)
      return false
    }
    if (event.kind === 'tokens-used') {
      this.lastTokens = event.used
      return false
    }
    if (event.kind === 'response-complete') {
      return true
    }
    return false
  }

  drain(): AccumulatedResponse {
    const text = this.buffer.join('\n')
    const responseTokens = this.lastTokens
    this.buffer = []
    this.lastTokens = null
    this.collecting = false
    return { text, responseTokens }
  }
}
