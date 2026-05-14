# Phase 5A: Gearing Engine + Anthropic SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock gearing flow with a real Haiku-driven engine. Clicking "Gear" sends the user prompt + project context + configs to Anthropic's Messages API via the SDK, parses the structured JSON response (geared prompt + critique flags + token usage), and renders the result in the existing GearReviewPane. The TelemetryStrip's cost preview switches from `MOCK_COST_PREVIEW` to a real per-prompt estimate based on the actual Haiku usage. The most common §7.2 API failure modes (401, 429, 5xx, network down, malformed JSON) get classified by the client wrapper, retried where appropriate, and surfaced as toasts via the Phase 4C infrastructure. Phase 5B owns the deeper UIs (401 Settings modal, 429 inline retry banner) + background summary refresh + branch-from-turn recovery.

**Architecture:** A new `main/api/` module wraps `@anthropic-ai/sdk` with an `AnthropicClient` class that owns retry/backoff + error classification (returns a typed `ApiError` discriminated union, not raw SDK errors). A new `main/gearing/` module owns the prompt construction + JSON parsing: `system-prompt.md` is the versioned template, `builder.ts` interpolates the user's configs + project context into the system prompt, `parser.ts` validates the Haiku response shape via Zod, `engine.ts` is the orchestrator. The IPC handler (`main/ipc/gearing-handler.ts`) wraps engine calls in `withIpcResult` and returns either a complete `GearResult` envelope or an `IpcResult` error with codes like `API_AUTH_FAILED`, `API_RATE_LIMITED`, `NETWORK_DOWN`, `GEAR_PARSE_FAILED`. Tests use `MockAnthropicClient` that replays JSON fixtures from `test/fixtures/api/` — no real API calls in CI. The renderer's Composer Gear button replaces its mock setState with a real IPC call; in-flight state is local to the Composer. Failures push toasts via the Phase 4C `useToast` hook.

**Tech Stack:** `@anthropic-ai/sdk` 0.30.1 (already in package.json from Phase 0), `zod` 3.25 (already there) for response validation, no new dependencies. The SDK supports streaming but Phase 5A uses non-streaming `messages.create` (Phase 5B can revisit if gearing latency becomes a UX issue).

**Out of scope for Phase 5A (→ Phase 5B):**
- Background summary refresh after assistant turn (ADR-014). The hook exists from Phase 4B (`response-complete` parser event) — Phase 5B wires it.
- 401 → "Settings" modal (Phase 5A surfaces a generic auth-failed toast; Phase 5B builds the proper Settings page + modal once Phase 6's account management lands).
- 429 retry banner with attempt counter (Phase 5A retries transparently inside the client; user sees toast only on final failure).
- "Send original" auto-suggest fallback when gearing is exhausted (Phase 5B).
- Real-claude output pattern calibration (the `tokens: N/M` line from mock-claude — Phase 5B will calibrate against real claude tool-call markers).
- §7.1 row 4-6 recovery UIs (branch-from-turn, switch-to-API, re-auth PTY).

---

## File Structure

**New files (main process):**
- `src/main/api/types.ts` — `ApiError`, `MessageRequest`, `MessageResponse` types
- `src/main/api/pricing.ts` — per-model token pricing constants
- `src/main/api/cost.ts` — token-count → $ estimator
- `src/main/api/client.ts` — `AnthropicClient` wrapper with retry + classify
- `src/main/api/index.ts` — barrel
- `src/main/gearing/system-prompt.md` — Haiku system prompt template (`?raw` import)
- `src/main/gearing/sql.d.ts` already exists from Phase 3 for `?raw` SQL — add `?raw` md declaration here too
- `src/main/gearing/builder.ts` — assembles request from configs + context
- `src/main/gearing/parser.ts` — Zod-validates Haiku JSON response
- `src/main/gearing/engine.ts` — orchestrates builder → client → parser
- `src/main/gearing/index.ts` — barrel
- `src/main/ipc/gearing-handler.ts`
- `src/main/__tests__/api/client.unit.test.ts`
- `src/main/__tests__/api/cost.unit.test.ts`
- `src/main/__tests__/gearing/builder.unit.test.ts`
- `src/main/__tests__/gearing/parser.unit.test.ts`
- `src/main/__tests__/gearing/engine.integration.test.ts`
- `src/main/__tests__/ipc/gearing-handler.integration.test.ts`

**New files (shared):**
- `src/shared/types/gearing.ts` — `GearResult`, `CritiqueFlag`, `GearTokenBreakdown`, `GearConfigs`
- `src/shared/ipc/gearing.ts` — channel + payloads

**New files (renderer):**
- `src/renderer/src/hooks/use-gearing.ts`

**New files (tests):**
- `test/doubles/mock-anthropic-client.ts`
- `test/fixtures/api/gear-simple.json` — initial synthesized fixture
- `test/fixtures/api/gear-edge-empty-flags.json` — fixture with no critique flags

**Modified files:**
- `src/shared/ipc.ts` — re-export gearing channels
- `src/main/ipc/index.ts` — register GearingHandler with an injectable AnthropicClient instance
- `src/main/index.ts` — instantiate the production AnthropicClient with the env API key
- `src/preload/index.ts`, `src/preload/index.d.ts` — expose `gearing.gear(request)`
- `src/renderer/src/components/composer/Composer.tsx` — Gear button calls real IPC; in-flight state; replace mock setGearState path
- `src/renderer/src/components/gear-review/GearReviewPane.tsx` — accept real `GearResult` typed prop (replace MockCritiqueFlag with the shared CritiqueFlag)
- `src/renderer/src/components/gear-review/CritiqueFlags.tsx` — accept shared CritiqueFlag type
- `src/renderer/src/components/composer/TelemetryStrip.tsx` — accept real `CostPreview` prop (from gearing's token estimate × pricing) instead of importing MOCK_COST_PREVIEW
- `src/renderer/src/mocks/geared-prompt.ts` — DELETE after rewire
- `src/renderer/src/mocks/telemetry.ts` — DELETE `MOCK_COST_PREVIEW` (file becomes empty — delete the file)
- `src/renderer/src/hooks/use-toast.tsx` — auto-dismiss timer (Phase 4C nit)
- `src/renderer/src/components/terminal/TerminalSection.tsx` — remove dead `useCcEvents` no-op (Phase 4C nit)
- `docs/decisions.md` — ADR-030 (API client design) + ADR-031 (system prompt template versioning)
- `docs/observability.md` — extend `api` + `gearing` rows with Phase 5A events
- `docs/test-scenarios.md` — Phase 5A scenarios

---

## Task 1: Phase 4C nits — toast auto-dismiss + remove dead useCcEvents

**Files:**
- Modify: `src/renderer/src/hooks/use-toast.tsx`
- Modify: `src/renderer/src/components/terminal/TerminalSection.tsx`
- Modify: `src/renderer/src/hooks/__tests__/use-toast.unit.test.tsx`

- [ ] **Step 1: Toast auto-dismiss timer**

Edit `src/renderer/src/hooks/use-toast.tsx`. Currently `push(input)` adds a toast with no dismissal timer. Add:

- Default `durationMs` per severity: info=5000, warn=8000, error=null (manual-only)
- `push()` accepts an optional `durationMs` override
- When a toast is pushed with `durationMs !== null`, schedule a setTimeout to call `dismiss(id)` after that duration. Clear the timer if `dismiss` is called manually before it fires.

Pattern: keep a `Map<string, ReturnType<typeof setTimeout>>` of pending timers. On dismiss, clear the matching timer.

The `ToastInput` interface gains an optional `durationMs?: number | null` field.

Update the `push` implementation:

```ts
const push = useCallback((input: ToastInput): string => {
  const id = generateId()
  const duration = input.durationMs !== undefined
    ? input.durationMs
    : input.severity === 'info' ? 5000
    : input.severity === 'warn' ? 8000
    : null  // 'error' — manual-only
  setToasts((cur) => [...cur, { id, ...input }])
  if (duration !== null) {
    const timer = setTimeout(() => {
      timers.current.delete(id)
      setToasts((cur) => cur.filter((t) => t.id !== id))
    }, duration)
    timers.current.set(id, timer)
  }
  return id
}, [])
```

`timers` is `useRef(new Map<string, ReturnType<typeof setTimeout>>())`. Update `dismiss` to clear the timer:

```ts
const dismiss = useCallback((id: string): void => {
  const timer = timers.current.get(id)
  if (timer) {
    clearTimeout(timer)
    timers.current.delete(id)
  }
  setToasts((cur) => cur.filter((t) => t.id !== id))
}, [])
```

On unmount, the provider should clear all pending timers (useEffect cleanup).

- [ ] **Step 2: Add tests for auto-dismiss**

Append to `src/renderer/src/hooks/__tests__/use-toast.unit.test.tsx`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ... existing imports

describe('hooks/use-toast — auto-dismiss', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('info toasts auto-dismiss after 5s', () => {
    render(
      <ToastProvider>
        <ToastHost />
        <ConsumerButton label="info" severity="info" />
      </ToastProvider>
    )
    act(() => screen.getByRole('button', { name: /push/i }).click())
    expect(screen.getByText('info')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.queryByText('info')).not.toBeInTheDocument()
  })

  it('warn toasts auto-dismiss after 8s', () => {
    render(
      <ToastProvider>
        <ToastHost />
        <ConsumerButton label="warn" severity="warn" />
      </ToastProvider>
    )
    act(() => screen.getByRole('button', { name: /push/i }).click())
    act(() => { vi.advanceTimersByTime(7999) })
    expect(screen.getByText('warn')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.queryByText('warn')).not.toBeInTheDocument()
  })

  it('error toasts stay until manually dismissed', () => {
    render(
      <ToastProvider>
        <ToastHost />
        <ConsumerButton label="error" severity="error" />
      </ToastProvider>
    )
    act(() => screen.getByRole('button', { name: /push/i }).click())
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(screen.getByText('error')).toBeInTheDocument()
  })
})
```

The plan-provided `ConsumerButton` from the existing test file may need an update to support `severity` as a prop — verify and extend.

- [ ] **Step 3: Remove dead useCcEvents from TerminalSection**

Edit `src/renderer/src/components/terminal/TerminalSection.tsx`. The `useCcEvents(conversationId, () => { /* Phase 4D */ })` call adds an IPC listener that does nothing. Remove the call AND the `import { useCcEvents } from '../../hooks/use-cc-events'`. The hook file stays (used by `TerminalPane`).

- [ ] **Step 4: Verify**

```bash
npm run typecheck
npm run test:run
```

Expected: clean. Tests: 162 baseline + 3 new = 165.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/hooks/use-toast.tsx \
        src/renderer/src/hooks/__tests__/use-toast.unit.test.tsx \
        src/renderer/src/components/terminal/TerminalSection.tsx
git commit -m "fix(phase-4c-nits): toast auto-dismiss timers + drop dead useCcEvents subscription"
```

---

## Task 2: ADR-030 — API client design

**Files:**
- Modify: `docs/decisions.md`

- [ ] **Step 1: Append**

```markdown

## ADR-030 (2026-05-14) — Anthropic SDK wrapper: typed errors, transparent retry for 429/5xx, recorded fixtures for tests

**Context:** Phase 5A integrates the Anthropic Messages API for gearing. The raw SDK throws strongly-typed errors but is awkward to test (real API calls) and doesn't retry by default. Spec §7.2 prescribes specific recovery for 401, 429, 5xx, network, malformed JSON.

**Options considered:**
- A) Use the SDK directly inside the gearing engine. Simple but couples gearing to retry / fixture-replay logic.
- B) Thin wrapper that exposes `complete(request)` returning a discriminated union `OK | typed error`. Wrapper owns retry + classification. Tests inject a `MockAnthropicClient` that implements the same interface.
- C) Full HTTP client abstraction. Overkill — the SDK already handles HTTP.

**Choice:** B. `AnthropicClient` class with one method: `complete(request): Promise<Result<MessageResponse, ApiError>>`. Internally retries 429 and 5xx with exponential backoff + jitter (3 attempts total). Classifies errors:
- `API_AUTH_FAILED` (HTTP 401) — non-retried
- `API_RATE_LIMITED` (HTTP 429) — retried, exposed if exhausted
- `API_SERVER_ERROR` (HTTP 5xx) — retried, exposed if exhausted
- `API_NETWORK_DOWN` (fetch reject before any HTTP response) — non-retried
- `API_TIMEOUT` (request timeout — default 30s) — non-retried in Phase 5A; Phase 5B may add retry
- `API_UNKNOWN` (anything else) — non-retried

**Fixture pattern:** `test/fixtures/api/<scenario>.json` stores a complete `MessageResponse` shape. `MockAnthropicClient` is constructed with a mapping `Map<string, MessageResponse>` and routes by a request signature (model + first 200 chars of system + first 200 chars of user). Initial fixtures are hand-synthesized to match the Haiku output shape; `npm run fixtures:record` (added in Phase 5B) regenerates them against the real API.

**Reasoning:** A thin wrapper keeps the engine pure (deterministic given client output) and makes the failure surface explicit at the type level. Transparent retry for 429/5xx mirrors what users expect from a robust client — the UI only sees the final outcome, not the intermediate attempts. Recorded fixtures keep tests fast, deterministic, and free of API costs.

**Discovered:** Phase 5A API design.

```

- [ ] **Step 2: Commit**

```bash
git add docs/decisions.md
git commit -m "docs(phase-5a): ADR-030 — AnthropicClient wrapper with typed errors + transparent retry"
```

---

## Task 3: Shared types — GearResult, CritiqueFlag, ApiError taxonomy

**Files:**
- Create: `src/shared/types/gearing.ts`
- Create: `src/shared/ipc/gearing.ts`
- Modify: `src/shared/ipc.ts`

- [ ] **Step 1: Gearing types**

Create `src/shared/types/gearing.ts`:

```ts
// Gearing types crossing the IPC boundary. The renderer treats these as
// opaque — main builds them, renderer renders them.

export interface CritiqueFlag {
  readonly severity: 'info' | 'warn'
  readonly message: string
}

export interface GearTokenBreakdown {
  // Input + output token counts as reported by the Anthropic API for the
  // Haiku gearing call itself (the "meta" tokens we spend to get gearing).
  readonly haikuInputTokens: number
  readonly haikuOutputTokens: number
  // Pre-send estimate: how many input tokens we expect the user's geared
  // prompt to use when sent to the model (cheaper than haikuInput).
  readonly gearedInputEstimate: number
  // For comparison: how many tokens the original prompt would have used.
  readonly originalInputEstimate: number
}

export interface CostPreview {
  // Dollar estimate for the geared prompt's full round-trip (input + output).
  // Output tokens are an estimate based on configs (breadth/format).
  readonly expectedDollars: number
  readonly expectedInputTokens: number
  readonly expectedOutputTokens: number
  readonly modelLabel: string
  // Haiku meta cost — typically <$0.001 — surfaced separately so the user
  // can see "Gearing cost: $0.0003" vs "Expected total: $0.04".
  readonly haikuMetaDollars: number
}

export interface GearConfigs {
  readonly model: string         // 'haiku' | 'sonnet' | 'opus'
  readonly breadth: string       // 'terse' | 'normal' | 'thorough'
  readonly format: string        // 'prose' | 'bullets' | 'code' | 'json'
  readonly skill: string | null  // skill id, or null
}

export interface GearResult {
  readonly originalPrompt: string
  readonly gearedPrompt: string
  readonly critiqueFlags: readonly CritiqueFlag[]
  readonly tokenBreakdown: GearTokenBreakdown
  readonly costPreview: CostPreview
}

// Error codes returned in the IpcResult envelope's `error.code` field.
// These propagate from the AnthropicClient classification through the engine
// and the GearingHandler.
export type GearErrorCode =
  | 'API_AUTH_FAILED'
  | 'API_RATE_LIMITED'
  | 'API_SERVER_ERROR'
  | 'API_NETWORK_DOWN'
  | 'API_TIMEOUT'
  | 'GEAR_PARSE_FAILED'     // Haiku returned non-JSON or wrong shape
  | 'API_UNKNOWN'
```

Create `src/shared/ipc/gearing.ts`:

```ts
import type { IpcResult } from './envelope'
import type { GearConfigs, GearResult } from '../types/gearing'

export const IPC_GEARING_GEAR = 'gearing:gear'

export interface GearingGearRequest {
  readonly conversationId: number
  readonly originalPrompt: string
  readonly configs: GearConfigs
}

export type GearingGearResult = IpcResult<{ result: GearResult }>
```

- [ ] **Step 2: Re-export from `src/shared/ipc.ts`**

Add the new constant + types + result alias to the existing re-export block. Add `'gearing:gear'` to the `IpcChannelName` union.

- [ ] **Step 3: Typecheck + commit**

```bash
npm run typecheck
git add src/shared/types/gearing.ts src/shared/ipc/gearing.ts src/shared/ipc.ts
git commit -m "feat(phase-5a): shared gearing types — GearResult, CritiqueFlag, GearErrorCode union"
```

---

## Task 4: Pricing constants + cost calculator

**Files:**
- Create: `src/main/api/pricing.ts`
- Create: `src/main/api/cost.ts`
- Create: `src/main/__tests__/api/cost.unit.test.ts`

- [ ] **Step 1: Pricing constants**

Create `src/main/api/pricing.ts`:

```ts
// Per-model pricing — dollars per million tokens. Source: anthropic.com/pricing
// as of 2026-05-14. Cached here as a versioned table; Phase 5B may add a
// "refresh from registry" path if pricing changes.
//
// The keys match the model labels used in our config selectors ('haiku',
// 'sonnet', 'opus'). The actual API model identifiers are looked up by these
// keys (anthropic uses claude-3-5-haiku-latest, etc.).

export interface ModelPricing {
  readonly inputPerMillion: number
  readonly outputPerMillion: number
  // Canonical API identifier sent to anthropic.com.
  readonly apiModel: string
  // Human-readable label for UI.
  readonly displayName: string
}

export const PRICING: Record<string, ModelPricing> = {
  haiku: {
    apiModel: 'claude-3-5-haiku-latest',
    displayName: 'Haiku 3.5',
    inputPerMillion: 1.00,
    outputPerMillion: 5.00
  },
  sonnet: {
    apiModel: 'claude-sonnet-4-7-latest',
    displayName: 'Sonnet 4.7',
    inputPerMillion: 3.00,
    outputPerMillion: 15.00
  },
  opus: {
    apiModel: 'claude-opus-4-7-latest',
    displayName: 'Opus 4.7',
    inputPerMillion: 15.00,
    outputPerMillion: 75.00
  }
}

// The gearing engine itself ALWAYS uses Haiku (the cheap, fast model) —
// regardless of which model the user will send the geared prompt to.
export const GEARING_MODEL = 'haiku' as const

export function pricingFor(modelKey: string): ModelPricing | null {
  return PRICING[modelKey] ?? null
}
```

The pricing numbers should be cross-checked against anthropic.com/pricing — if they're stale, that's acceptable for Phase 5A (Phase 5B can refresh). If the implementer finds drastically different numbers (>2× off), prefer accuracy.

- [ ] **Step 2: Cost calculator + test**

Create `src/main/__tests__/api/cost.unit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { estimateCost, estimateInputTokens } from '../../api/cost'

describe('api/cost', () => {
  it('estimates dollar cost from token counts × pricing', () => {
    // Haiku: $1/M input, $5/M output. 1000 in + 500 out = 0.001 + 0.0025 = $0.0035
    const cost = estimateCost('haiku', 1000, 500)
    expect(cost).toBeCloseTo(0.0035, 6)
  })

  it('returns 0 for unknown model', () => {
    expect(estimateCost('moonshot', 1000, 1000)).toBe(0)
  })

  it('estimateInputTokens approximates chars/4', () => {
    expect(estimateInputTokens('a'.repeat(400))).toBe(100)
    expect(estimateInputTokens('')).toBe(0)
  })

  it('estimateInputTokens rounds up', () => {
    expect(estimateInputTokens('hello')).toBe(2) // 5/4 = 1.25 → 2
  })
})
```

Create `src/main/api/cost.ts`:

```ts
import { pricingFor } from './pricing'

// estimateCost: returns dollars given a model key and token counts.
// Returns 0 if the model is unknown (callers may render this as "—").
export function estimateCost(modelKey: string, inputTokens: number, outputTokens: number): number {
  const p = pricingFor(modelKey)
  if (!p) return 0
  return (inputTokens / 1_000_000) * p.inputPerMillion + (outputTokens / 1_000_000) * p.outputPerMillion
}

// Rough token estimator for pre-send previews — Anthropic's actual tokenization
// is a BPE variant. The "characters / 4" rule is a serviceable approximation
// for English prose. Round UP so we don't under-quote.
export function estimateInputTokens(text: string): number {
  if (text.length === 0) return 0
  return Math.ceil(text.length / 4)
}
```

- [ ] **Step 3: Test + commit**

```bash
npm run test:run -- src/main/__tests__/api/cost.unit.test.ts
git add src/main/api/pricing.ts src/main/api/cost.ts src/main/__tests__/api/cost.unit.test.ts
git commit -m "feat(phase-5a): pricing constants + cost estimator (chars/4 token approximation)"
```

---

## Task 5: API types + AnthropicClient wrapper

**Files:**
- Create: `src/main/api/types.ts`
- Create: `src/main/api/client.ts`
- Create: `src/main/api/index.ts`
- Create: `src/main/__tests__/api/client.unit.test.ts`

- [ ] **Step 1: API types**

Create `src/main/api/types.ts`:

```ts
import type { GearErrorCode } from '@shared/types/gearing'

export interface MessageRequest {
  readonly model: string       // API model identifier (e.g. 'claude-3-5-haiku-latest')
  readonly maxTokens: number
  readonly system: string
  readonly userPrompt: string
  // Future: tools, stop sequences, etc. Phase 5A keeps it minimal.
}

export interface MessageResponse {
  readonly text: string                    // Joined text from content blocks
  readonly inputTokens: number             // From response.usage.input_tokens
  readonly outputTokens: number            // From response.usage.output_tokens
  readonly stopReason: string | null       // 'end_turn' | 'max_tokens' | etc.
  readonly model: string                   // Echoed back; may differ from request if claude picked a fallback
}

export interface ApiError {
  readonly code: GearErrorCode
  readonly message: string
  readonly cause?: unknown
}

export type Result<T, E> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: E }

// Test seam — production wires Anthropic SDK; tests wire MockAnthropicClient.
export interface AnthropicClientLike {
  complete(request: MessageRequest): Promise<Result<MessageResponse, ApiError>>
}
```

- [ ] **Step 2: AnthropicClient with retry**

Create `src/main/api/client.ts`:

```ts
// AnthropicClient — wraps @anthropic-ai/sdk with transparent retry for
// 429/5xx + typed-error classification. Returns Result<MessageResponse, ApiError>
// so callers don't see raw SDK throws.
//
// Retry policy: exponential backoff with jitter. Base 500ms, factor 2, max 3
// attempts. Network/auth/unknown errors are not retried.

import Anthropic from '@anthropic-ai/sdk'

import type { AnthropicClientLike, ApiError, MessageRequest, MessageResponse, Result } from './types'

interface AnthropicClientOptions {
  readonly apiKey: string
  readonly maxRetries?: number   // default 3
  readonly baseBackoffMs?: number // default 500
  readonly timeoutMs?: number    // default 30_000
  // Test seam — production omits this; tests inject a fake delay function.
  readonly delay?: (ms: number) => Promise<void>
}

const DEFAULT_OPTS = {
  maxRetries: 3,
  baseBackoffMs: 500,
  timeoutMs: 30_000
}

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class AnthropicClient implements AnthropicClientLike {
  private readonly sdk: Anthropic
  private readonly maxRetries: number
  private readonly baseBackoffMs: number
  private readonly timeoutMs: number
  private readonly delay: (ms: number) => Promise<void>

  constructor(opts: AnthropicClientOptions) {
    this.sdk = new Anthropic({ apiKey: opts.apiKey, timeout: opts.timeoutMs ?? DEFAULT_OPTS.timeoutMs })
    this.maxRetries = opts.maxRetries ?? DEFAULT_OPTS.maxRetries
    this.baseBackoffMs = opts.baseBackoffMs ?? DEFAULT_OPTS.baseBackoffMs
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_OPTS.timeoutMs
    this.delay = opts.delay ?? defaultDelay
  }

  async complete(request: MessageRequest): Promise<Result<MessageResponse, ApiError>> {
    let lastError: ApiError | null = null
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.sdk.messages.create({
          model: request.model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: [{ role: 'user', content: request.userPrompt }]
        })
        const text = response.content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
        return {
          ok: true,
          data: {
            text,
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            stopReason: response.stop_reason ?? null,
            model: response.model
          }
        }
      } catch (err) {
        lastError = classifyError(err)
        // Retryable only if it's a server / rate-limit AND we have attempts left
        if (
          (lastError.code === 'API_RATE_LIMITED' || lastError.code === 'API_SERVER_ERROR') &&
          attempt < this.maxRetries
        ) {
          const backoff = this.baseBackoffMs * Math.pow(2, attempt - 1)
          const jitter = Math.random() * backoff * 0.3
          await this.delay(backoff + jitter)
          continue
        }
        return { ok: false, error: lastError }
      }
    }
    return { ok: false, error: lastError ?? { code: 'API_UNKNOWN', message: 'no attempts made' } }
  }
}

export function classifyError(err: unknown): ApiError {
  const e = err as { status?: number; message?: string; name?: string }
  const status = e?.status
  const message = e?.message ?? String(err)

  if (status === 401) return { code: 'API_AUTH_FAILED', message, cause: err }
  if (status === 429) return { code: 'API_RATE_LIMITED', message, cause: err }
  if (typeof status === 'number' && status >= 500 && status < 600) {
    return { code: 'API_SERVER_ERROR', message, cause: err }
  }
  // Anthropic SDK wraps fetch errors in APIConnectionError / APIConnectionTimeoutError
  if (e?.name === 'APIConnectionTimeoutError') return { code: 'API_TIMEOUT', message, cause: err }
  if (e?.name === 'APIConnectionError') return { code: 'API_NETWORK_DOWN', message, cause: err }
  // Fallback for anything unrecognized
  return { code: 'API_UNKNOWN', message, cause: err }
}
```

Create `src/main/api/index.ts`:

```ts
export { AnthropicClient, classifyError } from './client'
export type { AnthropicClientLike, ApiError, MessageRequest, MessageResponse, Result } from './types'
export { estimateCost, estimateInputTokens } from './cost'
export { pricingFor, GEARING_MODEL, PRICING, type ModelPricing } from './pricing'
```

- [ ] **Step 3: Client tests**

Create `src/main/__tests__/api/client.unit.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

import { classifyError } from '../../api/client'

// classifyError unit tests — the retry loop itself is tested via integration
// (engine.integration.test.ts uses a MockAnthropicClient that DOESN'T inherit
// AnthropicClient's retry behavior, so the retry loop is tested implicitly
// only here). For Phase 5A this is acceptable; Phase 5B may add a retry
// integration test against a stubbed SDK if flakes arise.

describe('api/client classifyError', () => {
  it('maps HTTP 401 to API_AUTH_FAILED', () => {
    const err = { status: 401, message: 'invalid x-api-key' }
    expect(classifyError(err).code).toBe('API_AUTH_FAILED')
  })

  it('maps HTTP 429 to API_RATE_LIMITED', () => {
    expect(classifyError({ status: 429, message: 'rate limit' }).code).toBe('API_RATE_LIMITED')
  })

  it('maps HTTP 500-599 to API_SERVER_ERROR', () => {
    expect(classifyError({ status: 500, message: 'oops' }).code).toBe('API_SERVER_ERROR')
    expect(classifyError({ status: 503, message: 'unavail' }).code).toBe('API_SERVER_ERROR')
    expect(classifyError({ status: 599, message: 'edge' }).code).toBe('API_SERVER_ERROR')
  })

  it('maps APIConnectionTimeoutError to API_TIMEOUT', () => {
    expect(classifyError({ name: 'APIConnectionTimeoutError', message: 't/o' }).code).toBe('API_TIMEOUT')
  })

  it('maps APIConnectionError to API_NETWORK_DOWN', () => {
    expect(classifyError({ name: 'APIConnectionError', message: 'enotfound' }).code).toBe('API_NETWORK_DOWN')
  })

  it('falls back to API_UNKNOWN for anything else', () => {
    expect(classifyError(new Error('weird')).code).toBe('API_UNKNOWN')
    expect(classifyError({ status: 418, message: "I'm a teapot" }).code).toBe('API_UNKNOWN')
  })
})
```

- [ ] **Step 4: Run + commit**

```bash
npm run test:run -- src/main/__tests__/api/
git add src/main/api/types.ts src/main/api/client.ts src/main/api/index.ts \
        src/main/__tests__/api/client.unit.test.ts
git commit -m "feat(phase-5a): AnthropicClient wrapper — typed errors + transparent retry + classifyError"
```

---

## Task 6: Mock Anthropic client + initial fixtures

**Files:**
- Create: `test/doubles/mock-anthropic-client.ts`
- Create: `test/fixtures/api/gear-simple.json`
- Create: `test/fixtures/api/gear-edge-empty-flags.json`

- [ ] **Step 1: MockAnthropicClient**

Create `test/doubles/mock-anthropic-client.ts`:

```ts
// MockAnthropicClient — implements AnthropicClientLike using a static
// fixture map. Tests construct it with the fixtures they need; calls that
// don't match a fixture throw an explicit "no fixture" error so test gaps
// are loud.

import type { AnthropicClientLike, ApiError, MessageRequest, MessageResponse, Result } from '../../src/main/api/types'

export interface MockFixture {
  readonly response?: MessageResponse
  readonly error?: ApiError
}

export class MockAnthropicClient implements AnthropicClientLike {
  private readonly fixtures: Map<string, MockFixture>
  readonly calls: MessageRequest[] = []

  constructor(fixtures: Record<string, MockFixture> = {}) {
    this.fixtures = new Map(Object.entries(fixtures))
  }

  async complete(request: MessageRequest): Promise<Result<MessageResponse, ApiError>> {
    this.calls.push(request)
    const key = this.keyFor(request)
    const fx = this.fixtures.get(key) ?? this.fixtures.get('*')
    if (!fx) {
      throw new Error(`MockAnthropicClient: no fixture for key="${key}". Available keys: ${[...this.fixtures.keys()].join(', ')}`)
    }
    if (fx.error) return { ok: false, error: fx.error }
    if (fx.response) return { ok: true, data: fx.response }
    throw new Error('MockAnthropicClient fixture must have response or error')
  }

  private keyFor(request: MessageRequest): string {
    // Lightweight signature: model + first 60 chars of system + first 60 chars of user.
    // Adjust if collisions become a problem.
    const sysPrefix = request.system.slice(0, 60).replace(/\s+/g, ' ')
    const usrPrefix = request.userPrompt.slice(0, 60).replace(/\s+/g, ' ')
    return `${request.model}|${sysPrefix}|${usrPrefix}`
  }
}
```

- [ ] **Step 2: Initial fixtures**

Create `test/fixtures/api/gear-simple.json`:

```json
{
  "description": "Hand-synthesized fixture for the canonical gear test. Use scripts/record-fixtures.ts (Phase 5B) to regenerate against the live API.",
  "response": {
    "text": "{\"geared_prompt\":\"Refactor src/auth/middleware.ts to flatten nested conditionals in the token validation flow. Handle the edge case where the refresh token has expired but the access token is still valid — currently this leaks into downstream API errors. Output: diff only, no preamble.\",\"critique_flags\":[{\"severity\":\"info\",\"message\":\"Original was 100+ words for a focused refactor — typical compression: 80-90%.\"},{\"severity\":\"warn\",\"message\":\"Original mentions 'other improvements while you're in there' — open-ended scope. Geared version drops this. If you want broader review, switch breadth to Thorough.\"}],\"rationale\":\"Trimmed conversational filler. Made the file path explicit. Specified diff-only output to suppress claude's prose preamble.\"}",
    "inputTokens": 412,
    "outputTokens": 187,
    "stopReason": "end_turn",
    "model": "claude-3-5-haiku-latest"
  }
}
```

Create `test/fixtures/api/gear-edge-empty-flags.json`:

```json
{
  "description": "Edge case: critique_flags array is empty (Haiku found nothing to flag).",
  "response": {
    "text": "{\"geared_prompt\":\"Add a unit test for the parseConfig() function covering: valid input, missing keys, invalid type. Use vitest.\",\"critique_flags\":[],\"rationale\":\"Already well-scoped; minimal compression.\"}",
    "inputTokens": 95,
    "outputTokens": 65,
    "stopReason": "end_turn",
    "model": "claude-3-5-haiku-latest"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add test/doubles/mock-anthropic-client.ts test/fixtures/api/
git commit -m "test(phase-5a): MockAnthropicClient + two initial hand-synthesized gear fixtures"
```

---

## Task 7: Gearing system prompt template

**Files:**
- Create: `src/main/gearing/system-prompt.md`
- Create: `src/main/gearing/md.d.ts`

- [ ] **Step 1: System prompt template**

Create `src/main/gearing/system-prompt.md`:

```markdown
You are TokenLess's gearing engine. Your single job: rewrite the user's prompt so the receiving model (claude-3-5-sonnet, claude-opus, or claude-3-5-haiku) produces fewer wasted tokens in its response while preserving the user's intent.

## Hard rules

1. Return ONLY a JSON object. No prose, no markdown, no commentary outside the JSON.
2. The JSON object MUST have exactly these top-level keys:
   - `geared_prompt` (string): the rewritten prompt the user will send.
   - `critique_flags` (array): zero or more `{ severity: "info"|"warn", message: string }` objects.
   - `rationale` (string): one or two sentences explaining what you changed and why.
3. NEVER fabricate file paths, function names, or technical details the user didn't mention. If the user is vague, the geared prompt may inherit that vagueness — that's correct.

## Rewriting heuristics

- **Output-side compression first.** Add response-shaping language: "diff only, no preamble", "≤200 words", "bullet list, no narration". This is the single largest token saver.
- **Trim conversational filler.** "Could you please..." → imperative. "I'd really appreciate it if..." → just the request.
- **Make implicit explicit.** "Refactor the auth middleware" stays as-is if the user gave context; otherwise note in critique_flags that the path is ambiguous.
- **Respect the configs.** The user's `breadth` config determines compression depth:
  - `terse`: aggressive compression; drop anything not strictly necessary.
  - `normal`: balanced; keep meaningful context.
  - `thorough`: preserve more context; favor clarity over compression.
- The `format` config tells you what response shape to ASK FOR (not what the user prompt should look like):
  - `prose`: ask for prose response.
  - `bullets`: ask for bullet list response.
  - `code`: ask for code-only response (diff or full file).
  - `json`: ask for JSON response.

## Critique flag rules

Add a critique flag when:
- **Open-ended scope** ("while you're in there", "anything else you notice") → severity "warn", suggest user switch breadth to `thorough` if they want broader work.
- **Ambiguous reference** (no file path, vague feature name) → severity "warn", note the ambiguity but proceed with the prompt as-is.
- **High compression rate** (>80% token reduction) → severity "info", explain what was trimmed so the user can spot-check.
- **Conflicting configs** (e.g., breadth=thorough but format=code with no scope mention) → severity "warn".

Do NOT add flags for:
- Spelling/grammar.
- Stylistic preferences.
- Things the user could reasonably want both ways.

## Output shape (strict)

```json
{
  "geared_prompt": "<rewritten prompt>",
  "critique_flags": [
    { "severity": "info" | "warn", "message": "<short, actionable>" }
  ],
  "rationale": "<1-2 sentences>"
}
```

Return the JSON inline with no surrounding text, no triple-backticks, no comments.
```

Create `src/main/gearing/md.d.ts`:

```ts
declare module '*.md?raw' {
  const content: string
  export default content
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/gearing/system-prompt.md src/main/gearing/md.d.ts
git commit -m "feat(phase-5a): gearing system prompt template + ?raw md ambient declaration"
```

---

## Task 8: Gearing builder

**Files:**
- Create: `src/main/gearing/builder.ts`
- Create: `src/main/__tests__/gearing/builder.unit.test.ts`

- [ ] **Step 1: Builder + test**

Create `src/main/__tests__/gearing/builder.unit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

import { buildGearRequest } from '../../gearing/builder'

describe('gearing/builder', () => {
  const baseConfigs = { model: 'sonnet', breadth: 'normal', format: 'prose', skill: null }

  it('uses the haiku model identifier for the gearing call (not the user-selected model)', () => {
    const req = buildGearRequest({
      originalPrompt: 'Refactor X',
      configs: { ...baseConfigs, model: 'opus' }
    })
    // The user's selected model (opus) goes INTO the prompt context, not as the
    // gearing-call model. The gearing call itself is always Haiku.
    expect(req.model).toBe('claude-3-5-haiku-latest')
  })

  it('embeds the user prompt as the user message', () => {
    const req = buildGearRequest({
      originalPrompt: 'Refactor src/x.ts',
      configs: baseConfigs
    })
    expect(req.userPrompt).toContain('Refactor src/x.ts')
  })

  it('includes the configs in the user message so the system prompt knows breadth/format', () => {
    const req = buildGearRequest({
      originalPrompt: 'foo',
      configs: { model: 'sonnet', breadth: 'terse', format: 'bullets', skill: null }
    })
    expect(req.userPrompt).toMatch(/breadth.*terse/i)
    expect(req.userPrompt).toMatch(/format.*bullets/i)
  })

  it('sets a reasonable maxTokens for the Haiku response', () => {
    const req = buildGearRequest({ originalPrompt: 'foo', configs: baseConfigs })
    // Haiku response is JSON containing geared prompt + flags — typically
    // 200-600 tokens. Cap at 2000 to leave headroom for verbose gearings.
    expect(req.maxTokens).toBeGreaterThanOrEqual(1000)
    expect(req.maxTokens).toBeLessThanOrEqual(4000)
  })

  it('includes the system prompt template in the request', () => {
    const req = buildGearRequest({ originalPrompt: 'foo', configs: baseConfigs })
    expect(req.system).toContain('TokenLess')
    expect(req.system).toContain('JSON')
  })
})
```

Create `src/main/gearing/builder.ts`:

```ts
// Builds the MessageRequest for the gearing call. The system prompt is fixed
// (system-prompt.md, ?raw-imported). The user message embeds the user's
// configs as a structured preamble + the original prompt.

import type { GearConfigs } from '@shared/types/gearing'

import type { MessageRequest } from '../api/types'
import { PRICING, GEARING_MODEL } from '../api/pricing'

// eslint-disable-next-line import/no-unresolved
import SYSTEM_PROMPT from './system-prompt.md?raw'

export interface BuildGearRequestInput {
  readonly originalPrompt: string
  readonly configs: GearConfigs
  // Future: projectNotes, conversationSummary, etc. (Phase 5B)
}

export function buildGearRequest(input: BuildGearRequestInput): MessageRequest {
  const targetModelLabel = PRICING[input.configs.model]?.displayName ?? input.configs.model
  const userPrompt =
    `# Gearing configs\n` +
    `- target model: ${targetModelLabel}\n` +
    `- breadth: ${input.configs.breadth}\n` +
    `- format: ${input.configs.format}\n` +
    `- skill: ${input.configs.skill ?? 'none'}\n\n` +
    `# Original prompt\n\n${input.originalPrompt}\n`
  return {
    model: PRICING[GEARING_MODEL].apiModel,
    maxTokens: 2000,
    system: SYSTEM_PROMPT,
    userPrompt
  }
}
```

- [ ] **Step 2: Run + commit**

```bash
npm run test:run -- src/main/__tests__/gearing/builder.unit.test.ts
git add src/main/gearing/builder.ts src/main/__tests__/gearing/builder.unit.test.ts
git commit -m "feat(phase-5a): gearing builder — assembles Haiku message request from configs + original prompt"
```

---

## Task 9: Gearing parser

**Files:**
- Create: `src/main/gearing/parser.ts`
- Create: `src/main/__tests__/gearing/parser.unit.test.ts`

- [ ] **Step 1: Parser + test**

Create `src/main/__tests__/gearing/parser.unit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

import { parseGearResponse } from '../../gearing/parser'

describe('gearing/parser', () => {
  it('parses a well-formed JSON response', () => {
    const text = JSON.stringify({
      geared_prompt: 'Refactor X.',
      critique_flags: [{ severity: 'info', message: 'compact' }],
      rationale: 'trimmed filler'
    })
    const result = parseGearResponse(text)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.gearedPrompt).toBe('Refactor X.')
      expect(result.data.critiqueFlags).toEqual([{ severity: 'info', message: 'compact' }])
    }
  })

  it('strips surrounding code fences if the LLM adds them', () => {
    const text =
      '```json\n' +
      JSON.stringify({ geared_prompt: 'p', critique_flags: [], rationale: 'r' }) +
      '\n```'
    const result = parseGearResponse(text)
    expect(result.ok).toBe(true)
  })

  it('accepts an empty critique_flags array', () => {
    const text = JSON.stringify({ geared_prompt: 'p', critique_flags: [], rationale: 'r' })
    const result = parseGearResponse(text)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.critiqueFlags).toEqual([])
  })

  it('returns GEAR_PARSE_FAILED on invalid JSON', () => {
    const result = parseGearResponse('not json at all')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('GEAR_PARSE_FAILED')
  })

  it('returns GEAR_PARSE_FAILED on missing required keys', () => {
    const text = JSON.stringify({ geared_prompt: 'p' /* missing critique_flags, rationale */ })
    const result = parseGearResponse(text)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('GEAR_PARSE_FAILED')
  })

  it('returns GEAR_PARSE_FAILED on invalid critique_flag severity', () => {
    const text = JSON.stringify({
      geared_prompt: 'p',
      critique_flags: [{ severity: 'fatal', message: 'oops' }], // invalid severity
      rationale: 'r'
    })
    const result = parseGearResponse(text)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('GEAR_PARSE_FAILED')
  })
})
```

Create `src/main/gearing/parser.ts`:

```ts
// Parser for the Haiku gearing response. Strips optional code-fence wrappers
// the LLM sometimes adds despite the system prompt forbidding them, then
// validates the structure via Zod. Returns Result<ParsedGearResponse, ApiError>.

import { z } from 'zod'

import type { CritiqueFlag } from '@shared/types/gearing'
import type { ApiError, Result } from '../api/types'

const SCHEMA = z.object({
  geared_prompt: z.string(),
  critique_flags: z.array(
    z.object({
      severity: z.union([z.literal('info'), z.literal('warn')]),
      message: z.string()
    })
  ),
  rationale: z.string()
})

export interface ParsedGearResponse {
  readonly gearedPrompt: string
  readonly critiqueFlags: readonly CritiqueFlag[]
  readonly rationale: string
}

function stripFences(text: string): string {
  const fenceRe = /^```(?:json)?\s*\n([\s\S]*?)\n\s*```$/m
  const m = text.trim().match(fenceRe)
  return m ? m[1].trim() : text.trim()
}

export function parseGearResponse(text: string): Result<ParsedGearResponse, ApiError> {
  const stripped = stripFences(text)
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'GEAR_PARSE_FAILED',
        message: `Haiku response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        cause: err
      }
    }
  }
  const result = SCHEMA.safeParse(parsed)
  if (!result.success) {
    return {
      ok: false,
      error: {
        code: 'GEAR_PARSE_FAILED',
        message: `Haiku response did not match expected shape: ${result.error.message}`,
        cause: result.error
      }
    }
  }
  return {
    ok: true,
    data: {
      gearedPrompt: result.data.geared_prompt,
      critiqueFlags: result.data.critique_flags,
      rationale: result.data.rationale
    }
  }
}
```

- [ ] **Step 2: Run + commit**

```bash
npm run test:run -- src/main/__tests__/gearing/parser.unit.test.ts
git add src/main/gearing/parser.ts src/main/__tests__/gearing/parser.unit.test.ts
git commit -m "feat(phase-5a): gearing parser — Zod-validates Haiku JSON response + handles code fences"
```

---

## Task 10: Gearing engine

**Files:**
- Create: `src/main/gearing/engine.ts`
- Create: `src/main/gearing/index.ts`
- Create: `src/main/__tests__/gearing/engine.integration.test.ts`

- [ ] **Step 1: Engine + test**

Create `src/main/__tests__/gearing/engine.integration.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

import { GearingEngine } from '../../gearing/engine'
import { MockAnthropicClient } from '../../../../test/doubles/mock-anthropic-client'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function loadFixture(name: string): { response?: unknown; error?: unknown } {
  const raw = readFileSync(join(process.cwd(), 'test/fixtures/api', name), 'utf8')
  return JSON.parse(raw)
}

describe('gearing/engine', () => {
  it('happy path: builds request, calls client, parses response, computes cost', async () => {
    const fx = loadFixture('gear-simple.json') as { response: { text: string; inputTokens: number; outputTokens: number; stopReason: string; model: string } }
    const client = new MockAnthropicClient({
      '*': { response: fx.response }
    })
    const engine = new GearingEngine(client)
    const result = await engine.gear({
      originalPrompt: 'Could you please take a look at the auth middleware...',
      configs: { model: 'sonnet', breadth: 'normal', format: 'prose', skill: null }
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.gearedPrompt).toContain('Refactor src/auth/middleware.ts')
    expect(result.data.critiqueFlags.length).toBeGreaterThan(0)
    expect(result.data.tokenBreakdown.haikuInputTokens).toBe(fx.response.inputTokens)
    expect(result.data.tokenBreakdown.haikuOutputTokens).toBe(fx.response.outputTokens)
    expect(result.data.costPreview.expectedDollars).toBeGreaterThan(0)
    expect(result.data.costPreview.haikuMetaDollars).toBeGreaterThan(0)
  })

  it('propagates API errors as IpcResult-shaped failures', async () => {
    const client = new MockAnthropicClient({
      '*': { error: { code: 'API_AUTH_FAILED', message: 'bad key' } }
    })
    const engine = new GearingEngine(client)
    const result = await engine.gear({
      originalPrompt: 'foo',
      configs: { model: 'haiku', breadth: 'normal', format: 'prose', skill: null }
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('API_AUTH_FAILED')
  })

  it('returns GEAR_PARSE_FAILED when Haiku returns junk', async () => {
    const client = new MockAnthropicClient({
      '*': {
        response: {
          text: 'sorry I cannot help with that',
          inputTokens: 100,
          outputTokens: 10,
          stopReason: 'end_turn',
          model: 'claude-3-5-haiku-latest'
        }
      }
    })
    const engine = new GearingEngine(client)
    const result = await engine.gear({
      originalPrompt: 'foo',
      configs: { model: 'haiku', breadth: 'normal', format: 'prose', skill: null }
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('GEAR_PARSE_FAILED')
  })
})
```

Create `src/main/gearing/engine.ts`:

```ts
// GearingEngine — orchestrates builder → client → parser, then computes the
// CostPreview from token counts × pricing. Returns Result<GearResult, ApiError>.

import type { AnthropicClientLike, ApiError, Result } from '../api/types'
import { estimateCost, estimateInputTokens } from '../api/cost'
import { GEARING_MODEL, pricingFor } from '../api/pricing'

import type { GearConfigs, GearResult } from '@shared/types/gearing'

import { buildGearRequest } from './builder'
import { parseGearResponse } from './parser'

export interface GearInput {
  readonly originalPrompt: string
  readonly configs: GearConfigs
}

export class GearingEngine {
  constructor(private readonly client: AnthropicClientLike) {}

  async gear(input: GearInput): Promise<Result<GearResult, ApiError>> {
    const request = buildGearRequest(input)
    const apiResult = await this.client.complete(request)
    if (!apiResult.ok) return apiResult

    const parsed = parseGearResponse(apiResult.data.text)
    if (!parsed.ok) return parsed

    // Compute token estimates + cost preview
    const originalInputEstimate = estimateInputTokens(input.originalPrompt)
    const gearedInputEstimate = estimateInputTokens(parsed.data.gearedPrompt)
    // Output estimate: rough heuristic tied to format + breadth. Phase 5B may
    // refine via learned distributions. For Phase 5A: 800 tokens default, halved
    // for terse, doubled for thorough.
    const breadthFactor = input.configs.breadth === 'terse' ? 0.5
      : input.configs.breadth === 'thorough' ? 2.0
      : 1.0
    const expectedOutputTokens = Math.round(800 * breadthFactor)

    const userModel = input.configs.model
    const expectedDollars = estimateCost(userModel, gearedInputEstimate, expectedOutputTokens)
    const haikuMetaDollars = estimateCost(GEARING_MODEL, apiResult.data.inputTokens, apiResult.data.outputTokens)
    const modelLabel = pricingFor(userModel)?.displayName ?? userModel

    const result: GearResult = {
      originalPrompt: input.originalPrompt,
      gearedPrompt: parsed.data.gearedPrompt,
      critiqueFlags: parsed.data.critiqueFlags,
      tokenBreakdown: {
        haikuInputTokens: apiResult.data.inputTokens,
        haikuOutputTokens: apiResult.data.outputTokens,
        gearedInputEstimate,
        originalInputEstimate
      },
      costPreview: {
        expectedDollars,
        expectedInputTokens: gearedInputEstimate,
        expectedOutputTokens,
        modelLabel,
        haikuMetaDollars
      }
    }
    return { ok: true, data: result }
  }
}
```

Create `src/main/gearing/index.ts`:

```ts
export { GearingEngine } from './engine'
export type { GearInput } from './engine'
export { buildGearRequest } from './builder'
export { parseGearResponse } from './parser'
```

- [ ] **Step 2: Run + commit**

```bash
npm run test:run -- src/main/__tests__/gearing/engine.integration.test.ts
git add src/main/gearing/engine.ts src/main/gearing/index.ts \
        src/main/__tests__/gearing/engine.integration.test.ts
git commit -m "feat(phase-5a): GearingEngine — builder → client → parser → CostPreview"
```

---

## Task 11: GearingHandler IPC class

**Files:**
- Create: `src/main/ipc/gearing-handler.ts`
- Create: `src/main/__tests__/ipc/gearing-handler.integration.test.ts`

- [ ] **Step 1: Handler test**

Create `src/main/__tests__/ipc/gearing-handler.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { GearingHandler } from '../../ipc/gearing-handler'
import { GearingEngine } from '../../gearing/engine'
import { MockAnthropicClient } from '../../../../test/doubles/mock-anthropic-client'
import { Logger } from '../../observability/logger'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function loadFixture(name: string): { response: { text: string; inputTokens: number; outputTokens: number; stopReason: string; model: string } } {
  return JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/api', name), 'utf8'))
}

function makeLogger(): Logger {
  return new Logger(
    { write: vi.fn(), append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100,
    'main'
  )
}

describe('ipc/gearing-handler', () => {
  let engine: GearingEngine
  let handler: GearingHandler

  beforeEach(() => {
    const fx = loadFixture('gear-simple.json')
    const client = new MockAnthropicClient({ '*': { response: fx.response } })
    engine = new GearingEngine(client)
    handler = new GearingHandler(engine, makeLogger())
  })

  it('gear returns the GearResult envelope', async () => {
    const result = await handler.gear({
      conversationId: 1,
      originalPrompt: 'Refactor the auth middleware',
      configs: { model: 'sonnet', breadth: 'normal', format: 'prose', skill: null }
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.result.gearedPrompt).toContain('Refactor')
      expect(result.data.result.costPreview.expectedDollars).toBeGreaterThan(0)
    }
  })

  it('propagates API errors through the IpcResult envelope', async () => {
    const errClient = new MockAnthropicClient({
      '*': { error: { code: 'API_AUTH_FAILED', message: 'bad key' } }
    })
    const errEngine = new GearingEngine(errClient)
    const errHandler = new GearingHandler(errEngine, makeLogger())
    const result = await errHandler.gear({
      conversationId: 1,
      originalPrompt: 'x',
      configs: { model: 'haiku', breadth: 'normal', format: 'prose', skill: null }
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('API_AUTH_FAILED')
  })
})
```

Create `src/main/ipc/gearing-handler.ts`:

```ts
import type { IpcMain, IpcMainInvokeEvent } from 'electron'

import { GearingEngine } from '../gearing'
import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'

import {
  IPC_GEARING_GEAR,
  type GearingGearRequest,
  type GearingGearResult
} from '@shared/ipc/gearing'

export class GearingHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly engine: GearingEngine,
    private readonly logger: Logger
  ) {}

  gear = async (req: GearingGearRequest): Promise<GearingGearResult> =>
    withIpcResult(this.logger, 'gearing', 'gearing-gear', async () => {
      const apiResult = await this.engine.gear({
        originalPrompt: req.originalPrompt,
        configs: req.configs
      })
      if (!apiResult.ok) {
        // Throw a tagged error so withIpcResult produces the right envelope
        // code. The classifier in withIpcResult propagates UPPER_SNAKE_CASE.
        const tagged = new Error(apiResult.error.message) as Error & { code?: string }
        tagged.code = apiResult.error.code
        throw tagged
      }
      this.logger.info('gearing', 'gearing-gear-ok', 'Gearing succeeded', {
        conversationId: req.conversationId,
        haikuInputTokens: apiResult.data.tokenBreakdown.haikuInputTokens,
        haikuOutputTokens: apiResult.data.tokenBreakdown.haikuOutputTokens,
        gearedInputEstimate: apiResult.data.tokenBreakdown.gearedInputEstimate,
        expectedDollars: apiResult.data.costPreview.expectedDollars
      })
      return { result: apiResult.data }
    })

  install(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_GEARING_GEAR, async (_e: IpcMainInvokeEvent, req: GearingGearRequest) =>
      this.gear(req)
    )
    this.installedHandlers.push(IPC_GEARING_GEAR)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
```

- [ ] **Step 2: Run + commit**

```bash
npm run test:run -- src/main/__tests__/ipc/gearing-handler.integration.test.ts
git add src/main/ipc/gearing-handler.ts src/main/__tests__/ipc/gearing-handler.integration.test.ts
git commit -m "feat(phase-5a): GearingHandler — IPC wrapping for the gearing engine"
```

---

## Task 12: Wire into main + preload

**Files:**
- Modify: `src/main/ipc/index.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

- [ ] **Step 1: main/ipc/index.ts — instantiate engine + handler**

Edit `src/main/ipc/index.ts`. After existing handler instantiations:

```ts
import { AnthropicClient, type AnthropicClientLike } from '@main/api'
import { GearingEngine } from '@main/gearing'
import { GearingHandler } from './gearing-handler'

// ...

export interface IpcRegistration {
  // ... existing fields
  gearingHandler: GearingHandler
  uninstallAll: () => void
}

export function registerIpcHandlers(
  ipcMain: IpcMain,
  logger: Logger,
  broadcast: Broadcast,
  db: Database,
  anthropicClient: AnthropicClientLike
): IpcRegistration {
  // ... existing handler instantiation

  const gearingEngine = new GearingEngine(anthropicClient)
  const gearingHandler = new GearingHandler(gearingEngine, logger)
  gearingHandler.install(ipcMain)

  return {
    // ... existing
    gearingHandler,
    uninstallAll: () => {
      // ... existing uninstall calls
      gearingHandler.uninstall(ipcMain)
    }
  }
}
```

The `anthropicClient` parameter is INJECTED so main/index.ts can construct it with the env var (production) and tests can pass mocks.

- [ ] **Step 2: src/main/index.ts — construct the production client**

Edit `src/main/index.ts`. Near the top, alongside Logger/DB setup, instantiate the client:

```ts
import { AnthropicClient } from './api'

// ... inside app.whenReady().then(...) after DB setup:
const apiKey = process.env['ANTHROPIC_API_KEY'] ?? ''
if (!apiKey) {
  logger.warn('api', 'api-key-missing', 'ANTHROPIC_API_KEY not set — gearing will fail with API_AUTH_FAILED')
}
const anthropicClient = new AnthropicClient({ apiKey })

const ipcRegistration = registerIpcHandlers(ipcMain, logger, broadcast, db, anthropicClient)
```

The client is constructed even with an empty key — the first gear call will fail with API_AUTH_FAILED, which produces a toast (user knows what's wrong). Phase 5B will surface "set your API key in Settings".

- [ ] **Step 3: preload — expose `gearing.gear`**

Edit `src/preload/index.ts`. Add a new top-level namespace:

```ts
import {
  IPC_GEARING_GEAR,
  type GearingGearRequest,
  type GearingGearResult
} from '@shared/ipc'

// inside the api object:
gearing: {
  gear(req: GearingGearRequest): Promise<GearingGearResult> {
    return ipcRenderer.invoke(IPC_GEARING_GEAR, req) as Promise<GearingGearResult>
  }
}
```

Update `src/preload/index.d.ts` to declare `readonly gearing: { gear(req): Promise<GearingGearResult> }` on TokenlessApi.

- [ ] **Step 4: Typecheck + build + commit**

```bash
npm run typecheck
npm run build
git add src/main/ipc/index.ts src/main/index.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(phase-5a): wire AnthropicClient + GearingEngine + GearingHandler into main + preload"
```

---

## Task 13: Renderer wiring — Composer Gear + GearReviewPane + TelemetryStrip

**Files:**
- Modify: `src/renderer/src/components/composer/Composer.tsx`
- Modify: `src/renderer/src/components/composer/TelemetryStrip.tsx`
- Modify: `src/renderer/src/components/gear-review/GearReviewPane.tsx`
- Modify: `src/renderer/src/components/gear-review/CritiqueFlags.tsx`
- Delete: `src/renderer/src/mocks/geared-prompt.ts`
- Delete: `src/renderer/src/mocks/telemetry.ts` (after removing MOCK_COST_PREVIEW)

- [ ] **Step 1: Composer.gear handler — real IPC**

Edit `src/renderer/src/components/composer/Composer.tsx`. The current `handleGear` sets gearState from mocks. Replace with:

```ts
import type { GearResult } from '@shared/types/gearing'
// ...
const [gearing, setGearing] = useState(false)
const [gearState, setGearState] = useState<GearResult | null>(null)

const handleGear = async (): Promise<void> => {
  if (conversationId === null) {
    rendererLogger.warn('ui', 'gear-no-conv', 'Gear clicked without active conversation')
    return
  }
  setGearing(true)
  try {
    const result = await window.tokenless.gearing.gear({
      conversationId,
      originalPrompt: prompt,
      configs: { model, breadth, format, skill: skill || null }
    })
    if (result.ok) {
      setGearState(result.data.result)
      rendererLogger.info('ui', 'gear-ok', 'Gearing returned', {
        conversationId,
        haikuInputTokens: result.data.result.tokenBreakdown.haikuInputTokens,
        haikuOutputTokens: result.data.result.tokenBreakdown.haikuOutputTokens,
        expectedDollars: result.data.result.costPreview.expectedDollars
      })
    } else {
      rendererLogger.error('ui', 'gear-failed', result.error.message, {
        conversationId,
        code: result.error.code,
        logId: result.error.logId
      })
      // Map error codes to user-facing toast messages
      const map: Record<string, string> = {
        API_AUTH_FAILED: 'Anthropic API key invalid or missing. Set ANTHROPIC_API_KEY and restart.',
        API_RATE_LIMITED: 'Anthropic API rate-limited. Try again in a moment.',
        API_SERVER_ERROR: 'Anthropic API returned an error. Try again.',
        API_NETWORK_DOWN: 'Network unreachable. Gearing offline.',
        API_TIMEOUT: 'Gearing timed out. Try again or send the original prompt.',
        GEAR_PARSE_FAILED: "Couldn't parse the gearing response. Send the original prompt.",
        API_UNKNOWN: 'Gearing failed unexpectedly. View Dev Mode for details.'
      }
      pushToast({
        message: map[result.error.code] ?? `Gearing failed: ${result.error.message}`,
        severity: 'error'
      })
    }
  } finally {
    setGearing(false)
  }
}
```

The Composer's `gearState` type changes from the old `{ original, geared, flags }` shape to `GearResult` from shared types.

Update the `<GearReviewPane>` render to pass real props:

```tsx
<GearReviewPane
  key={gearState.gearedPrompt}
  original={gearState.originalPrompt}
  geared={gearState.gearedPrompt}
  critiqueFlags={gearState.critiqueFlags}
  costPreview={gearState.costPreview}
  onSendOriginal={handleGearSendOriginal}
  onSendGeared={handleGearSendGeared}
  onReGear={handleGearReGear}
  onCancel={handleGearCancel}
/>
```

`handleGearReGear` now calls the same async `handleGear` flow (set gearing=true, call IPC, update gearState).

`handleGearSendOriginal` uses `gearState.originalPrompt` instead of the old field name.

Update the `disableGear` prop on ActionsRow to also account for `gearing` in-flight state: `disableGear={sending || gearing}`.

- [ ] **Step 2: Update GearReviewPane + CritiqueFlags to accept shared types**

Edit `src/renderer/src/components/gear-review/GearReviewPane.tsx`. Change the `critiqueFlags` prop type from `MockCritiqueFlag[]` to `readonly CritiqueFlag[]` (from `@shared/types/gearing`). Add a `costPreview: CostPreview` prop.

The pane's existing structure renders the original on the left, geared on the right, critique flags above. Phase 5A adds a small cost-preview footer below the geared pane that shows:
- Expected total: `$X.XX` (from costPreview.expectedDollars)
- Gearing meta cost: `$X.XXXX` (from costPreview.haikuMetaDollars)
- Token compression: `originalInputEstimate → gearedInputEstimate` (compute the savings inline if helpful)

If GearReviewPane already has a cost area, swap it; otherwise add a small div above the action row.

Edit `src/renderer/src/components/gear-review/CritiqueFlags.tsx` — change the prop type from `MockCritiqueFlag` to the shared `CritiqueFlag` type. The interface is identical (severity + message) so no rendering changes needed.

- [ ] **Step 3: TelemetryStrip wires real cost preview**

Currently `TelemetryStrip` imports `MOCK_COST_PREVIEW` from `mocks/telemetry.ts`. Phase 5A: TelemetryStrip becomes a prop-driven component. Edit `src/renderer/src/components/composer/TelemetryStrip.tsx`:

```tsx
import type { CostPreview } from '@shared/types/gearing'

interface TelemetryStripProps {
  costPreview: CostPreview | null
}

export function TelemetryStrip({ costPreview }: TelemetryStripProps): JSX.Element {
  if (!costPreview) {
    return (
      <div className="telemetry-strip telemetry-strip--idle">
        <span className="telemetry-strip__hint">Type a prompt + click Gear to see cost estimate</span>
      </div>
    )
  }
  return (
    <div className="telemetry-strip">
      <span className="telemetry-strip__model">{costPreview.modelLabel}</span>
      <span className="telemetry-strip__cost">${costPreview.expectedDollars.toFixed(4)}</span>
      <span className="telemetry-strip__tokens">
        {costPreview.expectedInputTokens.toLocaleString()} in + {costPreview.expectedOutputTokens.toLocaleString()} out
      </span>
      {costPreview.haikuMetaDollars > 0 && (
        <span className="telemetry-strip__meta">
          +${costPreview.haikuMetaDollars.toFixed(4)} gearing
        </span>
      )}
    </div>
  )
}
```

Composer passes `<TelemetryStrip costPreview={gearState?.costPreview ?? null} />`. Before the user clicks Gear, costPreview is null and the strip shows the idle hint. After Gear succeeds, the strip shows real numbers.

- [ ] **Step 4: Delete the mock files**

```bash
git rm src/renderer/src/mocks/geared-prompt.ts
```

For `mocks/telemetry.ts`: remove the `MOCK_COST_PREVIEW` export. If the file ends up empty, delete the whole file:

```bash
git rm src/renderer/src/mocks/telemetry.ts
```

Verify no leftover imports:

```bash
grep -r "MOCK_COST_PREVIEW\|MOCK_GEARED_PROMPT\|MOCK_CRITIQUE_FLAGS\|MOCK_ORIGINAL_PROMPT\|MockCritiqueFlag" C:/personal/tokenless/src/ C:/personal/tokenless/test/
```

Should return nothing.

- [ ] **Step 5: Verify + commit**

```bash
npm run typecheck
npm run test:run
```

Expected: all green. Some Phase 2B/4 renderer tests may import the mocks — fix them inline if needed (likely the geared-prompt mock isn't actively used in tests).

```bash
git add src/renderer/src/components
git commit -m "feat(phase-5a): rewire Composer Gear + GearReviewPane + TelemetryStrip to real gearing IPC"
```

---

## Task 14: E2E — gear-then-send happy path

**Files:**
- Create: `test/e2e/gearing.e2e.test.ts`

**Note:** the e2e test uses a real fetch to the Anthropic API → won't work in CI without an API key. Alternative: extend the mock-claude with a `TOKENLESS_MOCK_GEARING` mode and stub the gearing IPC by hand at the Electron-main side via a hook.

For simplicity in Phase 5A, the cleanest approach: **the e2e test mocks `window.tokenless.gearing.gear` directly via `page.evaluate(...)`** before clicking Gear. This bypasses the IPC + API client entirely. It tests only the renderer-side flow (Gear → render GearReviewPane → cost preview visible).

- [ ] **Step 1: Write the test**

Create `test/e2e/gearing.e2e.test.ts`:

```ts
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test.describe('Phase 5A gearing flow', () => {
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

  test('clicking Gear with a mocked response renders the geared-review pane with cost preview', async () => {
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

    // Project setup
    await expect(win.getByRole('region', { name: /welcome to tokenless/i })).toBeVisible()
    await win.getByRole('button', { name: /create your first project/i }).click()
    await win.getByPlaceholder('My Project').fill('Gear Test')
    await win.getByPlaceholder('C:/path/to/project').fill(process.cwd())
    await win.getByRole('button', { name: /^create$/i }).click()
    await expect(win.locator('.terminal-pane')).toBeVisible({ timeout: 10000 })

    // Replace window.tokenless.gearing.gear with a stub that returns a
    // deterministic GearResult. This bypasses the real Anthropic SDK call.
    await win.evaluate(() => {
      interface RendererApi {
        gearing: {
          gear: (req: unknown) => Promise<unknown>
        }
      }
      const win = window as unknown as { tokenless: RendererApi }
      const fakeResult = {
        ok: true,
        data: {
          result: {
            originalPrompt: 'Refactor my code please',
            gearedPrompt: 'Refactor src/x.ts. Output: diff only.',
            critiqueFlags: [
              { severity: 'info', message: 'Compression: 80%' }
            ],
            tokenBreakdown: {
              haikuInputTokens: 100,
              haikuOutputTokens: 50,
              gearedInputEstimate: 20,
              originalInputEstimate: 120
            },
            costPreview: {
              expectedDollars: 0.0123,
              expectedInputTokens: 20,
              expectedOutputTokens: 800,
              modelLabel: 'Sonnet 4.7',
              haikuMetaDollars: 0.0003
            }
          }
        }
      }
      win.tokenless.gearing = {
        async gear() {
          return fakeResult
        }
      }
    })

    // Start a conversation so Gear is enabled
    await win.getByRole('button', { name: /new conversation/i }).click()

    // Type a prompt
    await win.locator('.prompt-textarea').fill('Refactor my code please')

    // Click Gear
    await win.getByRole('button', { name: /^gear$/i }).click()

    // GearReviewPane should be visible with the geared prompt + critique flag
    await expect(win.locator('.gear-review-pane')).toBeVisible({ timeout: 5000 })
    await expect(win.getByText('Refactor src/x.ts')).toBeVisible()
    await expect(win.getByText(/Compression: 80%/)).toBeVisible()
    // The cost preview should show the dollar amount
    await expect(win.getByText(/0\.0123/)).toBeVisible()
  })
})
```

- [ ] **Step 2: Run E2E + commit**

```bash
npm run rebuild:electron
npm run build
npm run test:e2e
npm run rebuild:node
```

Expected: 17 prior + 1 new = 18/18.

```bash
git add test/e2e/gearing.e2e.test.ts
git commit -m "test(phase-5a): E2E — gear flow renders GearReviewPane + cost preview (gearing IPC stubbed)"
```

---

## Task 15: ADR-031 + docs + scenarios + verification + tag

**Files:**
- Modify: `docs/decisions.md`
- Modify: `docs/observability.md`
- Modify: `docs/test-scenarios.md`

- [ ] **Step 1: ADR-031**

Append to `docs/decisions.md`:

```markdown

## ADR-031 (2026-05-14) — Gearing system prompt versioning + JSON-only response contract

**Context:** Phase 5A's gearing engine sends a Haiku call with a system prompt that defines the gearing rules + the strict JSON response shape. Two related decisions: where the prompt lives, and how we enforce the response shape.

**Choice:**
1. **System prompt is a markdown file** at `src/main/gearing/system-prompt.md`, loaded via Vite's `?raw` import. The build inlines its content into the main bundle.
2. **Response shape is enforced server-side by Zod** in `gearing/parser.ts`. The system prompt tells Haiku to return JSON-only (no fences, no prose); if it disobeys, the parser strips fences as a kindness and Zod-validates the structure. Failures map to `GEAR_PARSE_FAILED`.
3. **Versioning is implicit via git history.** When the prompt changes, the commit message documents the change. Test fixtures in `test/fixtures/api/` are regenerated against the new prompt (Phase 5B adds the regeneration script). If a fixture's gearing call signature changes such that the existing fixture no longer matches, the test fails loudly — the fixture file itself becomes the version marker.

**Reasoning:** Markdown is human-readable + diff-friendly + easy to maintain. The `?raw` Vite pattern (used since Phase 3 for SQL migrations) is already proven in the build. Zod validation keeps the parser tolerant of formatting variance (the fence-stripping kindness) while strict about structure. Implicit git versioning avoids over-engineering a registry for a single prompt; Phase 7+ may add a real prompt-versioning table if we run experiments.

**Discovered:** Phase 5A gearing engine design.

```

- [ ] **Step 2: Observability events**

Edit `docs/observability.md`:
- Add `gearing` row events for Phase 5A: `gearing-gear` (warn-level on failures via withIpcResult), `gearing-gear-ok` (info-level on success).
- Add `api` row events: pricing events emitted by the client wrapper (`api-retry-attempt`, future).
- The `ui` row gains `gear-ok`, `gear-failed`, `gear-no-conv`.

If the rows don't have a "Phase NA events" pattern, add the events inline in the existing description text.

- [ ] **Step 3: Test scenarios**

Append to `docs/test-scenarios.md`:

```markdown

## Phase 5A — Gearing engine

### S-5A.1 Happy gearing path
1. Set `ANTHROPIC_API_KEY` env var. Launch the app. Create project + New Conversation.
2. Type a verbose prompt (e.g., "Could you please take a look at the auth middleware...").
3. Click Gear.
4. **Expect:** Within ~2s the GearReviewPane appears with a noticeably shorter geared prompt. Critique flags (info/warn) visible if applicable. Cost preview shows expected $ for the user-selected model + Haiku meta cost.

### S-5A.2 Send the geared prompt
1. From the gear review pane, click "Send geared".
2. **Expect:** The prompt sent to claude is the GEARED text. Verify in Dev Mode logs: `send-success` entry's `promptLength` matches the geared length, not the original.

### S-5A.3 Bad API key
1. Set `ANTHROPIC_API_KEY=invalid_key`. Launch. Try to gear.
2. **Expect:** Error toast: "Anthropic API key invalid or missing." Dev Mode shows `gearing-gear` warn with code `API_AUTH_FAILED`.

### S-5A.4 Network down
1. Unplug network. Try to gear.
2. **Expect:** Error toast: "Network unreachable. Gearing offline." Dev Mode shows code `API_NETWORK_DOWN`.

### S-5A.5 Rate-limited (synthetic)
Hard to trigger manually. The retry path is unit-tested. When/if rate-limit hits in production:
- 1st attempt: retry transparently
- 2nd attempt: retry transparently
- 3rd attempt: failure → toast "Anthropic API rate-limited. Try again in a moment."

### S-5A.6 Malformed JSON from Haiku
Hard to trigger manually (Haiku usually obeys). The parser handles this via Zod. If it does occur:
- Toast: "Couldn't parse the gearing response. Send the original prompt."
- Dev Mode: code `GEAR_PARSE_FAILED`.
```

- [ ] **Step 4: Commit docs**

```bash
git add docs/decisions.md docs/observability.md docs/test-scenarios.md
git commit -m "docs(phase-5a): ADR-031 system prompt versioning + scenarios + observability events"
```

- [ ] **Step 5: Final verification (all four gates)**

```bash
npm run rebuild:node
npm run typecheck
npm run test:run
npm run rebuild:electron
npm run build
npm run test:e2e
npm run rebuild:node
```

All four green.

- [ ] **Step 6: Tag**

```bash
git tag -s -a v0.10.0-phase-5a -m "Phase 5A complete — real gearing engine via Anthropic SDK + Haiku, cost preview, §7.2 error surfacing"
git rev-parse v0.10.0-phase-5a^{commit}
```

Spec §9 Phase 5 exit criteria — "Gear works end-to-end. Token savings visible. §7.2 failure modes implemented." — are met. (Full v1.0 stays reserved for Phase 8 release; Phase 5A ships as a 0.10.x because Phase 5B + 6 + 7 + 8 still remain before the v1 promise.)

---

## Self-Review Checklist

- [ ] **Spec §9 Phase 5 exit criteria:** Gear works end-to-end ✓. Token savings visible (gearing logs + cost preview UI) ✓. §7.2 failure modes implemented (classify + retry + toast for 401/429/5xx/network/malformed) ✓.
- [ ] **Mock removal:** `MOCK_GEARED_PROMPT`, `MOCK_CRITIQUE_FLAGS`, `MOCK_ORIGINAL_PROMPT`, `MOCK_COST_PREVIEW`, `MockCritiqueFlag` all gone.
- [ ] **No new silent catches.**
- [ ] **No console.* in src/main or src/renderer/src outside tests.**
- [ ] **All commit messages follow conventional commits.**
- [ ] **Typecheck clean** in both tsconfigs.
- [ ] **Phase 5B backlog documented in the plan** (summary refresh, 401 modal, 429 banner, branch-from-turn, real-claude calibration).

---

## Exit State

**Visible to user:**
- Clicking Gear sends the prompt to Haiku and shows a real geared prompt (shorter, more directive), real critique flags, and a real cost preview.
- The TelemetryStrip below the composer shows expected dollars + token breakdown for the geared prompt.
- Bad API key, rate limit, server error, network down, and malformed-JSON failures all produce specific user-facing toasts.
- Toasts auto-dismiss for info (5s) and warn (8s); errors stay until clicked (Phase 4C nit).

**Under the hood:**
- `AnthropicClient` wraps the SDK with retry + classify (ADR-030).
- `GearingEngine` orchestrates builder → client → parser (ADR-031).
- Initial fixtures hand-synthesized to match the system prompt's contract; user regenerates via Phase 5B's `npm run fixtures:record`.
- The system prompt lives at `src/main/gearing/system-prompt.md` and is `?raw`-bundled.
- All gearing code is logged through the `gearing` category; `api` category gets retry/error events.

**Phase 5B will deliver:**
- Background summary refresh (`response-complete` from Phase 4B parser → background Haiku call updates `conversations.summary`).
- 401 → Settings modal with "Open Settings" button (depends on Phase 6 Settings page scaffold).
- 429 → inline retry banner with attempt counter.
- "Send original" auto-suggest fallback when gearing is exhausted.
- `npm run fixtures:record` script (regenerates fixtures against real API).
- Real-claude output pattern calibration (tighten the parser's prompt/tool-call regexes).
- The §7.1 row 4-6 recovery UIs (branch-from-turn, switch-to-API, re-auth PTY).

**Tag:** `v0.10.0-phase-5a`
