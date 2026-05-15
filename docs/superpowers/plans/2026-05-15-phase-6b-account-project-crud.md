# Phase 6B: Account + Project CRUD Parity + UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring account and project management to full CRUD parity, persist last-active selections across restarts, and resolve the highest-priority demo-derived UX issues that naturally cluster with switcher/modal work. Phase 6A wired per-account API keys but only landed account `create`; you couldn't edit a key, delete an account, or update a project rootPath after creation. Phase 6B closes those gaps. The phase also fixes the Project/Account dropdown z-index bug (caught in live demo) and adds project rootPath validation so the Windows `ERROR_DIRECTORY 267` cryptic spawn failure becomes a clean inline modal error.

**Architecture:** A new `SettingsDao` provides a thin key/value façade over the existing `settings` table (schema landed Phase 3, never wired). Two specific keys are introduced this phase: `lastActiveAccountId` and `lastActiveProjectId`. The renderer reads them on mount to pre-select activeAccountId/activeProjectId, and writes them on every selection change. `AccountsDao` gains `updateAccount` + `deleteAccount`; the handler invalidates the `AnthropicClientRegistry` cache when an account's `apiKey` changes (or the account is deleted). `ProjectsDao` already has `updateProject` + `deleteProject` from Phase 3 — Phase 6B just wires UI. Edit modals mirror the Create modal pattern (`EditAccountModal`, `EditProjectModal`). Delete uses a tiny shared `ConfirmModal` (or the OS-native `window.confirm` for v1 — keep it simple). The Dropdown z-index fix bumps `--tl-z-dropdown` above `--tl-z-gear-review` AND audits the parent stacking context — likely Composer or MainPane is establishing a stacking context that traps the menu. rootPath validation introduces a `paths:check-dir` IPC that returns `{ exists: boolean, isDirectory: boolean }`; CreateProjectModal calls it inline before submit and shows a "Directory doesn't exist" hint when false.

**Out of scope for Phase 6B (→ Phase 6C / later):**
- Skills discovery (chokidar-watched `~/.claude/skills/`, plugin dirs, project-local) — Phase 6C
- Telemetry summary view (cost-over-time) — Phase 6C
- Optional `ANTHROPIC_API_KEY` env var fallback — defer; Phase 6A removed it deliberately, and 6B's "edit account → add key" is the supported recovery path
- Settings page proper (full UI per spec §2 `/settings` route) — Phase 8

---

## File Structure

**New files (main):**
- `src/main/db/dao/settings.ts` — `SettingsDao` (get / set / delete)
- `src/main/__tests__/db/dao-settings.integration.test.ts`
- `src/main/ipc/settings-handler.ts`
- `src/main/__tests__/ipc/settings-handler.integration.test.ts`
- `src/main/ipc/paths-handler.ts` — fs.existsSync + statSync wrapper for rootPath validation
- `src/main/__tests__/ipc/paths-handler.integration.test.ts`

**New files (shared):**
- `src/shared/ipc/settings.ts` — channels + payloads
- `src/shared/ipc/paths.ts` — channels + payloads

**New files (renderer):**
- `src/renderer/src/components/layout/EditAccountModal.tsx`
- `src/renderer/src/components/layout/EditProjectModal.tsx`
- `src/renderer/src/components/common/ConfirmModal.tsx` — small cross-cutting confirm dialog
- `src/renderer/src/hooks/use-settings.ts` — thin get/set with caching

**Modified files:**
- `src/main/db/dao/accounts.ts` — add `updateAccount(input)` + `deleteAccount(id)`
- `src/main/__tests__/db/dao-accounts.integration.test.ts` — add tests for the new methods
- `src/main/db/index.ts` — barrel SettingsDao
- `src/shared/ipc/accounts.ts` — add `accounts:update` + `accounts:delete` channels + types
- `src/shared/ipc.ts` — re-export new channels (settings, paths, accounts update/delete)
- `src/main/ipc/accounts-handler.ts` — add update + delete methods; invalidate ClientRegistry on key change / delete
- `src/main/__tests__/ipc/accounts-handler.integration.test.ts` — update + delete tests including registry invalidation
- `src/main/ipc/index.ts` — register SettingsHandler + PathsHandler; pass ClientRegistry to AccountsHandler so it can invalidate
- `src/preload/index.ts` + `index.d.ts` — expose `accounts.update/delete`, `settings.{get,set}`, `paths.checkDir`
- `src/renderer/src/hooks/use-accounts.ts` — already has `update` and `remove` exposed but they call `update`/`delete` IPCs that didn't exist; verify and connect
- `src/renderer/src/components/layout/AccountSwitcher.tsx` — add an "✎ Edit" affordance for the active account (or per-item)
- `src/renderer/src/components/layout/ProjectSwitcher.tsx` — add an "✎ Edit" affordance for the active project
- `src/renderer/src/components/layout/AppShell.tsx` — mount EditAccountModal + EditProjectModal + ConfirmModal; thread state; on activeAccountId / activeProjectId change, write to settings; on mount, read from settings to pre-select
- `src/renderer/src/components/layout/CreateProjectModal.tsx` — debounced inline rootPath validation via `paths.checkDir`
- `src/renderer/src/theme/tokens.css` — bump `--tl-z-dropdown` token
- `src/renderer/src/components/common/styles.css` — verify Dropdown menu uses the token correctly; remove any stacking-context-trap from parents (likely a `transform` or `position: relative` without explicit z-index on `.composer` or `.main-pane`)
- `docs/decisions.md` — ADR-035 (last-active persistence schema choice)
- `docs/observability.md` — extend `db` row with settings events; `ui` row with edit/delete events
- `docs/test-scenarios.md` — Phase 6B scenarios

---

## Task 1: SettingsDao + IPC + preload + key/value store

**Files:**
- Create: `src/main/db/dao/settings.ts`
- Create: `src/main/__tests__/db/dao-settings.integration.test.ts`
- Create: `src/shared/ipc/settings.ts`
- Modify: `src/shared/ipc.ts` (re-export)
- Modify: `src/main/db/index.ts` (barrel)

- [ ] **Step 1: Failing DAO test**

Create `src/main/__tests__/db/dao-settings.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { getSetting, setSetting, deleteSetting } from '../../db/dao/settings'

describe('db/dao/settings', () => {
  let db: Database
  beforeEach(() => { db = createTestDb() })

  it('getSetting returns null for unknown key', () => {
    expect(getSetting(db, 'doesNotExist')).toBeNull()
  })

  it('setSetting persists a value; getSetting reads it back', () => {
    setSetting(db, 'lastActiveAccountId', '42')
    expect(getSetting(db, 'lastActiveAccountId')).toBe('42')
  })

  it('setSetting overwrites on conflict (UPSERT)', () => {
    setSetting(db, 'k', 'v1')
    setSetting(db, 'k', 'v2')
    expect(getSetting(db, 'k')).toBe('v2')
  })

  it('deleteSetting removes the key', () => {
    setSetting(db, 'k', 'v')
    expect(deleteSetting(db, 'k')).toBe(true)
    expect(getSetting(db, 'k')).toBeNull()
  })

  it('deleteSetting returns false for non-existent key', () => {
    expect(deleteSetting(db, 'missing')).toBe(false)
  })
})
```

- [ ] **Step 2: Run failure**

```bash
npm run test:run -- src/main/__tests__/db/dao-settings.integration.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement DAO**

Create `src/main/db/dao/settings.ts`:

```ts
// SettingsDao — thin key/value façade over the `settings` table.
// Schema: settings(key TEXT PRIMARY KEY, value TEXT).
// Use for app-wide singleton state: lastActiveAccountId, lastActiveProjectId,
// future theme preferences, etc. Values are always strings — callers
// stringify/parse JSON if they need structured data.

import type { Database } from 'better-sqlite3'

interface SettingRow {
  key: string
  value: string | null
}

export function getSetting(db: Database, key: string): string | null {
  const row = db
    .prepare<[string], SettingRow>('SELECT value FROM settings WHERE key = ?')
    .get(key)
  return row?.value ?? null
}

export function setSetting(db: Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value)
}

export function deleteSetting(db: Database, key: string): boolean {
  const result = db.prepare('DELETE FROM settings WHERE key = ?').run(key)
  return result.changes > 0
}
```

- [ ] **Step 4: Shared IPC types**

Create `src/shared/ipc/settings.ts`:

```ts
import type { IpcResult } from './envelope'

export const IPC_SETTINGS_GET = 'settings:get'
export const IPC_SETTINGS_SET = 'settings:set'

export interface SettingsGetRequest { readonly key: string }
export interface SettingsGetResponse { readonly value: string | null }
export interface SettingsSetRequest { readonly key: string; readonly value: string }
export interface SettingsSetResponse { readonly ok: true }

export type SettingsGetResult = IpcResult<SettingsGetResponse>
export type SettingsSetResult = IpcResult<SettingsSetResponse>
```

Re-export from `src/shared/ipc.ts` + add `'settings:get' | 'settings:set'` to `IpcChannelName` union.

- [ ] **Step 5: Update DB barrel**

Edit `src/main/db/index.ts`:

```ts
export * as SettingsDao from './dao/settings'
```

- [ ] **Step 6: Run + commit**

```bash
npm run test:run -- src/main/__tests__/db/dao-settings.integration.test.ts
npm run typecheck
git add src/main/db/dao/settings.ts src/main/db/index.ts \
        src/main/__tests__/db/dao-settings.integration.test.ts \
        src/shared/ipc/settings.ts src/shared/ipc.ts
git commit -m "feat(phase-6b): SettingsDao key/value store + shared IPC types (Phase 3 schema finally wired)"
```

---

## Task 2: SettingsHandler IPC + preload + useSettings hook

**Files:**
- Create: `src/main/ipc/settings-handler.ts`
- Create: `src/main/__tests__/ipc/settings-handler.integration.test.ts`
- Modify: `src/main/ipc/index.ts` (register)
- Modify: `src/preload/index.ts` + `index.d.ts` (expose `settings.{get,set}`)
- Create: `src/renderer/src/hooks/use-settings.ts`

- [ ] **Step 1: Handler test**

Create `src/main/__tests__/ipc/settings-handler.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { SettingsHandler } from '../../ipc/settings-handler'
import { Logger } from '../../observability/logger'

function makeLogger(): Logger {
  return new Logger(
    { write: vi.fn(), append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100, 'main'
  )
}

describe('ipc/settings-handler', () => {
  let db: Database
  let handler: SettingsHandler

  beforeEach(() => {
    db = createTestDb()
    handler = new SettingsHandler(db, makeLogger())
  })

  it('get returns null for unknown key', async () => {
    const r = await handler.get({ key: 'nope' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.value).toBeNull()
  })

  it('set persists; get reads it back', async () => {
    await handler.set({ key: 'theme', value: 'dark' })
    const r = await handler.get({ key: 'theme' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.value).toBe('dark')
  })
})
```

- [ ] **Step 2: Implement handler**

Create `src/main/ipc/settings-handler.ts`:

```ts
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Database } from 'better-sqlite3'

import { SettingsDao } from '../db'
import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'

import {
  IPC_SETTINGS_GET,
  IPC_SETTINGS_SET,
  type SettingsGetRequest,
  type SettingsGetResult,
  type SettingsSetRequest,
  type SettingsSetResult
} from '@shared/ipc/settings'

export class SettingsHandler {
  private installedHandlers: string[] = []

  constructor(private readonly db: Database, private readonly logger: Logger) {}

  get = async (req: SettingsGetRequest): Promise<SettingsGetResult> =>
    withIpcResult(this.logger, 'db', 'settings-get', async () => {
      return { value: SettingsDao.getSetting(this.db, req.key) }
    })

  set = async (req: SettingsSetRequest): Promise<SettingsSetResult> =>
    withIpcResult(this.logger, 'db', 'settings-set', async () => {
      SettingsDao.setSetting(this.db, req.key, req.value)
      return { ok: true as const }
    })

  install(ipcMain: IpcMain): void {
    const wrap = <Req, Res>(channel: string, fn: (req: Req) => Promise<Res>): void => {
      ipcMain.handle(channel, async (_e: IpcMainInvokeEvent, req: Req) => fn(req))
      this.installedHandlers.push(channel)
    }
    wrap<SettingsGetRequest, SettingsGetResult>(IPC_SETTINGS_GET, this.get)
    wrap<SettingsSetRequest, SettingsSetResult>(IPC_SETTINGS_SET, this.set)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
```

- [ ] **Step 3: Wire into main/ipc/index.ts**

Edit `src/main/ipc/index.ts`:

```ts
import { SettingsHandler } from './settings-handler'

// inside registerIpcHandlers:
const settingsHandler = new SettingsHandler(db, logger)
settingsHandler.install(ipcMain)

// add to IpcRegistration interface + return; uninstall in uninstallAll
```

- [ ] **Step 4: Preload exposure**

Edit `src/preload/index.ts`. Add `settings: { get, set }` namespace using `ipcRenderer.invoke`. Update `src/preload/index.d.ts` to declare it.

- [ ] **Step 5: useSettings hook**

Create `src/renderer/src/hooks/use-settings.ts`:

```ts
// Thin async accessor for settings:get / settings:set. Phase 6B uses this for
// lastActiveAccountId / lastActiveProjectId persistence. Phase 8 may add a
// React-Context-backed cache for synchronous reads, but for now async-on-mount
// is fine — these reads happen once per app launch.

import type { SettingsGetResult, SettingsSetResult } from '@shared/ipc/settings'

export async function readSetting(key: string): Promise<string | null> {
  const result: SettingsGetResult = await window.tokenless.settings.get({ key })
  return result.ok ? result.data.value : null
}

export async function writeSetting(key: string, value: string): Promise<void> {
  const result: SettingsSetResult = await window.tokenless.settings.set({ key, value })
  if (!result.ok) {
    // Settings failures are non-critical — log via renderer logger upstream.
    // The caller decides whether to surface.
    throw new Error(`Failed to write setting ${key}: ${result.error.message}`)
  }
}

export const SETTING_LAST_ACTIVE_ACCOUNT_ID = 'lastActiveAccountId'
export const SETTING_LAST_ACTIVE_PROJECT_ID = 'lastActiveProjectId'
```

- [ ] **Step 6: Typecheck + tests + commit**

```bash
npm run typecheck
npm run test:run
git add src/main/ipc/settings-handler.ts src/main/__tests__/ipc/settings-handler.integration.test.ts \
        src/main/ipc/index.ts src/preload/index.ts src/preload/index.d.ts \
        src/renderer/src/hooks/use-settings.ts
git commit -m "feat(phase-6b): SettingsHandler IPC + preload exposure + readSetting/writeSetting renderer helpers"
```

---

## Task 3: AccountsDao + AccountsHandler — update + delete with registry invalidation

**Files:**
- Modify: `src/main/db/dao/accounts.ts` — add `updateAccount` + `deleteAccount`
- Modify: `src/main/__tests__/db/dao-accounts.integration.test.ts` — add tests
- Modify: `src/shared/ipc/accounts.ts` — add channels + types
- Modify: `src/shared/ipc.ts` — re-export
- Modify: `src/main/ipc/accounts-handler.ts` — wire + invalidate registry
- Modify: `src/main/__tests__/ipc/accounts-handler.integration.test.ts`
- Modify: `src/main/ipc/index.ts` — pass clientRegistry to AccountsHandler

- [ ] **Step 1: Extend DAO + tests**

Edit `src/main/db/dao/accounts.ts`. Add `UpdateAccountInput`:

```ts
export interface UpdateAccountInput {
  readonly id: number
  readonly label?: string
  readonly configDir?: string
  readonly apiKey?: string | null
}

export function updateAccount(db: Database, input: UpdateAccountInput): Account | null {
  const current = getAccountById(db, input.id)
  if (!current) return null
  const next = {
    label: input.label ?? current.label,
    configDir: input.configDir ?? current.configDir,
    apiKey: input.apiKey !== undefined ? input.apiKey : current.apiKey
  }
  db.prepare(
    'UPDATE accounts SET label = ?, config_dir = ?, api_key_ref = ? WHERE id = ?'
  ).run(next.label, next.configDir, next.apiKey, input.id)
  return getAccountById(db, input.id)
}

export function deleteAccount(db: Database, id: number): boolean {
  const result = db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
  return result.changes > 0
}
```

Also export the new interface.

Add tests to `src/main/__tests__/db/dao-accounts.integration.test.ts`:

```ts
import { updateAccount, deleteAccount } from '../../db/dao/accounts'

// ... new describe block or appended tests

it('updateAccount patches only specified fields, preserves others', () => {
  const a = createAccount(db, { label: 'Personal', configDir: '/p', apiKey: 'k1' })
  const updated = updateAccount(db, { id: a.id, label: 'Renamed' })
  expect(updated?.label).toBe('Renamed')
  expect(updated?.configDir).toBe('/p')
  expect(updated?.apiKey).toBe('k1')
})

it('updateAccount can set apiKey to null', () => {
  const a = createAccount(db, { label: 'X', configDir: '/x', apiKey: 'k' })
  const updated = updateAccount(db, { id: a.id, apiKey: null })
  expect(updated?.apiKey).toBeNull()
})

it('updateAccount returns null for unknown id', () => {
  expect(updateAccount(db, { id: 99999, label: 'X' })).toBeNull()
})

it('deleteAccount removes the row', () => {
  const a = createAccount(db, { label: 'Doomed', configDir: '/d' })
  expect(deleteAccount(db, a.id)).toBe(true)
  expect(getAccountById(db, a.id)).toBeNull()
})

it('deleteAccount returns false for unknown id', () => {
  expect(deleteAccount(db, 99999)).toBe(false)
})
```

- [ ] **Step 2: Shared types + IPC channels**

Edit `src/shared/ipc/accounts.ts`. Add:

```ts
export const IPC_ACCOUNTS_UPDATE = 'accounts:update'
export const IPC_ACCOUNTS_DELETE = 'accounts:delete'

export interface AccountsUpdateRequest {
  readonly input: UpdateAccountInput  // import from types
}
export interface AccountsUpdateResponse {
  readonly account: Account
}
export interface AccountsDeleteRequest {
  readonly id: number
}
export interface AccountsDeleteResponse {
  readonly id: number
}

export type AccountsUpdateResult = IpcResult<AccountsUpdateResponse>
export type AccountsDeleteResult = IpcResult<AccountsDeleteResponse>
```

The `UpdateAccountInput` import comes from `../types/accounts` — add it to `src/shared/types/accounts.ts` (mirroring main's DAO):

```ts
export interface UpdateAccountInput {
  readonly id: number
  readonly label?: string
  readonly configDir?: string
  readonly apiKey?: string | null
}
```

Re-export from `src/shared/ipc.ts` + add to IpcChannelName union.

- [ ] **Step 3: AccountsHandler update + delete with registry invalidation**

Edit `src/main/ipc/accounts-handler.ts`. The constructor signature needs to gain `clientRegistry: AnthropicClientRegistry`:

```ts
constructor(
  private readonly db: Database,
  private readonly logger: Logger,
  private readonly broadcast: Broadcast,
  private readonly clientRegistry: AnthropicClientRegistry
) {}
```

Add methods:

```ts
update = async (req: AccountsUpdateRequest): Promise<AccountsUpdateResult> =>
  withIpcResult(this.logger, 'db', 'accounts-update', async () => {
    const account = AccountsDao.updateAccount(this.db, req.input)
    if (!account) {
      const e = new Error('Account not found') as Error & { code?: string }
      e.code = 'NOT_FOUND'
      throw e
    }
    // Invalidate cached AnthropicClient for this account — if the apiKey
    // changed, the next gear call needs a fresh client with the new key.
    this.clientRegistry.invalidate(account.id)
    this.broadcast(IPC_ACCOUNTS_CHANGED, undefined)
    return { account }
  })

delete = async (req: AccountsDeleteRequest): Promise<AccountsDeleteResult> =>
  withIpcResult(this.logger, 'db', 'accounts-delete', async () => {
    const removed = AccountsDao.deleteAccount(this.db, req.id)
    if (!removed) {
      const e = new Error('Account not found') as Error & { code?: string }
      e.code = 'NOT_FOUND'
      throw e
    }
    this.clientRegistry.invalidate(req.id)
    this.broadcast(IPC_ACCOUNTS_CHANGED, undefined)
    return { id: req.id }
  })
```

Wire them into `install(ipcMain)`.

- [ ] **Step 4: Wire ClientRegistry into AccountsHandler at construction**

Edit `src/main/ipc/index.ts`:

```ts
const accountsHandler = new AccountsHandler(db, logger, broadcast, clientRegistry)
```

(The clientRegistry was already in scope from Phase 6A.)

- [ ] **Step 5: AccountsHandler tests for update + delete**

Append to `src/main/__tests__/ipc/accounts-handler.integration.test.ts`:

```ts
it('update returns ok with the updated account + broadcasts + invalidates registry', async () => {
  // ... use a mock registry to assert invalidate was called
})

it('delete returns ok + broadcasts + invalidates registry', async () => {
  // ... same pattern
})

it('update returns NOT_FOUND for unknown id', async () => {
  // ...
})
```

The test setup needs to construct AccountsHandler with a real or mock AnthropicClientRegistry. Use the existing factory pattern: `new AnthropicClientRegistry(logger, () => new MockAnthropicClient({}))`. Then spy on `invalidate`:

```ts
const registry = new AnthropicClientRegistry(logger, () => new MockAnthropicClient({}))
const invalidateSpy = vi.spyOn(registry, 'invalidate')
handler = new AccountsHandler(db, logger, broadcast, registry)
// ... after handler.update or handler.delete:
expect(invalidateSpy).toHaveBeenCalledWith(account.id)
```

- [ ] **Step 6: Preload exposure**

Edit `src/preload/index.ts`. Add `accounts.update + accounts.delete` methods using `ipcRenderer.invoke`. Update `index.d.ts`.

- [ ] **Step 7: Run + commit**

```bash
npm run test:run
npm run typecheck
git add src/main/db/dao/accounts.ts src/main/__tests__/db/dao-accounts.integration.test.ts \
        src/shared/types/accounts.ts src/shared/ipc/accounts.ts src/shared/ipc.ts \
        src/main/ipc/accounts-handler.ts src/main/__tests__/ipc/accounts-handler.integration.test.ts \
        src/main/ipc/index.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(phase-6b): AccountsDao + Handler update/delete with AnthropicClientRegistry invalidation"
```

---

## Task 4: useAccounts hook — wire update + remove to real IPCs

Phase 3 added `update` and `remove` to the hook's return shape but they called channels that didn't exist (returned NOT_FOUND envelopes). Now that the channels exist:

**Files:**
- Modify: `src/renderer/src/hooks/use-accounts.ts`

- [ ] **Step 1: Audit current hook**

Read `src/renderer/src/hooks/use-accounts.ts` and check whether `update`/`remove` are already declared. If yes, they may already call `window.tokenless.accounts.update` / `.delete` — those will now succeed. If the methods don't exist in the hook, add them:

```ts
const update = useCallback(async (input: UpdateAccountInput): Promise<Account | null> => {
  const result = await window.tokenless.accounts.update({ input })
  return result.ok ? result.data.account : null
}, [])

const remove = useCallback(async (id: number): Promise<boolean> => {
  const result = await window.tokenless.accounts.delete({ id })
  return result.ok
}, [])

return { accounts, loading, error, refetch: fetchAccounts, create, update, remove }
```

- [ ] **Step 2: Commit**

```bash
npm run typecheck
git add src/renderer/src/hooks/use-accounts.ts
git commit -m "feat(phase-6b): useAccounts.update/remove wired to real IPC handlers"
```

---

## Task 5: PathsHandler — rootPath existence check

**Files:**
- Create: `src/shared/ipc/paths.ts` — channels
- Create: `src/main/ipc/paths-handler.ts`
- Create: `src/main/__tests__/ipc/paths-handler.integration.test.ts`
- Modify: `src/shared/ipc.ts` — re-export
- Modify: `src/main/ipc/index.ts` — register
- Modify: `src/preload/index.ts` + `index.d.ts` — expose

- [ ] **Step 1: Shared types**

Create `src/shared/ipc/paths.ts`:

```ts
import type { IpcResult } from './envelope'

export const IPC_PATHS_CHECK_DIR = 'paths:check-dir'

export interface PathsCheckDirRequest { readonly path: string }
export interface PathsCheckDirResponse {
  readonly exists: boolean
  readonly isDirectory: boolean
}

export type PathsCheckDirResult = IpcResult<PathsCheckDirResponse>
```

Re-export from `src/shared/ipc.ts` + add `'paths:check-dir'` to IpcChannelName union.

- [ ] **Step 2: Handler + test**

Create `src/main/__tests__/ipc/paths-handler.integration.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PathsHandler } from '../../ipc/paths-handler'
import { Logger } from '../../observability/logger'

function makeLogger(): Logger {
  return new Logger(
    { write: vi.fn(), append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100, 'main'
  )
}

describe('ipc/paths-handler', () => {
  const handler = new PathsHandler(makeLogger())

  it('checkDir returns exists=true + isDirectory=true for a real directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tl-paths-'))
    try {
      const result = await handler.checkDir({ path: dir })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.exists).toBe(true)
        expect(result.data.isDirectory).toBe(true)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('checkDir returns exists=false for non-existent path', async () => {
    const result = await handler.checkDir({ path: 'C:/this/path/does/not/exist/12345' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.exists).toBe(false)
      expect(result.data.isDirectory).toBe(false)
    }
  })

  it('checkDir returns exists=true + isDirectory=false for a file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tl-paths-'))
    const file = join(dir, 'a.txt')
    writeFileSync(file, 'x')
    try {
      const result = await handler.checkDir({ path: file })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.exists).toBe(true)
        expect(result.data.isDirectory).toBe(false)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
```

Create `src/main/ipc/paths-handler.ts`:

```ts
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { existsSync, statSync } from 'node:fs'

import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'

import {
  IPC_PATHS_CHECK_DIR,
  type PathsCheckDirRequest,
  type PathsCheckDirResult
} from '@shared/ipc/paths'

export class PathsHandler {
  private installedHandlers: string[] = []

  constructor(private readonly logger: Logger) {}

  checkDir = async (req: PathsCheckDirRequest): Promise<PathsCheckDirResult> =>
    withIpcResult(this.logger, 'fs', 'paths-check-dir', async () => {
      const exists = existsSync(req.path)
      if (!exists) return { exists: false, isDirectory: false }
      try {
        const s = statSync(req.path)
        return { exists: true, isDirectory: s.isDirectory() }
      } catch {
        return { exists: false, isDirectory: false }
      }
    })

  install(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_PATHS_CHECK_DIR, async (_e: IpcMainInvokeEvent, req: PathsCheckDirRequest) =>
      this.checkDir(req)
    )
    this.installedHandlers.push(IPC_PATHS_CHECK_DIR)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
```

- [ ] **Step 3: Wire into main + preload**

Edit `src/main/ipc/index.ts` — instantiate + install + add to IpcRegistration. Edit `src/preload/index.ts` + `index.d.ts` to expose `paths.checkDir`.

- [ ] **Step 4: Run + commit**

```bash
npm run test:run -- src/main/__tests__/ipc/paths-handler.integration.test.ts
git add src/shared/ipc/paths.ts src/shared/ipc.ts \
        src/main/ipc/paths-handler.ts src/main/__tests__/ipc/paths-handler.integration.test.ts \
        src/main/ipc/index.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(phase-6b): PathsHandler — paths:check-dir IPC for rootPath validation"
```

---

## Task 6: CreateProjectModal rootPath validation

**Files:**
- Modify: `src/renderer/src/components/layout/CreateProjectModal.tsx`

- [ ] **Step 1: Inline validation**

Edit `src/renderer/src/components/layout/CreateProjectModal.tsx`. Read current shape; add a debounced `useEffect` that calls `window.tokenless.paths.checkDir({ path: rootPath })` 400ms after rootPath changes, sets a `pathError: string | null` state. On submit, also re-check synchronously — if invalid, show error and don't call `onCreate`.

Pseudo:

```ts
const [pathError, setPathError] = useState<string | null>(null)

useEffect(() => {
  if (!rootPath.trim()) { setPathError(null); return undefined }
  const timer = setTimeout(async () => {
    const result = await window.tokenless.paths.checkDir({ path: rootPath.trim() })
    if (!result.ok) { setPathError(null); return }
    if (!result.data.exists) setPathError("Directory doesn't exist on disk.")
    else if (!result.data.isDirectory) setPathError('Path points to a file, not a directory.')
    else setPathError(null)
  }, 400)
  return () => clearTimeout(timer)
}, [rootPath])

// In handleSubmit:
if (pathError) {
  setError(pathError)
  return
}
```

Show the inline hint below the rootPath field (use `modal__field-hint` style but make the color danger when error):

```tsx
{pathError && <span className="modal__field-error">{pathError}</span>}
```

Add a CSS rule for `.modal__field-error` (red text, small).

- [ ] **Step 2: Commit**

```bash
npm run typecheck
git add src/renderer/src/components/layout/CreateProjectModal.tsx \
        src/renderer/src/components/layout/styles.css
git commit -m "feat(phase-6b): CreateProjectModal validates rootPath against disk via paths.checkDir"
```

---

## Task 7: Dropdown z-index fix

**Files:**
- Modify: `src/renderer/src/theme/tokens.css`
- Modify: `src/renderer/src/components/common/styles.css` (verify Dropdown menu uses the token)
- Audit: `src/renderer/src/components/composer/styles.css`, `gear-review/styles.css`, layout for stacking-context traps

- [ ] **Step 1: Inspect current z-index tokens**

Read `src/renderer/src/theme/tokens.css`. Current tokens (per Phase 4A history):
```
--tl-z-dropdown: 50
--tl-z-dev-mode: 100
--tl-z-modal: 200
--tl-z-gear-review: 210
--tl-z-toast: 300
```

The dropdown menu (when expanded) is sandwiched below `--tl-z-modal` etc., which is correct — but the parent (TopBar) may be creating a stacking context that limits the dropdown menu's absolute positioning to its parent.

- [ ] **Step 2: Audit the Dropdown component CSS**

Open `src/renderer/src/components/common/styles.css`. Find `.dropdown-menu` (or similar). Verify:
- Uses `position: absolute`
- Uses `z-index: var(--tl-z-dropdown)` (or similar — should reference the token)
- Parent `.dropdown` has `position: relative` (creates positioning ancestor but NOT a stacking context unless it has `transform`, `filter`, `will-change`, `isolation: isolate`, or `z-index: <non-auto>` plus `position: relative`)

Likely cause: the parent stacking context is from `.composer` or `.main-pane` having `position: relative` + some other property. The dropdown menu's `z-index: 50` only competes within its own stacking context — if that context's outer z-index is lower than `.composer`'s 0, the menu paints below `.composer`.

- [ ] **Step 3: Apply fix**

The cleanest fix: hoist the dropdown menu OUT of its parent's stacking context. Two approaches:

A) Use a React portal to render the menu in a top-level `<div id="dropdown-portal">`. More work but isolates the issue.

B) Add `isolation: isolate` to `.top-bar` (or similar parent) AND raise the menu's z-index to be HIGHER than any other stacking context. Increase `--tl-z-dropdown` to `1000`.

Go with B for Phase 6B (smaller change). If it doesn't work, fall back to portal in Phase 8.

Edit `src/renderer/src/theme/tokens.css`:
```css
--tl-z-dropdown: 1000;
```

Edit `src/renderer/src/components/common/styles.css` `.dropdown-menu` rule to ensure it uses `z-index: var(--tl-z-dropdown)`.

Also verify `.top-bar` doesn't have a `transform` or other property that creates a stacking context. If it does, the dropdown menu is trapped — moving its z-index doesn't help. In that case, remove the trap or use a portal.

Verify by manual demo: launch dev, click a dropdown → menu should now overlay MainPane.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/theme/tokens.css src/renderer/src/components/common/styles.css
git commit -m "fix(phase-6b): bump --tl-z-dropdown to 1000 so Dropdown menus paint above MainPane"
```

---

## Task 8: EditAccountModal + AccountSwitcher edit affordance

**Files:**
- Create: `src/renderer/src/components/layout/EditAccountModal.tsx`
- Modify: `src/renderer/src/components/layout/AccountSwitcher.tsx`
- Modify: `src/renderer/src/components/layout/TopBar.tsx` + `AppShell.tsx`

- [ ] **Step 1: EditAccountModal**

Create `src/renderer/src/components/layout/EditAccountModal.tsx`. Mirror CreateAccountModal but pre-fill from an `account: Account | null` prop, and the submit calls `onUpdate({ id, label, configDir, apiKey })` instead of `onCreate`.

Also add a "Delete account" button at the bottom (next to Cancel/Save), with a confirmation step. For simplicity: use `window.confirm('Delete account "<label>"? This cannot be undone.')` — Phase 8 can replace with a styled ConfirmModal.

```tsx
interface EditAccountModalProps {
  open: boolean
  account: Account | null
  onClose: () => void
  onUpdate: (input: UpdateAccountInput) => Promise<void>
  onDelete: (id: number) => Promise<void>
}
```

Pre-fill state from `account` when modal opens. Show the API key as `type="password"` so it doesn't render the existing key in plaintext — but the user can replace it. If they leave it blank, the existing key is preserved (the update applies the form value; if the form value equals the stored value, no semantic change).

Wait — actually the right UX: showing the existing key (even masked) lets the user know "there IS a key" vs "this account has no key." For Phase 6B: render the existing key INPUT field pre-populated with the stored value (still `type="password"` so it's dots). The user can replace it or leave it. If they clear the field, that's an explicit "remove the key" action — the update sets apiKey=null.

```tsx
const [apiKey, setApiKey] = useState(account?.apiKey ?? '')
```

- [ ] **Step 2: AccountSwitcher edit button**

Edit `src/renderer/src/components/layout/AccountSwitcher.tsx`. Add an "✎" button next to the existing "+" button. It calls `onEdit` (new prop). The edit always targets the ACTIVE account (the dropdown's selected value).

```tsx
{activeAccountId !== null && (
  <button
    type="button"
    className="account-switcher__edit"
    onClick={onEdit}
    aria-label="Edit active account"
  >
    ✎
  </button>
)}
```

Add a matching style in `layout/styles.css`.

- [ ] **Step 3: AppShell + TopBar wiring**

TopBar accepts new `onEditAccount` prop, passes to AccountSwitcher.

AppShell:
```ts
const [editAccountOpen, setEditAccountOpen] = useState(false)
const { update: updateAccount, remove: removeAccount } = useAccounts()
const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null

const handleUpdateAccount = async (input: UpdateAccountInput): Promise<void> => {
  const updated = await updateAccount(input)
  if (updated) {
    rendererLogger.info('ui', 'account-update', 'Account updated', { accountId: updated.id })
  }
}

const handleDeleteAccount = async (id: number): Promise<void> => {
  const removed = await removeAccount(id)
  if (removed) {
    rendererLogger.info('ui', 'account-delete', 'Account deleted', { accountId: id })
    // If the deleted account was active, fall back to the first remaining
    if (activeAccountId === id) setActiveAccountId(accounts.find((a) => a.id !== id)?.id ?? null)
  }
}

// In JSX:
<EditAccountModal
  open={editAccountOpen}
  account={activeAccount}
  onClose={() => setEditAccountOpen(false)}
  onUpdate={handleUpdateAccount}
  onDelete={handleDeleteAccount}
/>
```

Pass `onEditAccount={() => setEditAccountOpen(true)}` to TopBar.

- [ ] **Step 4: Commit**

```bash
npm run typecheck
npm run test:run
git add src/renderer/src/components/layout/EditAccountModal.tsx \
        src/renderer/src/components/layout/AccountSwitcher.tsx \
        src/renderer/src/components/layout/TopBar.tsx \
        src/renderer/src/components/layout/AppShell.tsx \
        src/renderer/src/components/layout/styles.css
git commit -m "feat(phase-6b): EditAccountModal — edit label/configDir/apiKey + delete with confirm"
```

---

## Task 9: EditProjectModal + ProjectSwitcher edit affordance

Same pattern as Task 8 for projects. Project handlers/DAO already exist from Phase 3.

**Files:**
- Create: `src/renderer/src/components/layout/EditProjectModal.tsx`
- Modify: `src/renderer/src/components/layout/ProjectSwitcher.tsx`
- Modify: `src/renderer/src/components/layout/TopBar.tsx` + `AppShell.tsx`

- [ ] **Step 1: EditProjectModal** — mirror EditAccountModal pattern but for `Project`. Fields: name, rootPath. rootPath uses the same `paths.checkDir` validation as CreateProjectModal (factor into a shared helper if it feels duplicated, otherwise inline both).

- [ ] **Step 2: ProjectSwitcher edit button** — add "✎" next to "+".

- [ ] **Step 3: AppShell** — `useProjects.update/remove`, `handleUpdateProject/handleDeleteProject`, mount modal.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(phase-6b): EditProjectModal — parity with EditAccountModal; reuses paths.checkDir validation"
```

---

## Task 10: Last-active persistence wiring

**Files:**
- Modify: `src/renderer/src/components/layout/AppShell.tsx`

- [ ] **Step 1: On mount, read last-active settings**

In AppShell:

```ts
import { readSetting, writeSetting, SETTING_LAST_ACTIVE_ACCOUNT_ID, SETTING_LAST_ACTIVE_PROJECT_ID } from '../../hooks/use-settings'

// existing activeAccountId / activeProjectId state stays — change the initial-pick logic:
useEffect(() => {
  let cancelled = false
  void Promise.all([
    readSetting(SETTING_LAST_ACTIVE_ACCOUNT_ID),
    readSetting(SETTING_LAST_ACTIVE_PROJECT_ID)
  ]).then(([accStr, projStr]) => {
    if (cancelled) return
    const accId = accStr ? Number(accStr) : null
    const projId = projStr ? Number(projStr) : null
    if (accId !== null && accounts.some((a) => a.id === accId)) setActiveAccountId(accId)
    if (projId !== null && projects.some((p) => p.id === projId)) setActiveProjectId(projId)
  })
  return () => { cancelled = true }
}, [accounts, projects])
```

(The "if it still exists" guard handles the case where the user deleted the previously-active account/project in a previous session.)

- [ ] **Step 2: On change, persist**

```ts
// When activeAccountId changes, write
useEffect(() => {
  if (activeAccountId !== null) {
    void writeSetting(SETTING_LAST_ACTIVE_ACCOUNT_ID, String(activeAccountId))
  }
}, [activeAccountId])

// Same for activeProjectId
useEffect(() => {
  if (activeProjectId !== null) {
    void writeSetting(SETTING_LAST_ACTIVE_PROJECT_ID, String(activeProjectId))
  }
}, [activeProjectId])
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/layout/AppShell.tsx
git commit -m "feat(phase-6b): persist + restore activeAccountId / activeProjectId via settings table"
```

---

## Task 11: ADR-035 — last-active persistence schema

**Files:**
- Modify: `docs/decisions.md`

- [ ] **Step 1: Append ADR-035**

```markdown

## ADR-035 (2026-05-15) — Last-active selections persisted via the `settings` key/value table; restore on mount with fallback if the target is missing

**Context:** Phase 6B needs to remember which account + project the user had selected at the last session, so reopening the app doesn't dump them back to defaults.

**Options considered:**
- A) Dedicated `app_state` table with one row. Overkill for two fields.
- B) JSON file at `userData/last-active.json`. Adds a second persistence mechanism.
- C) Use the existing `settings(key, value)` table (schema landed Phase 3, never wired). Two rows: `lastActiveAccountId`, `lastActiveProjectId`. Values are stringified ints.

**Choice:** C.

**Reasoning:**
- The `settings` table was designed exactly for this — Phase 3 just never wired it.
- Phase 8 will add more app-wide singletons here (theme preference, send-confirm toggle, etc.). One table, one access pattern.
- On boot, AppShell reads both keys, validates the IDs still exist in the current `accounts`/`projects` lists, and falls back to the first-available if missing.

**Trade-offs:**
- The renderer makes 2 IPC calls on mount (async). Acceptable — the activeAccountId/activeProjectId state is the only thing that "snaps" from initial-default to last-active after the reads resolve. The UI briefly shows the default-first state. Phase 8 could batch via a single `settings:get-batch` IPC if it matters for UX.
- Stale IDs (account/project deleted in a prior session) are silently ignored. No error toast.

**Discovered:** Phase 6B account+project CRUD work.

```

- [ ] **Step 2: Commit**

```bash
git add docs/decisions.md
git commit -m "docs(phase-6b): ADR-035 — last-active persistence via settings table key/value"
```

---

## Task 12: Docs sweep — observability + scenarios

**Files:**
- Modify: `docs/observability.md`
- Modify: `docs/test-scenarios.md`

- [ ] **Step 1: observability.md**

`db` row: append `settings-get`, `settings-set`, `accounts-update`, `accounts-delete`.
`fs` row (already exists): append `paths-check-dir`.
`ui` row: append `account-update`, `account-delete`, `project-update`, `project-delete`.

- [ ] **Step 2: test-scenarios.md**

Append `## Phase 6B — Account + Project CRUD + last-active`:

```markdown

### S-6B.1 Edit account API key
1. Active account "Test" has a working key. Click ✎ next to AccountSwitcher.
2. Clear the API key field, paste a new key. Save.
3. **Expect:** Account is updated. Next Gear call uses the new key. Dev Mode shows `account-update` log.

### S-6B.2 Delete account
1. With "Test" account active, click ✎. Click Delete in the modal. Confirm.
2. **Expect:** Account is removed from the dropdown. Active account falls back to first remaining ("Personal"). Dev Mode shows `account-delete`.

### S-6B.3 Edit project rootPath
1. Click ✎ next to ProjectSwitcher. Change rootPath to a different real directory. Save.
2. **Expect:** Project is updated. The NEXT New Conversation uses the new path as claude's cwd. Existing conversations keep their original rootPath (Phase 7 may reconcile).

### S-6B.4 CreateProjectModal validates rootPath
1. Click + next to ProjectSwitcher. Type a path that doesn't exist. Wait ~400ms.
2. **Expect:** Inline error "Directory doesn't exist on disk." appears under the field. Create button disabled (or click is blocked).
3. Change to a real directory. Error clears.

### S-6B.5 Last-active persistence
1. Set active account = "Test" and active project = "Foo". Close the app.
2. Relaunch.
3. **Expect:** "Test" and "Foo" are auto-selected as active (not the first-in-list defaults). Dev Mode shows `settings-get` for both keys at boot.

### S-6B.6 Stale last-active gracefully ignored
1. With "Test" + "Foo" persisted as last-active, delete "Foo" project. Close the app.
2. Relaunch.
3. **Expect:** activeProjectId falls back to first remaining project. No error toast. Dev Mode shows `settings-get` returned a value that didn't match any current project.

### S-6B.7 Dropdown menu now paints above MainPane
1. Click the Project: or Account: dropdown.
2. **Expect:** The expanded list is FULLY VISIBLE — not clipped behind the composer or terminal pane.
```

- [ ] **Step 3: Commit**

```bash
git add docs/observability.md docs/test-scenarios.md
git commit -m "docs(phase-6b): observability events + Phase 6B manual scenarios"
```

---

## Task 13: Verification + tag v0.14.0-phase-6b

- [ ] **Step 1: Four-gate verification**

```bash
npm run rebuild:node
npm run typecheck
npm run test:run

npm run rebuild:electron
npm run build
npm run test:e2e
npm run rebuild:node
```

Expected: typecheck clean, unit/integration suite green (234 baseline + ~20 new = ~254), E2E 18/18 (no new E2E in 6B — UI changes covered by manual scenarios).

- [ ] **Step 2: Tag**

```bash
git tag -s -a v0.14.0-phase-6b -m "Phase 6B complete — account + project CRUD parity, last-active persistence, dropdown z-index, rootPath validation"
git rev-parse v0.14.0-phase-6b^{commit}
```

---

## Self-Review Checklist

- [ ] **Phase 6B exit-state vs plan:**
  - Account edit + delete with registry invalidation ✓
  - Project edit + delete (UI; DAO + handler already existed) ✓
  - Last-active persistence on selection change + on mount ✓
  - Dropdown z-index fix demonstrably resolves the "menu hidden behind MainPane" demo bug ✓
  - rootPath validation gives a clean inline error before submit ✓
- [ ] **Phase 8 backlog items resolved by 6B:**
  - "Project / Account dropdowns hidden behind MainPane content" — closed
  - "Project rootPath not validated against disk before spawn" — partially closed (validation now in modal; spawner-level guard still optional)
- [ ] **CLAUDE.md cornerstones:**
  - All new error paths through Logger
  - No silent catches
  - `paths:check-dir` uses `fs` category as planned
- [ ] **TypeScript strict clean**
- [ ] **No console.* outside tests**

---

## Exit State

**Visible to user:**
- ✎ button next to Project: and Account: dropdowns opens edit modal for the active item
- Edit modal includes a Delete action with confirmation
- CreateProjectModal shows "Directory doesn't exist on disk" inline before submit if the path is bad
- After restart, the previously-active account + project are auto-selected
- Dropdowns no longer paint behind MainPane

**Under the hood:**
- `SettingsDao` thin key/value façade; ADR-035 documents the schema choice
- `AccountsDao.updateAccount/deleteAccount` + handler with `AnthropicClientRegistry.invalidate` on key change or delete
- `PathsHandler` provides `paths:check-dir` for filesystem validation from the renderer
- `--tl-z-dropdown` bumped to 1000 above the gear-review pane

**Phase 6C will deliver:**
- Skills discovery (chokidar-watched `~/.claude/skills/`, plugin dirs, project-local)
- Telemetry summary view (cost-over-time, savings dashboard)
- ANTHROPIC_API_KEY env var fallback if no account has a key (optional)
- ConfirmModal upgrade from `window.confirm` to a styled component

**Tag:** `v0.14.0-phase-6b`
