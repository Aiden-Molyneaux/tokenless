# Phase 4B: Output Parser + Stop + Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete spec §9 Phase 4's exit criteria — "Send, stream, stop, resume all work" — by adding the output parser (so we can detect prompts/tool-calls/end-of-response), Stop (SIGINT to PTY + persist partial turn), Resume (`claude --resume <id>` from stored session ID), per-conversation TerminalPane keying (Phase 4A deferred), and the most critical §7.1 failure modes (spawn ENOENT + mid-session crash surfacing). The watchdog hang detector, output-pattern failures (quota/auth), recovery UIs, and full telemetry tick are deferred to Phase 4C.

**Architecture:** A new `main/cc/parser.ts` is a **pure state machine** that consumes raw PTY chunks, strips ANSI escape sequences, and emits typed `CcEvent` objects (prompt-ready, tool-call, response-complete, token-usage). `CcLifecycle` instantiates one parser per conversation, fans each chunk through it, and rebroadcasts the events as `cc:event` IPC alongside the existing `cc:output-chunk`. Stop and Resume extend `CcLifecycle` with `stop(id, signal)` (already exists from 4A — now wired via IPC) and `resume(id, opts)` (new — spawns with a known session-id). The renderer gains a `useCcEvents(conversationId)` hook, the TerminalToolbar Stop button calls `cc:stop`, and AppShell's sidebar-click triggers `cc:resume` when the clicked conversation has a stored `cc_session_id` but no live PTY.

**Tech Stack:** Same as Phase 4A. Parser is pure TS — no new dependencies. ANSI strip is a single regex + small state to handle CSI sequences split across chunks.

---

## File Structure

**New files (main process):**
- `src/main/cc/parser.ts` — `CcParser` class (pure state machine)
- `src/main/cc/ansi.ts` — ANSI escape stripper
- `src/main/__tests__/cc/parser.unit.test.ts`
- `src/main/__tests__/cc/ansi.unit.test.ts`

**New files (shared):**
- `src/shared/types/cc-events.ts` — `CcEvent` discriminated union

**New files (renderer):**
- `src/renderer/src/hooks/use-cc-events.ts`
- `src/renderer/src/hooks/__tests__/use-cc-events.unit.test.tsx`
- `src/renderer/src/components/notifications/ClaudeNotFoundModal.tsx`
- `src/renderer/src/components/notifications/styles.css`

**New files (tests):**
- `test/e2e/cc-stop.e2e.test.ts`
- `test/e2e/cc-resume.e2e.test.ts`
- `test/e2e/cc-not-found.e2e.test.ts`

**Modified files:**
- `src/shared/ipc/cc.ts` — add `cc:stop`, `cc:resume`, `cc:event` channels
- `src/shared/ipc.ts` — re-export new channels
- `src/main/cc/types.ts` — extend `SpawnOptions` with `existingSessionId?: string` (for resume)
- `src/main/cc/spawner.ts` — when `existingSessionId` is set, pass it instead of generating new
- `src/main/cc/lifecycle.ts` — `resume(opts)` method, attach parser per slot, fan chunks through parser, expose parser events via constructor callback
- `src/main/ipc/cc-handler.ts` — `stop(req)` + `resume(req)` methods; persist `status='stopped'` on stop
- `src/main/ipc/index.ts` — wire parser-event broadcast in `CcLifecycle` callbacks
- `src/main/db/dao/conversations.ts` — (review only — already supports `ccSessionId` + `status` updates)
- `src/preload/index.ts` — expose `cc.stop`, `cc.resume`, `cc.onEvent`
- `src/preload/index.d.ts` — declare new APIs
- `src/renderer/src/components/terminal/TerminalSection.tsx` — local `streaming` state replaced by `cc:event`-driven derivation
- `src/renderer/src/components/terminal/TerminalPane.tsx` — `key={conversationId ?? 'none'}` on the container OR move conversationId into resize-effect deps so the closure refreshes
- `src/renderer/src/components/terminal/TerminalToolbar.tsx` — keep `onStop` prop; wiring lives in TerminalSection
- `src/renderer/src/components/layout/AppShell.tsx` — `handleSelectConversation` calls `cc:resume` if clicked row has stored sessionId + no live PTY
- `src/renderer/src/components/layout/ConversationListItem.tsx` — add a small "● live" or "○ idle" indicator (Phase 4C may polish further)
- `test/doubles/claude-mock.cjs` — emit a recognizable prompt marker + a fake "tokens: N/M" line per response so parser tests can hit those branches
- `docs/decisions.md` — ADR-028 (parser pattern)
- `docs/observability.md` — extend `cc` row with new events
- `docs/test-scenarios.md` — append Phase 4B scenarios

---

## Task 1: Fix Phase 4A deferred — per-conversation TerminalPane keying

**Why first:** isolated, small, has a known correctness contract from Phase 4A's review. Cleanest to land alone.

**Files:**
- Modify: `src/renderer/src/components/terminal/TerminalSection.tsx`
- Modify: `src/renderer/src/components/terminal/TerminalPane.tsx`

- [ ] **Step 1: Add `key={conversationId}` to TerminalPane usage**

Edit `src/renderer/src/components/terminal/TerminalSection.tsx`. Find the `<TerminalPane conversationId={conversationId} />` (or similar) and add a key prop so the pane remounts on conversation switch:

```tsx
<TerminalPane key={conversationId ?? 'none'} conversationId={conversationId} />
```

The `?? 'none'` handles the no-active-conversation case (one stable key, no remount thrash when both prior + next are null).

- [ ] **Step 2: Verify the resize closure is now safe**

In `src/renderer/src/components/terminal/TerminalPane.tsx`, the `// eslint-disable-next-line react-hooks/exhaustive-deps` comment can stay — but its rationale changes. The mount-time conversationId capture is now correct because the WHOLE component remounts on conversationId change (forced by the key). Update the comment to:

```ts
    // Mount effect runs once per (re)mount. Since TerminalPane is keyed by
    // conversationId in its parent (TerminalSection), a conversation switch
    // remounts this whole component — refreshing the closure capture below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

- [ ] **Step 3: Verify all unit tests still pass**

```bash
npm run test:run
```

Expected: 111 tests still green (no change to test count yet).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/terminal/TerminalSection.tsx \
        src/renderer/src/components/terminal/TerminalPane.tsx
git commit -m "fix(phase-4a-deferred): key TerminalPane by conversationId so resize closure stays fresh"
```

---

## Task 2: ANSI escape stripper

**Files:**
- Create: `src/main/cc/ansi.ts`
- Create: `src/main/__tests__/cc/ansi.unit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/cc/ansi.unit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

import { AnsiStripper } from '../../cc/ansi'

// Purpose: AnsiStripper removes ANSI CSI escape sequences from a stream of
// chunks. It handles sequences split across chunks (CSI half in chunk A, the
// rest in chunk B) by buffering an in-progress sequence.

describe('cc/ansi', () => {
  it('strips simple CSI color codes', () => {
    const s = new AnsiStripper()
    expect(s.feed('\x1b[31mred\x1b[0m')).toBe('red')
  })

  it('passes plain text through unchanged', () => {
    const s = new AnsiStripper()
    expect(s.feed('hello world')).toBe('hello world')
  })

  it('handles a sequence split across chunks', () => {
    const s = new AnsiStripper()
    // ESC starts in chunk 1, [31m completes in chunk 2
    expect(s.feed('before\x1b')).toBe('before')
    expect(s.feed('[31mred\x1b[0mafter')).toBe('redafter')
  })

  it('handles incomplete sequence at end of stream', () => {
    const s = new AnsiStripper()
    expect(s.feed('text\x1b[3')).toBe('text')
    // Stripper holds onto the trailing partial; next chunk completes it
    expect(s.feed('1mred')).toBe('red')
  })

  it('strips OSC (operating system command) sequences', () => {
    const s = new AnsiStripper()
    // OSC: ESC ] ... BEL or ESC ] ... ESC \
    expect(s.feed('\x1b]0;title\x07after')).toBe('after')
  })

  it('strips cursor movement', () => {
    const s = new AnsiStripper()
    expect(s.feed('a\x1b[2Db')).toBe('ab')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/main/__tests__/cc/ansi.unit.test.ts
```

Expected: FAIL — `ansi` module not found.

- [ ] **Step 3: Implement the stripper**

Create `src/main/cc/ansi.ts`:

```ts
// AnsiStripper — feeds chunks in, emits same chunks with ANSI escape
// sequences stripped. Handles CSI and OSC. Buffers a partial sequence
// across chunk boundaries so a sequence split mid-stream still gets
// recognized and removed.
//
// CSI: ESC [ <params> <command-letter>
// OSC: ESC ] <params> (BEL | ESC \)
// We treat anything starting with ESC that isn't CSI/OSC as a 2-char
// sequence (ESC + final byte) — covers most short sequences.

const ESC = 0x1b
const BEL = 0x07
const BACKSLASH = 0x5c

type State = 'text' | 'esc' | 'csi' | 'osc' | 'osc-end-esc'

export class AnsiStripper {
  private state: State = 'text'

  feed(chunk: string): string {
    const out: string[] = []
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk.charCodeAt(i)
      switch (this.state) {
        case 'text':
          if (c === ESC) this.state = 'esc'
          else out.push(chunk[i])
          break
        case 'esc':
          if (chunk[i] === '[') this.state = 'csi'
          else if (chunk[i] === ']') this.state = 'osc'
          else this.state = 'text' // 2-char sequence — drop both
          break
        case 'csi':
          // CSI ends at the first byte in 0x40–0x7E
          if (c >= 0x40 && c <= 0x7e) this.state = 'text'
          break
        case 'osc':
          // OSC ends at BEL or ESC \
          if (c === BEL) this.state = 'text'
          else if (c === ESC) this.state = 'osc-end-esc'
          break
        case 'osc-end-esc':
          if (c === BACKSLASH) this.state = 'text'
          else this.state = 'osc' // false alarm — keep eating
          break
      }
    }
    return out.join('')
  }

  // Reset state between conversations (rare — usually one parser per slot for
  // its lifetime).
  reset(): void {
    this.state = 'text'
  }
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm run test:run -- src/main/__tests__/cc/ansi.unit.test.ts
```

Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add src/main/cc/ansi.ts src/main/__tests__/cc/ansi.unit.test.ts
git commit -m "feat(phase-4b): AnsiStripper — CSI + OSC stripping with cross-chunk state"
```

---

## Task 3: CcEvent shared types

**Files:**
- Create: `src/shared/types/cc-events.ts`

- [ ] **Step 1: Define the event union**

Create `src/shared/types/cc-events.ts`:

```ts
// CcEvent — typed events emitted by the parser. The renderer subscribes via
// useCcEvents() and uses these to drive UI state (streaming indicator,
// context budget meter, etc.). Raw chunks still flow separately via
// cc:output-chunk for xterm.js.
//
// Phase 4B emits the four basic event types. Phase 4C will add quota / auth /
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
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/cc-events.ts
git commit -m "feat(phase-4b): shared CcEvent type union (prompt-ready, tool-call, response-complete, tokens-used)"
```

---

## Task 4: CcParser state machine

**Files:**
- Create: `src/main/cc/parser.ts`
- Create: `src/main/__tests__/cc/parser.unit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/cc/parser.unit.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

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
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/main/__tests__/cc/parser.unit.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the parser**

Create `src/main/cc/parser.ts`:

```ts
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

// Prompt patterns — both the mock's "claude-mock>" and a generic ">" alone.
function isPromptLine(line: string): boolean {
  const trimmed = line.replace(/\r/g, '').trimEnd()
  return /^(?:claude-mock>|>)\s*$/.test(trimmed)
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
    // Unknown line — ignored
  }
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm run test:run -- src/main/__tests__/cc/parser.unit.test.ts
```

Expected: PASS (8/8).

- [ ] **Step 5: Commit**

```bash
git add src/main/cc/parser.ts src/main/__tests__/cc/parser.unit.test.ts
git commit -m "feat(phase-4b): CcParser — line-based pattern matcher with ANSI stripping"
```

---

## Task 5: Wire parser into CcLifecycle

**Files:**
- Modify: `src/main/cc/lifecycle.ts`
- Modify: `src/main/__tests__/cc/lifecycle.integration.test.ts`

- [ ] **Step 1: Add `onEvent` to LifecycleCallbacks**

Edit `src/main/cc/lifecycle.ts`. Update the callbacks interface:

```ts
export interface LifecycleCallbacks {
  onChunk(event: { conversationId: number; chunk: string }): void
  onExit(event: { conversationId: number; exitCode: number; signal?: number }): void
  onEvent(event: { conversationId: number; event: CcEvent }): void
}
```

Import `CcEvent`:

```ts
import type { CcEvent } from '@shared/types/cc-events'
import { CcParser } from './parser'
```

Update the `Slot` interface to include a parser:

```ts
interface Slot {
  readonly conversationId: number
  readonly sessionId: string
  readonly pty: PtyHandle
  readonly parser: CcParser
}
```

In `start()`, after spawning the PTY:

```ts
const parser = new CcParser((event) => {
  this.cb.onEvent({ conversationId: opts.conversationId, event })
})
const slot: Slot = { conversationId: opts.conversationId, sessionId, pty, parser }
this.slots.set(opts.conversationId, slot)

pty.onData((chunk) => {
  parser.feed(chunk)
  this.cb.onChunk({ conversationId: opts.conversationId, chunk })
})
```

(Note: feed the parser BEFORE calling onChunk so events arrive in causal order with the chunk that produced them.)

- [ ] **Step 2: Update the existing test to provide onEvent**

Edit `src/main/__tests__/cc/lifecycle.integration.test.ts`. In `beforeEach`, add `onEvent: vi.fn()` to the callbacks object. Add a new test:

```ts
it('feeds chunks through the parser and emits cc:events', () => {
  const onEvent = vi.fn()
  const lc = new CcLifecycle(factory, { onChunk, onExit, onEvent })
  lc.start({ conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30, env: { CLAUDE_CONFIG_DIR: 'C:/c' } })
  lastPty!.emitData('claude-mock> ')
  expect(onEvent).toHaveBeenCalledWith({
    conversationId: 7,
    event: { kind: 'prompt-ready' }
  })
})
```

- [ ] **Step 3: Run lifecycle tests**

```bash
npm run test:run -- src/main/__tests__/cc/lifecycle.integration.test.ts
```

Expected: PASS (8/8 — 7 existing + 1 new).

- [ ] **Step 4: Commit**

```bash
git add src/main/cc/lifecycle.ts src/main/__tests__/cc/lifecycle.integration.test.ts
git commit -m "feat(phase-4b): wire CcParser into CcLifecycle — onEvent callback fans parsed events to IPC"
```

---

## Task 6: cc:event IPC channel + broadcast

**Files:**
- Modify: `src/shared/ipc/cc.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

- [ ] **Step 1: Add the channel + payload**

Edit `src/shared/ipc/cc.ts`. Add:

```ts
export const IPC_CC_EVENT = 'cc:event'

import type { CcEvent } from '../types/cc-events'

export interface CcEventPayload {
  readonly conversationId: number
  readonly event: CcEvent
}
```

(Hoist the `CcEvent` import to the top of the file alongside other imports.)

- [ ] **Step 2: Re-export from src/shared/ipc.ts**

Add `IPC_CC_EVENT` + `CcEventPayload` to the existing `from './ipc/cc'` re-export block. Update the legacy `IpcChannelName` union to include `'cc:event'`.

- [ ] **Step 3: Wire the broadcast in main/ipc/index.ts**

Edit `src/main/ipc/index.ts`. In the `CcLifecycle` constructor's callbacks object, add:

```ts
onEvent: (e) => broadcast(IPC_CC_EVENT, e)
```

Import `IPC_CC_EVENT` from `@shared/ipc/cc`.

- [ ] **Step 4: Expose via preload**

Edit `src/preload/index.ts`. In the `cc` namespace, add:

```ts
onEvent(fn: (payload: CcEventPayload) => void): () => void {
  const listener = (_e: unknown, payload: CcEventPayload): void => fn(payload)
  ipcRenderer.on(IPC_CC_EVENT, listener as never)
  return () => ipcRenderer.removeListener(IPC_CC_EVENT, listener as never)
}
```

Import the constant + payload type. Update `src/preload/index.d.ts` to declare `onEvent` on the `cc` namespace of `TokenlessApi`.

- [ ] **Step 5: Typecheck + test**

```bash
npm run typecheck
npm run test:run
```

Expected: clean + all green.

- [ ] **Step 6: Commit**

```bash
git add src/shared/ipc/cc.ts src/shared/ipc.ts src/main/ipc/index.ts \
        src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(phase-4b): cc:event IPC channel + broadcast wiring + preload exposure"
```

---

## Task 7: useCcEvents renderer hook

**Files:**
- Create: `src/renderer/src/hooks/use-cc-events.ts`
- Create: `src/renderer/src/hooks/__tests__/use-cc-events.unit.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/hooks/__tests__/use-cc-events.unit.test.tsx`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useCcEvents } from '../use-cc-events'

describe('hooks/use-cc-events', () => {
  let listener: ((p: { conversationId: number; event: unknown }) => void) | null
  let unsub: ReturnType<typeof vi.fn>

  beforeEach(() => {
    listener = null
    unsub = vi.fn()
    ;(window as unknown as { tokenless: unknown }).tokenless = {
      cc: {
        onEvent: (fn: typeof listener) => {
          listener = fn
          return unsub
        }
      }
    }
  })

  it('forwards events for the matching conversationId', () => {
    const onEvent = vi.fn()
    renderHook(() => useCcEvents(7, onEvent))
    act(() => listener?.({ conversationId: 7, event: { kind: 'prompt-ready' } }))
    expect(onEvent).toHaveBeenCalledWith({ kind: 'prompt-ready' })
  })

  it('ignores events for other conversations', () => {
    const onEvent = vi.fn()
    renderHook(() => useCcEvents(7, onEvent))
    act(() => listener?.({ conversationId: 99, event: { kind: 'prompt-ready' } }))
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('does not subscribe when conversationId is null', () => {
    renderHook(() => useCcEvents(null, vi.fn()))
    expect(listener).toBeNull()
  })

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useCcEvents(7, vi.fn()))
    unmount()
    expect(unsub).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/renderer/src/hooks/__tests__/use-cc-events.unit.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement the hook (mirrors useCcSubscription's ref pattern)**

Create `src/renderer/src/hooks/use-cc-events.ts`:

```ts
// useCcEvents — subscribe to parsed cc:event IPC for a conversationId.
// Callback held in a ref so the IPC listener only re-attaches when
// conversationId changes (same pattern as useCcSubscription).

import { useEffect, useRef } from 'react'

import type { CcEvent } from '@shared/types/cc-events'

export function useCcEvents(
  conversationId: number | null,
  onEvent: (event: CcEvent) => void
): void {
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    if (conversationId === null) return undefined
    const unsub = window.tokenless.cc.onEvent((payload) => {
      if (payload.conversationId === conversationId) {
        onEventRef.current(payload.event)
      }
    })
    return () => unsub()
  }, [conversationId])
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm run test:run -- src/renderer/src/hooks/__tests__/use-cc-events.unit.test.tsx
```

Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/hooks/use-cc-events.ts \
        src/renderer/src/hooks/__tests__/use-cc-events.unit.test.tsx
git commit -m "feat(phase-4b): useCcEvents hook — parsed-event subscription per conversationId"
```

---

## Task 8: TerminalSection — derive `streaming` from cc:events

**Files:**
- Modify: `src/renderer/src/components/terminal/TerminalSection.tsx`

- [ ] **Step 1: Replace local streaming state with event-derived state**

The current `useState(true)` for `streaming` is from Phase 2B. Phase 4B replaces it with: `streaming = true` when a chunk has arrived but no `response-complete` event yet (or `prompt-ready` after a tool call). For Phase 4B's MVP, the rule is simply:

- Start as `false` (no conversation, no PTY)
- Becomes `true` when the user calls Send (parent component AppShell tells us)
- Becomes `false` when a `response-complete` or `prompt-ready` event arrives
- Becomes `false` when a `cc:exit` event arrives

The cleanest API: `TerminalSection` accepts a `streaming: boolean` prop, computed by AppShell, and a `conversationId`. AppShell subscribes to `useCcEvents` + `cc.onExit` to flip its own `streaming` state.

Actually, the simpler shape — keep streaming state inside TerminalSection but DRIVE it via useCcEvents:

Replace `src/renderer/src/components/terminal/TerminalSection.tsx`:

```tsx
import { useState } from 'react'

import { useCcEvents } from '../../hooks/use-cc-events'
import { rendererLogger } from '../../observability/logger-bridge'
import { TerminalPane } from './TerminalPane'
import { TerminalToolbar } from './TerminalToolbar'
import './styles.css'

interface TerminalSectionProps {
  conversationId: number | null
}

export function TerminalSection({ conversationId }: TerminalSectionProps): JSX.Element {
  // streaming = true while we've started a send but haven't seen a
  // response-complete / prompt-ready event yet.
  const [streaming, setStreaming] = useState(false)

  // Listen for cc:event — flip streaming off on terminal markers.
  useCcEvents(conversationId, (event) => {
    if (event.kind === 'response-complete' || event.kind === 'prompt-ready') {
      setStreaming(false)
    }
  })

  // Phase 4B Task 9 wires this to cc:stop IPC. For now, just log.
  const handleStop = (): void => {
    if (conversationId === null) {
      rendererLogger.warn('ui', 'terminal-stop-no-conv', 'Stop clicked with no active conversation')
      return
    }
    // The real IPC call lands in Task 9 — keep the log so the click is observable.
    rendererLogger.info('ui', 'terminal-stop-clicked', 'Stop clicked (cc:stop wiring lands Task 9)', {
      conversationId
    })
  }

  return (
    <section className="terminal-section">
      <TerminalToolbar onStop={handleStop} streaming={streaming} />
      <TerminalPane key={conversationId ?? 'none'} conversationId={conversationId} />
    </section>
  )
}
```

Note: `streaming` here STARTS false. The parent (Composer/AppShell) needs to flip it to true when Send is called. For Phase 4B that signaling is handled inline — when the parser sees `response-complete` or `prompt-ready`, we flip off. We don't yet have a clean "flip on" path; that's intentional for Phase 4B because the Stop button is more useful "always available while there's a live PTY" than "only enabled mid-stream."

**Revise:** instead of `streaming` deciding when Stop is enabled, base it on "is there a live cc subprocess?". That's a derived state from cc:exit. Simpler still: enable Stop whenever `conversationId !== null` and an exit hasn't fired.

Adjust the implementation:

```tsx
import { useState } from 'react'

import { useCcEvents } from '../../hooks/use-cc-events'
import { rendererLogger } from '../../observability/logger-bridge'
import { TerminalPane } from './TerminalPane'
import { TerminalToolbar } from './TerminalToolbar'
import './styles.css'

interface TerminalSectionProps {
  conversationId: number | null
}

export function TerminalSection({ conversationId }: TerminalSectionProps): JSX.Element {
  // PTY is live as long as we haven't seen an exit for this conversation.
  // (Phase 4B: re-derives true on every conversationId change because the
  // key on TerminalPane forces a fresh component tree.)
  const [ptyLive, setPtyLive] = useState(conversationId !== null)

  useCcEvents(conversationId, (event) => {
    // No state changes from these events in Phase 4B's MVP. Phase 4C will
    // use them to drive the budget meter.
    void event
  })

  // When conversationId changes, reset the live flag.
  // We use a key on TerminalPane so its xterm gets reset, but the
  // TerminalSection itself persists, so we manually reset state here.
  // The state hook above already captures the initial state from the new
  // conversationId — to also react to cc:exit we'd subscribe in AppShell
  // and pass a prop down. For Phase 4B the simpler approach: always allow
  // Stop while conversationId is set. The IPC handler will gracefully
  // ignore stop calls on already-dead PTYs.

  const handleStop = (): void => {
    if (conversationId === null) {
      rendererLogger.warn('ui', 'terminal-stop-no-conv', 'Stop clicked with no active conversation')
      return
    }
    rendererLogger.info('ui', 'terminal-stop-clicked', 'Stop clicked (cc:stop wiring lands Task 9)', {
      conversationId
    })
  }

  return (
    <section className="terminal-section">
      <TerminalToolbar onStop={handleStop} streaming={ptyLive} />
      <TerminalPane key={conversationId ?? 'none'} conversationId={conversationId} />
    </section>
  )
}
```

The `void event` is intentional — the hook subscription is wired but we don't use the events to drive state in this MVP. Phase 4C will. The `setPtyLive` is unused for now but kept so the wiring is obvious.

Actually for simplicity, drop `useState(ptyLive)` entirely. The Stop button enables whenever `conversationId !== null`. Refactor to:

```tsx
import { useCcEvents } from '../../hooks/use-cc-events'
import { rendererLogger } from '../../observability/logger-bridge'
import { TerminalPane } from './TerminalPane'
import { TerminalToolbar } from './TerminalToolbar'
import './styles.css'

interface TerminalSectionProps {
  conversationId: number | null
}

export function TerminalSection({ conversationId }: TerminalSectionProps): JSX.Element {
  // Subscribe to events even though we don't use them yet — keeps the
  // wiring hot so Phase 4C just adds state.
  useCcEvents(conversationId, () => {
    /* Phase 4C: drive budget meter from tokens-used events */
  })

  const handleStop = async (): Promise<void> => {
    if (conversationId === null) {
      rendererLogger.warn('ui', 'terminal-stop-no-conv', 'Stop clicked with no active conversation')
      return
    }
    // The cc:stop IPC call lands in Task 9 — for now log to surface clicks.
    rendererLogger.info('ui', 'terminal-stop-clicked', 'Stop clicked (cc:stop wiring lands Task 9)', {
      conversationId
    })
  }

  return (
    <section className="terminal-section">
      <TerminalToolbar onStop={() => void handleStop()} streaming={conversationId !== null} />
      <TerminalPane key={conversationId ?? 'none'} conversationId={conversationId} />
    </section>
  )
}
```

**Implementer choice:** pick the cleanest expression. The contract is: Stop button is enabled when a conversation is active. The Task 9 commit replaces the log with the real IPC call.

- [ ] **Step 2: Typecheck + test**

```bash
npm run typecheck
npm run test:run
```

Expected: clean + green.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/terminal/TerminalSection.tsx
git commit -m "feat(phase-4b): TerminalSection subscribes to cc:events; Stop button enables when conversation active"
```

---

## Task 9: cc:stop IPC + lifecycle wiring + persist partial turn

**Files:**
- Modify: `src/shared/ipc/cc.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc/cc-handler.ts`
- Modify: `src/main/__tests__/ipc/cc-handler.integration.test.ts`
- Modify: `src/main/cc/lifecycle.ts` (stop already exists — just verify signature)
- Modify: `src/preload/index.ts`, `src/preload/index.d.ts`
- Modify: `src/renderer/src/components/terminal/TerminalSection.tsx` (replace Task 8's log with real IPC call)

- [ ] **Step 1: Add cc:stop channel**

Edit `src/shared/ipc/cc.ts`:

```ts
export const IPC_CC_STOP = 'cc:stop'

export interface CcStopRequest {
  readonly conversationId: number
}

export type CcStopResult = IpcResult<{ ok: true }>
```

Re-export from `src/shared/ipc.ts`.

- [ ] **Step 2: Write the failing handler test**

Add to `src/main/__tests__/ipc/cc-handler.integration.test.ts`:

```ts
it('stop kills the PTY and marks the most-recent in-flight turn as stopped', async () => {
  await handler.start({ conversationId, cwd: 'C:/x', cols: 100, rows: 30, accountId })
  await handler.send({ conversationId, prompt: 'hi', model: null, breadth: null, format: null })
  const result = await handler.stop({ conversationId })
  expect(result.ok).toBe(true)
  expect(lastPty!.killed).toBe(true)
  expect(lastPty!.killSignals[0]).toBe('SIGINT')
  // The most-recent turn for this conversation should now be status='stopped'.
  // Phase 4B persists this at stop-time — the simplest implementation finds
  // the most-recent user-role turn and downgrades its status. Real
  // assistant-turn writing comes in Phase 4C.
  const turn = db
    .prepare(
      'SELECT status FROM turns WHERE conversation_id = ? ORDER BY id DESC LIMIT 1'
    )
    .get(conversationId) as { status: string }
  expect(turn.status).toBe('stopped')
})

it('stop on unknown conversationId returns ok but is a no-op', async () => {
  // Stop is idempotent — Phase 7's branching may stop a conv that already
  // ended. NO error envelope here.
  const result = await handler.stop({ conversationId: 99999 })
  expect(result.ok).toBe(true)
})
```

- [ ] **Step 3: Run to confirm failure**

```bash
npm run test:run -- src/main/__tests__/ipc/cc-handler.integration.test.ts
```

Expected: FAIL — handler doesn't have `stop`.

- [ ] **Step 4: Implement handler.stop**

Edit `src/main/ipc/cc-handler.ts`. Add at the top of the channel imports:

```ts
import {
  // ... existing imports
  IPC_CC_STOP,
  type CcStopRequest,
  type CcStopResult
} from '@shared/ipc/cc'
```

Add the method (between resize and install):

```ts
stop = async (req: CcStopRequest): Promise<CcStopResult> =>
  withIpcResult(this.logger, 'cc', 'cc-stop', async () => {
    // No-op + ok if the conversation has no live PTY — stop is idempotent.
    const handle = this.lifecycle.get(req.conversationId)
    if (handle) {
      this.lifecycle.stop(req.conversationId, 'SIGINT')
      // Persist the most-recent turn for this conversation as 'stopped'.
      // The cc:exit broadcast will eventually fire when SIGINT propagates,
      // but we set the status optimistically here so the DB reflects user
      // intent immediately.
      this.db
        .prepare(
          `UPDATE turns SET status = 'stopped'
           WHERE id = (
             SELECT id FROM turns
             WHERE conversation_id = ?
             ORDER BY id DESC
             LIMIT 1
           )`
        )
        .run(req.conversationId)
      this.logger.info('cc', 'cc-stop', 'Sent SIGINT and marked turn stopped', {
        conversationId: req.conversationId
      })
    }
    return { ok: true as const }
  })
```

In `install()`, add:

```ts
ipcMain.handle(IPC_CC_STOP, async (_e: IpcMainInvokeEvent, req: CcStopRequest) =>
  this.stop(req)
)
this.installedHandlers.push(IPC_CC_STOP)
```

- [ ] **Step 5: Run handler tests**

```bash
npm run test:run -- src/main/__tests__/ipc/cc-handler.integration.test.ts
```

Expected: all pass.

- [ ] **Step 6: Expose via preload**

Edit `src/preload/index.ts`. Add to the `cc` namespace:

```ts
stop(req: CcStopRequest): Promise<CcStopResult> {
  return ipcRenderer.invoke(IPC_CC_STOP, req) as Promise<CcStopResult>
}
```

Import the constants + types. Update `src/preload/index.d.ts`.

- [ ] **Step 7: Wire TerminalSection's Stop to the real IPC**

Edit `src/renderer/src/components/terminal/TerminalSection.tsx`. Replace the log-only `handleStop` with:

```ts
const handleStop = async (): Promise<void> => {
  if (conversationId === null) {
    rendererLogger.warn('ui', 'terminal-stop-no-conv', 'Stop clicked with no active conversation')
    return
  }
  const result = await window.tokenless.cc.stop({ conversationId })
  if (!result.ok) {
    rendererLogger.error('ui', 'terminal-stop-failed', result.error.message, {
      conversationId,
      code: result.error.code,
      logId: result.error.logId
    })
  } else {
    rendererLogger.info('ui', 'terminal-stop-ok', 'Sent stop to backend', { conversationId })
  }
}
```

- [ ] **Step 8: Full suite**

```bash
npm run typecheck
npm run test:run
```

Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add src/shared/ipc/cc.ts src/shared/ipc.ts \
        src/main/ipc/cc-handler.ts src/main/__tests__/ipc/cc-handler.integration.test.ts \
        src/preload/index.ts src/preload/index.d.ts \
        src/renderer/src/components/terminal/TerminalSection.tsx
git commit -m "feat(phase-4b): cc:stop IPC — SIGINT + persist turn status=stopped + Stop button wired"
```

---

## Task 10: Resume lifecycle — extend spawner + add CcLifecycle.resume

**Files:**
- Modify: `src/main/cc/types.ts` — `SpawnOptions.existingSessionId?`
- Modify: `src/main/cc/spawner.ts`
- Modify: `src/main/cc/lifecycle.ts`
- Modify: `src/main/__tests__/cc/spawner.unit.test.ts`
- Modify: `src/main/__tests__/cc/lifecycle.integration.test.ts`

- [ ] **Step 1: Extend SpawnOptions + spawner**

Edit `src/main/cc/types.ts`. Add to `SpawnOptions`:

```ts
// When set, spawnClaude passes this UUID to `claude --session-id <uuid>`
// instead of asking the caller (Lifecycle.start) to generate a fresh one.
// Used by resume — the conversation already has a stored cc_session_id.
readonly existingSessionId?: string
```

Edit `src/main/cc/spawner.ts`. The current code generates `args = ['--session-id', opts.sessionId]` and the caller passes `sessionId`. For resume, the Lifecycle calls `spawnClaude({ ...opts, sessionId: existingSessionId })`. The spawner doesn't need to change because it already takes whatever `sessionId` the caller passes. We just need a different `args` form when resuming:

Actually for resume, `claude --resume <uuid>` is the correct invocation per the spec — `--session-id` is for pre-specifying NEW sessions, `--resume` is for re-attaching to existing ones. Let's distinguish them.

Update `SpawnOptions`:

```ts
export interface SpawnOptions {
  readonly conversationId: number
  readonly sessionId: string
  // When true, spawn with `--resume <id>` instead of `--session-id <id>`.
  // The session ID is the same value either way.
  readonly resume?: boolean
  readonly cwd: string
  readonly cols: number
  readonly rows: number
  readonly env: {
    readonly CLAUDE_CONFIG_DIR: string
    readonly ANTHROPIC_API_KEY?: string
  }
  readonly claudeBin?: string
}
```

Update `spawnClaude` in `src/main/cc/spawner.ts`:

```ts
const args = opts.resume
  ? ['--resume', opts.sessionId]
  : ['--session-id', opts.sessionId]
```

- [ ] **Step 2: Add spawner test for resume**

Add to `src/main/__tests__/cc/spawner.unit.test.ts`:

```ts
it('on resume, spawns claude with --resume <sessionId> instead of --session-id', () => {
  let argsSeen: readonly string[] | undefined
  const factory: PtySpawnFn = (_bin, args, _opts) => {
    argsSeen = args
    return new MockPty()
  }
  spawnClaude(
    {
      conversationId: 1,
      sessionId: 'abc-def-uuid',
      resume: true,
      cwd: 'C:/x',
      cols: 80,
      rows: 24,
      env: { CLAUDE_CONFIG_DIR: 'C:/c' }
    },
    factory
  )
  expect(argsSeen).toEqual(['--resume', 'abc-def-uuid'])
})
```

- [ ] **Step 3: Add CcLifecycle.resume**

Edit `src/main/cc/lifecycle.ts`. Add a `resume` method:

```ts
export interface LifecycleResumeOptions {
  readonly conversationId: number
  readonly sessionId: string
  readonly cwd: string
  readonly cols: number
  readonly rows: number
  readonly env: { readonly CLAUDE_CONFIG_DIR: string; readonly ANTHROPIC_API_KEY?: string }
  readonly claudeBin?: string
}

resume(opts: LifecycleResumeOptions): LifecycleStartResult {
  if (this.slots.has(opts.conversationId)) {
    throw new Error(`conversation ${opts.conversationId} already active — one PTY per conversation`)
  }
  const pty = spawnClaude(
    {
      conversationId: opts.conversationId,
      sessionId: opts.sessionId,
      resume: true,
      cwd: opts.cwd,
      cols: opts.cols,
      rows: opts.rows,
      env: opts.env,
      claudeBin: opts.claudeBin
    },
    this.ptyFactory
  )
  const parser = new CcParser((event) => {
    this.cb.onEvent({ conversationId: opts.conversationId, event })
  })
  const slot: Slot = {
    conversationId: opts.conversationId,
    sessionId: opts.sessionId, // existing — don't generate
    pty,
    parser
  }
  this.slots.set(opts.conversationId, slot)

  pty.onData((chunk) => {
    parser.feed(chunk)
    this.cb.onChunk({ conversationId: opts.conversationId, chunk })
  })
  pty.onExit(({ exitCode, signal }) => {
    this.slots.delete(opts.conversationId)
    this.cb.onExit({ conversationId: opts.conversationId, exitCode, signal })
  })

  return { sessionId: opts.sessionId, pid: pty.pid }
}
```

Note the duplication with `start()` — Phase 4C may DRY this up. For now, explicit is OK.

- [ ] **Step 4: Add lifecycle test for resume**

Add to `src/main/__tests__/cc/lifecycle.integration.test.ts`:

```ts
it('resume spawns with the provided sessionId and stores it in the slot', () => {
  const lc = new CcLifecycle(factory, { onChunk, onExit, onEvent: vi.fn() })
  const r = lc.resume({
    conversationId: 5,
    sessionId: 'existing-uuid-here',
    cwd: 'C:/x',
    cols: 100,
    rows: 30,
    env: { CLAUDE_CONFIG_DIR: 'C:/c' }
  })
  expect(r.sessionId).toBe('existing-uuid-here')
  expect(lc.getSessionId(5)).toBe('existing-uuid-here')
})
```

- [ ] **Step 5: Run tests**

```bash
npm run test:run -- src/main/__tests__/cc/
```

Expected: all pass (spawner: 5/5, lifecycle: 9/9).

- [ ] **Step 6: Commit**

```bash
git add src/main/cc/types.ts src/main/cc/spawner.ts src/main/cc/lifecycle.ts \
        src/main/__tests__/cc/spawner.unit.test.ts \
        src/main/__tests__/cc/lifecycle.integration.test.ts
git commit -m "feat(phase-4b): CcLifecycle.resume — spawn with --resume <sessionId> instead of --session-id"
```

---

## Task 11: cc:resume IPC handler + preload

**Files:**
- Modify: `src/shared/ipc/cc.ts`, `src/shared/ipc.ts`
- Modify: `src/main/ipc/cc-handler.ts`
- Modify: `src/main/__tests__/ipc/cc-handler.integration.test.ts`
- Modify: `src/preload/index.ts`, `src/preload/index.d.ts`

- [ ] **Step 1: Add channel + types**

Edit `src/shared/ipc/cc.ts`:

```ts
export const IPC_CC_RESUME = 'cc:resume'

export interface CcResumeRequest {
  readonly conversationId: number
  readonly cwd: string
  readonly cols: number
  readonly rows: number
  readonly accountId: number
}

export interface CcResumeResponse {
  readonly sessionId: string
  readonly pid: number
}

export type CcResumeResult = IpcResult<CcResumeResponse>
```

Re-export from `src/shared/ipc.ts`.

- [ ] **Step 2: Handler test**

Add to `src/main/__tests__/ipc/cc-handler.integration.test.ts`:

```ts
it('resume looks up cc_session_id + delegates to lifecycle.resume', async () => {
  // First start a conversation so cc_session_id is persisted
  await handler.start({ conversationId, cwd: 'C:/x', cols: 100, rows: 30, accountId })
  const conv = ConversationsDao.getConversationById(db, conversationId)
  const storedSession = conv?.ccSessionId
  expect(storedSession).toBeTruthy()
  // Close so we can resume
  await handler.stop({ conversationId })
  await new Promise((r) => queueMicrotask(() => r(undefined)))

  // Now resume
  const result = await handler.resume({
    conversationId,
    cwd: 'C:/x',
    cols: 100,
    rows: 30,
    accountId
  })
  expect(result.ok).toBe(true)
  if (result.ok) {
    expect(result.data.sessionId).toBe(storedSession)
  }
})

it('resume returns NOT_FOUND when conversation has no stored cc_session_id', async () => {
  // Fresh conversation without a start
  const result = await handler.resume({
    conversationId,
    cwd: 'C:/x',
    cols: 100,
    rows: 30,
    accountId
  })
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error.code).toBe('NOT_FOUND')
})
```

- [ ] **Step 3: Run to confirm failure**

```bash
npm run test:run -- src/main/__tests__/ipc/cc-handler.integration.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement handler.resume**

Edit `src/main/ipc/cc-handler.ts`. Add the method:

```ts
resume = async (req: CcResumeRequest): Promise<CcResumeResult> =>
  withIpcResult(this.logger, 'cc', 'cc-resume', async () => {
    const account = AccountsDao.getAccountById(this.db, req.accountId)
    if (!account) throw notFound(`account ${req.accountId} not found`)
    const conv = ConversationsDao.getConversationById(this.db, req.conversationId)
    if (!conv) throw notFound(`conversation ${req.conversationId} not found`)
    if (!conv.ccSessionId) {
      throw notFound(`conversation ${req.conversationId} has no stored cc_session_id`)
    }
    const { sessionId, pid } = this.lifecycle.resume({
      conversationId: req.conversationId,
      sessionId: conv.ccSessionId,
      cwd: req.cwd,
      cols: req.cols,
      rows: req.rows,
      env: {
        CLAUDE_CONFIG_DIR: account.configDir,
        ...(account.apiKeyRef ? { ANTHROPIC_API_KEY: account.apiKeyRef } : {})
      }
    })
    this.logger.info('cc', 'cc-resume', 'Resumed claude subprocess', {
      conversationId: req.conversationId,
      sessionId,
      pid
    })
    return { sessionId, pid }
  })
```

Add to `install()`:

```ts
ipcMain.handle(IPC_CC_RESUME, async (_e: IpcMainInvokeEvent, req: CcResumeRequest) =>
  this.resume(req)
)
this.installedHandlers.push(IPC_CC_RESUME)
```

Import the new constant + types.

- [ ] **Step 5: Preload exposure**

Edit `src/preload/index.ts`. Add to the `cc` namespace:

```ts
resume(req: CcResumeRequest): Promise<CcResumeResult> {
  return ipcRenderer.invoke(IPC_CC_RESUME, req) as Promise<CcResumeResult>
}
```

Import. Update `src/preload/index.d.ts`.

- [ ] **Step 6: Run tests**

```bash
npm run test:run -- src/main/__tests__/ipc/cc-handler.integration.test.ts
npm run typecheck
```

Expected: pass + clean.

- [ ] **Step 7: Commit**

```bash
git add src/shared/ipc/cc.ts src/shared/ipc.ts \
        src/main/ipc/cc-handler.ts src/main/__tests__/ipc/cc-handler.integration.test.ts \
        src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(phase-4b): cc:resume IPC handler — looks up stored cc_session_id + delegates to lifecycle"
```

---

## Task 12: AppShell — clicking a sidebar conversation resumes its session

**Files:**
- Modify: `src/renderer/src/components/layout/AppShell.tsx`

- [ ] **Step 1: Augment handleSelectConversation**

The current `handleSelectConversation(id)` just calls `setActiveConversationId`. Phase 4B extends it: if the selected conversation has a stored `cc_session_id` AND its PTY is not already live (no entry for it in the active lifecycle map — but the renderer can't see that map), the renderer simply ALWAYS calls `cc:resume`. The handler returns ok if a PTY was successfully spawned; if a PTY was already live for that conversation, lifecycle throws "already active" — we treat that as a no-op success.

**Simpler approach for Phase 4B:** the renderer doesn't have visibility into "is the PTY currently live?" — that lives in main. The renderer just always calls `cc:resume` when switching to a conversation that has a stored session. The handler:
- If conversation has a sessionId AND no live slot → spawns via lifecycle.resume → ok
- If conversation has a sessionId AND already has a live slot → main returns INTERNAL_ERROR ("already active"). The renderer can treat this as benign and ignore.

Better: handler treats "already active" as ok (idempotent). Update the handler too:

Edit `src/main/ipc/cc-handler.ts` `resume` method — wrap the lifecycle call in a try/catch for the "already active" message and convert to success:

```ts
try {
  const { sessionId, pid } = this.lifecycle.resume(...)
  // ...
  return { sessionId, pid }
} catch (err) {
  if (err instanceof Error && err.message.includes('already active')) {
    // Idempotent — the PTY is already live, just return its current state
    const handle = this.lifecycle.get(req.conversationId)
    const existingSessionId = this.lifecycle.getSessionId(req.conversationId)
    if (handle && existingSessionId) {
      return { sessionId: existingSessionId, pid: handle.pid }
    }
  }
  throw err
}
```

That's a fairly clean idempotency. The test exercises both paths.

Now in AppShell:

```ts
const handleSelectConversation = (id: number): void => {
  setActiveConversationId(id)
  rendererLogger.info('ui', 'conversation-select', 'Selected conversation', { conversationId: id })
  // Resume the underlying PTY if it has a stored session. Idempotent — the
  // backend handles "already active" by no-oping.
  const conv = conversations.find((c) => c.id === id)
  if (conv?.ccSessionId && activeProjectId !== null && activeAccountId !== null) {
    const activeProject = projects.find((p) => p.id === activeProjectId)
    if (!activeProject) return
    void window.tokenless.cc.resume({
      conversationId: id,
      cwd: activeProject.rootPath,
      cols: 100,
      rows: 30,
      accountId: activeAccountId
    }).then((result) => {
      if (!result.ok) {
        rendererLogger.warn('ui', 'cc-resume-failed', result.error.message, {
          conversationId: id,
          code: result.error.code,
          logId: result.error.logId
        })
      }
    })
  }
}
```

- [ ] **Step 2: Update handler.resume for idempotency**

(Per the discussion above — implementer makes the small change to handler.resume.)

- [ ] **Step 3: Typecheck + tests**

```bash
npm run typecheck
npm run test:run
```

Expected: clean + green.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/layout/AppShell.tsx src/main/ipc/cc-handler.ts
git commit -m "feat(phase-4b): AppShell — clicking sidebar conversation resumes its PTY (idempotent)"
```

---

## Task 13: Extend mock-claude to emit parseable markers

**Files:**
- Modify: `test/doubles/claude-mock.cjs`

- [ ] **Step 1: Add fake telemetry + tool-call output**

Edit `test/doubles/claude-mock.cjs`. The current behavior: writes `claude-mock> (session <uuid>)` at startup, echoes lines back as `[mock-claude] received: <line>`. Phase 4B adds:

After each echoed-received line, also emit:
- `tokens: 12/200000` (or some incrementing counter)
- `tool: Read(/some/path)` once every 3rd received line
- Final newline + `claude-mock> ` (already there)

Updated logic:

```js
let receivedCount = 0
let tokenCount = 0

process.stdin.on('data', (chunk) => {
  buf += chunk
  let nl
  while ((nl = buf.indexOf('\r')) >= 0) {
    const line = buf.slice(0, nl)
    buf = buf.slice(nl + 1)
    if (line.trim().length > 0) {
      receivedCount++
      tokenCount += Math.floor(line.length / 4) + 10  // rough estimate
      // Tool call every 3rd line
      if (receivedCount % 3 === 0) {
        process.stdout.write(`tool: Read(/example/file/${receivedCount}.ts)\r\n`)
      }
      process.stdout.write(`[mock-claude] received: ${line}\r\n`)
      process.stdout.write(`tokens: ${tokenCount}/200000\r\n`)
      process.stdout.write('claude-mock> ')
    }
  }
})
```

- [ ] **Step 2: Smoke-test the updated mock**

```bash
echo "hello world" | node test/doubles/claude-mock.cjs --session-id test-uuid
```

Expected output:

```
claude-mock> (session test-uuid)
[mock-claude] received: hello world
tokens: 12/200000
claude-mock>
```

(Output may differ slightly depending on bash echo behavior — verify in PowerShell with `"hello world" | node ...`)

- [ ] **Step 3: Commit**

```bash
git add test/doubles/claude-mock.cjs
git commit -m "test(phase-4b): mock-claude emits tokens-used + tool-call markers for parser tests"
```

---

## Task 14: E2E — cc:stop

**Files:**
- Create: `test/e2e/cc-stop.e2e.test.ts`

- [ ] **Step 1: Write the test**

Mirror the structure of `cc-send.e2e.test.ts`. Steps:

1. Launch with isolated userData + mock claude bin
2. Create a project, click New Conversation
3. Type a prompt + Send
4. Click Stop
5. Assert the Stop button is visible/clickable (it should remain enabled as long as a conversation is active)
6. Assert a `terminal-stop-ok` log entry appears (or open Dev Mode and check)

The cleanest assertion: after clicking Stop, the Send button stays enabled (because conversationId is still set even though PTY died). Type a 2nd prompt + Send → the next IPC call returns NOT_FOUND from CcHandler.send because there's no live PTY. The renderer logs send-failed.

Actually, a simpler signal: after Stop, the DB's turns row for the most-recent turn has status='stopped'. But we can't easily inspect DB from E2E without exposing a debug endpoint. So use the renderer-state signal: after Stop, try another Send — it should fail (composer doesn't clear, send-failed logged).

For Phase 4B, this is sufficient:

```ts
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test.describe('Phase 4B cc:stop', () => {
  let userDataDir: string
  let app: ElectronApplication

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'tokenless-e2e-'))
  })

  test.afterEach(async () => {
    if (app) {
      try { await app.close() } catch { /* best-effort */ }
    }
    if (existsSync(userDataDir)) {
      rmSync(userDataDir, { recursive: true, force: true })
    }
  })

  test('Stop button kills the PTY — subsequent Send fails until resume', async () => {
    const mockClaudeCmd = resolve('test/doubles/claude-mock.cmd')
    app = await electron.launch({
      args: ['out/main/index.js'],
      env: {
        ...process.env,
        TOKENLESS_USER_DATA_DIR: userDataDir,
        TOKENLESS_CLAUDE_BIN: mockClaudeCmd
      }
    })
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')

    // Create project
    await expect(win.getByRole('region', { name: /welcome to tokenless/i })).toBeVisible()
    await win.getByRole('button', { name: /create your first project/i }).click()
    await win.getByPlaceholder('My Project').fill('Stop Test')
    await win.getByPlaceholder('C:/path/to/project').fill(process.cwd())
    await win.getByRole('button', { name: /^create$/i }).click()
    await expect(win.locator('.terminal-pane')).toBeVisible({ timeout: 10000 })

    // New conversation
    await win.getByRole('button', { name: /new conversation/i }).click()

    // Send a prompt
    await win.locator('.prompt-textarea').fill('hello mock')
    const sendButton = win.getByRole('button', { name: /^send$/i })
    await expect(sendButton).toBeEnabled()
    await sendButton.click()
    await expect(win.locator('.prompt-textarea')).toHaveValue('', { timeout: 10000 })

    // Click Stop
    const stopButton = win.locator('.terminal-toolbar__stop')
    await expect(stopButton).toBeEnabled()
    await stopButton.click()

    // Wait briefly for SIGINT to propagate
    await win.waitForTimeout(500)

    // Subsequent Send should fail (cc:send returns NOT_FOUND)
    await win.locator('.prompt-textarea').fill('after stop')
    await sendButton.click()
    // After failure the prompt does NOT clear
    await expect(win.locator('.prompt-textarea')).toHaveValue('after stop', { timeout: 3000 })
  })
})
```

- [ ] **Step 2: Run E2E**

```bash
npm run rebuild:electron
npm run build
npm run test:e2e
```

Expected: 13 prior + 1 new cc-stop = 14/14.

```bash
npm run rebuild:node
```

- [ ] **Step 3: Commit**

```bash
git add test/e2e/cc-stop.e2e.test.ts
git commit -m "test(phase-4b): E2E — Stop button kills PTY + subsequent Send fails"
```

---

## Task 15: E2E — cc:resume across restart

**Files:**
- Create: `test/e2e/cc-resume.e2e.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test.describe('Phase 4B cc:resume', () => {
  let userDataDir: string
  let app: ElectronApplication

  const mockClaudeCmd = resolve('test/doubles/claude-mock.cmd')

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'tokenless-e2e-'))
  })

  test.afterEach(async () => {
    if (app) {
      try { await app.close() } catch { /* best-effort */ }
    }
    if (existsSync(userDataDir)) {
      rmSync(userDataDir, { recursive: true, force: true })
    }
  })

  async function launch(): Promise<{ app: ElectronApplication; page: Page }> {
    const application = await electron.launch({
      args: ['out/main/index.js'],
      env: {
        ...process.env,
        TOKENLESS_USER_DATA_DIR: userDataDir,
        TOKENLESS_CLAUDE_BIN: mockClaudeCmd
      }
    })
    const page = await application.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    return { app: application, page }
  }

  test('conversation with stored cc_session_id survives restart and resumes on click', async () => {
    // First launch — create project, start a conversation, send a prompt
    ;({ app } = await launch())
    let win = await app.firstWindow()

    await expect(win.getByRole('region', { name: /welcome to tokenless/i })).toBeVisible()
    await win.getByRole('button', { name: /create your first project/i }).click()
    await win.getByPlaceholder('My Project').fill('Resume Test')
    await win.getByPlaceholder('C:/path/to/project').fill(process.cwd())
    await win.getByRole('button', { name: /^create$/i }).click()
    await expect(win.locator('.terminal-pane')).toBeVisible({ timeout: 10000 })

    await win.getByRole('button', { name: /new conversation/i }).click()
    await win.locator('.prompt-textarea').fill('first prompt')
    await win.getByRole('button', { name: /^send$/i }).click()
    await expect(win.locator('.prompt-textarea')).toHaveValue('', { timeout: 10000 })

    // The new conversation row should be in the sidebar with a title
    const sidebarItems = win.locator('.conversation-item')
    await expect(sidebarItems).toHaveCount(1)

    await app.close()

    // Second launch — click the existing conversation, expect resume
    ;({ app } = await launch())
    win = await app.firstWindow()

    // The conversation should appear in the sidebar (persistence from Phase 3)
    await expect(win.locator('.conversation-item')).toHaveCount(1, { timeout: 5000 })
    await win.locator('.conversation-item').first().click()

    // After clicking, the terminal-pane should be visible (it always is, but
    // a "resume" log should appear). For Phase 4B the simplest signal is
    // that the Send button works again after click — verify by typing + send.
    await win.locator('.prompt-textarea').fill('second prompt')
    const sendButton = win.getByRole('button', { name: /^send$/i })
    await expect(sendButton).toBeEnabled()
    await sendButton.click()
    await expect(win.locator('.prompt-textarea')).toHaveValue('', { timeout: 10000 })
  })
})
```

- [ ] **Step 2: Run E2E**

```bash
npm run rebuild:electron
npm run build
npm run test:e2e
```

Expected: 14 prior + 1 new cc-resume = 15/15.

```bash
npm run rebuild:node
```

- [ ] **Step 3: Commit**

```bash
git add test/e2e/cc-resume.e2e.test.ts
git commit -m "test(phase-4b): E2E — conversation survives restart and resumes on sidebar click"
```

---

## Task 16: Spawn ENOENT — claude not found

**Files:**
- Modify: `src/main/cc/spawner.ts`
- Modify: `src/main/__tests__/cc/spawner.unit.test.ts`
- Modify: `src/main/ipc/cc-handler.ts` (translate to CLAUDE_NOT_FOUND envelope)
- Modify: `src/main/__tests__/ipc/cc-handler.integration.test.ts`
- Create: `src/renderer/src/components/notifications/ClaudeNotFoundModal.tsx`
- Create: `src/renderer/src/components/notifications/styles.css`
- Modify: `src/renderer/src/components/layout/AppShell.tsx`

- [ ] **Step 1: Spawner catches ENOENT and tags the error**

Edit `src/main/cc/spawner.ts`. Wrap the `ptyFactory` call in a try/catch:

```ts
let pty: PtyHandle
try {
  pty = ptyFactory(bin, args, { cols: opts.cols, rows: opts.rows, cwd: opts.cwd, env, name: 'xterm-256color' })
} catch (err) {
  const e = err instanceof Error ? err : new Error(String(err))
  const tagged = new Error(`claude binary not found: ${bin}`) as Error & { code?: string; cause?: unknown }
  tagged.code = 'CLAUDE_NOT_FOUND'
  tagged.cause = e
  throw tagged
}
return pty
```

(Actually, only ENOENT should map to CLAUDE_NOT_FOUND — other spawn errors (EACCES, etc.) should propagate as-is. Refine:)

```ts
let pty: PtyHandle
try {
  pty = ptyFactory(bin, args, { cols: opts.cols, rows: opts.rows, cwd: opts.cwd, env, name: 'xterm-256color' })
} catch (err) {
  const e = err instanceof Error ? err : new Error(String(err))
  const msg = e.message.toLowerCase()
  if (msg.includes('enoent') || msg.includes('no such file') || msg.includes('not found')) {
    const tagged = new Error(`claude binary not found: ${bin}`) as Error & { code?: string; cause?: unknown }
    tagged.code = 'CLAUDE_NOT_FOUND'
    tagged.cause = e
    throw tagged
  }
  throw e
}
return pty
```

- [ ] **Step 2: Spawner test for ENOENT**

Add to `src/main/__tests__/cc/spawner.unit.test.ts`:

```ts
it('translates ENOENT into a CLAUDE_NOT_FOUND-tagged error', () => {
  const factory: PtySpawnFn = () => {
    const err = new Error('spawn ENOENT') as Error & { code?: string }
    err.code = 'ENOENT'
    throw err
  }
  expect(() =>
    spawnClaude(
      {
        conversationId: 1,
        sessionId: 'x',
        cwd: 'C:/x',
        cols: 80,
        rows: 24,
        env: { CLAUDE_CONFIG_DIR: 'C:/c' }
      },
      factory
    )
  ).toThrow(/claude binary not found/)
  try {
    spawnClaude(
      {
        conversationId: 1,
        sessionId: 'x',
        cwd: 'C:/x',
        cols: 80,
        rows: 24,
        env: { CLAUDE_CONFIG_DIR: 'C:/c' }
      },
      factory
    )
  } catch (e) {
    expect((e as Error & { code?: string }).code).toBe('CLAUDE_NOT_FOUND')
  }
})
```

- [ ] **Step 3: Update CcHandler to surface CLAUDE_NOT_FOUND**

Edit `src/main/ipc/cc-handler.ts`. In `withIpcResult`, the existing NOT_FOUND code is for resource lookups. CLAUDE_NOT_FOUND is structurally similar — let `withIpcResult` propagate the code as-is.

Look at `with-ipc-result.ts`: it should currently check for `code === 'NOT_FOUND'` and produce that envelope. Update it to forward ANY string code from the thrown error:

Edit `src/main/ipc/with-ipc-result.ts`:

```ts
} catch (err) {
  const logId = randomUUID()
  const message = err instanceof Error ? err.message : String(err)
  const errCode = (err as { code?: string }).code
  const code: string =
    typeof errCode === 'string' && /^[A-Z_]+$/.test(errCode) ? errCode : 'INTERNAL_ERROR'
  const stack = err instanceof Error ? err.stack : undefined
  if (code === 'INTERNAL_ERROR') {
    logger.error(category, event, message, { errorString: String(err), logId }, stack)
  } else {
    // Expected business errors (NOT_FOUND, CLAUDE_NOT_FOUND, etc.) — warn level
    logger.warn(category, event, message, { code, logId })
  }
  return { ok: false, error: { message, code, logId } }
}
```

The regex `/^[A-Z_]+$/` is a defensive guard so unexpected `code` values don't leak through.

- [ ] **Step 4: Handler test for CLAUDE_NOT_FOUND envelope**

Add to `src/main/__tests__/ipc/cc-handler.integration.test.ts`:

```ts
it('start returns CLAUDE_NOT_FOUND when the spawner fails with that code', async () => {
  // Inject a factory that throws CLAUDE_NOT_FOUND
  const errLifecycle = new CcLifecycle(
    () => {
      const e = new Error('claude binary not found: claude.cmd') as Error & { code?: string }
      e.code = 'CLAUDE_NOT_FOUND'
      throw e
    },
    { onChunk: vi.fn(), onExit: vi.fn(), onEvent: vi.fn() }
  )
  const errHandler = new CcHandler(db, makeLogger(), errLifecycle)
  const result = await errHandler.start({
    conversationId,
    cwd: 'C:/x',
    cols: 100,
    rows: 30,
    accountId
  })
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error.code).toBe('CLAUDE_NOT_FOUND')
})
```

- [ ] **Step 5: ClaudeNotFoundModal renderer component**

Create `src/renderer/src/components/notifications/ClaudeNotFoundModal.tsx`:

```tsx
interface ClaudeNotFoundModalProps {
  open: boolean
  onDismiss: () => void
}

export function ClaudeNotFoundModal({ open, onDismiss }: ClaudeNotFoundModalProps): JSX.Element | null {
  if (!open) return null
  return (
    <div className="modal-backdrop" role="presentation" onClick={onDismiss}>
      <div
        className="modal claude-not-found-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="claude-not-found-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="claude-not-found-title" className="modal__title">Claude Code not found</h2>
        <p>
          TokenLess couldn&apos;t find the <code>claude</code> command. Install Claude Code from{' '}
          <a href="https://claude.com/code" target="_blank" rel="noreferrer">claude.com/code</a> and
          ensure it&apos;s on your PATH, or set <code>TOKENLESS_CLAUDE_BIN</code> to its full path.
        </p>
        <p>
          (Settings &rarr; Claude Code path will land in Phase 8 polish.)
        </p>
        <div className="modal__actions">
          <button type="button" className="btn btn--primary" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
```

Create `src/renderer/src/components/notifications/styles.css`:

```css
.claude-not-found-modal {
  width: min(540px, 90vw);
}
.claude-not-found-modal p {
  margin: 0.25rem 0;
  line-height: 1.5;
}
.claude-not-found-modal code {
  background: var(--tl-bg-mute);
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  font-size: 0.9em;
}
.claude-not-found-modal a {
  color: var(--tl-accent);
}
```

Import the stylesheet at the top of `ClaudeNotFoundModal.tsx`:

```tsx
import './styles.css'
```

- [ ] **Step 6: AppShell — show modal on CLAUDE_NOT_FOUND**

Edit `src/renderer/src/components/layout/AppShell.tsx`. Add state + modal mount. In `handleNewConversation`, after the `cc.start` returns `!ok`, check the code and toggle the modal:

```ts
const [claudeNotFoundOpen, setClaudeNotFoundOpen] = useState(false)

// ... inside handleNewConversation, after the started result:
if (!started.ok) {
  rendererLogger.error('ui', 'new-conversation-start-failed', started.error.message, {
    code: started.error.code,
    logId: started.error.logId,
    conversationId: created.data.conversation.id
  })
  if (started.error.code === 'CLAUDE_NOT_FOUND') {
    setClaudeNotFoundOpen(true)
  }
  return
}

// At the bottom of the JSX:
<ClaudeNotFoundModal open={claudeNotFoundOpen} onDismiss={() => setClaudeNotFoundOpen(false)} />
```

Same handling for the resume path's failure.

- [ ] **Step 7: Run tests**

```bash
npm run typecheck
npm run test:run
```

Expected: clean + green.

- [ ] **Step 8: Commit**

```bash
git add src/main/cc/spawner.ts src/main/__tests__/cc/spawner.unit.test.ts \
        src/main/ipc/with-ipc-result.ts \
        src/main/ipc/cc-handler.ts src/main/__tests__/ipc/cc-handler.integration.test.ts \
        src/renderer/src/components/notifications \
        src/renderer/src/components/layout/AppShell.tsx
git commit -m "feat(phase-4b): §7.1 — CLAUDE_NOT_FOUND modal on spawn ENOENT + generic IpcResult code propagation"
```

---

## Task 17: E2E — CLAUDE_NOT_FOUND modal

**Files:**
- Create: `test/e2e/cc-not-found.e2e.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test.describe('Phase 4B CLAUDE_NOT_FOUND', () => {
  let userDataDir: string
  let app: ElectronApplication

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'tokenless-e2e-'))
  })

  test.afterEach(async () => {
    if (app) {
      try { await app.close() } catch { /* best-effort */ }
    }
    if (existsSync(userDataDir)) {
      rmSync(userDataDir, { recursive: true, force: true })
    }
  })

  test('clicking New Conversation with a missing claude binary opens the modal', async () => {
    // Set TOKENLESS_CLAUDE_BIN to a path that doesn't exist
    app = await electron.launch({
      args: ['out/main/index.js'],
      env: {
        ...process.env,
        TOKENLESS_USER_DATA_DIR: userDataDir,
        TOKENLESS_CLAUDE_BIN: 'C:/this/path/does/not/exist/claude.cmd'
      }
    })
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')

    // Project setup
    await expect(win.getByRole('region', { name: /welcome to tokenless/i })).toBeVisible()
    await win.getByRole('button', { name: /create your first project/i }).click()
    await win.getByPlaceholder('My Project').fill('NotFound Test')
    await win.getByPlaceholder('C:/path/to/project').fill(process.cwd())
    await win.getByRole('button', { name: /^create$/i }).click()
    await expect(win.locator('.terminal-pane')).toBeVisible({ timeout: 10000 })

    // Click New Conversation — spawn should fail with CLAUDE_NOT_FOUND
    await win.getByRole('button', { name: /new conversation/i }).click()

    // Modal appears
    await expect(win.getByRole('dialog', { name: /claude code not found/i })).toBeVisible({ timeout: 5000 })

    // Dismiss
    await win.getByRole('button', { name: /^dismiss$/i }).click()
    await expect(win.getByRole('dialog', { name: /claude code not found/i })).toHaveCount(0)
  })
})
```

- [ ] **Step 2: Run E2E**

```bash
npm run rebuild:electron
npm run build
npm run test:e2e
```

Expected: 15 prior + 1 new cc-not-found = 16/16.

```bash
npm run rebuild:node
```

- [ ] **Step 3: Commit**

```bash
git add test/e2e/cc-not-found.e2e.test.ts
git commit -m "test(phase-4b): E2E — CLAUDE_NOT_FOUND modal appears when TOKENLESS_CLAUDE_BIN is invalid"
```

---

## Task 18: ADR-028 — Output parser pattern

**Files:**
- Modify: `docs/decisions.md`

- [ ] **Step 1: Append ADR-028**

```markdown

## ADR-028 (2026-05-14) — Output parser is a pure-state line matcher; ANSI strip first, pattern match second

**Context:** Phase 4B introduces a parser over claude's stdout/stderr stream to detect prompts, tool calls, response-complete markers, and token usage. The parser sits between PTY chunks (raw bytes including ANSI) and the renderer's UI state (xterm shows raw chunks, the rest of the UI consumes typed CcEvents).

**Options considered:**
- A) Parse against raw ANSI-containing text. Brittle — escape sequences can appear inside what looks like a pattern.
- B) Pre-strip ANSI then run regex/state matchers against clean text. Slightly more compute (each chunk passes through two passes), but matches are reliable.
- C) Use a parser combinator library. Overkill for ~4 patterns.

**Choice:** B. `AnsiStripper` (CSI + OSC state machine) runs first; `CcParser` runs second over its output. Both are pure state — they hold buffered state across chunks (a partial sequence, a partial line) but emit deterministic output for any given input sequence.

**Patterns recognized in Phase 4B:**
- `claude-mock>` or `>` alone on a line → `prompt-ready`
- `[mock-claude] received:` → `response-complete`
- `tokens: <used>/<total>` → `tokens-used`
- `tool: <name>(<summary>)` → `tool-call`

These are deliberately conservative — built around the mock-claude's output so the parser can be unit-tested. Phase 4C will calibrate against real claude's output formats (which evolve with the CLI) and add quota / auth / resume-failed patterns from §7.1.

**Reasoning:** ANSI stripping has a stable spec (CSI + OSC are well-defined). Pure-state matchers are trivial to test. The tolerance behavior (unknown lines ignored) means claude CLI updates won't break the parser — they'll just stop emitting some events until we update the patterns. The downside — events emit only when a line completes — is acceptable: token counts and tool calls are line-oriented anyway.

**Discovered:** Phase 4B parser design.

```

- [ ] **Step 2: Verify ADR sequence**

```bash
grep -n "^## ADR" docs/decisions.md | tail -10
```

Should show ...025, 026, 027, 028.

- [ ] **Step 3: Commit**

```bash
git add docs/decisions.md
git commit -m "docs(phase-4b): ADR-028 — output parser is ANSI-strip then pure-state line matcher"
```

---

## Task 19: Test scenarios + observability rows

**Files:**
- Modify: `docs/test-scenarios.md`
- Modify: `docs/observability.md`

- [ ] **Step 1: Append Phase 4B scenarios**

Append to `docs/test-scenarios.md`:

```markdown

## Phase 4B — Parser + Stop + Resume

### S-4B.1 Stop kills a running response
1. Launch the app, create project, click New Conversation, send a long prompt.
2. While claude is streaming a response, click Stop.
3. **Expect:** The terminal stops appending output. Dev Mode shows `cc-stop` and `terminal-stop-ok` log entries. The `turns` table's most-recent row has `status = 'stopped'`.

### S-4B.2 Resume across restart
1. Launch the app, create project, New Conversation, send a prompt, wait for completion.
2. Quit the app entirely (Cmd/Ctrl+Q).
3. Relaunch. The conversation appears in the sidebar.
4. Click the conversation.
5. **Expect:** Dev Mode shows `cc-resume` log entry with the stored `sessionId`. The Send button is enabled — typing + Send works as expected.

### S-4B.3 Resume with no stored sessionId fails cleanly
1. Open DB browser, NULL out a conversation's `cc_session_id` column.
2. Restart the app, click that conversation.
3. **Expect:** `cc-resume` warn log fires with `NOT_FOUND` code. UI proceeds — Stop is enabled (since we still consider the conversation active) but Send will also fail with NOT_FOUND until a fresh `cc:start` happens.

### S-4B.4 Claude not found
1. Quit the app. Set `TOKENLESS_CLAUDE_BIN=C:/no/such/path/claude.cmd`. Relaunch.
2. Create project, click New Conversation.
3. **Expect:** Modal appears: "Claude Code not found." Dev Mode shows `cc-start` warn with `CLAUDE_NOT_FOUND` code. Dismiss closes the modal; no conversation is created (the DB row that was created BEFORE the spawn is left orphaned for now — Phase 4C cleanup task).

### S-4B.5 Two conversations, stop one while the other streams
1. Open conversation A, send a long prompt. Open conversation B (sidebar click on a different conversation row), send another prompt.
2. **Expect:** Both stream independently — switching tabs shows the right output (because TerminalPane is keyed by conversationId, the xterm instance is per-conversation).
3. Click Stop on B.
4. **Expect:** B stops, A continues. The turns table for B has the latest row with `status='stopped'`. A's turns are unaffected.
```

- [ ] **Step 2: Update observability.md**

Find the `cc` category row and extend it with Phase 4B events: `cc-stop`, `cc-resume`. Add a new "events emitted from the parser" sub-row or note:

> Parsed events (broadcast as `cc:event` IPC, not Logger entries): `prompt-ready`, `tool-call`, `response-complete`, `tokens-used`.

Update the `ui` row with new renderer events: `terminal-stop-ok`, `terminal-stop-failed`, `terminal-stop-no-conv`, `cc-resume-failed`.

- [ ] **Step 3: Commit**

```bash
git add docs/test-scenarios.md docs/observability.md
git commit -m "docs(phase-4b): manual test scenarios + observability event vocabulary"
```

---

## Task 20: Verification + tag v0.8.0-phase-4b

**Files:** none new

- [ ] **Step 1: Switch to Node ABI + run typecheck + tests**

```bash
npm run rebuild:node
npm run typecheck
npm run test:run
```

Expected: clean + ~120+ tests green (111 baseline + new tests from Tasks 2, 4, 5, 7, 9, 10, 11, 16).

- [ ] **Step 2: Switch to Electron ABI + build + E2E**

```bash
npm run rebuild:electron
npm run build
npm run test:e2e
```

Expected: 13 baseline + 3 new (cc-stop, cc-resume, cc-not-found) = 16/16.

- [ ] **Step 3: Switch back to Node ABI for handoff**

```bash
npm run rebuild:node
```

- [ ] **Step 4: Tag**

```bash
git tag -s -a v0.8.0-phase-4b -m "Phase 4B complete — output parser, cc:stop/resume, CLAUDE_NOT_FOUND modal, per-conversation TerminalPane keying"
git rev-parse v0.8.0-phase-4b^{commit}
```

- [ ] **Step 5: Hand off**

Report: `Phase 4B complete locally. Tag v0.8.0-phase-4b at <sha>. Push + CI watch is next.`

---

## Self-Review Checklist

After all tasks land:

- [ ] **Phase 4A deferred resolved:** TerminalPane is keyed by conversationId; the resize closure stays fresh on switch
- [ ] **§9 Phase 4 exit criteria:** Send ✓ (4A), Stream ✓ (4A), Stop ✓ (this phase), Resume ✓ (this phase) — all four work
- [ ] **§7.1 partial:** "claude not found" row covered (the most visible failure). Other §7.1 rows (mid-session crash, watchdog hangs, quota, auth, resume-fail-output-pattern, write-fail) deferred to Phase 4C — confirmed
- [ ] **No silent failures introduced** (`grep -rn "catch\s*\(\s*\)\s*\{" src/main src/renderer/src --include "*.ts" --include "*.tsx" | grep -v __tests__ | grep -v "ignore"`)
- [ ] **MOCK_CONTEXT_BUDGET still in TerminalToolbar (mock telemetry) — left untouched until Phase 4C wires real values**
- [ ] **TypeScript strict clean** (`npm run typecheck`)
- [ ] **All commit messages follow conventional commits**

---

## Exit State

**Visible to user:**
- Clicking Stop sends SIGINT to claude — current response cuts off, `turns` row marked `stopped`
- Clicking a sidebar conversation that has a stored session resumes that claude session — typing + Send works
- If `claude` isn't installed/findable, a modal explains what's wrong instead of silently failing
- Switching between two active conversations correctly shows the right xterm output (per-conversation keying)

**Under the hood:**
- `CcParser` (line-based) + `AnsiStripper` (state machine) emit typed `CcEvent`s
- Lifecycle has `resume()` alongside `start()`; both build a fresh parser per slot
- `cc:event` IPC channel + `useCcEvents` hook ready for Phase 4C's ContextBudgetMeter wiring + quota/auth detection
- `IpcResult` envelope now propagates arbitrary `UPPER_SNAKE_CASE` codes (CLAUDE_NOT_FOUND, NOT_FOUND, etc.) so future failure modes plug in without adapter changes
- Mock-claude emits `tokens: N/M` + occasional `tool: Read(...)` lines for parser test coverage

**Phase 4C will deliver:**
- Watchdog (90s no-output → hang warning) + recovery UI
- Output-pattern failures: quota, auth, resume-fail (with branch-from-last-turn recovery)
- PTY write failure handling
- Telemetry tick — real token/cost values into ContextBudgetMeter
- Orphan-conversation cleanup (created-but-never-spawned rows)

**Tag:** `v0.8.0-phase-4b`
