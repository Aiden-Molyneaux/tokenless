// CcParser — line-based pattern matcher over a stream of (possibly chunked)
// PTY output. Strips ANSI first via AnsiStripper, accumulates a line buffer,
// emits typed CcEvents when known patterns are recognized.
//
// Pure state — easy to unit-test. Tolerant — unknown lines are ignored.

import type { CcEvent } from '@shared/types/cc-events'

import { AnsiStripper } from './ansi'

const TOKENS_RE = /^tokens:\s*(\d+)\s*\/\s*(\d+)\s*$/
const TOOL_CALL_RE = /^tool:\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*(.*?)\s*\)\s*$/

// "received:" is the mock-claude echo signature — real claude doesn't emit it
// but a similar end-of-response signal will be added in Phase 4C.
const MOCK_RECEIVED_RE = /^\[mock-claude\]\s+received:/

// Prompt patterns — known prompt strings only.
// The bare `>` regex from Phase 4B is removed because it false-positives on
// shell-style continuation output. Phase 4D will calibrate this against real claude output.
function isPromptLine(line: string): boolean {
  const trimmed = line.replace(/\r/g, '').trimEnd()
  return trimmed === 'claude-mock>' || trimmed === 'claude>'
}

export class CcParser {
  private readonly stripper = new AnsiStripper()
  private lineBuf = ''

  constructor(private readonly onEvent: (event: CcEvent) => void) {}

  feed(chunk: string): void {
    const clean = this.stripper.feed(chunk)
    this.lineBuf += clean
    // Split on newline — but \r alone (used by the mock) ends a logical line
    // for our purposes. Normalize \r\n → \n first.
    const normalized = this.lineBuf.replace(/\r\n/g, '\n')
    const lines = normalized.split('\n')
    // Last segment is incomplete — hold for next chunk
    this.lineBuf = lines.pop() ?? ''
    for (const raw of lines) {
      this.processLine(raw)
    }
    // Special case: prompts often DON'T end with \n — they appear at the end
    // of the chunk as the trailing buffered text. Check the buffer too.
    if (this.lineBuf.length > 0 && isPromptLine(this.lineBuf)) {
      this.onEvent({ kind: 'prompt-ready' })
      this.lineBuf = ''
    }
  }

  private processLine(line: string): void {
    if (line.length === 0) return
    if (isPromptLine(line)) {
      this.onEvent({ kind: 'prompt-ready' })
      return
    }
    if (MOCK_RECEIVED_RE.test(line)) {
      this.onEvent({ kind: 'response-complete' })
      return
    }
    const tokenMatch = TOKENS_RE.exec(line.trim())
    if (tokenMatch) {
      this.onEvent({
        kind: 'tokens-used',
        used: Number(tokenMatch[1]),
        total: Number(tokenMatch[2])
      })
      return
    }
    const toolMatch = TOOL_CALL_RE.exec(line.trim())
    if (toolMatch) {
      this.onEvent({
        kind: 'tool-call',
        name: toolMatch[1],
        summary: toolMatch[2]
      })
      return
    }
    // Unknown lines are emitted as response-chunk — the accumulator (or any
    // other listener) decides what to keep based on its own state machine
    // (bracketed between user-send and response-complete events).
    this.onEvent({ kind: 'response-chunk', text: line })
  }
}
