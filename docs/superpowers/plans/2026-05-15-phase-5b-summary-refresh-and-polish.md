# Phase 5B: Summary Refresh + Gearing Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build out the gearing system's remaining post-MVP surfaces. The biggest piece is background summary refresh (ADR-014) — after every completed assistant turn, fire a Haiku call in the background to update `conversations.summary`, so future gearings see fresh context. Alongside that, ship the §7.2 UX polish: a proper modal for API_AUTH_FAILED (replacing the toast), a "send original" auto-suggest fallback when gearing fails, AnthropicClient retry logging (so per-attempt activity is visible in Dev Mode), a persistent live cost preview in the TelemetryStrip (so users see expected cost as they type, not just after gearing), and an `npm run fixtures:record` script.

**Architecture:** A new `SummaryRefresher` class lives in `main/gearing/` alongside the existing engine. It subscribes to `response-complete` parser events from CcLifecycle, debounces per-conversation, and runs a Haiku call with the prior summary + last N turns to produce a new summary. AnthropicClient gains a Logger injection so each retry attempt emits an `api-retry-attempt` event. The renderer's TelemetryStrip lifts into AppShell-ish scope (or stays in Composer with a separate `lastCostPreview` state that survives gear-state clearing) and gets a debounced live estimator. A `ClaudeAuthMissingModal` replaces the toast path for `API_AUTH_FAILED`. The fixture-recording script is a tsx-runnable Node script that hits the real API and writes JSON files under `test/fixtures/api/`.

**Out of scope for Phase 5B (→ Phase 5C/later):**
- 429 inline retry banner with attempt counter (Phase 5C — depends on Logger emit landing in 5B; the renderer subscription side can be 5C)
- Real-claude output pattern calibration (needs Phase 6+ real-claude data collection)
- The full Settings page (Phase 8) — the auth modal stays a one-shot dialog for now

---

## File Structure

**New files (main):**
- `src/main/gearing/summary-refresher.ts` — `SummaryRefresher` class
- `src/main/gearing/summary-prompt.md` — Haiku system prompt for summarization
- `src/main/__tests__/gearing/summary-refresher.unit.test.ts`

**New files (shared):**
- `src/shared/ipc/api-events.ts` — `IPC_API_RETRY_ATTEMPT` broadcast channel + payload

**New files (renderer):**
- `src/renderer/src/components/notifications/AuthMissingModal.tsx`
- `src/renderer/src/hooks/use-live-cost-estimate.ts` — debounced pre-gear cost estimator

**New files (scripts/tests):**
- `scripts/record-fixtures.ts` — TSX-runnable: hits real API + writes JSON fixtures
- `test/fixtures/api/.gitignore` — keeps recorded fixtures committed but ignores any `.tmp` working files

**Modified files:**
- `src/shared/ipc.ts` — re-export the new API event channel
- `src/main/api/client.ts` — accept optional `Logger`; emit `api-retry-attempt` per retry
- `src/main/__tests__/api/client.unit.test.ts` — add retry-loop tests with injected delay + logger spy
- `src/main/ipc/index.ts` — instantiate `SummaryRefresher`; wire it to lifecycle's `onEvent` callback for `response-complete`; broadcast `api-retry-attempt` via the new channel
- `src/main/index.ts` — pass `logger` to AnthropicClient constructor
- `src/preload/index.ts`, `src/preload/index.d.ts` — expose `api.onRetryAttempt` subscription
- `src/main/db/dao/conversations.ts` — already supports `summary` updates; just verify
- `src/renderer/src/components/composer/Composer.tsx` — add `lastCostPreview` state surviving gear-state clear; show in TelemetryStrip when present; new `useLiveCostEstimate` drives a fallback estimate from current prompt text; `API_AUTH_FAILED` opens the modal instead of pushing a toast
- `src/renderer/src/components/composer/TelemetryStrip.tsx` — accept an additional optional `liveEstimate` prop showing pre-gear estimate
- `src/renderer/src/hooks/use-toast.tsx` — `ToastInput` already supports `action` from Phase 4C; verify
- `src/renderer/src/components/notifications/ClaudeNotFoundModal.tsx` — uses the same .modal styles; new AuthMissingModal mirrors the pattern
- `package.json` — add `fixtures:record` script
- `docs/decisions.md` — ADR-032 (SummaryRefresher design)
- `docs/observability.md` — extend `api` + `gearing` rows with Phase 5B events
- `docs/test-scenarios.md` — Phase 5B scenarios

---

## Task 1: AnthropicClient — Logger injection + retry-attempt emission

**Files:**
- Modify: `src/main/api/client.ts`
- Modify: `src/main/__tests__/api/client.unit.test.ts`
- Modify: `src/shared/observability.ts` — verify `api` category exists (already does from Phase 1)

- [ ] **Step 1: Extend AnthropicClient constructor with optional Logger**

Edit `src/main/api/client.ts`:

```ts
import type { Logger } from '../observability/logger'

interface AnthropicClientOptions {
  readonly apiKey: string
  readonly maxRetries?: number
  readonly baseBackoffMs?: number
  readonly timeoutMs?: number
  readonly delay?: (ms: number) => Promise<void>
  readonly logger?: Logger
}

export class AnthropicClient implements AnthropicClientLike {
  private readonly sdk: Anthropic
  private readonly maxRetries: number
  private readonly baseBackoffMs: number
  private readonly delay: (ms: number) => Promise<void>
  private readonly logger: Logger | null

  constructor(opts: AnthropicClientOptions) {
    this.sdk = new Anthropic({ apiKey: opts.apiKey, timeout: opts.timeoutMs ?? DEFAULT_OPTS.timeoutMs })
    this.maxRetries = opts.maxRetries ?? DEFAULT_OPTS.maxRetries
    this.baseBackoffMs = opts.baseBackoffMs ?? DEFAULT_OPTS.baseBackoffMs
    this.delay = opts.delay ?? defaultDelay
    this.logger = opts.logger ?? null
  }
  // ...
}
```

In the retry loop, log every retry attempt:

```ts
if (
  (lastError.code === 'API_RATE_LIMITED' || lastError.code === 'API_SERVER_ERROR') &&
  attempt < this.maxRetries
) {
  const backoff = this.baseBackoffMs * Math.pow(2, attempt - 1)
  const jitter = Math.random() * backoff * 0.3
  const sleepMs = backoff + jitter
  this.logger?.warn('api', 'api-retry-attempt', 'Anthropic API retry', {
    attempt,
    maxRetries: this.maxRetries,
    code: lastError.code,
    backoffMs: Math.round(sleepMs),
    model: request.model
  })
  await this.delay(sleepMs)
  continue
}
```

When retries are exhausted, log a final `api-retry-exhausted` error:

```ts
return { ok: false, error: lastError }
// becomes:
this.logger?.error('api', 'api-retry-exhausted', 'Anthropic API retries exhausted', {
  finalCode: lastError.code,
  attempts: this.maxRetries,
  model: request.model
})
return { ok: false, error: lastError }
```

- [ ] **Step 2: Write retry-loop unit tests**

Add to `src/main/__tests__/api/client.unit.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

import { AnthropicClient, classifyError } from '../../api/client'
import { Logger } from '../../observability/logger'

// ... existing classifyError tests stay

function makeSpyLogger(): Logger {
  return new Logger(
    { write: vi.fn(), append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100,
    'main'
  )
}

describe('api/client retry loop', () => {
  function makeClient(opts: { sdk: { messages: { create: ReturnType<typeof vi.fn> } } }): AnthropicClient {
    const c = new AnthropicClient({
      apiKey: 'sk-test',
      maxRetries: 3,
      baseBackoffMs: 1,
      delay: async () => undefined,
      logger: makeSpyLogger()
    })
    // Inject a fake SDK
    ;(c as unknown as { sdk: typeof opts.sdk }).sdk = opts.sdk
    return c
  }

  it('retries on 429 then succeeds', async () => {
    const create = vi.fn()
      .mockRejectedValueOnce({ status: 429, message: 'rate' })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn',
        model: 'haiku'
      })
    const c = makeClient({ sdk: { messages: { create } } })
    const result = await c.complete({ model: 'haiku', maxTokens: 100, system: 's', userPrompt: 'u' })
    expect(result.ok).toBe(true)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('retries on 5xx then surfaces the final error after exhausting attempts', async () => {
    const create = vi.fn().mockRejectedValue({ status: 503, message: 'unavail' })
    const c = makeClient({ sdk: { messages: { create } } })
    const result = await c.complete({ model: 'haiku', maxTokens: 100, system: 's', userPrompt: 'u' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('API_SERVER_ERROR')
    expect(create).toHaveBeenCalledTimes(3)
  })

  it('does NOT retry on 401', async () => {
    const create = vi.fn().mockRejectedValue({ status: 401, message: 'bad' })
    const c = makeClient({ sdk: { messages: { create } } })
    const result = await c.complete({ model: 'haiku', maxTokens: 100, system: 's', userPrompt: 'u' })
    expect(result.ok).toBe(false)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry on network errors', async () => {
    const create = vi.fn().mockRejectedValue({ name: 'APIConnectionError', message: 'enotfound' })
    const c = makeClient({ sdk: { messages: { create } } })
    const result = await c.complete({ model: 'haiku', maxTokens: 100, system: 's', userPrompt: 'u' })
    expect(result.ok).toBe(false)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('emits api-retry-attempt log entry per retry', async () => {
    const create = vi.fn()
      .mockRejectedValueOnce({ status: 429, message: 'rate' })
      .mockRejectedValueOnce({ status: 429, message: 'rate' })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 5, output_tokens: 5 },
        stop_reason: 'end_turn',
        model: 'haiku'
      })
    const spyLogger = makeSpyLogger()
    const warnSpy = vi.spyOn(spyLogger, 'warn')
    const c = new AnthropicClient({
      apiKey: 'sk-test',
      maxRetries: 3,
      baseBackoffMs: 1,
      delay: async () => undefined,
      logger: spyLogger
    })
    ;(c as unknown as { sdk: { messages: { create: typeof create } } }).sdk = { messages: { create } }
    await c.complete({ model: 'haiku', maxTokens: 100, system: 's', userPrompt: 'u' })
    expect(warnSpy).toHaveBeenCalledWith(
      'api',
      'api-retry-attempt',
      expect.any(String),
      expect.objectContaining({ attempt: expect.any(Number), code: 'API_RATE_LIMITED' })
    )
    expect(warnSpy).toHaveBeenCalledTimes(2) // 2 retries before success
  })
})
```

- [ ] **Step 3: Wire logger in main/index.ts**

Edit `src/main/index.ts`. Update the AnthropicClient construction:

```ts
const anthropicClient = new AnthropicClient({ apiKey, logger })
```

- [ ] **Step 4: Run + commit**

```bash
npm run test:run -- src/main/__tests__/api/
npm run typecheck
git add src/main/api/client.ts src/main/__tests__/api/client.unit.test.ts src/main/index.ts
git commit -m "feat(phase-5b): AnthropicClient accepts Logger; emits api-retry-attempt per retry"
```

---

## Task 2: api-retry-attempt IPC broadcast + preload exposure

**Files:**
- Create: `src/shared/ipc/api-events.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`, `src/preload/index.d.ts`

- [ ] **Step 1: Shared channel + payload**

Create `src/shared/ipc/api-events.ts`:

```ts
// Broadcast main → renderer for api-retry-attempt visibility (Phase 5B).
// Phase 5C wires a renderer banner to this so the user sees "Retrying… (2/3)"
// during a 429/5xx storm.

export const IPC_API_RETRY_ATTEMPT = 'api:retry-attempt'

export interface ApiRetryAttemptPayload {
  readonly attempt: number
  readonly maxRetries: number
  readonly code: 'API_RATE_LIMITED' | 'API_SERVER_ERROR'
  readonly backoffMs: number
  readonly model: string
}
```

- [ ] **Step 2: Re-export from src/shared/ipc.ts**

Add to the existing re-export block + add `'api:retry-attempt'` to `IpcChannelName`.

- [ ] **Step 3: Subscribe Logger ring buffer → broadcast in main**

This is the trickiest piece. We DON'T want every log record broadcast over IPC — there's already a separate LogBridge for that (Phase 1B). We want a SPECIFIC retry-event broadcast for the renderer banner.

The cleanest approach: the Logger already subscribes; add a small dedicated subscriber in `main/ipc/index.ts` that filters for `api/api-retry-attempt` records and re-broadcasts them on the new channel.

Edit `src/main/ipc/index.ts`:

```ts
import { IPC_API_RETRY_ATTEMPT, type ApiRetryAttemptPayload } from '@shared/ipc/api-events'
// ...

const retrySubscription = logger.subscribe((record) => {
  if (record.category === 'api' && record.event === 'api-retry-attempt') {
    const ctx = record.context as {
      attempt: number
      maxRetries: number
      code: string
      backoffMs: number
      model: string
    }
    const payload: ApiRetryAttemptPayload = {
      attempt: ctx.attempt,
      maxRetries: ctx.maxRetries,
      code: ctx.code as 'API_RATE_LIMITED' | 'API_SERVER_ERROR',
      backoffMs: ctx.backoffMs,
      model: ctx.model
    }
    broadcast(IPC_API_RETRY_ATTEMPT, payload)
  }
})
```

Store `retrySubscription` so `uninstallAll` can call it (the subscribe method returns an unsubscribe function — verify the existing Logger API). Add to `IpcRegistration`:

```ts
uninstallAll: () => {
  // ... existing
  retrySubscription()
}
```

- [ ] **Step 4: Preload exposure**

Edit `src/preload/index.ts`. Add to a new `api` namespace:

```ts
api: {
  onRetryAttempt(fn: (payload: ApiRetryAttemptPayload) => void): () => void {
    const listener = (_e: unknown, payload: ApiRetryAttemptPayload): void => fn(payload)
    ipcRenderer.on(IPC_API_RETRY_ATTEMPT, listener as never)
    return () => ipcRenderer.removeListener(IPC_API_RETRY_ATTEMPT, listener as never)
  }
}
```

Import constants + types from `@shared/ipc`. Update `src/preload/index.d.ts` with the new `api` namespace on TokenlessApi.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
npm run test:run
git add src/shared/ipc/api-events.ts src/shared/ipc.ts src/main/ipc/index.ts \
        src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(phase-5b): api:retry-attempt IPC channel + Logger subscription bridge + preload exposure"
```

---

## Task 3: ADR-032 — SummaryRefresher design

**Files:**
- Modify: `docs/decisions.md`

- [ ] **Step 1: Append**

```markdown

## ADR-032 (2026-05-15) — Background summary refresh: per-conversation debounced Haiku call on response-complete

**Context:** ADR-014 prescribes refreshing the rolling Haiku summary after every completed assistant turn. Phase 4B's parser already emits `response-complete` events. Phase 5B wires those events to a Haiku call that updates `conversations.summary` so future gearings see fresh context.

**Options considered:**
- A) Refresh on EVERY `response-complete` event, blocking the next user action until done. Adds per-turn latency and burns tokens for users who don't gear again immediately.
- B) Refresh inside the gearing flow only (lazy). Cheaper but means the FIRST gear after a long claude session sees a stale summary.
- C) Refresh in the BACKGROUND with per-conversation debounce (500ms) so rapid-fire response-complete events coalesce into one Haiku call.

**Choice:** C — `SummaryRefresher` in `main/gearing/`. Per-conversation debounce timer; on `response-complete`, schedule a 500ms timer (or reset an existing one); when it fires, run the refresh.

**Refresh algorithm:**
1. Read the conversation's prior summary + last N turns (default 6 — covers most claude session shapes).
2. Build a Haiku message: system prompt asks "produce a 200-token summary of this conversation's purpose + current state".
3. Call `anthropicClient.complete(...)`.
4. On success: `ConversationsDao.updateConversation({ id, summary, summaryUpdatedAt: Date.now() })`. Log `summary-refresh-ok` info.
5. On failure: log `summary-refresh-failed` warn. NO toast (per spec §7.2 row 6 — silent failure; use stale summary).

**Reasoning:** Background + debounce balances freshness with cost. Failures are invisible because a stale summary is OK — the rolling summary is an OPTIMIZATION, not a correctness primitive. Phase 5A's gearing engine works WITHOUT a fresh summary (the system prompt doesn't require one; it just helps with multi-turn context). This isolates the summary subsystem from the user's main flow.

**Trade-offs:**
- Two consecutive sends with claude responses ~1s apart: only one summary refresh happens (debounce). User won't notice.
- A claude crash mid-stream means `response-complete` never fires; the summary stays stale. Acceptable — Phase 4C's crash detection handles the user-visible side.
- Summary refresh fires per cc:event broadcast, NOT per turns table row. The two are correlated but not 1:1. Phase 5B accepts this; Phase 6 may revisit.

**Discovered:** Phase 5B summary refresh design.

```

- [ ] **Step 2: Verify + commit**

```bash
grep "^## ADR" docs/decisions.md | tail -3
git add docs/decisions.md
git commit -m "docs(phase-5b): ADR-032 — SummaryRefresher design (per-conv debounce, background, silent failure)"
```

---

## Task 4: Summary prompt template + SummaryRefresher class

**Files:**
- Create: `src/main/gearing/summary-prompt.md`
- Create: `src/main/gearing/summary-refresher.ts`
- Create: `src/main/__tests__/gearing/summary-refresher.unit.test.ts`

- [ ] **Step 1: Summary prompt template**

Create `src/main/gearing/summary-prompt.md`:

```markdown
You are TokenLess's conversation summarizer. Your job: produce a concise summary of an ongoing Claude Code conversation so the gearing engine can give future prompts the right context.

## Hard rules

1. Return ONLY the summary text. No JSON, no markdown, no commentary.
2. Maximum 200 tokens. Aim for 100-150.
3. Past tense, third-person. ("User asked X. Claude refactored Y. Open question: Z.")
4. Surface UNRESOLVED items prominently. If claude promised something it hasn't delivered, note it. If the user expressed dissatisfaction, note it.

## What to include

- The conversation's primary goal (what is the user trying to accomplish overall).
- Major decisions or commitments made by claude (file changes, design choices).
- Open questions or pending work.
- Anything the user explicitly flagged as confusing, wrong, or important.

## What to exclude

- Verbatim quotes longer than ~10 words.
- Boilerplate ("the user said hello", "claude responded helpfully").
- Tool-call details (claude used Read on src/foo.ts) unless they led to a decision.

## Example output

"User refactoring the auth middleware in src/auth/. Claude flattened nested conditionals (PR #42 staged but not merged). Open question: should refresh-token expiry be checked before or after access-token validation. Claude paused waiting for user direction."
```

- [ ] **Step 2: Failing test**

Create `src/main/__tests__/gearing/summary-refresher.unit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { SummaryRefresher } from '../../gearing/summary-refresher'
import { MockAnthropicClient } from '../../../../test/doubles/mock-anthropic-client'
import { createTestDb } from '../../../../test/doubles/test-db'
import { Logger } from '../../observability/logger'
import { AccountsDao, ProjectsDao, ConversationsDao } from '../../db'

import type { Database } from 'better-sqlite3'

function makeLogger(): Logger {
  return new Logger(
    { write: vi.fn(), append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100,
    'main'
  )
}

describe('gearing/summary-refresher', () => {
  let db: Database
  let conversationId: number

  beforeEach(() => {
    vi.useFakeTimers()
    db = createTestDb()
    const accountId = AccountsDao.createAccount(db, { label: 'P', configDir: '/p' }).id
    const projectId = ProjectsDao.createProject(db, { name: 'P', rootPath: '/x', defaultAccountId: accountId }).id
    conversationId = ConversationsDao.createConversation(db, { projectId, accountId }).id
    // Seed a couple of turns for the summary call
    db.prepare(
      `INSERT INTO turns (conversation_id, role, original_prompt, response_text, status, sent_at)
       VALUES (?, 'user', 'do something', NULL, 'complete', ?)`
    ).run(conversationId, Date.now() - 1000)
    db.prepare(
      `INSERT INTO turns (conversation_id, role, response_text, status, sent_at)
       VALUES (?, 'assistant', 'done.', 'complete', ?)`
    ).run(conversationId, Date.now())
  })

  it('debounces rapid response-complete events into a single Haiku call', async () => {
    const client = new MockAnthropicClient({
      '*': {
        response: {
          text: 'A summary line.',
          inputTokens: 50,
          outputTokens: 20,
          stopReason: 'end_turn',
          model: 'claude-3-5-haiku-latest'
        }
      }
    })
    const refresher = new SummaryRefresher({
      db, client, logger: makeLogger(), debounceMs: 500, recentTurnsCount: 6
    })
    refresher.onResponseComplete(conversationId)
    refresher.onResponseComplete(conversationId)
    refresher.onResponseComplete(conversationId)
    await vi.advanceTimersByTimeAsync(500)
    // Allow the async flush to complete
    await vi.runAllTimersAsync()
    expect(client.calls).toHaveLength(1)
  })

  it('writes the new summary to conversations.summary on success', async () => {
    const client = new MockAnthropicClient({
      '*': {
        response: {
          text: 'User refactoring auth. Claude flattened conditionals.',
          inputTokens: 80,
          outputTokens: 12,
          stopReason: 'end_turn',
          model: 'claude-3-5-haiku-latest'
        }
      }
    })
    const refresher = new SummaryRefresher({
      db, client, logger: makeLogger(), debounceMs: 500, recentTurnsCount: 6
    })
    refresher.onResponseComplete(conversationId)
    await vi.advanceTimersByTimeAsync(500)
    await vi.runAllTimersAsync()

    const conv = ConversationsDao.getConversationById(db, conversationId)
    expect(conv?.summary).toBe('User refactoring auth. Claude flattened conditionals.')
    expect(conv?.summaryUpdatedAt).not.toBeNull()
  })

  it('silently logs and does not throw when the API call fails', async () => {
    const client = new MockAnthropicClient({
      '*': { error: { code: 'API_AUTH_FAILED', message: 'bad key' } }
    })
    const logger = makeLogger()
    const warnSpy = vi.spyOn(logger, 'warn')
    const refresher = new SummaryRefresher({
      db, client, logger, debounceMs: 500, recentTurnsCount: 6
    })
    refresher.onResponseComplete(conversationId)
    await vi.advanceTimersByTimeAsync(500)
    await vi.runAllTimersAsync()

    expect(warnSpy).toHaveBeenCalledWith('gearing', 'summary-refresh-failed', expect.any(String), expect.any(Object))
    // The conversation's summary should still be null (untouched)
    const conv = ConversationsDao.getConversationById(db, conversationId)
    expect(conv?.summary).toBeNull()
  })

  it('multiple conversations get independent debounce timers', async () => {
    const client = new MockAnthropicClient({
      '*': {
        response: {
          text: 'summary',
          inputTokens: 10,
          outputTokens: 5,
          stopReason: 'end_turn',
          model: 'claude-3-5-haiku-latest'
        }
      }
    })
    const refresher = new SummaryRefresher({
      db, client, logger: makeLogger(), debounceMs: 500, recentTurnsCount: 6
    })
    const accountId = AccountsDao.createAccount(db, { label: 'Q', configDir: '/q' }).id
    const projectId2 = ProjectsDao.createProject(db, { name: 'P2', rootPath: '/y', defaultAccountId: accountId }).id
    const conv2 = ConversationsDao.createConversation(db, { projectId: projectId2, accountId }).id

    refresher.onResponseComplete(conversationId)
    refresher.onResponseComplete(conv2)
    await vi.advanceTimersByTimeAsync(500)
    await vi.runAllTimersAsync()

    expect(client.calls).toHaveLength(2)
  })
})
```

- [ ] **Step 3: Implement SummaryRefresher**

Create `src/main/gearing/summary-refresher.ts`:

```ts
// SummaryRefresher — per-conversation debounced Haiku call to update
// conversations.summary after a response-complete event fires. Silent on
// failure per spec §7.2 row 6 (stale summary is OK).

import type { Database } from 'better-sqlite3'

import type { AnthropicClientLike } from '../api/types'
import { PRICING, GEARING_MODEL } from '../api/pricing'
import { ConversationsDao } from '../db'
import { Logger } from '../observability/logger'

// eslint-disable-next-line import/no-unresolved
import SUMMARY_PROMPT from './summary-prompt.md?raw'

export interface SummaryRefresherOptions {
  readonly db: Database
  readonly client: AnthropicClientLike
  readonly logger: Logger
  readonly debounceMs?: number       // default 500
  readonly recentTurnsCount?: number // default 6
}

const DEFAULT_DEBOUNCE_MS = 500
const DEFAULT_RECENT_TURNS = 6
const SUMMARY_MAX_TOKENS = 250

interface TurnRow {
  role: string
  original_prompt: string | null
  response_text: string | null
}

export class SummaryRefresher {
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>()
  private readonly debounceMs: number
  private readonly recentTurnsCount: number

  constructor(private readonly opts: SummaryRefresherOptions) {
    this.debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS
    this.recentTurnsCount = opts.recentTurnsCount ?? DEFAULT_RECENT_TURNS
  }

  onResponseComplete(conversationId: number): void {
    const existing = this.timers.get(conversationId)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      this.timers.delete(conversationId)
      void this.refresh(conversationId)
    }, this.debounceMs)
    this.timers.set(conversationId, timer)
  }

  // Cancel all pending refreshes — called from uninstallAll on app shutdown.
  stop(): void {
    for (const t of this.timers.values()) clearTimeout(t)
    this.timers.clear()
  }

  private async refresh(conversationId: number): Promise<void> {
    const conv = ConversationsDao.getConversationById(this.opts.db, conversationId)
    if (!conv) return
    const turns = this.opts.db
      .prepare<[number, number], TurnRow>(
        `SELECT role, original_prompt, response_text FROM turns
         WHERE conversation_id = ? ORDER BY id DESC LIMIT ?`
      )
      .all(conversationId, this.recentTurnsCount)
      .reverse() // chronological

    const turnsText = turns
      .map((t) => `### ${t.role}\n${t.role === 'user' ? t.original_prompt ?? '' : t.response_text ?? ''}`)
      .join('\n\n')
    const userPrompt =
      (conv.summary ? `## Prior summary\n\n${conv.summary}\n\n` : '') +
      `## Recent turns\n\n${turnsText}`

    const result = await this.opts.client.complete({
      model: PRICING[GEARING_MODEL].apiModel,
      maxTokens: SUMMARY_MAX_TOKENS,
      system: SUMMARY_PROMPT,
      userPrompt
    })

    if (!result.ok) {
      this.opts.logger.warn('gearing', 'summary-refresh-failed', 'Background summary refresh failed', {
        conversationId,
        code: result.error.code
      })
      return
    }

    const newSummary = result.data.text.trim()
    ConversationsDao.updateConversation(this.opts.db, {
      id: conversationId,
      summary: newSummary
    })
    // Also bump summary_updated_at — the DAO's update doesn't touch that
    // column directly, so do it via raw SQL.
    this.opts.db
      .prepare('UPDATE conversations SET summary_updated_at = ? WHERE id = ?')
      .run(Date.now(), conversationId)

    this.opts.logger.info('gearing', 'summary-refresh-ok', 'Summary refreshed', {
      conversationId,
      summaryLength: newSummary.length,
      haikuInputTokens: result.data.inputTokens,
      haikuOutputTokens: result.data.outputTokens
    })
  }
}
```

- [ ] **Step 4: Run + commit**

```bash
npm run test:run -- src/main/__tests__/gearing/summary-refresher.unit.test.ts
git add src/main/gearing/summary-prompt.md src/main/gearing/summary-refresher.ts \
        src/main/__tests__/gearing/summary-refresher.unit.test.ts
git commit -m "feat(phase-5b): SummaryRefresher — per-conversation debounced Haiku summary on response-complete"
```

---

## Task 5: Wire SummaryRefresher into lifecycle callbacks

**Files:**
- Modify: `src/main/ipc/index.ts`

- [ ] **Step 1: Instantiate + wire into onEvent**

Edit `src/main/ipc/index.ts`. After `gearingEngine` instantiation:

```ts
import { SummaryRefresher } from '@main/gearing/summary-refresher'

// ...

const summaryRefresher = new SummaryRefresher({
  db, client: anthropicClient, logger
})
```

Update the CcLifecycle `onEvent` callback to invoke the refresher on `response-complete`:

```ts
onEvent: (e) => {
  telemetryEmitter.handle(e)
  if (e.event.kind === 'response-complete') {
    summaryRefresher.onResponseComplete(e.conversationId)
  }
  broadcast(IPC_CC_EVENT, e)
}
```

Stop the refresher in `uninstallAll`:

```ts
uninstallAll: () => {
  // ... existing
  summaryRefresher.stop()
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npm run typecheck
npm run test:run
git add src/main/ipc/index.ts
git commit -m "feat(phase-5b): wire SummaryRefresher into CcLifecycle response-complete events"
```

---

## Task 6: AuthMissingModal — replace API_AUTH_FAILED toast with modal

**Files:**
- Create: `src/renderer/src/components/notifications/AuthMissingModal.tsx`
- Modify: `src/renderer/src/components/notifications/styles.css`
- Modify: `src/renderer/src/components/composer/Composer.tsx`
- Modify: `src/renderer/src/components/layout/AppShell.tsx`

- [ ] **Step 1: Modal component (mirrors ClaudeNotFoundModal pattern)**

Create `src/renderer/src/components/notifications/AuthMissingModal.tsx`:

```tsx
import './styles.css'

interface AuthMissingModalProps {
  open: boolean
  onDismiss: () => void
}

export function AuthMissingModal({ open, onDismiss }: AuthMissingModalProps): JSX.Element | null {
  if (!open) return null
  return (
    <div className="modal-backdrop" role="presentation" onClick={onDismiss}>
      <div
        className="modal auth-missing-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-missing-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="auth-missing-title" className="modal__title">Anthropic API key required</h2>
        <p>
          Gearing uses Claude Haiku via the Anthropic API. TokenLess didn&apos;t find an
          <code> ANTHROPIC_API_KEY</code> environment variable, or the one set isn&apos;t valid.
        </p>
        <p>
          To use gearing now: close TokenLess, set the env var, and relaunch. On Windows:
        </p>
        <pre className="auth-missing-modal__pre">
{`$env:ANTHROPIC_API_KEY = 'sk-ant-...'
npm run dev`}
        </pre>
        <p className="auth-missing-modal__hint">
          A proper Settings → &ldquo;API key&rdquo; field lands in Phase 8 polish.
        </p>
        <div className="modal__actions">
          <button type="button" className="btn btn--primary" onClick={onDismiss}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
```

Append to `src/renderer/src/components/notifications/styles.css`:

```css
.auth-missing-modal {
  width: min(560px, 92vw);
}
.auth-missing-modal p { margin: 0.25rem 0; line-height: 1.5; }
.auth-missing-modal code {
  background: var(--tl-bg-mute);
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  font-size: 0.9em;
}
.auth-missing-modal__pre {
  background: var(--tl-bg-mute);
  padding: 0.6rem 0.8rem;
  border-radius: 4px;
  font-size: 0.85rem;
  overflow-x: auto;
}
.auth-missing-modal__hint {
  color: var(--tl-text-muted);
  font-size: 0.85rem;
}
```

- [ ] **Step 2: Lift the auth-modal state to AppShell**

The current `Composer.tsx` pushes a toast for `API_AUTH_FAILED`. Phase 5B's modal lives at AppShell level (same as ClaudeNotFoundModal) so any component that hits an auth failure can trigger it.

The cleanest path: a small context. Or — much simpler — just have AppShell own a `<AuthMissingModal>` instance + expose a `setAuthMissingOpen` callback. Composer imports a hook to access it, OR Composer keeps its own local state and renders the modal.

For Phase 5B's MVP: keep state local to Composer. It's the only callsite. Move the modal mount out of the toast path:

Edit `src/renderer/src/components/composer/Composer.tsx`:

```ts
import { AuthMissingModal } from '../notifications/AuthMissingModal'

// inside the component:
const [authMissingOpen, setAuthMissingOpen] = useState(false)

// In runGear's failure branch:
} else {
  const code = result.error.code
  rendererLogger.error('ui', 'gear-failed', result.error.message, {
    conversationId, code, logId: result.error.logId
  })
  if (code === 'API_AUTH_FAILED') {
    setAuthMissingOpen(true)  // modal, not toast
  } else {
    const message = GEAR_ERROR_MESSAGES[code] ?? GEAR_ERROR_MESSAGES.API_UNKNOWN
    pushToast({ message, severity: 'error' })
  }
}
```

Mount the modal in the JSX (both in the gear-state branch and the normal composer branch, OR — easier — only in the normal composer branch since gear failures only happen when the user clicks Gear from the composer view, and the modal would appear there):

Actually the modal should ALWAYS be mountable, regardless of view. Render it as a sibling of the main `<div className="composer">` / `<GearReviewPane>`:

```tsx
return (
  <>
    {gearState ? (
      <GearReviewPane key={...} ... />
    ) : (
      <div className="composer">
        <PromptTextarea ... />
        {/* etc */}
      </div>
    )}
    <AuthMissingModal open={authMissingOpen} onDismiss={() => setAuthMissingOpen(false)} />
  </>
)
```

Update the `GEAR_ERROR_MESSAGES` map to remove the `API_AUTH_FAILED` entry (it's no longer rendered as a toast). Or keep it as a fallback in case the modal path fails — defensive.

- [ ] **Step 3: Typecheck + smoke test (manual)**

```bash
npm run typecheck
npm run test:run
```

Phase 5B doesn't add unit tests for the modal — it's exercised by the manual scenario S-5B.1 (set bad API key, click Gear, see modal not toast).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/notifications/AuthMissingModal.tsx \
        src/renderer/src/components/notifications/styles.css \
        src/renderer/src/components/composer/Composer.tsx
git commit -m "feat(phase-5b): AuthMissingModal — replaces API_AUTH_FAILED toast with a proper modal"
```

---

## Task 7: Send-original auto-suggest on gearing failure

**Files:**
- Modify: `src/renderer/src/components/composer/Composer.tsx`

- [ ] **Step 1: Update toast pushes with a "Send original" action**

The Phase 4C `ToastInput` already supports an optional `action: { label, onActivate }` field. Use it for gearing-failure toasts so the user can send the original prompt without re-clicking through the composer.

In Composer's `runGear` failure branch:

```ts
} else {
  // ... existing logging
  if (code === 'API_AUTH_FAILED') {
    setAuthMissingOpen(true)
  } else {
    const message = GEAR_ERROR_MESSAGES[code] ?? GEAR_ERROR_MESSAGES.API_UNKNOWN
    pushToast({
      message,
      severity: 'error',
      action: {
        label: 'Send original',
        onActivate: () => void handleSend(prompt)
      }
    })
  }
}
```

The Toast component (Phase 4C) already renders the optional action button. When the user clicks "Send original", the toast's onActivate fires, then the toast dismisses (the Toast component handles this).

- [ ] **Step 2: Typecheck + smoke test**

```bash
npm run typecheck
npm run test:run
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/composer/Composer.tsx
git commit -m "feat(phase-5b): gearing-failure toasts include 'Send original' action"
```

---

## Task 8: Live cost estimate in TelemetryStrip (Phase 5A polish)

**Files:**
- Create: `src/renderer/src/hooks/use-live-cost-estimate.ts`
- Create: `src/renderer/src/hooks/__tests__/use-live-cost-estimate.unit.test.tsx`
- Modify: `src/renderer/src/components/composer/Composer.tsx`
- Modify: `src/renderer/src/components/composer/TelemetryStrip.tsx`

The current TelemetryStrip in the composer view always shows the idle hint. Phase 5B adds:
- A LIVE estimate as the user types (debounced 500ms): rough input tokens × selected model's pricing, with a default output estimate.
- A persistent `lastCostPreview` slot that survives gear-state clearing: after the user clicks Send geared, the strip continues showing the actual gearing's cost preview as the "last completed" estimate.

For Phase 5B MVP we'll keep it simple: live estimate based on prompt text + model selection, no persistence across compose cycles. (The persistent slot is a nicer UX, but only delivers value when the user does multiple gearings in a row — defer to Phase 6.)

- [ ] **Step 1: useLiveCostEstimate hook + test**

Create `src/renderer/src/hooks/use-live-cost-estimate.ts`:

```ts
import { useEffect, useState } from 'react'

import type { CostPreview } from '@shared/types/gearing'

// Pricing duplicated from main/api/pricing.ts — the renderer needs these for
// pre-gear estimates. Keep in sync manually until Phase 6 introduces a pricing
// IPC query (or a shared module if it makes sense).
const PRICING: Record<string, { input: number; output: number; label: string }> = {
  haiku:  { input: 1.00,  output: 5.00,  label: 'Haiku 3.5'  },
  sonnet: { input: 3.00,  output: 15.00, label: 'Sonnet 4.7' },
  opus:   { input: 15.00, output: 75.00, label: 'Opus 4.7'   }
}

interface UseLiveCostEstimateInput {
  readonly prompt: string
  readonly model: string
  readonly breadth: string
  readonly debounceMs?: number
}

function estimateInputTokens(text: string): number {
  if (text.length === 0) return 0
  return Math.ceil(text.length / 4)
}

function defaultOutputTokens(breadth: string): number {
  if (breadth === 'terse') return 400
  if (breadth === 'thorough') return 1600
  return 800
}

export function useLiveCostEstimate(input: UseLiveCostEstimateInput): CostPreview | null {
  const [debounced, setDebounced] = useState({ prompt: input.prompt, model: input.model, breadth: input.breadth })

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced({ prompt: input.prompt, model: input.model, breadth: input.breadth })
    }, input.debounceMs ?? 500)
    return () => clearTimeout(timer)
  }, [input.prompt, input.model, input.breadth, input.debounceMs])

  if (debounced.prompt.length === 0) return null
  const p = PRICING[debounced.model]
  if (!p) return null
  const inputTokens = estimateInputTokens(debounced.prompt)
  const outputTokens = defaultOutputTokens(debounced.breadth)
  const dollars = (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output
  return {
    expectedDollars: dollars,
    expectedInputTokens: inputTokens,
    expectedOutputTokens: outputTokens,
    modelLabel: p.label,
    haikuMetaDollars: 0
  }
}
```

Create `src/renderer/src/hooks/__tests__/use-live-cost-estimate.unit.test.tsx`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useLiveCostEstimate } from '../use-live-cost-estimate'

describe('hooks/use-live-cost-estimate', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns null for empty prompt', () => {
    const { result } = renderHook(() => useLiveCostEstimate({ prompt: '', model: 'opus', breadth: 'normal' }))
    act(() => { vi.advanceTimersByTime(500) })
    expect(result.current).toBeNull()
  })

  it('debounces — returns null until 500ms passes', () => {
    const { result } = renderHook(() => useLiveCostEstimate({ prompt: 'hello world', model: 'haiku', breadth: 'normal' }))
    expect(result.current).toBeNull()
    act(() => { vi.advanceTimersByTime(499) })
    expect(result.current).toBeNull()
    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current).not.toBeNull()
  })

  it('computes expected dollars from chars/4 token estimate', () => {
    // "a".repeat(400) → 100 input tokens. Default output 800. Haiku $1/M in, $5/M out.
    // dollars = (100/1M * 1) + (800/1M * 5) = 0.0001 + 0.004 = 0.0041
    const { result } = renderHook(() =>
      useLiveCostEstimate({ prompt: 'a'.repeat(400), model: 'haiku', breadth: 'normal' })
    )
    act(() => { vi.advanceTimersByTime(500) })
    expect(result.current?.expectedDollars).toBeCloseTo(0.0041, 5)
  })

  it('halves output for terse breadth, doubles for thorough', () => {
    const { result: terse } = renderHook(() =>
      useLiveCostEstimate({ prompt: 'a'.repeat(400), model: 'opus', breadth: 'terse' })
    )
    const { result: thorough } = renderHook(() =>
      useLiveCostEstimate({ prompt: 'a'.repeat(400), model: 'opus', breadth: 'thorough' })
    )
    act(() => { vi.advanceTimersByTime(500) })
    expect(terse.current?.expectedOutputTokens).toBe(400)
    expect(thorough.current?.expectedOutputTokens).toBe(1600)
  })

  it('returns null for unknown model', () => {
    const { result } = renderHook(() => useLiveCostEstimate({ prompt: 'hi', model: 'fake', breadth: 'normal' }))
    act(() => { vi.advanceTimersByTime(500) })
    expect(result.current).toBeNull()
  })
})
```

- [ ] **Step 2: Wire into Composer + TelemetryStrip**

Edit `src/renderer/src/components/composer/Composer.tsx`. Inside the component:

```ts
import { useLiveCostEstimate } from '../../hooks/use-live-cost-estimate'

const liveEstimate = useLiveCostEstimate({ prompt, model, breadth })

// In the JSX:
<TelemetryStrip costPreview={liveEstimate} />
```

The TelemetryStrip already handles null (shows idle hint) and renders dollars/tokens when non-null. No changes needed to TelemetryStrip itself unless you want a different label for "live estimate" vs "completed gearing" — Phase 5B keeps it the same.

- [ ] **Step 3: Run + commit**

```bash
npm run test:run -- src/renderer/src/hooks/__tests__/use-live-cost-estimate.unit.test.tsx
git add src/renderer/src/hooks/use-live-cost-estimate.ts \
        src/renderer/src/hooks/__tests__/use-live-cost-estimate.unit.test.tsx \
        src/renderer/src/components/composer/Composer.tsx
git commit -m "feat(phase-5b): live cost estimate in TelemetryStrip — debounced chars/4 token approximation"
```

---

## Task 9: fixtures:record script

**Files:**
- Create: `scripts/record-fixtures.ts`
- Modify: `package.json`

- [ ] **Step 1: Script**

Create `scripts/record-fixtures.ts`:

```ts
#!/usr/bin/env tsx
// Record Anthropic API responses to test/fixtures/api/ for use by
// MockAnthropicClient in tests.
//
// USAGE:
//   $env:ANTHROPIC_API_KEY = 'sk-ant-...'
//   npm run fixtures:record
//
// Adds (or overwrites) fixture JSON files for a known set of test scenarios.
// Run when the gearing system prompt changes or to refresh after API changes.
//
// Each fixture file shape:
//   { description: string, response: MessageResponse }

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { AnthropicClient } from '../src/main/api/client'
import { buildGearRequest } from '../src/main/gearing/builder'

interface Scenario {
  readonly name: string
  readonly description: string
  readonly originalPrompt: string
  readonly configs: { model: string; breadth: string; format: string; skill: string | null }
}

const SCENARIOS: Scenario[] = [
  {
    name: 'gear-simple',
    description: 'Verbose refactor request — typical compression case.',
    originalPrompt:
      "Could you please take a look at the authentication middleware that I've been working on and see if there's any way we can refactor it? The current implementation has some nested conditionals that make the token validation flow really hard to follow.",
    configs: { model: 'sonnet', breadth: 'normal', format: 'prose', skill: null }
  },
  {
    name: 'gear-edge-empty-flags',
    description: 'Already well-scoped request — should produce empty critique_flags.',
    originalPrompt: 'Add a unit test for parseConfig() covering valid input, missing keys, invalid type.',
    configs: { model: 'haiku', breadth: 'normal', format: 'code', skill: null }
  },
  // Add more as the system prompt evolves
]

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY not set. Aborting.')
  process.exit(1)
}

const FIXTURES_DIR = join(process.cwd(), 'test/fixtures/api')
mkdirSync(FIXTURES_DIR, { recursive: true })

const client = new AnthropicClient({ apiKey })

async function main(): Promise<void> {
  for (const sc of SCENARIOS) {
    console.log(`Recording ${sc.name}...`)
    const request = buildGearRequest({ originalPrompt: sc.originalPrompt, configs: sc.configs })
    const result = await client.complete(request)
    if (!result.ok) {
      console.error(`  FAILED (${result.error.code}): ${result.error.message}`)
      continue
    }
    const fixture = {
      description: sc.description,
      recordedAt: new Date().toISOString(),
      response: result.data
    }
    const path = join(FIXTURES_DIR, `${sc.name}.json`)
    writeFileSync(path, JSON.stringify(fixture, null, 2) + '\n', 'utf8')
    console.log(`  → ${path} (input=${result.data.inputTokens}, output=${result.data.outputTokens})`)
  }
  console.log('Done.')
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(2)
})
```

- [ ] **Step 2: Add npm script**

Edit `package.json` `scripts`:

```json
"fixtures:record": "tsx scripts/record-fixtures.ts"
```

- [ ] **Step 3: Smoke test the script ONLY IF the developer has an API key**

If `ANTHROPIC_API_KEY` is set in the shell, run `npm run fixtures:record`. Otherwise skip — the script aborts cleanly.

Verify the resulting JSON fixture files have the same SHAPE as the hand-synthesized originals (description + response { text, inputTokens, outputTokens, stopReason, model }).

If the recorded fixtures replace the hand-synthesized ones, the existing engine tests should STILL pass — the gearing logic doesn't care if the JSON came from a real call or a hand-synthesized one. Run `npm run test:run -- src/main/__tests__/gearing/` to confirm.

- [ ] **Step 4: Commit**

```bash
git add scripts/record-fixtures.ts package.json
git commit -m "test(phase-5b): scripts/record-fixtures.ts — regenerates test/fixtures/api/ from live API"
```

---

## Task 10: Docs sweep + scenarios + tag

**Files:**
- Modify: `docs/observability.md`
- Modify: `docs/test-scenarios.md`

- [ ] **Step 1: observability.md updates**

Edit `docs/observability.md`:
- `api` row: add Phase 5B event `api-retry-attempt` (now emitted) + `api-retry-exhausted`
- `gearing` row: add `summary-refresh-ok` + `summary-refresh-failed`

- [ ] **Step 2: test-scenarios.md — Phase 5B scenarios**

Append to `docs/test-scenarios.md`:

```markdown

## Phase 5B — Summary refresh + polish

### S-5B.1 Auth modal (replaces toast)
1. Launch with no `ANTHROPIC_API_KEY` set (or with an invalid key).
2. Create project + new conversation, type a prompt, click Gear.
3. **Expect:** Modal "Anthropic API key required" appears with PowerShell instructions. NOT a toast.

### S-5B.2 Send original auto-suggest
1. Trigger any non-auth gearing failure (easiest: temporarily set `ANTHROPIC_API_KEY=invalid_after_validation` so the call fails post-auth somehow — or simulate via 5xx by network manipulation).
2. **Expect:** Toast appears with a "Send original" button. Clicking it sends the original prompt to claude (verify in Dev Mode `send-success` entry, prompt clears).

### S-5B.3 Live cost estimate
1. With a project + conversation active, type into the composer.
2. **Expect:** Within ~500ms of typing pause, the TelemetryStrip shows the current model + estimated $ + token counts. Updates as you change the model selection or breadth.
3. Clear the prompt.
4. **Expect:** Strip returns to idle hint.

### S-5B.4 Summary refresh after assistant turn
1. Launch with real Claude Code installed + `ANTHROPIC_API_KEY` set.
2. Start a conversation, send a prompt, wait for claude's response to complete (prompt-ready event fires).
3. **Expect:** Within ~1s, Dev Mode shows `summary-refresh-ok` log entry with a summary length. DB inspection: `conversations.summary` column for this conversation has a populated string; `summary_updated_at` is recent.

### S-5B.5 Retry attempts visible in Dev Mode
1. Hard to reliably trigger — only fires on 429/5xx.
2. **Expect when it happens:** Dev Mode shows multiple `api-retry-attempt` warn entries with attempt counters, then either a success log OR `api-retry-exhausted` error.

### S-5B.6 Fixture recording
1. `$env:ANTHROPIC_API_KEY = 'sk-ant-...'; npm run fixtures:record`
2. **Expect:** Existing fixture files in `test/fixtures/api/` get updated with fresh timestamps + actual API responses. `npm run test:run` still green afterward.
```

- [ ] **Step 3: Run full gates + tag**

```bash
npm run rebuild:node
npm run typecheck
npm run test:run
npm run rebuild:electron
npm run build
npm run test:e2e
npm run rebuild:node
```

All four gates green. Expected: unit/integration count grows by ~12-15 (Task 1 retry tests + Task 4 summary-refresher tests + Task 8 live-cost-estimate tests). E2E count stays at 18 (no new E2E in Phase 5B — manual scenarios are sufficient for the new flows).

```bash
git add docs/observability.md docs/test-scenarios.md
git commit -m "docs(phase-5b): observability events + manual scenarios"
git tag -s -a v0.11.0-phase-5b -m "Phase 5B complete — summary refresh, auth modal, live cost estimate, retry visibility, fixtures script"
git rev-parse v0.11.0-phase-5b^{commit}
```

---

## Self-Review Checklist

- [ ] **ADR-014 covered:** SummaryRefresher hooked to response-complete, debounced, silent on failure
- [ ] **§7.2 row 6 (summary refresh failure):** silent log only, no toast — matches spec
- [ ] **§7.2 row 1 (auth failed):** UPGRADED from toast to modal — better UX than 5A
- [ ] **api-retry-attempt** now emitted (closing the Phase 5A doc gap)
- [ ] **TelemetryStrip persistent visibility:** addressed via live estimate; persistent post-gear is deferred to Phase 6 since it's a UX-only nicety
- [ ] **No new silent catches**
- [ ] **TypeScript strict clean**

---

## Exit State

**Visible to user:**
- Click Gear with bad/missing API key → MODAL appears with explicit setup steps (no longer a toast)
- Click Gear with rate limit / server error / network down → Toast with "Send original" button so the user can proceed without re-clicking through
- TelemetryStrip shows live cost estimate as the user types (debounced 500ms)
- After every claude response completes, a background Haiku call refreshes `conversations.summary` (invisible to user; debug in Dev Mode shows `summary-refresh-ok`)

**Under the hood:**
- `SummaryRefresher` per-conversation debouncer; integrates with Phase 4B parser's `response-complete` event
- `AnthropicClient` accepts an optional Logger and emits `api-retry-attempt` + `api-retry-exhausted` events
- `api:retry-attempt` IPC broadcast available for Phase 5C's retry banner
- `useLiveCostEstimate` hook drives the TelemetryStrip's live preview
- `npm run fixtures:record` regenerates test fixtures against the live API

**Phase 5C will deliver:**
- 429 inline retry banner with attempt counter (consumes the new IPC event)
- Persistent CostPreview survival across compose cycles (small UX win)
- Real-claude pattern calibration (parser regex tightening based on real output samples)

**Tag:** `v0.11.0-phase-5b`
