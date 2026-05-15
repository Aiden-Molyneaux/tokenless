# Phase 6D: Telemetry Summary View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface aggregate cost + savings telemetry from the now-populated `turns` table (Phase 7B). A small "Saved $X.XX · Spent $Y.YY this week" pill renders in the TopBar; clicking it opens a popover with per-period breakdowns (today / week / month / all-time) and a per-model split. The numbers are pure SQL aggregations over `turns` joined with the existing pricing module — no new state.

**Architecture:** `TurnsDao` gains read-only aggregate queries: `getTokenSummary(db, sinceMs?)` returns the raw token sums by category (haiku-meta, original-input, geared-input, response-output) optionally scoped to rows where `sent_at >= sinceMs`. Cost is computed in main-process code (`telemetry-summary.ts`) that pulls token sums + invokes the existing `estimateCost(modelKey, input, output)` per model and aggregates. A `TelemetrySummaryHandler` exposes `telemetry:get-summary` IPC returning a fully-computed `TelemetrySummary` object. The renderer's `useTelemetrySummary(sinceMs)` hook refetches on mount + on `turns:changed` broadcasts (so feedback clicks DON'T cause a refetch — but new sends do, because the assistant turn write fans out the same broadcast). A new `TelemetryPill` component renders compact in the TopBar; clicking it toggles a `TelemetrySummaryPopover` with the four-tier period breakdown.

**Savings calculation:** for each user turn that has both `original_tokens` AND `geared_tokens` set (i.e., was sent from GearReviewPane), the saving is `(original_tokens - geared_tokens) * (input-price-per-token of model_used)`. We use the conversation's recorded `model_used` from the user turn row (NOT the haiku model — gearing's haiku cost is the "investment" that buys the savings; it's already counted under haikuMetaTokens). For each gearing call we ALSO record the cost: `haikuMetaTokens * (haiku input price)`. Net savings = sum(savings) − sum(haikuMetaCost). UI shows "Saved $X" where X is the NET number (negative is possible if the user gears short prompts where Haiku's overhead exceeds savings — show that case as "Cost $X" with red color).

**Out of scope for Phase 6D (→ post-v1):**
- Per-project / per-account breakdown — out of scope; aggregate-only this phase
- Charts / visualizations (v1.3 Savings dashboard per spec post-v1 backlog)
- Cost projections / forecasting
- Export to CSV
- Edit/delete turns (Phase 8 polish)

---

## File Structure

**New files (main):**
- `src/main/telemetry/summary.ts` — `computeTelemetrySummary(db, since, pricing)` pure function over TurnsDao queries + pricing
- `src/main/__tests__/telemetry/summary.unit.test.ts` — fixture-driven tests
- `src/main/ipc/telemetry-summary-handler.ts`
- `src/main/__tests__/ipc/telemetry-summary-handler.integration.test.ts`

**New files (shared):**
- `src/shared/ipc/telemetry-summary.ts` — channels + payloads (parallel to existing `telemetry.ts` which owns the live tick)
- `src/shared/types/telemetry-summary.ts` — `TelemetrySummary`, `TelemetryPeriod`

**New files (renderer):**
- `src/renderer/src/hooks/use-telemetry-summary.ts`
- `src/renderer/src/components/layout/TelemetryPill.tsx`
- `src/renderer/src/components/layout/TelemetrySummaryPopover.tsx`

**Modified files:**
- `src/main/db/dao/turns.ts` — add `getTokenSummary(db, sinceMs)` (read-only aggregate)
- `src/main/__tests__/db/dao-turns.integration.test.ts` — add token-summary tests
- `src/shared/ipc.ts` — re-export new channels + types
- `src/main/ipc/index.ts` — register the new handler
- `src/preload/index.ts` + `index.d.ts` — expose `telemetry.getSummary(since)`
- `src/renderer/src/components/layout/TopBar.tsx` — mount TelemetryPill
- `src/renderer/src/components/layout/styles.css` — `.telemetry-pill*` + `.telemetry-summary-popover*`
- `docs/decisions.md` — ADR-038 (savings math + period boundary choice)
- `docs/observability.md` — extend `db` row with summary events
- `docs/test-scenarios.md` — Phase 6D scenarios

---

## Task 1: TurnsDao.getTokenSummary aggregate query

**Files:**
- Modify: `src/main/db/dao/turns.ts` — add `getTokenSummary`
- Modify: `src/main/__tests__/db/dao-turns.integration.test.ts` — add tests

- [ ] **Step 1: Failing test**

Append to `src/main/__tests__/db/dao-turns.integration.test.ts`:
```ts
import { getTokenSummary } from '../../db/dao/turns'

it('getTokenSummary aggregates token columns across all rows when since is undefined', () => {
  // 2 user turns with gearMeta (full token data) + 2 assistant turns
  createUserTurn(db, {
    conversationId, originalPrompt: 'q1', modelUsed: 'sonnet',
    gearMeta: {
      originalPrompt: 'q1', gearedPrompt: 'g1',
      originalTokens: 10, gearedTokens: 30, haikuMetaTokens: 200,
      critiqueFlags: []
    }
  })
  createAssistantTurn(db, { conversationId, responseText: 'r1', responseTokens: 50, modelUsed: 'sonnet' })
  createUserTurn(db, {
    conversationId, originalPrompt: 'q2', modelUsed: 'opus',
    gearMeta: {
      originalPrompt: 'q2', gearedPrompt: 'g2',
      originalTokens: 5, gearedTokens: 20, haikuMetaTokens: 180,
      critiqueFlags: []
    }
  })
  createAssistantTurn(db, { conversationId, responseText: 'r2', responseTokens: 80, modelUsed: 'opus' })

  const s = getTokenSummary(db)
  expect(s.haikuMetaTokens).toBe(380)
  expect(s.originalInputTokens).toBe(15)  // 10 + 5
  expect(s.gearedInputTokens).toBe(50)    // 30 + 20
  expect(s.responseOutputTokens).toBe(130) // 50 + 80
  expect(s.byModel.sonnet.gearedInputTokens).toBe(30)
  expect(s.byModel.sonnet.responseOutputTokens).toBe(50)
  expect(s.byModel.opus.gearedInputTokens).toBe(20)
  expect(s.byModel.opus.responseOutputTokens).toBe(80)
})

it('getTokenSummary respects the sinceMs filter (sent_at >= since)', async () => {
  const old = createUserTurn(db, {
    conversationId, originalPrompt: 'old', modelUsed: 'sonnet',
    gearMeta: { originalPrompt: 'o', gearedPrompt: 'g',
      originalTokens: 100, gearedTokens: 80, haikuMetaTokens: 500, critiqueFlags: [] }
  })
  // Force the OLD turn's sent_at to be 1 hour ago.
  db.prepare('UPDATE turns SET sent_at = ? WHERE id = ?').run(Date.now() - 3600_000, old.id)
  const fresh = createUserTurn(db, {
    conversationId, originalPrompt: 'fresh', modelUsed: 'sonnet',
    gearMeta: { originalPrompt: 'o', gearedPrompt: 'g',
      originalTokens: 10, gearedTokens: 5, haikuMetaTokens: 100, critiqueFlags: [] }
  })
  expect(fresh.id).toBeGreaterThan(0)

  const sinceTenMinutesAgo = Date.now() - 600_000
  const s = getTokenSummary(db, sinceTenMinutesAgo)
  expect(s.haikuMetaTokens).toBe(100)  // old (500) excluded
  expect(s.originalInputTokens).toBe(10)
  expect(s.gearedInputTokens).toBe(5)
})

it('getTokenSummary returns zeros for an empty table', () => {
  // Use a fresh db (no setup turns)
  const fresh = createTestDb()
  const acc = createAccount(fresh, { label: 'X', configDir: '/x' })
  const pr = createProject(fresh, { name: 'X', rootPath: '/x', defaultAccountId: acc.id })
  createConversation(fresh, { projectId: pr.id, accountId: acc.id })
  const s = getTokenSummary(fresh)
  expect(s.haikuMetaTokens).toBe(0)
  expect(s.responseOutputTokens).toBe(0)
  expect(Object.keys(s.byModel)).toEqual([])
})
```

- [ ] **Step 2: Add the function**

Edit `src/main/db/dao/turns.ts`. Add at the bottom:
```ts
export interface ModelTokenBreakdown {
  readonly haikuMetaTokens: number  // included only if any user turn used this model AND had haiku meta
  readonly originalInputTokens: number
  readonly gearedInputTokens: number
  readonly responseOutputTokens: number
}

export interface TokenSummary {
  readonly haikuMetaTokens: number
  readonly originalInputTokens: number
  readonly gearedInputTokens: number
  readonly responseOutputTokens: number
  readonly byModel: Readonly<Record<string, ModelTokenBreakdown>>
}

interface AggregateRow {
  model_used: string | null
  haiku_total: number | null
  original_total: number | null
  geared_total: number | null
  response_total: number | null
}

export function getTokenSummary(db: Database, sinceMs?: number): TokenSummary {
  const where = sinceMs !== undefined ? 'WHERE sent_at >= ?' : ''
  const params = sinceMs !== undefined ? [sinceMs] : []
  const rows = db
    .prepare<unknown[], AggregateRow>(`
      SELECT
        model_used,
        COALESCE(SUM(haiku_meta_tokens), 0) AS haiku_total,
        COALESCE(SUM(original_tokens), 0) AS original_total,
        COALESCE(SUM(geared_tokens), 0) AS geared_total,
        COALESCE(SUM(response_tokens), 0) AS response_total
      FROM turns
      ${where}
      GROUP BY model_used
    `)
    .all(...params)

  const byModel: Record<string, ModelTokenBreakdown> = {}
  let haikuMetaTokens = 0
  let originalInputTokens = 0
  let gearedInputTokens = 0
  let responseOutputTokens = 0
  for (const r of rows) {
    if (r.model_used === null) continue  // turns with no recorded model (e.g., older rows) — counted in the overall sums via a separate query below if needed; for v1 just skip the per-model bucket
    const entry: ModelTokenBreakdown = {
      haikuMetaTokens: r.haiku_total ?? 0,
      originalInputTokens: r.original_total ?? 0,
      gearedInputTokens: r.geared_total ?? 0,
      responseOutputTokens: r.response_total ?? 0
    }
    byModel[r.model_used] = entry
    haikuMetaTokens += entry.haikuMetaTokens
    originalInputTokens += entry.originalInputTokens
    gearedInputTokens += entry.gearedInputTokens
    responseOutputTokens += entry.responseOutputTokens
  }
  // Include rows with NULL model_used in the OVERALL sums (not in byModel).
  const nullRow = rows.find((r) => r.model_used === null)
  if (nullRow) {
    haikuMetaTokens += nullRow.haiku_total ?? 0
    originalInputTokens += nullRow.original_total ?? 0
    gearedInputTokens += nullRow.geared_total ?? 0
    responseOutputTokens += nullRow.response_total ?? 0
  }
  return { haikuMetaTokens, originalInputTokens, gearedInputTokens, responseOutputTokens, byModel }
}
```

- [ ] **Step 3: Verify + commit**

```
npm run test:run -- src/main/__tests__/db/dao-turns.integration.test.ts
npm run typecheck
git add src/main/db/dao/turns.ts src/main/__tests__/db/dao-turns.integration.test.ts
git commit -m "feat(phase-6d): TurnsDao.getTokenSummary — aggregate token sums by model with optional sinceMs filter"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/shared/types/telemetry-summary.ts`
- Create: `src/shared/ipc/telemetry-summary.ts`
- Modify: `src/shared/ipc.ts`

- [ ] **Step 1: Type**

Create `src/shared/types/telemetry-summary.ts`:
```ts
export interface PerModelSummary {
  readonly model: string
  readonly haikuMetaTokens: number
  readonly originalInputTokens: number
  readonly gearedInputTokens: number
  readonly responseOutputTokens: number
  readonly inputCostDollars: number      // (geared input) * input-price
  readonly outputCostDollars: number     // response output * output-price
  readonly savingsDollars: number        // (original − geared) * input-price
}

export interface TelemetrySummary {
  readonly sinceMs: number | null
  readonly haikuMetaTokens: number
  readonly originalInputTokens: number
  readonly gearedInputTokens: number
  readonly responseOutputTokens: number
  // Total gearing investment: haikuMetaTokens × haiku-input price.
  readonly haikuCostDollars: number
  // Sum of per-model input + output cost (the "spend" — what we paid to non-haiku models).
  readonly spendDollars: number
  // Sum of per-model savings.
  readonly grossSavingsDollars: number
  // grossSavingsDollars − haikuCostDollars. Negative means gearing cost more than it saved.
  readonly netSavingsDollars: number
  readonly byModel: readonly PerModelSummary[]
}
```

- [ ] **Step 2: IPC types**

Create `src/shared/ipc/telemetry-summary.ts`:
```ts
import type { TelemetrySummary } from '../types/telemetry-summary'
import type { IpcResult } from './envelope'

export const IPC_TELEMETRY_GET_SUMMARY = 'telemetry:get-summary'

export interface TelemetryGetSummaryRequest {
  // Epoch ms — only rows with sent_at >= sinceMs are included. null = all-time.
  readonly sinceMs: number | null
}
export interface TelemetryGetSummaryResponse {
  readonly summary: TelemetrySummary
}

export type TelemetryGetSummaryResult = IpcResult<TelemetryGetSummaryResponse>
```

- [ ] **Step 3: Re-export from `src/shared/ipc.ts`** + add channel name to union.

- [ ] **Step 4: Commit**

```
npm run typecheck
git add src/shared/types/telemetry-summary.ts src/shared/ipc/telemetry-summary.ts src/shared/ipc.ts
git commit -m "feat(phase-6d): shared types + IPC channel for telemetry:get-summary"
```

---

## Task 3: computeTelemetrySummary pure function

**Files:**
- Create: `src/main/telemetry/summary.ts`
- Create: `src/main/__tests__/telemetry/summary.unit.test.ts`

This function takes the raw TokenSummary + pricing function and builds the per-model + aggregate cost picture.

- [ ] **Step 1: Failing test**

Create `src/main/__tests__/telemetry/summary.unit.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

import { computeTelemetrySummary } from '../../telemetry/summary'
import type { TokenSummary } from '../../db/dao/turns'

describe('telemetry/summary.computeTelemetrySummary', () => {
  // Synthetic pricing — keep math obvious: $1/M input, $5/M output.
  const pricing = (model: string): { inputPerMillion: number; outputPerMillion: number } | null => {
    if (model === 'sonnet') return { inputPerMillion: 1, outputPerMillion: 5 }
    if (model === 'haiku') return { inputPerMillion: 0.5, outputPerMillion: 2.5 }
    return null
  }
  // Haiku key — what cost.ts knows the gearing call's haiku model as.
  const haikuKey = 'haiku'

  const tokens: TokenSummary = {
    haikuMetaTokens: 1_000_000,    // $0.50 of haiku input
    originalInputTokens: 200_000,
    gearedInputTokens: 100_000,
    responseOutputTokens: 50_000,
    byModel: {
      sonnet: {
        haikuMetaTokens: 1_000_000,
        originalInputTokens: 200_000,
        gearedInputTokens: 100_000,
        responseOutputTokens: 50_000
      }
    }
  }

  it('computes haiku cost from haikuMetaTokens × haiku input price', () => {
    const s = computeTelemetrySummary(tokens, null, pricing, haikuKey)
    expect(s.haikuCostDollars).toBeCloseTo(0.5, 5)
  })

  it('computes per-model spend = geared-input × input-price + response × output-price', () => {
    const s = computeTelemetrySummary(tokens, null, pricing, haikuKey)
    const sonnet = s.byModel.find((m) => m.model === 'sonnet')
    // 100k input × $1/M = $0.10 + 50k output × $5/M = $0.25 → $0.35
    expect(sonnet?.inputCostDollars).toBeCloseTo(0.1, 5)
    expect(sonnet?.outputCostDollars).toBeCloseTo(0.25, 5)
    expect(s.spendDollars).toBeCloseTo(0.35, 5)
  })

  it('computes per-model savings = (original − geared) × input-price', () => {
    const s = computeTelemetrySummary(tokens, null, pricing, haikuKey)
    const sonnet = s.byModel.find((m) => m.model === 'sonnet')
    // (200k − 100k) × $1/M = $0.10
    expect(sonnet?.savingsDollars).toBeCloseTo(0.1, 5)
    expect(s.grossSavingsDollars).toBeCloseTo(0.1, 5)
  })

  it('computes netSavings = grossSavings − haikuCost (can be negative)', () => {
    const s = computeTelemetrySummary(tokens, null, pricing, haikuKey)
    // Gross $0.10 saved − $0.50 haiku cost = -$0.40 (gearing cost more than it saved)
    expect(s.netSavingsDollars).toBeCloseTo(-0.4, 5)
  })

  it('passes sinceMs through unchanged', () => {
    const s = computeTelemetrySummary(tokens, 1234567890, pricing, haikuKey)
    expect(s.sinceMs).toBe(1234567890)
  })

  it('skips models with no pricing entry without throwing', () => {
    const withUnknown: TokenSummary = {
      ...tokens,
      byModel: {
        ...tokens.byModel,
        mystery: {
          haikuMetaTokens: 0,
          originalInputTokens: 0,
          gearedInputTokens: 10000,
          responseOutputTokens: 5000
        }
      }
    }
    const s = computeTelemetrySummary(withUnknown, null, pricing, haikuKey)
    const mystery = s.byModel.find((m) => m.model === 'mystery')
    expect(mystery?.inputCostDollars).toBe(0)
    expect(mystery?.outputCostDollars).toBe(0)
    expect(mystery?.savingsDollars).toBe(0)
  })
})
```

- [ ] **Step 2: Implement**

Create `src/main/telemetry/summary.ts`:
```ts
import type { TokenSummary } from '../db/dao/turns'
import type { TelemetrySummary, PerModelSummary } from '@shared/types/telemetry-summary'

interface ModelPriceLite {
  readonly inputPerMillion: number
  readonly outputPerMillion: number
}

export type PricingFn = (modelKey: string) => ModelPriceLite | null

// Builds the per-model cost picture + aggregate from raw token sums.
// Pure — caller supplies pricing function (injectable for tests).
export function computeTelemetrySummary(
  tokens: TokenSummary,
  sinceMs: number | null,
  pricing: PricingFn,
  haikuKey: string
): TelemetrySummary {
  const haikuPrice = pricing(haikuKey)
  const haikuCostDollars = haikuPrice
    ? (tokens.haikuMetaTokens / 1_000_000) * haikuPrice.inputPerMillion
    : 0

  const byModel: PerModelSummary[] = []
  let spendDollars = 0
  let grossSavingsDollars = 0
  for (const [model, breakdown] of Object.entries(tokens.byModel)) {
    if (model === haikuKey) continue  // Haiku rows are gearing-meta, accounted in haikuCostDollars.
    const price = pricing(model)
    const inputCostDollars = price
      ? (breakdown.gearedInputTokens / 1_000_000) * price.inputPerMillion
      : 0
    const outputCostDollars = price
      ? (breakdown.responseOutputTokens / 1_000_000) * price.outputPerMillion
      : 0
    const savingsDollars = price
      ? ((breakdown.originalInputTokens - breakdown.gearedInputTokens) / 1_000_000) * price.inputPerMillion
      : 0
    byModel.push({
      model,
      haikuMetaTokens: breakdown.haikuMetaTokens,
      originalInputTokens: breakdown.originalInputTokens,
      gearedInputTokens: breakdown.gearedInputTokens,
      responseOutputTokens: breakdown.responseOutputTokens,
      inputCostDollars,
      outputCostDollars,
      savingsDollars
    })
    spendDollars += inputCostDollars + outputCostDollars
    grossSavingsDollars += savingsDollars
  }

  return {
    sinceMs,
    haikuMetaTokens: tokens.haikuMetaTokens,
    originalInputTokens: tokens.originalInputTokens,
    gearedInputTokens: tokens.gearedInputTokens,
    responseOutputTokens: tokens.responseOutputTokens,
    haikuCostDollars,
    spendDollars,
    grossSavingsDollars,
    netSavingsDollars: grossSavingsDollars - haikuCostDollars,
    byModel
  }
}
```

Note: `TokenSummary` is exported from `src/main/db/dao/turns.ts` (Task 1 added the interface). If not exported, add the export.

- [ ] **Step 3: Verify + commit**

```
npm run test:run -- src/main/__tests__/telemetry/summary.unit.test.ts
npm run typecheck
git add src/main/telemetry/summary.ts src/main/__tests__/telemetry/summary.unit.test.ts
git commit -m "feat(phase-6d): computeTelemetrySummary — per-model cost + savings from TokenSummary + injected pricing"
```

---

## Task 4: TelemetrySummaryHandler IPC

**Files:**
- Create: `src/main/ipc/telemetry-summary-handler.ts`
- Create: `src/main/__tests__/ipc/telemetry-summary-handler.integration.test.ts`
- Modify: `src/main/ipc/index.ts` — register + uninstall

- [ ] **Step 1: Test**

Create `src/main/__tests__/ipc/telemetry-summary-handler.integration.test.ts`. Test that:
- `getSummary({sinceMs: null})` returns ok with an empty-table TelemetrySummary (all zero dollars).
- After seeding a few turns via TurnsDao, `getSummary` returns non-zero numbers consistent with the test fixtures.

Use the established withIpcResult / Logger pattern. Inject a fake pricing function for cost predictability.

- [ ] **Step 2: Implement handler**

Create `src/main/ipc/telemetry-summary-handler.ts`. Mirror DraftsHandler structure:
```ts
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Database } from 'better-sqlite3'

import { TurnsDao } from '../db'
import { computeTelemetrySummary, type PricingFn } from '../telemetry/summary'
import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'

import {
  IPC_TELEMETRY_GET_SUMMARY,
  type TelemetryGetSummaryRequest,
  type TelemetryGetSummaryResult
} from '@shared/ipc/telemetry-summary'

export class TelemetrySummaryHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
    private readonly pricing: PricingFn,
    private readonly haikuKey: string
  ) {}

  getSummary = async (req: TelemetryGetSummaryRequest): Promise<TelemetryGetSummaryResult> =>
    withIpcResult(this.logger, 'db', 'telemetry-summary', async () => {
      const tokens = TurnsDao.getTokenSummary(this.db, req.sinceMs ?? undefined)
      const summary = computeTelemetrySummary(tokens, req.sinceMs ?? null, this.pricing, this.haikuKey)
      return { summary }
    })

  install(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_TELEMETRY_GET_SUMMARY, async (_e: IpcMainInvokeEvent, req: TelemetryGetSummaryRequest) =>
      this.getSummary(req)
    )
    this.installedHandlers.push(IPC_TELEMETRY_GET_SUMMARY)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
```

- [ ] **Step 3: Register in `src/main/ipc/index.ts`**

Import:
```ts
import { TelemetrySummaryHandler } from './telemetry-summary-handler'
import { pricingFor } from '@main/api/pricing'
```

Inside `registerIpcHandlers` (after `turnsHandler`):
```ts
const telemetrySummaryHandler = new TelemetrySummaryHandler(
  db, logger,
  (model) => pricingFor(model),
  'haiku'  // matches the key in PRICING; the haiku rate is the "investment" we deduct
)
telemetrySummaryHandler.install(ipcMain)
```

Add to `IpcRegistration` interface + returned object + `uninstallAll`.

- [ ] **Step 4: Verify + commit**

```
npm run test:run
npm run typecheck
git add src/main/ipc/telemetry-summary-handler.ts \
        src/main/__tests__/ipc/telemetry-summary-handler.integration.test.ts \
        src/main/ipc/index.ts
git commit -m "feat(phase-6d): TelemetrySummaryHandler — telemetry:get-summary IPC over TurnsDao + pricing"
```

---

## Task 5: Preload + useTelemetrySummary hook

**Files:**
- Modify: `src/preload/index.ts` + `index.d.ts`
- Create: `src/renderer/src/hooks/use-telemetry-summary.ts`

- [ ] **Step 1: Preload**

Add imports + expose `telemetry.getSummary(req: TelemetryGetSummaryRequest): Promise<TelemetryGetSummaryResult>` inside the existing `telemetry` namespace (NOTE: telemetry already exists with `onTick` — extend it). Mirror in `.d.ts`.

- [ ] **Step 2: Hook**

Create `src/renderer/src/hooks/use-telemetry-summary.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from 'react'

import type { TelemetrySummary } from '@shared/types/telemetry-summary'

interface UseTelemetrySummaryReturn {
  readonly summary: TelemetrySummary | null
  readonly loading: boolean
  readonly error: string | null
  readonly refetch: () => Promise<void>
}

export function useTelemetrySummary(sinceMs: number | null): UseTelemetrySummaryReturn {
  const [summary, setSummary] = useState<TelemetrySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetchSummary = useCallback(async (): Promise<void> => {
    try {
      const result = await window.tokenless.telemetry.getSummary({ sinceMs })
      if (!mountedRef.current) return
      if (result.ok) {
        setSummary(result.data.summary)
        setError(null)
      } else {
        setError(result.error.message)
      }
    } catch (e) {
      if (!mountedRef.current) return
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [sinceMs])

  useEffect(() => {
    mountedRef.current = true
    void fetchSummary()
    // turns:changed broadcasts whenever a new turn is written or feedback updates.
    // We want to refresh telemetry when token data changes — both happen on the
    // same broadcast. Acceptable to refetch on feedback updates too (cheap query).
    const unsub = window.tokenless.turns.onChanged(() => { void fetchSummary() })
    return () => { mountedRef.current = false; unsub() }
  }, [fetchSummary])

  return { summary, loading, error, refetch: fetchSummary }
}
```

- [ ] **Step 3: Commit**

```
npm run typecheck
git add src/preload/index.ts src/preload/index.d.ts src/renderer/src/hooks/use-telemetry-summary.ts
git commit -m "feat(phase-6d): preload exposes telemetry.getSummary + useTelemetrySummary hook"
```

---

## Task 6: TelemetryPill + TelemetrySummaryPopover components

**Files:**
- Create: `src/renderer/src/components/layout/TelemetryPill.tsx`
- Create: `src/renderer/src/components/layout/TelemetrySummaryPopover.tsx`
- Modify: `src/renderer/src/components/layout/styles.css`

The Pill shows a single line: `Saved $X.XX this week` (green) OR `Cost $X.XX this week` (red, when netSavings is negative). Clicking it toggles the popover.

The Popover shows period tabs (Today / Week / Month / All) and the breakdown below: gross savings, haiku cost, net savings, spend, plus per-model rows.

- [ ] **Step 1: Pill (no test — small, easy to verify by scenario)**

Create `src/renderer/src/components/layout/TelemetryPill.tsx`:
```tsx
import { useState } from 'react'

import { useTelemetrySummary } from '../../hooks/use-telemetry-summary'
import { TelemetrySummaryPopover } from './TelemetrySummaryPopover'

function startOfWeekMs(): number {
  const d = new Date()
  const day = d.getDay()  // 0=Sun
  const diff = (day + 6) % 7  // back to Monday
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - diff)
  return d.getTime()
}

function formatDollars(n: number): string {
  const abs = Math.abs(n)
  if (abs < 0.01) return '$0.00'
  return `$${abs.toFixed(2)}`
}

export function TelemetryPill(): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const since = startOfWeekMs()
  const { summary } = useTelemetrySummary(since)

  if (!summary) return null
  if (summary.haikuMetaTokens === 0 && summary.responseOutputTokens === 0) return null  // nothing to show

  const isSavings = summary.netSavingsDollars >= 0
  const label = isSavings ? 'Saved' : 'Cost'
  const cls = `telemetry-pill ${isSavings ? 'is-savings' : 'is-cost'}`

  return (
    <div className="telemetry-pill-host">
      <button
        type="button"
        className={cls}
        onClick={() => setOpen((v) => !v)}
        aria-label="Show telemetry summary"
        aria-expanded={open}
      >
        {label} {formatDollars(summary.netSavingsDollars)} <span className="telemetry-pill__suffix">this week</span>
      </button>
      {open && (
        <TelemetrySummaryPopover
          weekSince={since}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Popover**

Create `src/renderer/src/components/layout/TelemetrySummaryPopover.tsx`:
```tsx
import { useState } from 'react'

import { useTelemetrySummary } from '../../hooks/use-telemetry-summary'

interface TelemetrySummaryPopoverProps {
  weekSince: number
  onClose: () => void
}

function startOfDayMs(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function startOfMonthMs(): number {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

type Period = 'today' | 'week' | 'month' | 'all'

const PERIOD_LABEL: Record<Period, string> = {
  today: 'Today', week: 'This Week', month: 'This Month', all: 'All Time'
}

function formatDollars(n: number): string {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  return `${sign}$${abs.toFixed(2)}`
}

export function TelemetrySummaryPopover({ weekSince, onClose }: TelemetrySummaryPopoverProps): JSX.Element {
  const [period, setPeriod] = useState<Period>('week')

  let sinceMs: number | null = weekSince
  if (period === 'today') sinceMs = startOfDayMs()
  else if (period === 'month') sinceMs = startOfMonthMs()
  else if (period === 'all') sinceMs = null

  const { summary } = useTelemetrySummary(sinceMs)

  return (
    <div className="telemetry-summary-popover" role="dialog" aria-label="Telemetry summary">
      <div className="telemetry-summary-popover__tabs" role="tablist">
        {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={period === p}
            className={`telemetry-summary-popover__tab ${period === p ? 'is-active' : ''}`}
            onClick={() => setPeriod(p)}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
        <button
          type="button"
          aria-label="Close telemetry summary"
          className="telemetry-summary-popover__close"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="telemetry-summary-popover__body">
        {!summary ? (
          <p className="telemetry-summary-popover__empty">Loading…</p>
        ) : (
          <>
            <dl className="telemetry-summary-popover__totals">
              <div><dt>Gross savings</dt><dd>{formatDollars(summary.grossSavingsDollars)}</dd></div>
              <div><dt>Haiku cost</dt><dd>{formatDollars(summary.haikuCostDollars)}</dd></div>
              <div><dt>Net savings</dt><dd>{formatDollars(summary.netSavingsDollars)}</dd></div>
              <div><dt>Spend</dt><dd>{formatDollars(summary.spendDollars)}</dd></div>
            </dl>
            {summary.byModel.length > 0 && (
              <table className="telemetry-summary-popover__models">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Spend</th>
                    <th>Savings</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byModel.map((m) => (
                    <tr key={m.model}>
                      <td>{m.model}</td>
                      <td>{formatDollars(m.inputCostDollars + m.outputCostDollars)}</td>
                      <td>{formatDollars(m.savingsDollars)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: CSS**

Append to `src/renderer/src/components/layout/styles.css`:
```css
/* ===== TelemetryPill ===== */

.telemetry-pill-host { position: relative; display: inline-flex; }
.telemetry-pill {
  background: transparent;
  border: 1px solid var(--tl-rule);
  border-radius: var(--tl-radius-sm);
  padding: 2px 10px;
  font-size: var(--tl-text-sm);
  font-family: var(--tl-font-sans);
  cursor: pointer;
  color: var(--tl-fg);
}
.telemetry-pill:hover { background: var(--tl-hover); }
.telemetry-pill.is-savings { color: var(--tl-success); border-color: var(--tl-success); }
.telemetry-pill.is-cost { color: var(--tl-error); border-color: var(--tl-error); }
.telemetry-pill__suffix { color: var(--tl-mute); font-weight: var(--tl-weight-regular); }

.telemetry-summary-popover {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 320px;
  max-width: 440px;
  background: var(--tl-bg);
  border: 1px solid var(--tl-rule);
  border-radius: var(--tl-radius-md);
  box-shadow: var(--tl-shadow-md);
  z-index: var(--tl-z-dropdown);
  padding: var(--tl-space-2);
}
.telemetry-summary-popover__tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--tl-rule);
  padding-bottom: var(--tl-space-2);
  align-items: center;
}
.telemetry-summary-popover__tab {
  background: transparent; border: none; padding: 4px 8px;
  font-size: var(--tl-text-xs); cursor: pointer; color: var(--tl-mute);
  border-radius: var(--tl-radius-sm);
}
.telemetry-summary-popover__tab.is-active { background: var(--tl-active); color: var(--tl-fg); }
.telemetry-summary-popover__close { margin-left: auto; background: transparent; border: none; cursor: pointer; color: var(--tl-mute); font-size: 16px; }
.telemetry-summary-popover__body { padding-top: var(--tl-space-2); }
.telemetry-summary-popover__totals { display: grid; grid-template-columns: 1fr 1fr; gap: var(--tl-space-2); margin: 0; }
.telemetry-summary-popover__totals div { display: flex; flex-direction: column; gap: 2px; }
.telemetry-summary-popover__totals dt { font-size: var(--tl-text-xs); color: var(--tl-mute); }
.telemetry-summary-popover__totals dd { margin: 0; font-family: var(--tl-font-mono); font-size: var(--tl-text-sm); }
.telemetry-summary-popover__models { width: 100%; margin-top: var(--tl-space-3); border-collapse: collapse; font-size: var(--tl-text-xs); }
.telemetry-summary-popover__models th, .telemetry-summary-popover__models td {
  padding: 4px 8px; text-align: left; border-top: 1px solid var(--tl-rule-subtle);
}
.telemetry-summary-popover__models th { color: var(--tl-mute); font-weight: var(--tl-weight-medium); }
.telemetry-summary-popover__empty { margin: 0; color: var(--tl-mute); font-size: var(--tl-text-sm); }
```

- [ ] **Step 4: Verify + commit**

```
npm run typecheck
git add src/renderer/src/components/layout/TelemetryPill.tsx \
        src/renderer/src/components/layout/TelemetrySummaryPopover.tsx \
        src/renderer/src/components/layout/styles.css
git commit -m "feat(phase-6d): TelemetryPill + TelemetrySummaryPopover — period tabs with per-model spend/savings"
```

---

## Task 7: Wire TelemetryPill into TopBar

**Files:**
- Modify: `src/renderer/src/components/layout/TopBar.tsx`

- [ ] **Step 1: Mount in TopBar**

Add `import { TelemetryPill } from './TelemetryPill'`. Mount in the existing `<nav className="top-bar__nav">`, between `AccountSwitcher` and `SettingsButton`:

```tsx
<AccountSwitcher ... />
<TelemetryPill />
<SettingsButton ... />
```

- [ ] **Step 2: Commit**

```
npm run typecheck
git add src/renderer/src/components/layout/TopBar.tsx
git commit -m "feat(phase-6d): mount TelemetryPill in TopBar between AccountSwitcher and SettingsButton"
```

---

## Task 8: ADR-038

**Files:**
- Modify: `docs/decisions.md`

- [ ] **Step 1: Append**

```markdown

## ADR-038 (2026-05-15) — Telemetry summary: aggregate cost + net-savings derived in main process, fed from TurnsDao; period boundaries align to local-time day/week/month starts

**Context:** Phase 6D adds a per-user summary view of "what gearing has cost vs. saved." Phase 7B made the underlying `turns` table fully populated (user + assistant + token columns + `model_used`), so the aggregation is straightforward.

**Decisions:**

1. **Computation happens in main, not renderer.** The renderer asks for `TelemetrySummary` via `telemetry:get-summary` IPC; main runs the SQL + cost math + returns the finished object. Keeps the renderer free of pricing tables / cost math (which is duplicated in `useLiveCostEstimate` today — Phase 8 polish will consolidate).

2. **Period boundary = local time.** "Today" starts at midnight in the user's local timezone, "Week" at Monday 00:00 local, "Month" at the 1st 00:00 local. We don't try to sync across machines or accept a timezone parameter for v1. The renderer computes the boundary epoch-ms via `Date` and passes it as `sinceMs` to the IPC.

3. **Net savings can be negative.** If the user gears very short prompts, the haiku investment exceeds the savings. The UI surfaces this as "Cost $X" with red color (vs. "Saved $X" green). ADR rationale: hiding the negative case would be dishonest and prevent the user from learning that gearing isn't always worth it on tiny prompts.

4. **Haiku rows excluded from per-model breakdown.** The haiku model serves the gearing engine; its token usage is summed separately as `haikuCostDollars` (the "investment"). Per-model breakdowns show only models that actually answered user prompts (Sonnet, Opus, etc.).

5. **Refresh on `turns:changed`.** The renderer subscribes to the same broadcast that turn-feedback uses. A feedback click triggers a (cheap) refetch — acceptable for v1; Phase 8 can split the broadcast into `turns:created` vs `turns:feedback-changed` if measured to matter.

**Trade-offs:**
- Periods reset on calendar boundaries, not rolling windows. A user opening the app on Monday morning may see "$0 this week" briefly, even if they had savings on Sunday. Acceptable — calendar periods are what users intuitively expect.
- The savings calc uses the user-turn's `model_used` to price the original/geared diff. If the user changes model between gearing and sending, the savings number reflects the model at SEND time, not at GEAR time. Acceptable — they ARE sending to that model.
- `byModel` keys are the internal model keys (`'sonnet'`, `'opus'`), not the displayName. UI shows the raw key for v1; Phase 8 can join to PRICING.displayName.

**Discovered:** Phase 6D implementation; the gap was identified during Phase 6C scope planning and explicitly blocked on Phase 7B turn capture (so the math has data to operate on).

```

- [ ] **Step 2: Commit**

```
git add docs/decisions.md
git commit -m "docs(phase-6d): ADR-038 — telemetry summary computation + period boundaries"
```

---

## Task 9: Docs sweep — observability + scenarios

**Files:**
- Modify: `docs/observability.md`
- Modify: `docs/test-scenarios.md`

- [ ] **Step 1: observability.md**

Extend the `db` row event list with: `telemetry-summary`.

- [ ] **Step 2: test-scenarios.md**

Append Phase 6D scenarios:
- **S-6D.1** Pill hidden when turns table is empty.
- **S-6D.2** Pill shows "Saved $0.00 this week" after a tiny non-geared exchange.
- **S-6D.3** Pill shows green "Saved $X" after a geared send where the original was much longer than the geared.
- **S-6D.4** Pill shows red "Cost $X" after gearing a TINY prompt where haiku cost exceeds savings.
- **S-6D.5** Clicking the pill opens the popover with four period tabs; switching tabs refetches with the right boundary.
- **S-6D.6** Per-model rows show in the popover for each model used.
- **S-6D.7** Popover refreshes after a new geared send (turns:changed broadcast).
- **S-6D.8** Popover refreshes after a feedback click too (acceptable per ADR-038).

Commit:
```
git add docs/observability.md docs/test-scenarios.md
git commit -m "docs(phase-6d): observability events + Phase 6D manual scenarios"
```

---

## Task 10: Verification + tag v0.17.0-phase-6d

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

Expected: 315 (Phase 7B baseline) + 3 DAO + 6 summary unit + 2 handler = ~326 tests.

- [ ] **Step 2: Tag**

```
git tag -s -a v0.17.0-phase-6d -m "Phase 6D complete — telemetry summary pill in TopBar + popover with per-period / per-model breakdown"
git rev-parse v0.17.0-phase-6d^{commit}
```

---

## Self-Review Checklist

- [ ] **Plan exit-state vs spec:**
  - TopBar pill visible after the first geared turn ✓
  - Popover shows four period tabs with per-model breakdown ✓
  - Net savings can be positive (green "Saved $X") or negative (red "Cost $X") ✓
- [ ] **CLAUDE.md cornerstones:**
  - All new error paths through Logger
  - No silent catches
  - No new categories needed (`db` already exists)
- [ ] **TypeScript strict clean**
- [ ] **No console.*** outside tests

---

## Exit State

**Visible to user:**
- A pill in the TopBar reading "Saved $X.XX this week" (green) or "Cost $X.XX this week" (red)
- Clicking opens a popover with Today / Week / Month / All tabs + per-model spend + savings rows

**Under the hood:**
- `TurnsDao.getTokenSummary(db, sinceMs?)` aggregates with an optional time filter
- `computeTelemetrySummary` is a pure function over TokenSummary + pricing
- `TelemetrySummaryHandler` wires it through IPC; `useTelemetrySummary(sinceMs)` re-fetches on `turns:changed`
- ADR-038 documents the period boundary + savings math + negative-case display

**Phase 6 cluster fully closed:** all spec Phase 6 line items (multi-account, skills discovery, telemetry summary) are delivered across 6A/6B/6C/6D. Phase 7 (drafts done in 7A, turn capture done in 7B) progresses to branching (7C) and templates (7D) next.

**Tag:** `v0.17.0-phase-6d`
