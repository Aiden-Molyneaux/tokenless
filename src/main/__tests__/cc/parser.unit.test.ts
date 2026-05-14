import { describe, it, expect } from 'vitest'

import { CcParser } from '../../cc/parser'
import type { CcEvent } from '@shared/types/cc-events'

// Purpose: CcParser consumes raw PTY chunks (possibly containing ANSI), strips
// ANSI, accumulates a line buffer, and emits CcEvents when it recognizes the
// line patterns the mock-claude (and real claude) produce.
//
// Patterns recognized in Phase 4B (deliberately conservative):
//   - "claude-mock> " or "> " or ">" alone on a line → prompt-ready
//   - "[mock-claude] received:" → response-complete (the mock echoes input then re-prompts)
//   - "tokens: <used>/<total>"  → tokens-used
//   - "tool: <name>(<summary>)" → tool-call
//
// Real-claude patterns are nuanced and may change; the parser is intentionally
// tolerant — unknown lines are ignored, not errored. Phase 4C tightens this
// against real claude output.

describe('cc/parser', () => {
  function collect(): { events: CcEvent[]; onEvent: (e: CcEvent) => void } {
    const events: CcEvent[] = []
    return { events, onEvent: (e) => events.push(e) }
  }

  it('emits prompt-ready when a known prompt line appears', () => {
    const { events, onEvent } = collect()
    const p = new CcParser(onEvent)
    p.feed('claude-mock> ')
    expect(events).toEqual([{ kind: 'prompt-ready' }])
  })

  it('strips ANSI before pattern matching', () => {
    const { events, onEvent } = collect()
    const p = new CcParser(onEvent)
    p.feed('\x1b[32mclaude-mock>\x1b[0m ')
    expect(events).toEqual([{ kind: 'prompt-ready' }])
  })

  it('emits response-complete when the mock-echo line appears', () => {
    const { events, onEvent } = collect()
    const p = new CcParser(onEvent)
    p.feed('[mock-claude] received: hello\r\n')
    expect(events).toEqual([{ kind: 'response-complete' }])
  })

  it('emits tokens-used when a "tokens: N/M" line appears', () => {
    const { events, onEvent } = collect()
    const p = new CcParser(onEvent)
    p.feed('tokens: 1234/200000\r\n')
    expect(events).toEqual([{ kind: 'tokens-used', used: 1234, total: 200000 }])
  })

  it('emits tool-call when a "tool: name(summary)" line appears', () => {
    const { events, onEvent } = collect()
    const p = new CcParser(onEvent)
    p.feed('tool: Read(src/main/index.ts)\r\n')
    expect(events).toEqual([{ kind: 'tool-call', name: 'Read', summary: 'src/main/index.ts' }])
  })

  it('ignores lines that match no known pattern', () => {
    const { events, onEvent } = collect()
    const p = new CcParser(onEvent)
    p.feed('arbitrary chatter from claude\r\n')
    p.feed('more random text\r\n')
    expect(events).toEqual([])
  })

  it('handles a line split across two chunks', () => {
    const { events, onEvent } = collect()
    const p = new CcParser(onEvent)
    p.feed('tokens: 100')
    p.feed('/2000\r\n')
    expect(events).toEqual([{ kind: 'tokens-used', used: 100, total: 2000 }])
  })

  it('emits multiple events from one chunk containing multiple lines', () => {
    const { events, onEvent } = collect()
    const p = new CcParser(onEvent)
    p.feed('tokens: 50/100\r\nclaude-mock> ')
    expect(events).toEqual([
      { kind: 'tokens-used', used: 50, total: 100 },
      { kind: 'prompt-ready' }
    ])
  })
})
