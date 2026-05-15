# Phase 7A: Composer Draft Auto-save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement ADR-013's "don't lose typed prompts" promise. When the user types into the Composer, the text is auto-saved to the `drafts` table every 750ms of inactivity, keyed by `conversation_id`. On conversation switch (or fresh app launch), the saved draft is loaded back into the composer. On Send (regardless of original or geared), the draft is cleared.

**Architecture:** A new `DraftsDao` provides `upsert`, `get`, and `clear` operations against the existing `drafts` table (schema landed Phase 3, never wired). A `DraftsHandler` IPC class wraps the DAO with `withIpcResult`. The renderer side adds a `useDraftAutosave(conversationId, prompt, onLoad)` hook that:
- On mount + conversation switch: fetches the draft for the current conversation and calls `onLoad(body)` so the composer's `prompt` state is restored.
- On every `prompt` change: debounces 750ms, then upserts to the DB.
- Provides an imperative `clear()` function the composer calls on Send.

We deliberately scope to `conversationId !== null`. SQLite's `UNIQUE(conversation_id)` has odd NULL semantics (multiple NULLs allowed); rather than work around that, drafts for "no-active-conversation" are skipped — that's a rare state and the user can always create a conversation first.

**Out of scope for Phase 7A (→ Phase 7B/later):**
- Feedback (up/down/shrug per turn) — needs assistant-turn-row persistence (currently a Phase 4B punt — only user turns are written)
- Branching (right-click "Branch from here") — needs a turn list UI + Haiku summarizer
- Templates (CRUD + insert into composer) — separate feature
- Cross-window sync if Phase 8 ever multi-windows

---

## File Structure

**New files (main):**
- `src/main/db/dao/drafts.ts` — DraftsDao (upsert / get / clear)
- `src/main/__tests__/db/dao-drafts.integration.test.ts`
- `src/main/ipc/drafts-handler.ts`
- `src/main/__tests__/ipc/drafts-handler.integration.test.ts`

**New files (shared):**
- `src/shared/types/drafts.ts` — `Draft` shape
- `src/shared/ipc/drafts.ts` — channels + request/response types

**New files (renderer):**
- `src/renderer/src/hooks/use-draft-autosave.ts`
- `src/renderer/src/hooks/__tests__/use-draft-autosave.unit.test.tsx`

**Modified files:**
- `src/main/db/index.ts` — barrel export DraftsDao
- `src/main/ipc/index.ts` — instantiate + install DraftsHandler
- `src/preload/index.ts`, `src/preload/index.d.ts` — expose `drafts.save / get / clear`
- `src/shared/ipc.ts` — re-export drafts channels
- `src/renderer/src/components/composer/Composer.tsx` — wire the hook; load draft on mount, clear on Send, leave existing logic intact
- `docs/decisions.md` — ADR-033 (drafts UX semantics)
- `docs/observability.md` — extend `db` row with draft events
- `docs/test-scenarios.md` — Phase 7A scenarios

---

## Task 1: Shared Draft type + IPC channels

**Files:**
- Create: `src/shared/types/drafts.ts`
- Create: `src/shared/ipc/drafts.ts`
- Modify: `src/shared/ipc.ts`

- [ ] **Step 1: Draft type**

Create `src/shared/types/drafts.ts`:

```ts
// Public Draft shape that crosses the IPC boundary.

export interface Draft {
  readonly id: number
  readonly conversationId: number   // Phase 7A only persists drafts for active conversations
  readonly body: string
  readonly updatedAt: number
}
```

- [ ] **Step 2: IPC channels**

Create `src/shared/ipc/drafts.ts`:

```ts
import type { IpcResult } from './envelope'
import type { Draft } from '../types/drafts'

export const IPC_DRAFTS_SAVE = 'drafts:save'
export const IPC_DRAFTS_GET = 'drafts:get'
export const IPC_DRAFTS_CLEAR = 'drafts:clear'

export interface DraftsSaveRequest {
  readonly conversationId: number
  readonly body: string
}
export interface DraftsSaveResponse {
  readonly draft: Draft
}

export interface DraftsGetRequest {
  readonly conversationId: number
}
export interface DraftsGetResponse {
  readonly draft: Draft | null
}

export interface DraftsClearRequest {
  readonly conversationId: number
}
export interface DraftsClearResponse {
  readonly cleared: boolean
}

export type DraftsSaveResult = IpcResult<DraftsSaveResponse>
export type DraftsGetResult = IpcResult<DraftsGetResponse>
export type DraftsClearResult = IpcResult<DraftsClearResponse>
```

- [ ] **Step 3: Re-export from `src/shared/ipc.ts`**

Add the new constants + types to the existing re-export block. Add `'drafts:save' | 'drafts:get' | 'drafts:clear'` to the `IpcChannelName` union.

- [ ] **Step 4: Typecheck + commit**

```bash
npm run typecheck
git add src/shared/types/drafts.ts src/shared/ipc/drafts.ts src/shared/ipc.ts
git commit -m "feat(phase-7a): shared types + IPC channels for drafts (save/get/clear)"
```

---

## Task 2: DraftsDao

**Files:**
- Create: `src/main/db/dao/drafts.ts`
- Create: `src/main/__tests__/db/dao-drafts.integration.test.ts`
- Modify: `src/main/db/index.ts`

- [ ] **Step 1: Failing test**

Create `src/main/__tests__/db/dao-drafts.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { AccountsDao, ProjectsDao, ConversationsDao } from '../../db'
import {
  upsertDraft,
  getDraft,
  clearDraft
} from '../../db/dao/drafts'

// Purpose: DraftsDao upserts on conversation_id (UNIQUE), reads back the
// latest body, and clears cleanly. Multiple saves to the same conversation
// REPLACE the row; only one draft per conversation can exist.

describe('db/dao/drafts', () => {
  let db: Database
  let conversationId: number

  beforeEach(() => {
    db = createTestDb()
    const accountId = AccountsDao.createAccount(db, { label: 'P', configDir: '/p' }).id
    const projectId = ProjectsDao.createProject(db, { name: 'P', rootPath: '/x', defaultAccountId: accountId }).id
    conversationId = ConversationsDao.createConversation(db, { projectId, accountId }).id
  })

  it('upsertDraft inserts a new row when none exists', () => {
    const d = upsertDraft(db, conversationId, 'hello world')
    expect(d.id).toBeGreaterThan(0)
    expect(d.conversationId).toBe(conversationId)
    expect(d.body).toBe('hello world')
    expect(d.updatedAt).toBeGreaterThan(0)
  })

  it('upsertDraft REPLACES the row on subsequent saves (UNIQUE conversation_id)', () => {
    const a = upsertDraft(db, conversationId, 'first')
    const b = upsertDraft(db, conversationId, 'second')
    // Same id — it's an upsert, not an insert
    expect(b.id).toBe(a.id)
    expect(b.body).toBe('second')
    expect(b.updatedAt).toBeGreaterThanOrEqual(a.updatedAt)
  })

  it('getDraft returns the current draft for a conversation', () => {
    upsertDraft(db, conversationId, 'persisted')
    const d = getDraft(db, conversationId)
    expect(d?.body).toBe('persisted')
  })

  it('getDraft returns null when no draft exists', () => {
    expect(getDraft(db, conversationId)).toBeNull()
  })

  it('clearDraft removes the row and returns true', () => {
    upsertDraft(db, conversationId, 'doomed')
    expect(clearDraft(db, conversationId)).toBe(true)
    expect(getDraft(db, conversationId)).toBeNull()
  })

  it('clearDraft returns false when no draft existed', () => {
    expect(clearDraft(db, conversationId)).toBe(false)
  })

  it('drafts are scoped per conversation', () => {
    const accountId = AccountsDao.createAccount(db, { label: 'Q', configDir: '/q' }).id
    const projectId = ProjectsDao.createProject(db, { name: 'P2', rootPath: '/y', defaultAccountId: accountId }).id
    const otherConv = ConversationsDao.createConversation(db, { projectId, accountId }).id

    upsertDraft(db, conversationId, 'first')
    upsertDraft(db, otherConv, 'second')

    expect(getDraft(db, conversationId)?.body).toBe('first')
    expect(getDraft(db, otherConv)?.body).toBe('second')
  })

  it('ON DELETE CASCADE removes the draft when its conversation is deleted', () => {
    upsertDraft(db, conversationId, 'will-disappear')
    ConversationsDao.deleteConversation(db, conversationId)
    expect(getDraft(db, conversationId)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/main/__tests__/db/dao-drafts.integration.test.ts
```

Expected: FAIL — `dao/drafts` not found.

- [ ] **Step 3: Implement DAO**

Create `src/main/db/dao/drafts.ts`:

```ts
// DraftsDao — upsert / get / clear keyed by conversation_id (UNIQUE).
// 750ms debounced saves from the composer; load on conversation switch;
// clear on Send. Schema: drafts(id, conversation_id, body, updated_at).

import type { Database } from 'better-sqlite3'

import type { Draft } from '@shared/types/drafts'

interface DraftRow {
  id: number
  conversation_id: number
  body: string
  updated_at: number
}

function rowToDraft(r: DraftRow): Draft {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    body: r.body,
    updatedAt: r.updated_at
  }
}

export function upsertDraft(db: Database, conversationId: number, body: string): Draft {
  const now = Date.now()
  // SQLite: INSERT ... ON CONFLICT(conversation_id) DO UPDATE
  // The schema has UNIQUE(conversation_id) so the conflict target is well-defined.
  db.prepare(
    `INSERT INTO drafts (conversation_id, body, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(conversation_id) DO UPDATE SET
       body = excluded.body,
       updated_at = excluded.updated_at`
  ).run(conversationId, body, now)
  return getDraft(db, conversationId) as Draft
}

export function getDraft(db: Database, conversationId: number): Draft | null {
  const row = db
    .prepare<[number], DraftRow>('SELECT * FROM drafts WHERE conversation_id = ?')
    .get(conversationId)
  return row ? rowToDraft(row) : null
}

export function clearDraft(db: Database, conversationId: number): boolean {
  const result = db.prepare('DELETE FROM drafts WHERE conversation_id = ?').run(conversationId)
  return result.changes > 0
}
```

- [ ] **Step 4: Update barrel**

Edit `src/main/db/index.ts`:

```ts
export * as DraftsDao from './dao/drafts'
```

(Alongside the existing AccountsDao / ProjectsDao / ConversationsDao exports.)

- [ ] **Step 5: Run + commit**

```bash
npm run test:run -- src/main/__tests__/db/dao-drafts.integration.test.ts
git add src/main/db/dao/drafts.ts src/main/db/index.ts \
        src/main/__tests__/db/dao-drafts.integration.test.ts
git commit -m "feat(phase-7a): DraftsDao — upsert/get/clear on (conversation_id UNIQUE)"
```

---

## Task 3: DraftsHandler IPC

**Files:**
- Create: `src/main/ipc/drafts-handler.ts`
- Create: `src/main/__tests__/ipc/drafts-handler.integration.test.ts`

- [ ] **Step 1: Failing test**

Create `src/main/__tests__/ipc/drafts-handler.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { AccountsDao, ProjectsDao, ConversationsDao } from '../../db'
import { DraftsHandler } from '../../ipc/drafts-handler'
import { Logger } from '../../observability/logger'

function makeLogger(): Logger {
  return new Logger(
    { write: vi.fn(), append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100,
    'main'
  )
}

describe('ipc/drafts-handler', () => {
  let db: Database
  let handler: DraftsHandler
  let conversationId: number

  beforeEach(() => {
    db = createTestDb()
    const accountId = AccountsDao.createAccount(db, { label: 'P', configDir: '/p' }).id
    const projectId = ProjectsDao.createProject(db, { name: 'P', rootPath: '/x', defaultAccountId: accountId }).id
    conversationId = ConversationsDao.createConversation(db, { projectId, accountId }).id
    handler = new DraftsHandler(db, makeLogger())
  })

  it('save returns ok with the persisted draft', async () => {
    const result = await handler.save({ conversationId, body: 'hello' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.draft.body).toBe('hello')
      expect(result.data.draft.conversationId).toBe(conversationId)
    }
  })

  it('get returns the latest saved draft', async () => {
    await handler.save({ conversationId, body: 'one' })
    await handler.save({ conversationId, body: 'two' })
    const result = await handler.get({ conversationId })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.draft?.body).toBe('two')
  })

  it('get returns ok with draft=null when none exists', async () => {
    const result = await handler.get({ conversationId })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.draft).toBeNull()
  })

  it('clear returns ok with cleared=true when a draft existed', async () => {
    await handler.save({ conversationId, body: 'transient' })
    const result = await handler.clear({ conversationId })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.cleared).toBe(true)
    const after = await handler.get({ conversationId })
    if (after.ok) expect(after.data.draft).toBeNull()
  })

  it('clear returns ok with cleared=false when no draft existed (idempotent)', async () => {
    const result = await handler.clear({ conversationId })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.cleared).toBe(false)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/main/__tests__/ipc/drafts-handler.integration.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement handler**

Create `src/main/ipc/drafts-handler.ts`:

```ts
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Database } from 'better-sqlite3'

import { DraftsDao } from '../db'
import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'

import {
  IPC_DRAFTS_SAVE,
  IPC_DRAFTS_GET,
  IPC_DRAFTS_CLEAR,
  type DraftsSaveRequest,
  type DraftsSaveResult,
  type DraftsGetRequest,
  type DraftsGetResult,
  type DraftsClearRequest,
  type DraftsClearResult
} from '@shared/ipc/drafts'

export class DraftsHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly db: Database,
    private readonly logger: Logger
  ) {}

  save = async (req: DraftsSaveRequest): Promise<DraftsSaveResult> =>
    withIpcResult(this.logger, 'db', 'drafts-save', async () => {
      const draft = DraftsDao.upsertDraft(this.db, req.conversationId, req.body)
      return { draft }
    })

  get = async (req: DraftsGetRequest): Promise<DraftsGetResult> =>
    withIpcResult(this.logger, 'db', 'drafts-get', async () => {
      const draft = DraftsDao.getDraft(this.db, req.conversationId)
      return { draft }
    })

  clear = async (req: DraftsClearRequest): Promise<DraftsClearResult> =>
    withIpcResult(this.logger, 'db', 'drafts-clear', async () => {
      const cleared = DraftsDao.clearDraft(this.db, req.conversationId)
      return { cleared }
    })

  install(ipcMain: IpcMain): void {
    const wrap = <Req, Res>(channel: string, fn: (req: Req) => Promise<Res>): void => {
      ipcMain.handle(channel, async (_e: IpcMainInvokeEvent, req: Req) => fn(req))
      this.installedHandlers.push(channel)
    }
    wrap<DraftsSaveRequest, DraftsSaveResult>(IPC_DRAFTS_SAVE, this.save)
    wrap<DraftsGetRequest, DraftsGetResult>(IPC_DRAFTS_GET, this.get)
    wrap<DraftsClearRequest, DraftsClearResult>(IPC_DRAFTS_CLEAR, this.clear)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
```

- [ ] **Step 4: Run + commit**

```bash
npm run test:run -- src/main/__tests__/ipc/drafts-handler.integration.test.ts
git add src/main/ipc/drafts-handler.ts src/main/__tests__/ipc/drafts-handler.integration.test.ts
git commit -m "feat(phase-7a): DraftsHandler — IPC wrapping for DraftsDao (save/get/clear)"
```

---

## Task 4: Wire DraftsHandler into main + preload

**Files:**
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

- [ ] **Step 1: Register handler in main**

Edit `src/main/ipc/index.ts`. After the existing handler instantiations:

```ts
import { DraftsHandler } from './drafts-handler'

// ...
export interface IpcRegistration {
  // ... existing
  draftsHandler: DraftsHandler
  uninstallAll: () => void
}

// inside registerIpcHandlers:
const draftsHandler = new DraftsHandler(db, logger)
draftsHandler.install(ipcMain)

return {
  // ... existing fields
  draftsHandler,
  uninstallAll: () => {
    // ... existing uninstall calls
    draftsHandler.uninstall(ipcMain)
  }
}
```

- [ ] **Step 2: Expose via preload**

Edit `src/preload/index.ts`. Add to the `api` object:

```ts
drafts: {
  save(req: DraftsSaveRequest): Promise<DraftsSaveResult> {
    return ipcRenderer.invoke(IPC_DRAFTS_SAVE, req) as Promise<DraftsSaveResult>
  },
  get(req: DraftsGetRequest): Promise<DraftsGetResult> {
    return ipcRenderer.invoke(IPC_DRAFTS_GET, req) as Promise<DraftsGetResult>
  },
  clear(req: DraftsClearRequest): Promise<DraftsClearResult> {
    return ipcRenderer.invoke(IPC_DRAFTS_CLEAR, req) as Promise<DraftsClearResult>
  }
}
```

Import the constants + types from `@shared/ipc`.

Edit `src/preload/index.d.ts` — add the new `drafts` namespace on TokenlessApi:

```ts
readonly drafts: {
  save(req: DraftsSaveRequest): Promise<DraftsSaveResult>
  get(req: DraftsGetRequest): Promise<DraftsGetResult>
  clear(req: DraftsClearRequest): Promise<DraftsClearResult>
}
```

- [ ] **Step 3: Typecheck + build + commit**

```bash
npm run typecheck
npm run build
git add src/main/ipc/index.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(phase-7a): wire DraftsHandler into main + expose drafts namespace via preload"
```

---

## Task 5: useDraftAutosave hook

**Files:**
- Create: `src/renderer/src/hooks/use-draft-autosave.ts`
- Create: `src/renderer/src/hooks/__tests__/use-draft-autosave.unit.test.tsx`

The hook signature:
```ts
useDraftAutosave(conversationId: number | null, prompt: string, onLoad: (body: string) => void): { clear: () => void; lastSavedAt: number | null }
```

Behavior:
1. On mount + `conversationId` change: fetch the draft for the new conversation; if found, call `onLoad(draft.body)` so the composer's prompt state is restored.
2. On every `prompt` change (after the initial load): debounce 750ms, then `save({ conversationId, body: prompt })`. Track `lastSavedAt` so the composer can show "Draft saved" indicator (optional, Phase 7B may surface this).
3. Return a `clear()` function the composer calls on Send. This issues `clear({ conversationId })` and resets internal state.
4. If `conversationId === null`, the hook short-circuits — no fetch, no save, no clear.

**Test focus:**

- [ ] **Step 1: Failing test**

Create `src/renderer/src/hooks/__tests__/use-draft-autosave.unit.test.tsx`:

```ts
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

import { useDraftAutosave } from '../use-draft-autosave'

describe('hooks/use-draft-autosave', () => {
  let mockSave: ReturnType<typeof vi.fn>
  let mockGet: ReturnType<typeof vi.fn>
  let mockClear: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    mockSave = vi.fn().mockResolvedValue({ ok: true, data: { draft: { id: 1, conversationId: 7, body: '', updatedAt: 0 } } })
    mockGet = vi.fn().mockResolvedValue({ ok: true, data: { draft: null } })
    mockClear = vi.fn().mockResolvedValue({ ok: true, data: { cleared: true } })
    ;(window as unknown as { tokenless: unknown }).tokenless = {
      drafts: { save: mockSave, get: mockGet, clear: mockClear }
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns early when conversationId is null — no fetch, no save', async () => {
    const onLoad = vi.fn()
    renderHook(() => useDraftAutosave(null, 'typed text', onLoad))
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(mockGet).not.toHaveBeenCalled()
    expect(mockSave).not.toHaveBeenCalled()
    expect(onLoad).not.toHaveBeenCalled()
  })

  it('fetches and loads the existing draft on mount', async () => {
    mockGet.mockResolvedValueOnce({
      ok: true,
      data: { draft: { id: 1, conversationId: 7, body: 'persisted text', updatedAt: 1 } }
    })
    const onLoad = vi.fn()
    renderHook(() => useDraftAutosave(7, '', onLoad))
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    expect(mockGet).toHaveBeenCalledWith({ conversationId: 7 })
    expect(onLoad).toHaveBeenCalledWith('persisted text')
  })

  it('does NOT call onLoad when no draft exists', async () => {
    const onLoad = vi.fn()
    renderHook(() => useDraftAutosave(7, '', onLoad))
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    expect(onLoad).not.toHaveBeenCalled()
  })

  it('debounces prompt changes — saves after 750ms of inactivity', async () => {
    const { rerender } = renderHook(
      ({ prompt }: { prompt: string }) => useDraftAutosave(7, prompt, vi.fn()),
      { initialProps: { prompt: '' } }
    )
    // Initial load tick
    await act(async () => { await vi.runAllTimersAsync() })
    mockSave.mockClear()

    rerender({ prompt: 'hello' })
    expect(mockSave).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(749) })
    expect(mockSave).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(1)
      await vi.runAllTimersAsync()
    })
    expect(mockSave).toHaveBeenCalledWith({ conversationId: 7, body: 'hello' })
  })

  it('coalesces multiple rapid prompt changes into a single save', async () => {
    const { rerender } = renderHook(
      ({ prompt }: { prompt: string }) => useDraftAutosave(7, prompt, vi.fn()),
      { initialProps: { prompt: '' } }
    )
    await act(async () => { await vi.runAllTimersAsync() })
    mockSave.mockClear()

    rerender({ prompt: 'a' })
    await act(async () => { vi.advanceTimersByTime(200) })
    rerender({ prompt: 'ab' })
    await act(async () => { vi.advanceTimersByTime(200) })
    rerender({ prompt: 'abc' })
    await act(async () => {
      vi.advanceTimersByTime(750)
      await vi.runAllTimersAsync()
    })
    expect(mockSave).toHaveBeenCalledTimes(1)
    expect(mockSave).toHaveBeenCalledWith({ conversationId: 7, body: 'abc' })
  })

  it('clear() issues IPC clear and prevents the next pending save', async () => {
    const { result, rerender } = renderHook(
      ({ prompt }: { prompt: string }) => useDraftAutosave(7, prompt, vi.fn()),
      { initialProps: { prompt: '' } }
    )
    await act(async () => { await vi.runAllTimersAsync() })
    mockSave.mockClear()

    rerender({ prompt: 'about to send' })
    await act(async () => { vi.advanceTimersByTime(200) })

    // User clicks Send — composer calls clear() before the debounced save fires
    await act(async () => {
      await result.current.clear()
    })

    await act(async () => {
      vi.advanceTimersByTime(2000)
      await vi.runAllTimersAsync()
    })

    expect(mockClear).toHaveBeenCalledWith({ conversationId: 7 })
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('re-fetches when conversationId changes', async () => {
    const onLoad = vi.fn()
    mockGet.mockResolvedValueOnce({ ok: true, data: { draft: { id: 1, conversationId: 7, body: 'first', updatedAt: 1 } } })
    const { rerender } = renderHook(
      ({ id }: { id: number }) => useDraftAutosave(id, '', onLoad),
      { initialProps: { id: 7 } }
    )
    await act(async () => { await vi.runAllTimersAsync() })
    expect(onLoad).toHaveBeenCalledWith('first')

    mockGet.mockResolvedValueOnce({ ok: true, data: { draft: { id: 2, conversationId: 8, body: 'second', updatedAt: 1 } } })
    rerender({ id: 8 })
    await act(async () => { await vi.runAllTimersAsync() })
    expect(onLoad).toHaveBeenCalledWith('second')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/renderer/src/hooks/__tests__/use-draft-autosave.unit.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement hook**

Create `src/renderer/src/hooks/use-draft-autosave.ts`:

```ts
// useDraftAutosave — implements ADR-013's per-conversation draft persistence.
// Loads existing draft on conversation switch (calls onLoad with the body so
// the composer can restore its prompt state). Debounces 750ms on prompt
// changes. Returns an imperative clear() to call on Send.

import { useCallback, useEffect, useRef, useState } from 'react'

const DEBOUNCE_MS = 750

interface UseDraftAutosaveReturn {
  readonly clear: () => Promise<void>
  readonly lastSavedAt: number | null
}

export function useDraftAutosave(
  conversationId: number | null,
  prompt: string,
  onLoad: (body: string) => void
): UseDraftAutosaveReturn {
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const onLoadRef = useRef(onLoad)
  onLoadRef.current = onLoad
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Tracks whether the initial load for the current conversation has finished
  // — so we don't auto-save BEFORE we've loaded (which would race the load
  // and persist an empty string overtop of the user's draft).
  const initialLoadDone = useRef<Map<number, boolean>>(new Map())
  // Tracks whether a clear() has cancelled the pending save.
  const cancelled = useRef(false)

  // Load on conversation switch (and on initial mount).
  useEffect(() => {
    if (conversationId === null) return
    let active = true
    initialLoadDone.current.set(conversationId, false)
    void window.tokenless.drafts.get({ conversationId }).then((result) => {
      if (!active) return
      if (result.ok && result.data.draft) {
        onLoadRef.current(result.data.draft.body)
      }
      initialLoadDone.current.set(conversationId, true)
    })
    return () => {
      active = false
    }
  }, [conversationId])

  // Debounced save on prompt change.
  useEffect(() => {
    if (conversationId === null) return undefined
    if (!initialLoadDone.current.get(conversationId)) return undefined
    if (cancelled.current) {
      cancelled.current = false
      return undefined
    }
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null
      void window.tokenless.drafts.save({ conversationId, body: prompt }).then((result) => {
        if (result.ok) setLastSavedAt(result.data.draft.updatedAt)
      })
    }, DEBOUNCE_MS)
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
        debounceTimer.current = null
      }
    }
  }, [conversationId, prompt])

  const clear = useCallback(async (): Promise<void> => {
    if (conversationId === null) return
    // Cancel any pending save first
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
    cancelled.current = true
    await window.tokenless.drafts.clear({ conversationId })
    setLastSavedAt(null)
  }, [conversationId])

  return { clear, lastSavedAt }
}
```

- [ ] **Step 4: Run + commit**

```bash
npm run test:run -- src/renderer/src/hooks/__tests__/use-draft-autosave.unit.test.tsx
git add src/renderer/src/hooks/use-draft-autosave.ts \
        src/renderer/src/hooks/__tests__/use-draft-autosave.unit.test.tsx
git commit -m "feat(phase-7a): useDraftAutosave hook — load on switch, 750ms debounce save, clear on demand"
```

---

## Task 6: Wire the hook into Composer

**Files:**
- Modify: `src/renderer/src/components/composer/Composer.tsx`

- [ ] **Step 1: Add hook call + clear-on-Send**

Edit `src/renderer/src/components/composer/Composer.tsx`. Read the file first to understand its current shape.

Inside the component:
- Import `useDraftAutosave`
- Call it: `const { clear: clearDraft } = useDraftAutosave(conversationId, prompt, setPrompt)`
- In the existing `handleSend` function's success branch, call `void clearDraft()` after `setPrompt('')` (or before — order doesn't matter functionally, but logically clear-then-reset reads better):

```ts
if (result.ok) {
  setPrompt('')
  void clearDraft()  // NEW — clears the persisted draft for this conversation
  rendererLogger.info('ui', 'send-success', 'Prompt sent', {
    // ...
  })
}
```

- Apply the same change to `handleGearSendOriginal` and `handleGearSendGeared` (the gear-flow send paths) — both call `handleSend(...)` which already calls `clearDraft` so the flow is already covered transitively. **Verify by reading the current handleSend.** If `handleSend` is the only callsite, single change.

**Important — onLoad behavior:** `setPrompt` is the `onLoad` callback. When the user switches to a conversation with a draft, `setPrompt` runs and the composer's prompt state is restored.

But there's an edge: the user may have typed something in the OLD conversation just before switching. If the debounce hasn't fired, that text is LOST. For Phase 7A: accept this — the user can switch back to get the saved-then-loaded state. Phase 7B may add a flush-on-blur-or-switch.

- [ ] **Step 2: Typecheck + tests + commit**

```bash
npm run typecheck
npm run test:run
```

Full suite should remain green; no new tests added by this task.

```bash
git add src/renderer/src/components/composer/Composer.tsx
git commit -m "feat(phase-7a): Composer wires useDraftAutosave — load on mount, save on type, clear on Send"
```

---

## Task 7: ADR-033 + docs + scenarios

**Files:**
- Modify: `docs/decisions.md`
- Modify: `docs/observability.md`
- Modify: `docs/test-scenarios.md`

- [ ] **Step 1: ADR-033**

Append to `docs/decisions.md`:

```markdown

## ADR-033 (2026-05-15) — Drafts auto-save: 750ms debounce per conversation; null-conversation drafts NOT persisted

**Context:** ADR-013 prescribed per-conversation auto-saved drafts (750ms debounce, cleared on Send). Phase 7A implements it.

**Three sub-decisions:**

1. **The drafts table's `UNIQUE(conversation_id)` has weird NULL semantics in SQLite** — multiple NULL rows are allowed. To avoid an unbounded pile of "no-conversation" drafts, Phase 7A drafts ONLY save when `conversationId !== null`. The Composer can still have a typed prompt without an active conversation; it just won't survive process restart in that state. The user can always create a conversation first if they care about persistence.

2. **Load timing:** the hook fetches on mount + on conversationId change. Saves are suppressed until the load finishes (a `initialLoadDone` ref guard) to prevent racing the load → "save empty string overtop of the draft" bug.

3. **Clear on Send wins:** Send fires `clearDraft()` BEFORE the next debounce tick. We cancel the pending timer and set a `cancelled` flag so the next effect re-render doesn't immediately schedule another save (which would happen because `prompt` just changed to `''`).

**Reasoning:** Simple, predictable. The null-conversation exclusion is the only design liberty taken — UX cost is low (rare case) and it sidesteps SQLite UNIQUE-NULL footguns.

**Discovered:** Phase 7A draft-autosave wiring.

```

- [ ] **Step 2: observability.md**

In the `db` row, append: `drafts-save`, `drafts-get`, `drafts-clear` events.

- [ ] **Step 3: test-scenarios.md**

Append:

```markdown

## Phase 7A — Drafts auto-save

### S-7A.1 Type → switch away → come back → draft preserved
1. Launch app with a project + at least one conversation. Click into the conversation.
2. Type "this is my draft prompt" into the composer.
3. Wait ~1 second. Verify in Dev Mode that a `drafts-save` log entry appeared.
4. Click a DIFFERENT conversation in the sidebar.
5. **Expect:** Composer either clears or shows the OTHER conversation's draft (if any).
6. Click back to the original conversation.
7. **Expect:** "this is my draft prompt" is restored in the composer.

### S-7A.2 Send clears the draft
1. Continuing from S-7A.1, click Send.
2. **Expect:** Composer text clears. `drafts-clear` log entry visible in Dev Mode.
3. Switch away + back.
4. **Expect:** Composer is empty (no leftover draft).

### S-7A.3 Restart preserves drafts
1. Type a long prompt into a conversation. Wait for `drafts-save` to fire.
2. Quit the app (Cmd/Ctrl+Q).
3. Relaunch.
4. Click the conversation.
5. **Expect:** The draft is restored.

### S-7A.4 No-conversation drafts not persisted
1. Launch with no projects yet (or all projects with no conversations).
2. Type a prompt anyway (the textarea is editable even without a conversation).
3. Quit the app.
4. Relaunch.
5. **Expect:** Composer is empty (no persistence for null-conversation drafts per ADR-033).
```

- [ ] **Step 4: Commit**

```bash
git add docs/decisions.md docs/observability.md docs/test-scenarios.md
git commit -m "docs(phase-7a): ADR-033 + observability events + manual scenarios"
```

---

## Task 8: Verification + tag v0.12.0-phase-7a

**Files:** none new

- [ ] **Step 1: Four-gate verification**

```bash
npm run rebuild:node
npm run typecheck
npm run test:run
```

Expected: typecheck clean, 205 baseline + new DAO + handler + hook tests ≈ 225 tests.

```bash
npm run rebuild:electron
npm run build
npm run test:e2e
npm run rebuild:node
```

Expected: build clean, 18/18 E2E (no new E2E for Phase 7A; drafts is covered by manual scenarios).

- [ ] **Step 2: Tag**

```bash
git tag -s -a v0.12.0-phase-7a -m "Phase 7A complete — composer drafts auto-save (ADR-013 implemented)"
git rev-parse v0.12.0-phase-7a^{commit}
```

- [ ] **Step 3: Hand off**

Report: `Phase 7A complete locally. Tag v0.12.0-phase-7a at <sha>. Push + CI watch is next.`

---

## Self-Review Checklist

- [ ] **ADR-013 covered:** 750ms debounce ✓, per-conversation ✓, cleared on Send ✓.
- [ ] **No new silent catches** (`grep "catch\s*\(\s*\)\s*\{" src/main src/renderer/src --include "*.ts" --include "*.tsx" | grep -v __tests__`)
- [ ] **No console.* in src outside tests**
- [ ] **TypeScript strict clean**
- [ ] **drafts table schema already existed from Phase 3 — no migration needed**

---

## Exit State

**Visible to user:**
- Typed prompt persists across conversation switches and app restarts (when a conversation is active).
- Send clears the persisted draft for that conversation.
- No visible "saving" indicator yet (Phase 7B can surface `lastSavedAt` if desired).

**Under the hood:**
- `drafts` table populated by `DraftsHandler` IPC.
- `useDraftAutosave` debounces 750ms; suppresses saves until initial load completes; cancels pending saves on `clear()`.

**Phase 7B will deliver (when scoped):**
- Feedback (up/down/shrug per assistant turn — requires assistant-turn-row persistence first)
- Branching from turn (Haiku-summarized primer + parent_conversation_id wiring)
- Templates (CRUD + insert-into-composer)
- Optional "Draft saved Xs ago" indicator using `lastSavedAt`

**Tag:** `v0.12.0-phase-7a`
