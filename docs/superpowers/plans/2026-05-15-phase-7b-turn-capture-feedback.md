# Phase 7B: Turn Capture + Feedback Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the turn-persistence gap left after Phase 5. Today `cc-handler.send` writes ONE row per user prompt with `original_prompt = <final text>` and no Claude-side row at all — so `turns` only ever contains user turns with truncated data. This phase wires (a) full user-turn capture (`original_prompt`, `geared_prompt`, `original_tokens`, `geared_tokens`, `haiku_meta_tokens`, `critique_flags_json` when Send is fired from a geared review), (b) assistant-turn capture by accumulating PTY response text between `prompt-ready` → `response-complete` events, and (c) per-turn feedback buttons (👍 👎 🤷) that write `turns.feedback` and surface aggregate counts in Dev Mode. Phase 7B unblocks Phase 6D telemetry, Phase 7C branching, and any future "session replay" UI.

**Architecture:** A new `TurnsDao` is the only writer to the `turns` table. `cc-handler.send` is extended: callers pass an optional `gearMeta: { originalPrompt, gearedPrompt, originalTokens, gearedTokens, haikuMetaTokens, critiqueFlags } | null` and the handler writes a complete user turn. `PtyParser` gains a buffered-response accumulator (already line-oriented — extend to track `responseLines: string[]` between events). `CcLifecycle` (or `ipc/index.ts`'s onEvent handler — whichever is cleaner) writes the assistant turn on `response-complete`, pulling the accumulated text + the most recent `tokens-used` event for token counts. The Composer's existing `runSend` is extended to thread gear metadata through `cc:send` when sending from the GearReviewPane. A small `TurnFeedbackBar` renders below the Composer when the latest turn is `role='assistant'` with `feedback IS NULL`; clicking 👍/👎/🤷 fires a `turns:update-feedback` IPC and the bar disappears. Aggregate feedback counts are queryable via a new `turns:feedback-summary` IPC consumed by a small Dev-Mode panel addition (one-line "👍 X · 👎 Y · 🤷 Z" row).

**Out of scope for Phase 7B (→ later):**
- Telemetry summary view (cost-over-time dashboard) — Phase 6D, depends on this
- Branching ("branch from this turn") — Phase 7C, uses `parent_conversation_id` + `branched_at_turn_id`
- Session replay UI (browse past turns side-by-side) — post-v1
- Tool-call persistence (`turns.critique_flags_json` is wired; per-tool-call rows are out)
- Live feedback aggregate IN the Composer (counts only surfaced in Dev Mode for v1; main UI stays clean)

---

## File Structure

**New files (main):**
- `src/main/db/dao/turns.ts` — TurnsDao: `createUserTurn`, `createAssistantTurn`, `updateFeedback`, `getLastByConversation`, `listByConversation`, `getFeedbackSummary`
- `src/main/__tests__/db/dao-turns.integration.test.ts`
- `src/main/cc/response-accumulator.ts` — accumulates assistant response text + tokens between prompt-ready and response-complete; reset on response-complete
- `src/main/__tests__/cc/response-accumulator.unit.test.ts`
- `src/main/ipc/turns-handler.ts`
- `src/main/__tests__/ipc/turns-handler.integration.test.ts`

**New files (shared):**
- `src/shared/ipc/turns.ts` — channels + payloads
- `src/shared/types/turns.ts` — `Turn`, `TurnRole`, `Feedback`, `GearMeta`

**New files (renderer):**
- `src/renderer/src/hooks/use-turns.ts`
- `src/renderer/src/components/composer/TurnFeedbackBar.tsx`
- `src/renderer/src/components/composer/__tests__/turn-feedback-bar.unit.test.tsx`

**Modified files:**
- `src/shared/ipc/cc.ts` — extend `CcSendRequest` with optional `gearMeta: GearMeta | null`
- `src/shared/ipc.ts` — re-export turns channels + types; extend `IpcChannelName`
- `src/main/db/index.ts` — barrel TurnsDao
- `src/main/cc/parser.ts` — emit `response-chunk` events between prompt-ready and response-complete (or expose a way for ResponseAccumulator to subscribe to raw stripped chunks)
- `src/main/ipc/cc-handler.ts` — write full user turn via TurnsDao; threads turnId back to caller
- `src/main/ipc/index.ts` — instantiate ResponseAccumulator per conversation; on response-complete, write assistant turn + reset; register TurnsHandler
- `src/main/cc/lifecycle.ts` — wires the per-conversation accumulator; passes events through
- `src/preload/index.ts` + `index.d.ts` — expose `turns.{listByConversation, updateFeedback, getFeedbackSummary}`
- `src/renderer/src/components/composer/Composer.tsx` — thread `gearMeta` through `cc:send` when sending from GearReviewPane; mount TurnFeedbackBar
- `src/renderer/src/components/composer/styles.css` — `.turn-feedback-bar*` styles
- `src/renderer/src/components/dev-mode/DevModePanel.tsx` (and styles) — add one-line feedback-summary row to footer
- `docs/decisions.md` — ADR-037 (turn capture + feedback storage choices)
- `docs/observability.md` — extend `db` row with turns events; extend `ui` row with feedback events
- `docs/test-scenarios.md` — Phase 7B scenarios

---

## Task 1: Shared types + TurnsDao

**Files:**
- Create: `src/shared/types/turns.ts`
- Create: `src/main/db/dao/turns.ts`
- Create: `src/main/__tests__/db/dao-turns.integration.test.ts`
- Modify: `src/main/db/index.ts` (barrel)

- [ ] **Step 1: Shared type**

Create `src/shared/types/turns.ts`:
```ts
export type TurnRole = 'user' | 'assistant'
export type Feedback = 'up' | 'down' | 'shrug'
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
  readonly role: TurnRole
  readonly originalPrompt: string | null
  readonly gearedPrompt: string | null
  readonly responseText: string | null
  readonly originalTokens: number | null
  readonly gearedTokens: number | null
  readonly responseTokens: number | null
  readonly haikuMetaTokens: number | null
  readonly modelUsed: string | null
  readonly feedback: Feedback | null
  readonly critiqueFlagsJson: string | null
  readonly status: TurnStatus
  readonly sentAt: number
}

export interface FeedbackSummary {
  readonly up: number
  readonly down: number
  readonly shrug: number
  readonly unrated: number
}
```

- [ ] **Step 2: Failing DAO test**

Create `src/main/__tests__/db/dao-turns.integration.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { createAccount } from '../../db/dao/accounts'
import { createProject } from '../../db/dao/projects'
import { createConversation } from '../../db/dao/conversations'
import {
  createUserTurn,
  createAssistantTurn,
  updateFeedback,
  getLastByConversation,
  listByConversation,
  getFeedbackSummary
} from '../../db/dao/turns'

describe('db/dao/turns', () => {
  let db: Database
  let conversationId: number

  beforeEach(() => {
    db = createTestDb()
    const account = createAccount(db, { label: 'P', configDir: '/p' })
    const project = createProject(db, { name: 'X', rootPath: '/x', defaultAccountId: account.id })
    const conv = createConversation(db, { projectId: project.id, accountId: account.id })
    conversationId = conv.id
  })

  it('createUserTurn inserts a minimal user turn (no gear meta)', () => {
    const t = createUserTurn(db, {
      conversationId,
      originalPrompt: 'fix the bug',
      modelUsed: 'sonnet',
      gearMeta: null
    })
    expect(t.id).toBeGreaterThan(0)
    expect(t.role).toBe('user')
    expect(t.originalPrompt).toBe('fix the bug')
    expect(t.gearedPrompt).toBeNull()
    expect(t.originalTokens).toBeNull()
    expect(t.status).toBe('complete')
  })

  it('createUserTurn stores gearMeta when send is from GearReviewPane', () => {
    const t = createUserTurn(db, {
      conversationId,
      originalPrompt: 'fix the bug',
      modelUsed: 'sonnet',
      gearMeta: {
        originalPrompt: 'fix the bug',
        gearedPrompt: 'Refactor src/foo.ts — focus on null-safety. Output diff only.',
        originalTokens: 4,
        gearedTokens: 18,
        haikuMetaTokens: 320,
        critiqueFlags: ['ambiguous-target']
      }
    })
    expect(t.gearedPrompt).toContain('Refactor')
    expect(t.originalTokens).toBe(4)
    expect(t.gearedTokens).toBe(18)
    expect(t.haikuMetaTokens).toBe(320)
    expect(JSON.parse(t.critiqueFlagsJson ?? '[]')).toEqual(['ambiguous-target'])
  })

  it('createAssistantTurn inserts a response row', () => {
    const t = createAssistantTurn(db, {
      conversationId,
      responseText: 'Done. Patched foo.ts at line 42.',
      responseTokens: 12,
      modelUsed: 'sonnet'
    })
    expect(t.role).toBe('assistant')
    expect(t.responseText).toContain('Done')
    expect(t.responseTokens).toBe(12)
  })

  it('updateFeedback writes feedback on an assistant turn', () => {
    const t = createAssistantTurn(db, {
      conversationId, responseText: 'r', responseTokens: 1, modelUsed: null
    })
    expect(updateFeedback(db, t.id, 'up')).toBe(true)
    const fresh = listByConversation(db, conversationId).find((x) => x.id === t.id)
    expect(fresh?.feedback).toBe('up')
  })

  it('updateFeedback returns false for unknown id', () => {
    expect(updateFeedback(db, 99999, 'up')).toBe(false)
  })

  it('getLastByConversation returns the most recent turn (DESC by sent_at, tiebreak id DESC)', () => {
    createUserTurn(db, { conversationId, originalPrompt: 'q1', modelUsed: null, gearMeta: null })
    createAssistantTurn(db, { conversationId, responseText: 'r1', responseTokens: 1, modelUsed: null })
    const t = createUserTurn(db, { conversationId, originalPrompt: 'q2', modelUsed: null, gearMeta: null })
    expect(getLastByConversation(db, conversationId)?.id).toBe(t.id)
  })

  it('listByConversation returns rows in send order (ASC)', () => {
    const a = createUserTurn(db, { conversationId, originalPrompt: 'q1', modelUsed: null, gearMeta: null })
    const b = createAssistantTurn(db, { conversationId, responseText: 'r1', responseTokens: 1, modelUsed: null })
    expect(listByConversation(db, conversationId).map((t) => t.id)).toEqual([a.id, b.id])
  })

  it('getFeedbackSummary counts assistant turns by feedback bucket', () => {
    const t1 = createAssistantTurn(db, { conversationId, responseText: 'a', responseTokens: 1, modelUsed: null })
    const t2 = createAssistantTurn(db, { conversationId, responseText: 'b', responseTokens: 1, modelUsed: null })
    const t3 = createAssistantTurn(db, { conversationId, responseText: 'c', responseTokens: 1, modelUsed: null })
    createAssistantTurn(db, { conversationId, responseText: 'd', responseTokens: 1, modelUsed: null })  // unrated
    updateFeedback(db, t1.id, 'up')
    updateFeedback(db, t2.id, 'up')
    updateFeedback(db, t3.id, 'down')
    const s = getFeedbackSummary(db)
    expect(s.up).toBe(2); expect(s.down).toBe(1); expect(s.shrug).toBe(0); expect(s.unrated).toBe(1)
  })
})
```

Run to verify failure:
```
npm run test:run -- src/main/__tests__/db/dao-turns.integration.test.ts
```

- [ ] **Step 3: Implement DAO**

Create `src/main/db/dao/turns.ts`:
```ts
import type { Database } from 'better-sqlite3'

import type { Turn, TurnRole, TurnStatus, Feedback, FeedbackSummary, GearMeta } from '@shared/types/turns'

interface TurnRow {
  id: number
  conversation_id: number
  role: string
  original_prompt: string | null
  geared_prompt: string | null
  response_text: string | null
  original_tokens: number | null
  geared_tokens: number | null
  response_tokens: number | null
  haiku_meta_tokens: number | null
  model_used: string | null
  feedback: string | null
  critique_flags_json: string | null
  status: string
  sent_at: number
}

function rowToTurn(r: TurnRow): Turn {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role as TurnRole,
    originalPrompt: r.original_prompt,
    gearedPrompt: r.geared_prompt,
    responseText: r.response_text,
    originalTokens: r.original_tokens,
    gearedTokens: r.geared_tokens,
    responseTokens: r.response_tokens,
    haikuMetaTokens: r.haiku_meta_tokens,
    modelUsed: r.model_used,
    feedback: r.feedback === null ? null : (r.feedback as Feedback),
    critiqueFlagsJson: r.critique_flags_json,
    status: r.status as TurnStatus,
    sentAt: r.sent_at
  }
}

export interface CreateUserTurnInput {
  readonly conversationId: number
  readonly originalPrompt: string
  readonly modelUsed: string | null
  readonly gearMeta: GearMeta | null
}

export function createUserTurn(db: Database, input: CreateUserTurnInput): Turn {
  const now = Date.now()
  const critiqueFlagsJson = input.gearMeta && input.gearMeta.critiqueFlags.length > 0
    ? JSON.stringify(input.gearMeta.critiqueFlags)
    : null
  const result = db.prepare(`
    INSERT INTO turns (
      conversation_id, role, original_prompt, geared_prompt,
      original_tokens, geared_tokens, haiku_meta_tokens,
      model_used, critique_flags_json, status, sent_at
    ) VALUES (?, 'user', ?, ?, ?, ?, ?, ?, ?, 'complete', ?)
  `).run(
    input.conversationId,
    input.gearMeta?.originalPrompt ?? input.originalPrompt,
    input.gearMeta?.gearedPrompt ?? null,
    input.gearMeta?.originalTokens ?? null,
    input.gearMeta?.gearedTokens ?? null,
    input.gearMeta?.haikuMetaTokens ?? null,
    input.modelUsed,
    critiqueFlagsJson,
    now
  )
  return getById(db, Number(result.lastInsertRowid)) as Turn
}

export interface CreateAssistantTurnInput {
  readonly conversationId: number
  readonly responseText: string
  readonly responseTokens: number | null
  readonly modelUsed: string | null
}

export function createAssistantTurn(db: Database, input: CreateAssistantTurnInput): Turn {
  const now = Date.now()
  const result = db.prepare(`
    INSERT INTO turns (
      conversation_id, role, response_text, response_tokens, model_used, status, sent_at
    ) VALUES (?, 'assistant', ?, ?, ?, 'complete', ?)
  `).run(input.conversationId, input.responseText, input.responseTokens, input.modelUsed, now)
  return getById(db, Number(result.lastInsertRowid)) as Turn
}

export function updateFeedback(db: Database, id: number, feedback: Feedback): boolean {
  const r = db.prepare('UPDATE turns SET feedback = ? WHERE id = ? AND role = \'assistant\'').run(feedback, id)
  return r.changes > 0
}

export function getById(db: Database, id: number): Turn | null {
  const row = db.prepare<[number], TurnRow>('SELECT * FROM turns WHERE id = ?').get(id)
  return row ? rowToTurn(row) : null
}

export function getLastByConversation(db: Database, conversationId: number): Turn | null {
  const row = db
    .prepare<[number], TurnRow>(
      'SELECT * FROM turns WHERE conversation_id = ? ORDER BY sent_at DESC, id DESC LIMIT 1'
    )
    .get(conversationId)
  return row ? rowToTurn(row) : null
}

export function listByConversation(db: Database, conversationId: number): readonly Turn[] {
  const rows = db
    .prepare<[number], TurnRow>(
      'SELECT * FROM turns WHERE conversation_id = ? ORDER BY sent_at ASC, id ASC'
    )
    .all(conversationId)
  return rows.map(rowToTurn)
}

export function getFeedbackSummary(db: Database): FeedbackSummary {
  const row = db.prepare<[], { up: number; down: number; shrug: number; unrated: number }>(`
    SELECT
      SUM(CASE WHEN feedback = 'up' THEN 1 ELSE 0 END) AS up,
      SUM(CASE WHEN feedback = 'down' THEN 1 ELSE 0 END) AS down,
      SUM(CASE WHEN feedback = 'shrug' THEN 1 ELSE 0 END) AS shrug,
      SUM(CASE WHEN feedback IS NULL THEN 1 ELSE 0 END) AS unrated
    FROM turns WHERE role = 'assistant'
  `).get()
  return {
    up: row?.up ?? 0,
    down: row?.down ?? 0,
    shrug: row?.shrug ?? 0,
    unrated: row?.unrated ?? 0
  }
}
```

- [ ] **Step 4: Barrel**

Edit `src/main/db/index.ts`. Add:
```ts
export * as TurnsDao from './dao/turns'
```

- [ ] **Step 5: Verify + commit**

```
npm run test:run -- src/main/__tests__/db/dao-turns.integration.test.ts
npm run typecheck
git add src/shared/types/turns.ts src/main/db/dao/turns.ts src/main/db/index.ts \
        src/main/__tests__/db/dao-turns.integration.test.ts
git commit -m "feat(phase-7b): TurnsDao + Turn / GearMeta / Feedback types"
```

Expected: 8 new DAO tests; full suite ~289 → ~297.

---

## Task 2: Remove old INSERT INTO turns in cc-handler.send (now obsoleted by TurnsDao)

**Files:**
- Modify: `src/main/ipc/cc-handler.ts`

The current `cc-handler.send` does an inline INSERT into turns (lines 87-95). Replace it with a TurnsDao call. Don't change the response shape yet — that's Task 3.

- [ ] **Step 1: Switch to TurnsDao**

Edit `src/main/ipc/cc-handler.ts`. Add `import { TurnsDao } from '../db'`. Replace the inline INSERT with:
```ts
const userTurn = TurnsDao.createUserTurn(this.db, {
  conversationId: req.conversationId,
  originalPrompt: req.prompt,
  modelUsed: req.model,
  gearMeta: null
})
const turnId = userTurn.id
```

Existing tests for cc-handler.send must continue to pass — verify with `npm run test:run -- src/main/__tests__/ipc/cc-handler.integration.test.ts`.

- [ ] **Step 2: Commit**

```
git add src/main/ipc/cc-handler.ts
git commit -m "feat(phase-7b): cc-handler.send routes user-turn writes through TurnsDao"
```

---

## Task 3: Extend CcSendRequest with optional gearMeta + thread through cc-handler

**Files:**
- Modify: `src/shared/ipc/cc.ts` — add `gearMeta?: GearMeta | null` to `CcSendRequest`
- Modify: `src/main/ipc/cc-handler.ts` — pass `gearMeta` through to TurnsDao
- Modify: `src/main/__tests__/ipc/cc-handler.integration.test.ts` — add tests for the new path

- [ ] **Step 1: Extend shared type**

Edit `src/shared/ipc/cc.ts`. Add import + field:
```ts
import type { GearMeta } from '../types/turns'

export interface CcSendRequest {
  // ... existing fields ...
  readonly gearMeta?: GearMeta | null
}
```

- [ ] **Step 2: Wire through cc-handler**

Edit `cc-handler.ts`:
```ts
const userTurn = TurnsDao.createUserTurn(this.db, {
  conversationId: req.conversationId,
  originalPrompt: req.prompt,
  modelUsed: req.model,
  gearMeta: req.gearMeta ?? null
})
```

- [ ] **Step 3: Add test**

Append to `src/main/__tests__/ipc/cc-handler.integration.test.ts`:
```ts
it('send with gearMeta writes a complete user turn including geared fields', async () => {
  // ... use existing setup; pass gearMeta in the send call;
  //     query turns table directly to verify all fields persisted
})
```

- [ ] **Step 4: Verify + commit**

```
npm run test:run
npm run typecheck
git add src/shared/ipc/cc.ts src/main/ipc/cc-handler.ts \
        src/main/__tests__/ipc/cc-handler.integration.test.ts
git commit -m "feat(phase-7b): CcSendRequest.gearMeta carries original+geared+tokens for full user-turn capture"
```

---

## Task 4: Response accumulator + parser extension

**Files:**
- Modify: `src/main/cc/parser.ts` — emit a new `response-chunk` event between prompt-ready and response-complete
- Modify: `src/shared/types/cc-events.ts` — add `CcEventResponseChunk`
- Create: `src/main/cc/response-accumulator.ts`
- Create: `src/main/__tests__/cc/response-accumulator.unit.test.ts`
- Modify: `src/main/__tests__/cc/parser.unit.test.ts` — verify response-chunk emission

The accumulator collects every line of assistant output between a prompt-ready (user-side) and the next response-complete. It also retains the last `tokens-used` event for `responseTokens`. On response-complete, the accumulator emits `{ text, responseTokens }` and resets.

- [ ] **Step 1: Add CcEventResponseChunk type**

Edit `src/shared/types/cc-events.ts`:
```ts
export interface CcEventResponseChunk {
  readonly kind: 'response-chunk'
  readonly text: string
}
export type CcEvent =
  | CcEventPromptReady
  | CcEventResponseChunk
  | CcEventResponseComplete
  | CcEventTokensUsed
  | CcEventToolCall
```

- [ ] **Step 2: Parser emits response-chunk for unrecognized lines**

Edit `src/main/cc/parser.ts`. In `processLine`, when no known pattern matches AND the line isn't empty AND we're past the first prompt-ready, emit `response-chunk`. The tricky bit: the parser doesn't currently track "are we mid-response" state. Add a `private inResponse = false` flag:
- Set `true` after the FIRST response-chunk after a user send (or after `prompt-ready` if we say the user always types between prompt-readys)
- Set `false` on `response-complete`

Actually — simpler model: emit `response-chunk` for EVERY line that isn't a known event, between user-send and response-complete. The cc-handler knows when a user send happens (it can flip a per-conversation flag). The parser doesn't need to know.

Even simpler: just emit `response-chunk` for every non-event line. Let the accumulator decide what to keep based on its own state machine (drives on prompt-ready / response-complete). Phase 4D will refine.

So in `parser.ts` `processLine`, replace the `// Unknown line — ignored` comment with:
```ts
// Emit any other non-empty line as response text. The accumulator filters
// down to the assistant-response window via the prompt-ready /
// response-complete bracketing events.
this.onEvent({ kind: 'response-chunk', text: line })
```

Update existing parser tests to expect `response-chunk` for non-event lines. This may break some existing tests — fix them by either filtering out response-chunk in the assertion or asserting the chunk content.

- [ ] **Step 3: Implement the accumulator**

Create `src/main/cc/response-accumulator.ts`:
```ts
import type { CcEvent } from '@shared/types/cc-events'

export interface AccumulatedResponse {
  readonly text: string
  readonly responseTokens: number | null
}

// Tracks assistant-response output for a single PTY. Reset between user
// sends. Driven by parser events: response-chunk accumulates text;
// tokens-used updates the last-seen token count; response-complete returns
// the accumulated payload (and the caller MUST call reset() before the
// next user send).
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

  // Returns true if the accumulator should be drained (i.e. response-complete)
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
```

- [ ] **Step 4: Accumulator test**

Create `src/main/__tests__/cc/response-accumulator.unit.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

import { ResponseAccumulator } from '../../cc/response-accumulator'

describe('cc/response-accumulator', () => {
  it('ignores events when not collecting', () => {
    const a = new ResponseAccumulator()
    expect(a.handle({ kind: 'response-chunk', text: 'lost' })).toBe(false)
  })

  it('collects chunks between startCollecting and response-complete', () => {
    const a = new ResponseAccumulator()
    a.startCollecting()
    expect(a.handle({ kind: 'response-chunk', text: 'line 1' })).toBe(false)
    expect(a.handle({ kind: 'response-chunk', text: 'line 2' })).toBe(false)
    expect(a.handle({ kind: 'response-complete' })).toBe(true)
    expect(a.drain().text).toBe('line 1\nline 2')
  })

  it('captures the last tokens-used count', () => {
    const a = new ResponseAccumulator()
    a.startCollecting()
    a.handle({ kind: 'tokens-used', used: 100, total: 200000 })
    a.handle({ kind: 'response-chunk', text: 'ok' })
    a.handle({ kind: 'tokens-used', used: 250, total: 200000 })
    a.handle({ kind: 'response-complete' })
    const drained = a.drain()
    expect(drained.text).toBe('ok')
    expect(drained.responseTokens).toBe(250)
  })

  it('drain resets state — next startCollecting begins fresh', () => {
    const a = new ResponseAccumulator()
    a.startCollecting()
    a.handle({ kind: 'response-chunk', text: 'a' })
    a.handle({ kind: 'response-complete' })
    a.drain()
    a.startCollecting()
    a.handle({ kind: 'response-chunk', text: 'b' })
    a.handle({ kind: 'response-complete' })
    expect(a.drain().text).toBe('b')
  })
})
```

- [ ] **Step 5: Verify + commit**

```
npm run test:run -- src/main/__tests__/cc/
npm run typecheck
git add src/shared/types/cc-events.ts src/main/cc/parser.ts \
        src/main/cc/response-accumulator.ts \
        src/main/__tests__/cc/response-accumulator.unit.test.ts \
        src/main/__tests__/cc/parser.unit.test.ts
git commit -m "feat(phase-7b): PtyParser emits response-chunk events; ResponseAccumulator buffers assistant text"
```

---

## Task 5: Wire ResponseAccumulator into ipc/index.ts → writes assistant turn on response-complete

**Files:**
- Modify: `src/main/ipc/index.ts` — per-conversation accumulators map + assistant turn write

The accumulator is per-conversation (each PTY owns one). The simplest model: `Map<conversationId, ResponseAccumulator>` in `ipc/index.ts`'s closure. The cc-handler calls `startCollecting` when it processes a send. The lifecycle's onEvent handler runs `handle()` and, on response-complete, drains + writes the assistant turn.

- [ ] **Step 1: Inject accumulator startCollecting into cc-handler**

Pass a `onUserSend: (conversationId) => void` callback into cc-handler's constructor. The handler calls it after writing the user turn.

OR: expose a method on lifecycle (`lifecycle.markUserSend(conversationId)`) that flips a per-conversation flag. Cleaner.

Pick the lifecycle approach. Edit `src/main/cc/lifecycle.ts`:
- Add `markUserSend(conversationId)` that the cc-handler calls after the TurnsDao.createUserTurn
- Lifecycle owns the `Map<number, ResponseAccumulator>`; markUserSend calls `accumulator.startCollecting()`
- Lifecycle's existing `onEvent` indirection — chain through `accumulator.handle()` then forward to the original handler

Actually re-reading the existing code: the `onEvent` callback is provided BY `ipc/index.ts` (line 91-97). Putting the accumulator logic inside lifecycle vs. inside that callback are both valid.

Cleanest design: lifecycle owns accumulators because they're 1:1 with PTY handles (created when a conversation starts, destroyed when it ends). Lifecycle exposes `markUserSend(conversationId)`. The existing `onEvent` callback receives the event AFTER lifecycle has fed it to the accumulator; if `handle()` returns true (i.e. response-complete), lifecycle drains and calls a new optional `onAssistantTurn(conversationId, accumulated)` callback that `ipc/index.ts` provides.

Edit `lifecycle.ts`:
```ts
import { ResponseAccumulator } from './response-accumulator'

export interface CcLifecycleHooks {
  // ... existing ...
  onAssistantTurn?: (e: { conversationId: number; text: string; responseTokens: number | null }) => void
}

class CcLifecycle {
  private accumulators = new Map<number, ResponseAccumulator>()

  // Inside the per-handle PTY creation: create an accumulator and bind it.
  // Inside the onEvent path for that handle:
  private handleEvent(conversationId: number, event: CcEvent): void {
    const acc = this.accumulators.get(conversationId)
    if (acc) {
      const drained = acc.handle(event)
      if (drained) {
        const payload = acc.drain()
        this.hooks.onAssistantTurn?.({ conversationId, ...payload })
      }
    }
    this.hooks.onEvent?.(this.eventEnvelope(conversationId, event))
  }

  markUserSend(conversationId: number): void {
    this.accumulators.get(conversationId)?.startCollecting()
  }

  // In start(): create the accumulator
  // In stop()/close: remove from map
}
```

- [ ] **Step 2: cc-handler calls lifecycle.markUserSend**

Edit `cc-handler.ts`:
```ts
const userTurn = TurnsDao.createUserTurn(...)
this.lifecycle.markUserSend(req.conversationId)
this.lifecycle.write(req.conversationId, req.prompt)
```

- [ ] **Step 3: ipc/index.ts wires onAssistantTurn → TurnsDao**

Edit `src/main/ipc/index.ts`:
```ts
const ccLifecycle = new CcLifecycle(productionPtyFactory, {
  // ... existing hooks ...
  onAssistantTurn: ({ conversationId, text, responseTokens }) => {
    try {
      TurnsDao.createAssistantTurn(db, {
        conversationId,
        responseText: text,
        responseTokens,
        modelUsed: null  // model not tracked per response yet; Phase 8 may add
      })
    } catch (err) {
      logger.error('db', 'assistant-turn-write-failed', err instanceof Error ? err.message : String(err), {
        conversationId,
        errorString: String(err)
      })
    }
  }
})
```

Import `TurnsDao` at top.

- [ ] **Step 4: Verify + commit**

```
npm run test:run
npm run typecheck
git add src/main/cc/lifecycle.ts src/main/ipc/cc-handler.ts src/main/ipc/index.ts
git commit -m "feat(phase-7b): assistant turns written via ResponseAccumulator on response-complete"
```

---

## Task 6: Turns IPC handler + channels

**Files:**
- Create: `src/shared/ipc/turns.ts`
- Modify: `src/shared/ipc.ts` — re-export + union
- Create: `src/main/ipc/turns-handler.ts`
- Create: `src/main/__tests__/ipc/turns-handler.integration.test.ts`
- Modify: `src/main/ipc/index.ts` — instantiate + install + uninstall

- [ ] **Step 1: Shared types**

Create `src/shared/ipc/turns.ts`:
```ts
import type { Turn, Feedback, FeedbackSummary } from '../types/turns'
import type { IpcResult } from './envelope'

export const IPC_TURNS_LIST_BY_CONVERSATION = 'turns:list-by-conversation'
export const IPC_TURNS_UPDATE_FEEDBACK = 'turns:update-feedback'
export const IPC_TURNS_FEEDBACK_SUMMARY = 'turns:feedback-summary'
export const IPC_TURNS_CHANGED = 'turns:changed'

export interface TurnsListRequest { readonly conversationId: number }
export interface TurnsListResponse { readonly turns: readonly Turn[] }

export interface TurnsUpdateFeedbackRequest { readonly id: number; readonly feedback: Feedback }
export interface TurnsUpdateFeedbackResponse { readonly id: number; readonly feedback: Feedback }

export interface TurnsFeedbackSummaryResponse { readonly summary: FeedbackSummary }

export type TurnsListResult = IpcResult<TurnsListResponse>
export type TurnsUpdateFeedbackResult = IpcResult<TurnsUpdateFeedbackResponse>
export type TurnsFeedbackSummaryResult = IpcResult<TurnsFeedbackSummaryResponse>
```

- [ ] **Step 2: Re-export from `src/shared/ipc.ts`** + add channel names to union.

- [ ] **Step 3: Handler test**

Create `src/main/__tests__/ipc/turns-handler.integration.test.ts`. Mirror SkillsHandler test setup. Test:
- `listByConversation` returns rows for an existing conversation
- `updateFeedback` writes feedback + broadcasts `turns:changed`
- `updateFeedback` returns NOT_FOUND for unknown id
- `feedbackSummary` returns aggregate counts

- [ ] **Step 4: Implement handler**

Create `src/main/ipc/turns-handler.ts`. Constructor: `(db, logger, broadcast)`. Methods: `listByConversation`, `updateFeedback`, `getFeedbackSummary`. All wrapped in `withIpcResult` with category `'db'`. updateFeedback broadcasts `turns:changed`.

- [ ] **Step 5: Register in ipc/index.ts** — add to IpcRegistration, install + uninstall.

- [ ] **Step 6: Verify + commit**

```
npm run test:run
npm run typecheck
git add src/shared/ipc/turns.ts src/shared/ipc.ts \
        src/main/ipc/turns-handler.ts src/main/__tests__/ipc/turns-handler.integration.test.ts \
        src/main/ipc/index.ts
git commit -m "feat(phase-7b): TurnsHandler IPC — list / updateFeedback / feedbackSummary + turns:changed broadcast"
```

---

## Task 7: Preload exposure + useTurns hook

**Files:**
- Modify: `src/preload/index.ts` + `index.d.ts`
- Create: `src/renderer/src/hooks/use-turns.ts`

- [ ] **Step 1: Preload**

Expose `turns: { listByConversation, updateFeedback, getFeedbackSummary, onChanged }`. Mirror skills namespace pattern.

- [ ] **Step 2: Hook**

Create `src/renderer/src/hooks/use-turns.ts`. Takes `conversationId: number | null`. Mirrors useConversations pattern: list state + auto-fetch + onChanged subscription. Exposes `updateFeedback(id, feedback)`.

```ts
export function useTurns(conversationId: number | null): {
  readonly turns: readonly Turn[]
  readonly loading: boolean
  readonly error: string | null
  readonly refetch: () => Promise<void>
  readonly updateFeedback: (id: number, feedback: Feedback) => Promise<boolean>
}
```

If `conversationId` is null, returns empty state without firing IPC.

- [ ] **Step 3: Commit**

```
npm run typecheck
git add src/preload/index.ts src/preload/index.d.ts src/renderer/src/hooks/use-turns.ts
git commit -m "feat(phase-7b): preload exposes turns namespace + useTurns hook"
```

---

## Task 8: TurnFeedbackBar component

**Files:**
- Create: `src/renderer/src/components/composer/TurnFeedbackBar.tsx`
- Create: `src/renderer/src/components/composer/__tests__/turn-feedback-bar.unit.test.tsx`
- Modify: `src/renderer/src/components/composer/styles.css` — `.turn-feedback-bar*` rules

The bar appears below the Composer when (a) there's an active conversation, (b) the last turn is `role='assistant'`, and (c) feedback is null. Three buttons: 👍, 👎, 🤷. Clicking fires `updateFeedback` and the bar disappears (because the last turn now has feedback).

- [ ] **Step 1: Failing test**

Create `src/renderer/src/components/composer/__tests__/turn-feedback-bar.unit.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { TurnFeedbackBar } from '../TurnFeedbackBar'

describe('TurnFeedbackBar', () => {
  it('renders three feedback buttons', () => {
    render(<TurnFeedbackBar turnId={42} onSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: /thumbs up/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /thumbs down/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /shrug/i })).toBeInTheDocument()
  })

  it('calls onSubmit with the turnId and feedback when a button is clicked', () => {
    const onSubmit = vi.fn()
    render(<TurnFeedbackBar turnId={42} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: /thumbs up/i }))
    expect(onSubmit).toHaveBeenCalledWith(42, 'up')
  })
})
```

- [ ] **Step 2: Implement**

Create `src/renderer/src/components/composer/TurnFeedbackBar.tsx`:
```tsx
import type { Feedback } from '@shared/types/turns'

interface TurnFeedbackBarProps {
  turnId: number
  onSubmit: (turnId: number, feedback: Feedback) => void
}

export function TurnFeedbackBar({ turnId, onSubmit }: TurnFeedbackBarProps): JSX.Element {
  return (
    <div className="turn-feedback-bar" role="group" aria-label="Rate this response">
      <button type="button" aria-label="Thumbs up" onClick={() => onSubmit(turnId, 'up')}>👍</button>
      <button type="button" aria-label="Thumbs down" onClick={() => onSubmit(turnId, 'down')}>👎</button>
      <button type="button" aria-label="Shrug" onClick={() => onSubmit(turnId, 'shrug')}>🤷</button>
    </div>
  )
}
```

- [ ] **Step 3: CSS**

```css
.turn-feedback-bar {
  display: inline-flex;
  gap: var(--tl-space-2);
  padding: var(--tl-space-1) var(--tl-space-2);
  margin-top: var(--tl-space-2);
}
.turn-feedback-bar button {
  background: transparent;
  border: 1px solid var(--tl-rule);
  border-radius: var(--tl-radius-sm);
  padding: 2px 8px;
  font-size: 16px;
  cursor: pointer;
}
.turn-feedback-bar button:hover { background: var(--tl-hover); }
```

- [ ] **Step 4: Verify + commit**

```
npm run test:run -- src/renderer/src/components/composer/__tests__/turn-feedback-bar.unit.test.tsx
git add src/renderer/src/components/composer/TurnFeedbackBar.tsx \
        src/renderer/src/components/composer/__tests__/turn-feedback-bar.unit.test.tsx \
        src/renderer/src/components/composer/styles.css
git commit -m "feat(phase-7b): TurnFeedbackBar — 👍 👎 🤷 buttons; emits {turnId, feedback}"
```

---

## Task 9: Composer mounts TurnFeedbackBar + threads gearMeta through cc:send

**Files:**
- Modify: `src/renderer/src/components/composer/Composer.tsx`

- [ ] **Step 1: Mount TurnFeedbackBar**

Inside Composer (after the existing TerminalSection / below the textarea — pick whichever fits the layout):
```ts
const { turns, updateFeedback } = useTurns(conversationId)
const lastTurn = turns[turns.length - 1] ?? null
const showFeedbackBar = lastTurn !== null
  && lastTurn.role === 'assistant'
  && lastTurn.feedback === null
```

```tsx
{showFeedbackBar && lastTurn && (
  <TurnFeedbackBar
    turnId={lastTurn.id}
    onSubmit={(id, feedback) => { void updateFeedback(id, feedback) }}
  />
)}
```

- [ ] **Step 2: Thread gearMeta through cc:send when sending geared**

The Composer's send-from-GearReviewPane currently calls `cc.send({ conversationId, prompt: gearedText, model })`. Extend to pass:
```ts
gearMeta: {
  originalPrompt: <the original user text>,
  gearedPrompt: <what's in geared pane>,
  originalTokens: gearState.tokenBreakdown.original,
  gearedTokens: gearState.tokenBreakdown.geared,
  haikuMetaTokens: gearState.tokenBreakdown.haikuMeta,
  critiqueFlags: gearState.critiqueFlags ?? []
}
```

Field names vary based on GearResult shape — verify by reading `src/shared/ipc/gearing.ts` types. Adjust accordingly.

For plain Send (no gear), pass `gearMeta: null`.

- [ ] **Step 3: Verify + commit**

```
npm run typecheck
npm run test:run
git add src/renderer/src/components/composer/Composer.tsx
git commit -m "feat(phase-7b): Composer mounts TurnFeedbackBar + threads gearMeta through cc:send"
```

---

## Task 10: Dev-Mode feedback summary row

**Files:**
- Modify: `src/renderer/src/components/dev-mode/DevModePanel.tsx`
- Modify: `src/renderer/src/components/dev-mode/styles.css`

Add a one-line footer to DevModePanel: "👍 X · 👎 Y · 🤷 Z · ❓ U unrated". Polls `turns:feedback-summary` on mount + on `turns:changed`.

- [ ] **Step 1: Hook into useTurns or a dedicated useFeedbackSummary**

Add a small hook in `use-turns.ts`:
```ts
export function useFeedbackSummary(): FeedbackSummary | null {
  const [summary, setSummary] = useState<FeedbackSummary | null>(null)
  useEffect(() => {
    let cancelled = false
    const fetch = async (): Promise<void> => {
      const r = await window.tokenless.turns.getFeedbackSummary()
      if (!cancelled && r.ok) setSummary(r.data.summary)
    }
    void fetch()
    const unsub = window.tokenless.turns.onChanged(() => { void fetch() })
    return () => { cancelled = true; unsub() }
  }, [])
  return summary
}
```

- [ ] **Step 2: Render in DevModePanel footer**

```tsx
const summary = useFeedbackSummary()
{summary && (
  <div className="dev-mode__feedback-summary">
    👍 {summary.up} · 👎 {summary.down} · 🤷 {summary.shrug} · ❓ {summary.unrated} unrated
  </div>
)}
```

- [ ] **Step 3: Commit**

```
git add src/renderer/src/hooks/use-turns.ts \
        src/renderer/src/components/dev-mode/DevModePanel.tsx \
        src/renderer/src/components/dev-mode/styles.css
git commit -m "feat(phase-7b): Dev Mode panel surfaces feedback aggregate counts"
```

---

## Task 11: ADR-037

**Files:**
- Modify: `docs/decisions.md`

Append:
```markdown

## ADR-037 (2026-05-15) — Turn capture: one user-side write at Send, one assistant-side write on response-complete; ResponseAccumulator owns the bracketing

**Context:** Phase 7B closes the persistence gap where the `turns` table was being written only on the user side, with a single `original_prompt` field that conflated original-vs-final text. No assistant rows were being written at all.

**Options considered:**
- A) Write user + assistant turns in cc-handler.send (assistant in a setTimeout). Doesn't capture text.
- B) Subscribe to cc:output-chunk in the renderer and write turns from there. Crosses the main/renderer boundary unnecessarily.
- C) **Chosen.** Extend the PTY parser to emit `response-chunk` for non-event lines; introduce `ResponseAccumulator` per-conversation that buffers chunks between user-send (`startCollecting()`) and `response-complete` (drain). On drain, lifecycle hooks call `TurnsDao.createAssistantTurn`.

**Why C:**
- Single source of truth: lifecycle owns the per-PTY accumulator just like it owns the parser. No renderer logic needs to know about turn persistence.
- Pure functions are testable: accumulator + parser logic are isolated and unit-tested without touching DB or PTY.
- Pre-existing `response-complete` event from Phase 4B already exists — we hook the data flow into the same event boundary.
- `cc-handler.send` becomes the single user-side write site via `TurnsDao.createUserTurn` (replaces the inline INSERT that Phase 5 added).

**GearMeta on user turn:** when Send fires from the GearReviewPane, the renderer threads `{ originalPrompt, gearedPrompt, originalTokens, gearedTokens, haikuMetaTokens, critiqueFlags }` through `cc:send`. TurnsDao writes all of it into one user-turn row. Plain Send passes `gearMeta: null` and the user turn ends up with `original_prompt = req.prompt` (no geared variant; that's correct semantically).

**Feedback model:** assistant turns get a nullable `feedback` column accepting `'up' | 'down' | 'shrug'`. The Composer mounts a `TurnFeedbackBar` ONLY when the latest turn is an unrated assistant turn (so it disappears after clicking and doesn't reappear unless a new assistant turn arrives). Aggregate counts surface in Dev Mode for v1; a per-project breakdown is Phase 6D / Phase 8 polish.

**Trade-offs:**
- The parser now emits one event per non-event line — higher volume on the IPC channel. Acceptable: events are small + the existing throttle / IPC pipeline handles it. Phase 8 can debounce if measured to matter.
- The accumulator joins lines with `\n` — preserves original line breaks but loses trailing/leading whitespace differences from the raw PTY stream. Acceptable for prompt-feeding purposes; visual replay can fetch raw chunks separately if needed (Phase 8 / replay UI).
- `responseTokens` comes from the most recent `tokens-used` event before `response-complete`. Real claude may not always emit `tokens-used` mid-stream; in that case we record `null`. UI must handle the null case (already does in the existing telemetry layer).

**Discovered:** Phase 7B implementation; identified during Phase 6C/6D scope planning when telemetry-summary work surfaced the gap.

```

Commit:
```
git add docs/decisions.md
git commit -m "docs(phase-7b): ADR-037 — turn capture design (ResponseAccumulator + GearMeta + feedback)"
```

---

## Task 12: Docs sweep — observability + scenarios

**Files:**
- Modify: `docs/observability.md`
- Modify: `docs/test-scenarios.md`

- [ ] **Step 1: observability.md**

Extend `db` row's event list with: `turn-create-user`, `turn-create-assistant`, `turn-update-feedback`, `turn-list-by-conversation`, `turn-feedback-summary`, `assistant-turn-write-failed`.

Extend `ui` row with: `feedback-submitted`.

- [ ] **Step 2: test-scenarios.md**

Append Phase 7B scenarios:
- **S-7B.1** Plain Send writes a user turn (no gearMeta) — verify via DB inspection.
- **S-7B.2** Send geared writes a user turn with original + geared text + tokens.
- **S-7B.3** Assistant turn captured after response-complete fires.
- **S-7B.4** TurnFeedbackBar appears below Composer after assistant turn; disappears after clicking.
- **S-7B.5** Feedback persists across reload (Dev Mode summary reflects the new total).
- **S-7B.6** Multi-turn conversation: alternating user/assistant rows in correct order.
- **S-7B.7** Dev Mode footer shows aggregate "👍 X · 👎 Y · 🤷 Z · ❓ U" counts; updates live on click.

Commit:
```
git add docs/observability.md docs/test-scenarios.md
git commit -m "docs(phase-7b): observability events + Phase 7B manual scenarios"
```

---

## Task 13: Verification + tag v0.16.0-phase-7b

- [ ] **Step 1: Four-gate verification**

```
npm run rebuild:node
npm run typecheck
npm run test:run

npm run rebuild:electron
npm run build
npm run test:e2e
npm run rebuild:node
```

Expected unit/integration baseline: 289 (Phase 6C) + 8 DAO + 4 accumulator + 4 handler + 2 component + ~5 parser/cc updates = ~312 tests.

- [ ] **Step 2: Tag**

```
git tag -s -a v0.16.0-phase-7b -m "Phase 7B complete — turn capture (user + assistant) + feedback buttons"
git rev-parse v0.16.0-phase-7b^{commit}
```

---

## Self-Review Checklist

- [ ] **Plan exit-state vs spec:**
  - User turns capture original + geared + tokens ✓
  - Assistant turns capture response text + token count ✓
  - Feedback persisted per turn + visible aggregate in Dev Mode ✓
- [ ] **CLAUDE.md cornerstones:**
  - All new error paths through Logger
  - No silent catches (the assistant-turn-write try/catch logs the error)
  - All new categories already exist (`db`, `ui`)
- [ ] **TypeScript strict clean**
- [ ] **No console.*** outside tests

---

## Exit State

**Visible to user:**
- After Claude finishes responding, a small 👍 👎 🤷 bar appears below the Composer
- Clicking a button records the feedback (the bar disappears; reappears on next assistant response)
- Dev Mode panel footer shows aggregate counts across all conversations

**Under the hood:**
- `TurnsDao` is the single writer to the `turns` table
- `cc-handler.send` writes the user turn (with gearMeta when sending from GearReviewPane)
- `ResponseAccumulator` per-conversation buffers assistant chunks between sends; on response-complete the lifecycle writes the assistant turn
- `turns:update-feedback` IPC + `turns:changed` broadcast keep the UI in sync
- ADR-037 documents the capture design

**Phase 6D / 7C / 8 unblocked:**
- Telemetry summary view (Phase 6D) can query token totals + savings from real data
- Branching (Phase 7C) has the `turns` row(s) to point `branched_at_turn_id` at
- Session replay UI (post-v1) can list turns in order with all metadata

**Tag:** `v0.16.0-phase-7b`
