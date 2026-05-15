# Phase 6A: Multi-Account API Keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-account `ANTHROPIC_API_KEY` per ADR-018. Today there's a single global key from `process.env.ANTHROPIC_API_KEY` that the `AnthropicClient` is constructed with at boot — every gearing call + summary refresh uses that one key regardless of which account is active. Phase 6A wires the existing `accounts.api_key_ref` column (forward-declared in Phase 3's schema, empty until now) to actual stored API keys, replaces the single-client architecture with an `AnthropicClientRegistry` keyed by account, and adds a UI flow to create accounts with their own API keys. Phase 6B will deliver account editing/deletion + skills discovery; Phase 6C ships the telemetry summary view.

**Architecture:** `accounts.api_key_ref` stores the literal API key string for v1 (the ADR-018 plan of using the OS keychain is deferred to Phase 8 polish — see ADR-034 in this phase). The shared `Account` type renames `apiKeyRef` → `apiKey: string | null` to make the semantics clear in code. A new `AnthropicClientRegistry` class lives in `main/api/` and caches `AnthropicClient` instances by accountId; consumers (GearingEngine via GearingHandler, SummaryRefresher) ask the registry for the right client based on the conversation's `account_id`. A new `CreateAccountModal` (mirroring CreateProjectModal) lets the user add accounts with a label + config dir + API key. The AccountSwitcher gets a "+ New account" affordance. `AuthMissingModal` becomes per-account ("Account 'Work' has no API key configured") with a button that opens an EditAccount flow — but the full edit flow ships in Phase 6B; 6A's modal just guides the user to "create a new account with the key" or "restart with ANTHROPIC_API_KEY env var" as fallbacks.

**Out of scope for Phase 6A (→ Phase 6B):**
- Editing existing accounts (label / configDir / apiKey changes)
- Deleting accounts
- The full multi-account E2E flow with conversation re-association
- Skills (chokidar-watched discovery)
- ANTHROPIC_API_KEY env var fallback when no account has a key (Phase 6B may add a global "fallback" flow)

---

## File Structure

**New files (main):**
- `src/main/api/client-registry.ts` — `AnthropicClientRegistry`
- `src/main/__tests__/api/client-registry.unit.test.ts`

**New files (renderer):**
- `src/renderer/src/components/layout/CreateAccountModal.tsx`

**Modified files:**
- `src/main/db/migrations/002_account_api_key.sql` — NO new column, but a rename comment-only migration is unnecessary. Decision: do NOT add a migration. The existing `api_key_ref` column receives plain-text values. The shared `Account` type is the only thing that changes its semantic name. (See ADR-034.)
- `src/shared/types/accounts.ts` — rename `apiKeyRef` → `apiKey: string | null`; extend `CreateAccountInput` with `apiKey?: string | null`
- `src/main/db/dao/accounts.ts` — `rowToAccount` maps `api_key_ref` ↔ `apiKey`; `createAccount` accepts `apiKey` input
- `src/main/db/__tests__/dao-accounts.integration.test.ts` — update existing tests for the rename + add coverage for apiKey persistence
- `src/main/api/index.ts` — barrel export ClientRegistry
- `src/main/api/client.ts` — minor: ensure constructor handles empty apiKey gracefully (already does — it'll just fail with 401 at first call, classified correctly)
- `src/main/ipc/index.ts` — replace `anthropicClient` parameter with `clientRegistry`; pass to GearingHandler + SummaryRefresher
- `src/main/index.ts` — instantiate the registry; pass to `registerIpcHandlers`
- `src/main/ipc/gearing-handler.ts` — accept registry; resolve account from conversation (or from request.accountId fallback)
- `src/main/gearing/summary-refresher.ts` — accept registry; resolve account from conversation; skip refresh if account has no apiKey
- `src/shared/ipc/gearing.ts` — extend `GearingGearRequest` with optional `accountId: number | null`
- `src/preload/index.ts` + `index.d.ts` — accounts.create now accepts apiKey field (already does via the existing CreateAccountInput type — verify)
- `src/renderer/src/components/layout/AccountSwitcher.tsx` — add "+ New account" item rendered as a special row at the bottom of the dropdown that triggers onCreate
- `src/renderer/src/components/layout/AppShell.tsx` — manage CreateAccountModal state; pass `onCreate` to AccountSwitcher; auto-activate newly-created account
- `src/renderer/src/components/composer/Composer.tsx` — `runGear` passes `accountId` in the request (looked up from active state via prop or context)
- `src/renderer/src/components/notifications/AuthMissingModal.tsx` — accept optional `accountLabel` prop; per-account messaging
- `docs/decisions.md` — ADR-034 (plaintext API key storage decision + Phase 8 keychain migration)
- `docs/observability.md` — extend `auth` category note (api key resolution)
- `docs/test-scenarios.md` — Phase 6A scenarios

---

## Task 1: Rename `apiKeyRef` → `apiKey` in shared Account type + DAO

**Files:**
- Modify: `src/shared/types/accounts.ts`
- Modify: `src/main/db/dao/accounts.ts`
- Modify: `src/main/__tests__/db/dao-accounts.integration.test.ts`

- [ ] **Step 1: Update shared types**

Edit `src/shared/types/accounts.ts`:

```ts
export interface Account {
  readonly id: number
  readonly label: string
  readonly configDir: string
  readonly apiKey: string | null   // renamed from apiKeyRef
  readonly createdAt: number
}

export interface CreateAccountInput {
  readonly label: string
  readonly configDir: string
  readonly apiKey?: string | null  // renamed from apiKeyRef
}
```

- [ ] **Step 2: Update DAO mapper + create**

Edit `src/main/db/dao/accounts.ts`. The DB column name (`api_key_ref`) stays — only the TypeScript field name changes:

```ts
interface AccountRow {
  id: number
  label: string
  config_dir: string
  api_key_ref: string | null
  created_at: number
}

function rowToAccount(r: AccountRow): Account {
  return {
    id: r.id,
    label: r.label,
    configDir: r.config_dir,
    apiKey: r.api_key_ref,
    createdAt: r.created_at
  }
}

export function createAccount(db: Database, input: CreateAccountInput): Account {
  const now = Date.now()
  const stmt = db.prepare(
    'INSERT INTO accounts (label, config_dir, api_key_ref, created_at) VALUES (?, ?, ?, ?)'
  )
  const result = stmt.run(input.label, input.configDir, input.apiKey ?? null, now)
  const id = Number(result.lastInsertRowid)
  return getAccountById(db, id) as Account
}
```

- [ ] **Step 3: Update existing DAO tests**

The existing `dao-accounts.integration.test.ts` may reference `apiKeyRef`. Grep + replace with `apiKey`. Add a new test:

```ts
it('createAccount stores apiKey when provided', () => {
  const a = createAccount(db, { label: 'Work', configDir: '/c', apiKey: 'sk-ant-test-123' })
  expect(a.apiKey).toBe('sk-ant-test-123')
})

it('createAccount stores null apiKey when omitted', () => {
  const a = createAccount(db, { label: 'Personal', configDir: '/p' })
  expect(a.apiKey).toBeNull()
})
```

- [ ] **Step 4: Find + fix all `apiKeyRef` callsites**

```bash
grep -rn "apiKeyRef" C:/personal/tokenless/src/ C:/personal/tokenless/test/
```

Expected callsites:
- `src/main/db/seed.ts` — `seedDefaultAccount` may pass `apiKeyRef`. Update to `apiKey: null`.
- `src/main/ipc/cc-handler.ts` — uses `account.apiKeyRef` to set `ANTHROPIC_API_KEY` in PTY env. Update to `account.apiKey`.
- Any test files that construct Account objects in mocks.

Replace each with the new field name.

- [ ] **Step 5: Verify + commit**

```bash
npm run typecheck
npm run test:run
```

Expected: typecheck clean (the rename is breaking but limited; the grep should have caught everything). Tests still pass.

```bash
git add src/shared/types/accounts.ts src/main/db/dao/accounts.ts \
        src/main/__tests__/db/dao-accounts.integration.test.ts \
        src/main/db/seed.ts src/main/ipc/cc-handler.ts
git commit -m "refactor(phase-6a): rename Account.apiKeyRef → apiKey (DB column unchanged)"
```

---

## Task 2: ADR-034 — plaintext API key storage with keychain deferred

**Files:**
- Modify: `docs/decisions.md`

- [ ] **Step 1: Append**

```markdown

## ADR-034 (2026-05-15) — Per-account ANTHROPIC_API_KEY stored plaintext in `accounts.api_key_ref`; OS keychain migration deferred to Phase 8

**Context:** ADR-018 (2026-05-14) prescribed per-account API key injection but left the storage backend open ("opaque keychain reference"). Phase 6A actually wires per-account keys for the first time. Two implementation options:

A) OS keychain (Windows Credential Manager via a native module like `keytar` or `windows-credential-manager`). Encrypted at rest, accessible to TokenLess only.
B) Plaintext in the existing `api_key_ref` column of the SQLite DB. Simple, no new native modules, fits the existing migration story.

**Choice:** B for v1. The `api_key_ref` column name is preserved (semantic mismatch acknowledged); the field stores the literal API key string.

**Reasoning:**
- The keychain approach adds a Windows-only native module (cross-platform fork later) plus a runtime dependency on a service that can be locked.
- The DB file lives at `app.getPath('userData')/tokenless.db`. On Windows that's `%APPDATA%/tokenless/` — protected by NTFS user permissions. Backups of `%APPDATA%` (e.g., OneDrive) WILL include the key. Acceptable risk for v1 (the user opts in by setting a key in their account).
- Plaintext lets the user inspect / export / migrate keys with standard tools. The keychain approach makes recovery scenarios (DB corruption, account migration) harder.
- Phase 8 polish adds a `Settings → Security` view that can offer "move to keychain" as an opt-in migration. The schema column name `api_key_ref` is forward-compatible: if Phase 8 stores a keychain handle instead, no migration needed.

**Storage shape:** column `accounts.api_key_ref TEXT` — already exists from Phase 3. Phase 6A stores the literal key (e.g. `sk-ant-api03-...`) directly. TypeScript field renamed to `apiKey` for clarity.

**Tradeoffs:**
- Backup snapshots contain keys. Document this in the Settings UI.
- Reading the DB while running has no encryption layer. Acceptable for a single-user desktop app.

**Discovered:** Phase 6A multi-account auth wiring.

```

- [ ] **Step 2: Commit**

```bash
grep "^## ADR" docs/decisions.md | tail -3
git add docs/decisions.md
git commit -m "docs(phase-6a): ADR-034 — plaintext API key storage with keychain deferred to Phase 8"
```

---

## Task 3: AnthropicClientRegistry

**Files:**
- Create: `src/main/api/client-registry.ts`
- Create: `src/main/__tests__/api/client-registry.unit.test.ts`
- Modify: `src/main/api/index.ts`

- [ ] **Step 1: Failing test**

Create `src/main/__tests__/api/client-registry.unit.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

import { AnthropicClientRegistry } from '../../api/client-registry'
import { Logger } from '../../observability/logger'

function makeLogger(): Logger {
  return new Logger(
    { write: vi.fn(), append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100,
    'main'
  )
}

describe('api/client-registry', () => {
  it('returns null when account has no apiKey', () => {
    const registry = new AnthropicClientRegistry(makeLogger())
    const client = registry.getClient({ id: 1, label: 'X', configDir: '/x', apiKey: null, createdAt: 0 })
    expect(client).toBeNull()
  })

  it('returns null when account has empty-string apiKey', () => {
    const registry = new AnthropicClientRegistry(makeLogger())
    const client = registry.getClient({ id: 1, label: 'X', configDir: '/x', apiKey: '', createdAt: 0 })
    expect(client).toBeNull()
  })

  it('constructs and caches an AnthropicClient when apiKey is present', () => {
    const registry = new AnthropicClientRegistry(makeLogger())
    const account = { id: 1, label: 'X', configDir: '/x', apiKey: 'sk-test', createdAt: 0 }
    const c1 = registry.getClient(account)
    const c2 = registry.getClient(account)
    expect(c1).not.toBeNull()
    expect(c1).toBe(c2) // cache hit
  })

  it('cache key includes apiKey — different keys for same accountId get fresh clients', () => {
    const registry = new AnthropicClientRegistry(makeLogger())
    const c1 = registry.getClient({ id: 1, label: 'X', configDir: '/x', apiKey: 'sk-a', createdAt: 0 })
    const c2 = registry.getClient({ id: 1, label: 'X', configDir: '/x', apiKey: 'sk-b', createdAt: 0 })
    expect(c1).not.toBeNull()
    expect(c2).not.toBeNull()
    expect(c1).not.toBe(c2)
  })

  it('different accountIds get separate clients', () => {
    const registry = new AnthropicClientRegistry(makeLogger())
    const c1 = registry.getClient({ id: 1, label: 'A', configDir: '/a', apiKey: 'sk-1', createdAt: 0 })
    const c2 = registry.getClient({ id: 2, label: 'B', configDir: '/b', apiKey: 'sk-2', createdAt: 0 })
    expect(c1).not.toBe(c2)
  })
})
```

- [ ] **Step 2: Run failure**

```bash
npm run test:run -- src/main/__tests__/api/client-registry.unit.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/main/api/client-registry.ts`:

```ts
// AnthropicClientRegistry — resolves an AnthropicClient per Account. Caches
// instances by (accountId, apiKey) so that key rotation produces a fresh
// client. Phase 6A: one Logger shared across all clients (per-account loggers
// could come in Phase 8 polish if observability per account becomes useful).

import type { Account } from '@shared/types/accounts'

import { AnthropicClient } from './client'
import type { AnthropicClientLike } from './types'
import { Logger } from '../observability/logger'

export class AnthropicClientRegistry {
  private readonly cache = new Map<string, AnthropicClientLike>()

  constructor(private readonly logger: Logger) {}

  getClient(account: Account): AnthropicClientLike | null {
    if (!account.apiKey) return null
    const key = `${account.id}|${account.apiKey}`
    const cached = this.cache.get(key)
    if (cached) return cached
    const client = new AnthropicClient({ apiKey: account.apiKey, logger: this.logger })
    this.cache.set(key, client)
    return client
  }

  // Clear cache entries for an accountId — call when an account is deleted or
  // its key changes (Phase 6B may use this when account edit lands).
  invalidate(accountId: number): void {
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(`${accountId}|`)) {
        this.cache.delete(key)
      }
    }
  }
}
```

Edit `src/main/api/index.ts` — add export:

```ts
export { AnthropicClientRegistry } from './client-registry'
```

- [ ] **Step 4: Run pass + commit**

```bash
npm run test:run -- src/main/__tests__/api/client-registry.unit.test.ts
git add src/main/api/client-registry.ts src/main/api/index.ts \
        src/main/__tests__/api/client-registry.unit.test.ts
git commit -m "feat(phase-6a): AnthropicClientRegistry — per-account client cache keyed by (accountId, apiKey)"
```

---

## Task 4: Wire ClientRegistry through main/ipc + handlers

**Files:**
- Modify: `src/main/ipc/index.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc/gearing-handler.ts`
- Modify: `src/main/gearing/summary-refresher.ts`
- Modify: `src/main/__tests__/ipc/gearing-handler.integration.test.ts`
- Modify: `src/main/__tests__/gearing/summary-refresher.unit.test.ts`

This is the biggest single task — the refactor from "one global client" to "registry per account". TDD adapts the existing tests to the new API.

- [ ] **Step 1: GearingHandler signature change**

Edit `src/main/ipc/gearing-handler.ts`. The handler currently receives a `GearingEngine` in the constructor. Change to receive a `clientRegistry: AnthropicClientRegistry` + the `db: Database` directly. The handler now:

1. Reads the request's `conversationId` (which may be null).
2. Looks up the account: if `conversationId !== null`, look up conversation → use `conversation.accountId`. If null, use the request's `accountId` (Phase 6A adds this field).
3. Reads the account.apiKey.
4. Asks the registry for a client.
5. If client is null (account has no apiKey), returns `API_AUTH_FAILED` envelope with a message referencing the account label.
6. Otherwise, constructs a `GearingEngine(client)` and calls `gear(...)`.

```ts
import type { Database } from 'better-sqlite3'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'

import { GearingEngine } from '../gearing'
import { AnthropicClientRegistry } from '../api'
import { AccountsDao, ConversationsDao } from '../db'
import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'

import {
  IPC_GEARING_GEAR,
  type GearingGearRequest,
  type GearingGearResult
} from '@shared/ipc/gearing'

interface ErrWithCode extends Error { code?: string }
function tagged(message: string, code: string): ErrWithCode {
  const e = new Error(message) as ErrWithCode
  e.code = code
  return e
}

export class GearingHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
    private readonly registry: AnthropicClientRegistry
  ) {}

  gear = async (req: GearingGearRequest): Promise<GearingGearResult> =>
    withIpcResult(this.logger, 'gearing', 'gearing-gear', async () => {
      // Resolve the account: prefer conversation.accountId; fall back to
      // request.accountId; fail if neither.
      let accountId: number | null = null
      if (req.conversationId !== null) {
        const conv = ConversationsDao.getConversationById(this.db, req.conversationId)
        accountId = conv?.accountId ?? null
      }
      if (accountId === null) accountId = req.accountId ?? null
      if (accountId === null) {
        throw tagged('No account specified for gearing call', 'API_AUTH_FAILED')
      }
      const account = AccountsDao.getAccountById(this.db, accountId)
      if (!account) {
        throw tagged(`Account ${accountId} not found`, 'NOT_FOUND')
      }
      const client = this.registry.getClient(account)
      if (!client) {
        throw tagged(
          `Account "${account.label}" has no API key configured`,
          'API_AUTH_FAILED'
        )
      }

      const engine = new GearingEngine(client)
      const result = await engine.gear({
        originalPrompt: req.originalPrompt,
        configs: req.configs
      })
      if (!result.ok) {
        throw tagged(result.error.message, result.error.code)
      }
      this.logger.info('gearing', 'gearing-gear-ok', 'Gearing succeeded', {
        accountLabel: account.label,
        conversationId: req.conversationId,
        haikuInputTokens: result.data.tokenBreakdown.haikuInputTokens,
        haikuOutputTokens: result.data.tokenBreakdown.haikuOutputTokens,
        gearedInputEstimate: result.data.tokenBreakdown.gearedInputEstimate,
        expectedDollars: result.data.costPreview.expectedDollars
      })
      return { result: result.data }
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

- [ ] **Step 2: SummaryRefresher signature change**

Edit `src/main/gearing/summary-refresher.ts`. Replace `client: AnthropicClientLike` in the options with `registry: AnthropicClientRegistry`. In `refresh()`, resolve the conversation's account, ask registry for client; if null, log warn `summary-refresh-no-account` and bail.

```ts
import { AnthropicClientRegistry } from '../api'
import { AccountsDao, ConversationsDao } from '../db'

export interface SummaryRefresherOptions {
  readonly db: Database
  readonly registry: AnthropicClientRegistry
  readonly logger: Logger
  readonly debounceMs?: number
  readonly recentTurnsCount?: number
}

// In refresh():
const conv = ConversationsDao.getConversationById(this.opts.db, conversationId)
if (!conv) return
if (!conv.accountId) {
  this.opts.logger.warn('gearing', 'summary-refresh-no-account',
    'Conversation has no account — skipping summary refresh', { conversationId })
  return
}
const account = AccountsDao.getAccountById(this.opts.db, conv.accountId)
if (!account) return
const client = this.opts.registry.getClient(account)
if (!client) {
  this.opts.logger.warn('gearing', 'summary-refresh-no-key',
    'Account has no API key — skipping summary refresh', { conversationId, accountLabel: account.label })
  return
}

// ... existing logic but using `client.complete(...)` (was `this.opts.client.complete(...)`)
```

- [ ] **Step 3: Update GearingGearRequest with optional accountId**

Edit `src/shared/ipc/gearing.ts`:

```ts
export interface GearingGearRequest {
  readonly conversationId: number | null
  // Phase 6A: when conversationId is null (no active conversation), this is
  // REQUIRED. When conversationId is set, this is ignored (the conversation's
  // account is the source of truth).
  readonly accountId: number | null
  readonly originalPrompt: string
  readonly configs: GearConfigs
}
```

- [ ] **Step 4: Update tests**

`gearing-handler.integration.test.ts`: the handler constructor now takes `(db, logger, registry)`. Tests need to:
1. Create an account row with an apiKey (or use the registry's null-return path).
2. Update conversation rows to have `accountId` set (the test setup already does this).
3. Construct a registry: `new AnthropicClientRegistry(makeLogger())` — but it returns a REAL AnthropicClient, which would hit real API. Need to intercept.

Cleanest: extend AnthropicClientRegistry with an injectable factory so tests can use MockAnthropicClient:

```ts
// In client-registry.ts, allow overriding the AnthropicClient factory for tests:
type ClientFactory = (apiKey: string, logger: Logger) => AnthropicClientLike

export class AnthropicClientRegistry {
  private readonly cache = new Map<string, AnthropicClientLike>()
  private readonly factory: ClientFactory

  constructor(private readonly logger: Logger, factory?: ClientFactory) {
    this.factory = factory ?? ((apiKey, logger) => new AnthropicClient({ apiKey, logger }))
  }

  getClient(account: Account): AnthropicClientLike | null {
    if (!account.apiKey) return null
    const key = `${account.id}|${account.apiKey}`
    const cached = this.cache.get(key)
    if (cached) return cached
    const client = this.factory(account.apiKey, this.logger)
    this.cache.set(key, client)
    return client
  }
  // ...
}
```

Then in `gearing-handler.integration.test.ts`:
```ts
import { MockAnthropicClient } from '../../../../test/doubles/mock-anthropic-client'

const registry = new AnthropicClientRegistry(makeLogger(), () =>
  new MockAnthropicClient({ '*': { response: fx.response } })
)
const handler = new GearingHandler(db, makeLogger(), registry)
// Then update accounts.api_key on the test fixture so getClient returns the mock
```

Update tests:
- Happy path: account has apiKey, conversation has accountId, gear returns ok ✓
- API_AUTH_FAILED when account has no apiKey (set apiKey = null on the row)
- API_AUTH_FAILED when neither conversationId nor request.accountId resolves

For `summary-refresher.unit.test.ts`: same registry pattern. Update beforeEach.

- [ ] **Step 5: main/ipc/index.ts + main/index.ts wiring**

Edit `src/main/ipc/index.ts`:

```ts
// Change registerIpcHandlers' parameter from anthropicClient to clientRegistry:
export function registerIpcHandlers(
  ipcMain: IpcMain,
  logger: Logger,
  broadcast: Broadcast,
  db: Database,
  clientRegistry: AnthropicClientRegistry
): IpcRegistration {
  // ...
  const summaryRefresher = new SummaryRefresher({
    db, registry: clientRegistry, logger
  })
  // ...
  const gearingHandler = new GearingHandler(db, logger, clientRegistry)
  // ...
}
```

Edit `src/main/index.ts`:

```ts
import { AnthropicClient, AnthropicClientRegistry } from './api'

// Replace:
// const anthropicClient = new AnthropicClient({ apiKey, logger })
// With:
const clientRegistry = new AnthropicClientRegistry(logger)
// Keep the env-var-as-fallback behaviour for ONE BACKWARD-COMPAT cycle: if
// process.env.ANTHROPIC_API_KEY is set AND no account has a key, future calls
// fall back to it. Phase 6A actually drops this fallback — accounts MUST be
// configured. If a user has nothing configured, the AuthMissingModal will
// guide them. Keep it simple: pass only the registry.

const ipcRegistration = registerIpcHandlers(ipcMain, logger, broadcast, db, clientRegistry)
```

- [ ] **Step 6: Run + commit**

```bash
npm run test:run
npm run typecheck
git add src/main/api/client-registry.ts src/main/api/index.ts \
        src/main/ipc/index.ts src/main/index.ts \
        src/main/ipc/gearing-handler.ts src/main/__tests__/ipc/gearing-handler.integration.test.ts \
        src/main/gearing/summary-refresher.ts src/main/__tests__/gearing/summary-refresher.unit.test.ts \
        src/shared/ipc/gearing.ts
git commit -m "feat(phase-6a): AnthropicClientRegistry replaces single client — gearing + summary resolve per-account"
```

---

## Task 5: CreateAccountModal

**Files:**
- Create: `src/renderer/src/components/layout/CreateAccountModal.tsx`
- Modify: `src/renderer/src/components/layout/styles.css` (extends existing modal styles)

- [ ] **Step 1: Component**

Create `src/renderer/src/components/layout/CreateAccountModal.tsx`. Mirror the pattern of `CreateProjectModal`:

```tsx
import { useEffect, useRef, useState } from 'react'

interface CreateAccountModalProps {
  open: boolean
  onClose: () => void
  onCreate: (input: { label: string; configDir: string; apiKey: string }) => Promise<void>
}

export function CreateAccountModal({ open, onClose, onCreate }: CreateAccountModalProps): JSX.Element | null {
  const [label, setLabel] = useState('')
  const [configDir, setConfigDir] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setLabel('')
      setConfigDir('')
      setApiKey('')
      setError(null)
      setSubmitting(false)
      setTimeout(() => firstFieldRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    const trimmedLabel = label.trim()
    const trimmedConfigDir = configDir.trim()
    const trimmedKey = apiKey.trim()
    if (!trimmedLabel) {
      setError('Label is required.')
      return
    }
    setSubmitting(true)
    try {
      await onCreate({ label: trimmedLabel, configDir: trimmedConfigDir, apiKey: trimmedKey })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-account-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="create-account-title" className="modal__title">Add account</h2>
        <form onSubmit={handleSubmit} className="modal__form">
          <label className="modal__field">
            <span className="modal__label">Label</span>
            <input
              ref={firstFieldRef}
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Personal"
              autoComplete="off"
            />
          </label>
          <label className="modal__field">
            <span className="modal__label">Claude config dir (optional)</span>
            <input
              type="text"
              value={configDir}
              onChange={(e) => setConfigDir(e.target.value)}
              placeholder="C:/Users/you/.claude-personal"
              autoComplete="off"
            />
          </label>
          <label className="modal__field">
            <span className="modal__label">Anthropic API key (optional)</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              autoComplete="off"
            />
            <span className="modal__field-hint">
              Stored in the local DB (see ADR-034). Required for gearing — without it, Gear shows an auth modal.
            </span>
          </label>
          {error && <p className="modal__error">{error}</p>}
          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Append a minor style for `.modal__field-hint`**

Append to `src/renderer/src/components/layout/styles.css`:

```css
.modal__field-hint {
  font-size: 0.8rem;
  color: var(--tl-text-muted);
  margin-top: 0.15rem;
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npm run typecheck
git add src/renderer/src/components/layout/CreateAccountModal.tsx \
        src/renderer/src/components/layout/styles.css
git commit -m "feat(phase-6a): CreateAccountModal — label + config dir + API key form"
```

---

## Task 6: AccountSwitcher "+ New account" + AppShell wiring

**Files:**
- Modify: `src/renderer/src/components/layout/AccountSwitcher.tsx`
- Modify: `src/renderer/src/components/layout/AppShell.tsx`

- [ ] **Step 1: AccountSwitcher gains onCreate**

The Dropdown component renders a flat list. To add a "+ New account" item, the cleanest approach is to:
- Accept `onCreate: () => void` prop
- Render the Dropdown as before, plus a small "+ New account" link/button below it

Simpler design: don't touch the generic Dropdown. Instead wrap it:

```tsx
import { Dropdown, type DropdownItem } from '../common/Dropdown'
import type { Account } from '@shared/types/accounts'

interface AccountSwitcherProps {
  accounts: readonly Account[]
  activeAccountId: number | null
  onSelect: (id: number) => void
  onCreate: () => void
}

export function AccountSwitcher({ accounts, activeAccountId, onSelect, onCreate }: AccountSwitcherProps): JSX.Element {
  const items: readonly DropdownItem[] = accounts.map((a) => ({
    value: String(a.id),
    label: a.label,
    description: a.configDir || '(no config dir)'
  }))
  return (
    <div className="account-switcher">
      <Dropdown
        label="Account:"
        items={items}
        activeValue={activeAccountId !== null ? String(activeAccountId) : ''}
        onSelect={(v) => onSelect(Number(v))}
        fallbackLabel="No account"
      />
      <button
        type="button"
        className="account-switcher__add"
        onClick={onCreate}
        aria-label="Add account"
      >
        +
      </button>
    </div>
  )
}
```

Append a small CSS rule to `src/renderer/src/components/layout/styles.css`:

```css
.account-switcher { display: inline-flex; align-items: center; gap: 0.25rem; }
.account-switcher__add {
  background: transparent;
  border: 1px solid var(--tl-rule-subtle);
  border-radius: 4px;
  width: 1.8rem;
  height: 1.8rem;
  font-size: 1.1rem;
  cursor: pointer;
  color: var(--tl-text-base);
}
.account-switcher__add:hover { background: var(--tl-bg-mute); }
```

- [ ] **Step 2: AppShell — state + handlers**

Edit `src/renderer/src/components/layout/AppShell.tsx`. Add:

```ts
import { CreateAccountModal } from './CreateAccountModal'

// inside the component:
const [createAccountOpen, setCreateAccountOpen] = useState(false)
const { create: createAccount } = useAccounts()

const handleCreateAccount = async (input: { label: string; configDir: string; apiKey: string }): Promise<void> => {
  const created = await createAccount({
    label: input.label,
    configDir: input.configDir,
    apiKey: input.apiKey || null
  })
  if (created) {
    setActiveAccountId(created.id)
    rendererLogger.info('ui', 'account-create', 'Account created', { accountId: created.id, label: created.label })
  }
}
```

(Note: `useAccounts.create` returns the new account on success per Phase 3's hook signature.)

Pass the new prop:

```tsx
<TopBar
  // ... existing props
  onCreateAccount={() => setCreateAccountOpen(true)}
/>
```

…then thread `onCreateAccount` through TopBar → AccountSwitcher. (Or have AppShell mount AccountSwitcher directly — but TopBar is the existing renderer, so thread the prop.)

Mount the modal at the bottom of JSX:

```tsx
<CreateAccountModal
  open={createAccountOpen}
  onClose={() => setCreateAccountOpen(false)}
  onCreate={handleCreateAccount}
/>
```

Edit `src/renderer/src/components/layout/TopBar.tsx`: accept `onCreateAccount` prop, pass to AccountSwitcher.

- [ ] **Step 3: Typecheck + tests + commit**

```bash
npm run typecheck
npm run test:run
git add src/renderer/src/components/layout/AccountSwitcher.tsx \
        src/renderer/src/components/layout/AppShell.tsx \
        src/renderer/src/components/layout/TopBar.tsx \
        src/renderer/src/components/layout/styles.css
git commit -m "feat(phase-6a): AccountSwitcher gains '+' button to open CreateAccountModal; AppShell wires it"
```

---

## Task 7: Composer passes accountId in gear request

**Files:**
- Modify: `src/renderer/src/components/composer/Composer.tsx`
- Modify: `src/renderer/src/components/layout/MainPane.tsx` — verify if it threads activeAccountId
- Modify: `src/renderer/src/components/layout/AppShell.tsx` — pass activeAccountId to MainPane → Composer

Phase 6A's GearingGearRequest gained `accountId: number | null`. The renderer needs to pass it.

- [ ] **Step 1: Thread activeAccountId from AppShell → MainPane → Composer**

Add `accountId: number | null` prop to Composer (defaulting from a new MainPane prop). AppShell already has `activeAccountId` — pass to MainPane:

```tsx
// AppShell
<MainPane conversationId={activeConversationId} accountId={activeAccountId} />

// MainPane
<Composer conversationId={conversationId} accountId={accountId} />
```

- [ ] **Step 2: Composer.runGear passes accountId**

Edit `Composer.tsx`. In `runGear`:

```ts
const result = await window.tokenless.gearing.gear({
  conversationId,
  accountId,  // NEW
  originalPrompt,
  configs: { model, breadth, format, skill: skill || null }
})
```

Update `ComposerProps`:

```ts
interface ComposerProps {
  conversationId: number | null
  accountId: number | null
}
```

- [ ] **Step 3: Typecheck + tests + commit**

```bash
npm run typecheck
npm run test:run
git add src/renderer/src/components/composer/Composer.tsx \
        src/renderer/src/components/layout/MainPane.tsx \
        src/renderer/src/components/layout/AppShell.tsx
git commit -m "feat(phase-6a): Composer threads accountId in gear request — uses active account when no conversation"
```

---

## Task 8: AuthMissingModal — per-account messaging

**Files:**
- Modify: `src/renderer/src/components/notifications/AuthMissingModal.tsx`
- Modify: `src/renderer/src/components/composer/Composer.tsx`

- [ ] **Step 1: Accept optional accountLabel prop**

Edit `AuthMissingModal.tsx`:

```tsx
interface AuthMissingModalProps {
  open: boolean
  onDismiss: () => void
  accountLabel?: string | null
}

export function AuthMissingModal({ open, onDismiss, accountLabel }: AuthMissingModalProps): JSX.Element | null {
  if (!open) return null
  const headline = accountLabel
    ? `Account "${accountLabel}" needs an API key`
    : 'Anthropic API key required'
  const body = accountLabel
    ? `The "${accountLabel}" account has no Anthropic API key configured. Gearing won't work for this account until you add one.`
    : "Gearing uses Claude Haiku via the Anthropic API. TokenLess didn't find an ANTHROPIC_API_KEY for the active account."
  // ... existing rendering using `headline` + `body` instead of hardcoded text
}
```

Update the rendered text to use the new variables. The PowerShell snippet stays (it's a useful fallback for users who don't want to add an account-stored key yet).

- [ ] **Step 2: Composer passes accountLabel**

Edit `Composer.tsx`. Add an `accountLabel: string | null` prop (sourced from AppShell which knows the accounts list + activeAccountId). Pass to AuthMissingModal:

```tsx
<AuthMissingModal
  open={authMissingOpen}
  onDismiss={() => setAuthMissingOpen(false)}
  accountLabel={accountLabel}
/>
```

In AppShell, compute the label:

```ts
const activeAccount = accounts.find((a) => a.id === activeAccountId)
const accountLabel = activeAccount?.label ?? null

// Pass to MainPane → Composer
<MainPane conversationId={activeConversationId} accountId={activeAccountId} accountLabel={accountLabel} />
```

- [ ] **Step 3: Typecheck + tests + commit**

```bash
npm run typecheck
npm run test:run
git add src/renderer/src/components/notifications/AuthMissingModal.tsx \
        src/renderer/src/components/composer/Composer.tsx \
        src/renderer/src/components/layout/MainPane.tsx \
        src/renderer/src/components/layout/AppShell.tsx
git commit -m "feat(phase-6a): AuthMissingModal — per-account messaging when activeAccount has no key"
```

---

## Task 9: Docs + scenarios + tag

**Files:**
- Modify: `docs/observability.md`
- Modify: `docs/test-scenarios.md`

- [ ] **Step 1: observability.md**

Update the `gearing` row with the new events: `summary-refresh-no-account`, `summary-refresh-no-key`. Update `ui` with `account-create`.

- [ ] **Step 2: test-scenarios.md**

Append:

```markdown

## Phase 6A — Multi-account API keys

### S-6A.1 Create a second account with its own key
1. Launch the app with the seeded "Personal" account. Click the `+` next to AccountSwitcher.
2. Fill the modal: label="Work", configDir blank, API key set to a valid `sk-ant-...`. Click Add.
3. **Expect:** "Work" appears in AccountSwitcher and is auto-selected as active. Dev Mode shows `account-create` info log.

### S-6A.2 Gear uses the active account's key
1. Continuing from S-6A.1, type a prompt and click Gear.
2. **Expect:** Gearing succeeds (assuming the key is valid). The Haiku call is billed to the Work account's key, not Personal's.

### S-6A.3 Switch to an account with no key
1. Switch back to "Personal" (which was seeded with no key).
2. Type a prompt and click Gear.
3. **Expect:** `AuthMissingModal` opens with the headline "Account 'Personal' needs an API key". Dismissable.

### S-6A.4 Per-account state survives restart
1. Set up two accounts. Pick one as active. Restart the app.
2. **Expect:** Both accounts still in AccountSwitcher; the previously-active one is active again (Phase 6B may persist this further; for 6A the auto-active behaviour falls back to first-account).

### S-6A.5 Summary refresh respects account boundaries
1. With Account A as the conversation owner (account_id on the row), send a prompt + wait for response-complete.
2. Switch active account to B in the UI.
3. **Expect:** Background summary refresh uses Account A's key (because the conversation's accountId is A), not B's. Dev Mode shows `summary-refresh-ok` for that conversation.
```

- [ ] **Step 3: Tag**

```bash
git add docs/observability.md docs/test-scenarios.md
git commit -m "docs(phase-6a): observability events + Phase 6A manual scenarios"

npm run rebuild:node
npm run typecheck
npm run test:run
# Build + E2E:
npm run rebuild:electron
npm run build
npm run test:e2e
npm run rebuild:node

git tag -s -a v0.13.0-phase-6a -m "Phase 6A complete — per-account ANTHROPIC_API_KEY via AnthropicClientRegistry + CreateAccountModal"
git rev-parse v0.13.0-phase-6a^{commit}
```

---

## Self-Review Checklist

- [ ] **ADR-018 wired:** per-account API key flow from DB → registry → engine
- [ ] **ADR-034 documented:** plaintext storage, Phase 8 keychain migration noted
- [ ] **No new silent catches**
- [ ] **No console.* in src outside tests**
- [ ] **TypeScript strict clean**
- [ ] **Phase 4A's cc:start env wiring (CLAUDE_CONFIG_DIR + ANTHROPIC_API_KEY per account)** still works — verify by smoke check that the cc handler reads account.apiKey correctly

---

## Exit State

**Visible to user:**
- "+" button next to AccountSwitcher opens a modal to add an account with API key
- Newly-created account becomes active
- Gear uses the active account's key (not a global env var)
- AuthMissingModal shows the specific account label that needs a key

**Under the hood:**
- `accounts.api_key_ref` stores literal API keys (per ADR-034)
- `AnthropicClientRegistry` caches per-account clients; resolves on-demand for gearing + summary refresh
- `GearingGearRequest` has optional `accountId` for null-conversation paths

**Phase 6B will deliver:**
- Edit / delete accounts (config dir, label, key)
- Account-level persistence of "last active"
- Skills discovery (chokidar-watched `~/.claude/skills/`, plugin dirs, project-local)
- Optional ANTHROPIC_API_KEY env var fallback when no account is configured

**Tag:** `v0.13.0-phase-6a`
