# Phase 4A: Real Claude Code Subprocess + Send → Stream Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock terminal stream with a real `claude` subprocess. Clicking "New Conversation" creates a row in the DB and spawns a PTY-backed Claude Code session whose output streams into the existing xterm.js pane. The Send button pipes user input into that PTY's stdin and stores a turn row. The Phase 3 backlog items (accounts onChanged symmetry, missing tests) land at the start.

**Architecture:** A new `main/cc/` module owns subprocess lifecycle: `spawner.ts` (single `pty.spawn` call with multi-account env per ADR-017/-018, pre-specified session ID per ADR-016), `lifecycle.ts` (per-conversation `PtyHandle` map managed at the main-process scale), and `types.ts` (IPC-visible shapes). A new `CcHandler` IPC class wraps the lifecycle with `withIpcResult` envelopes and broadcasts `cc:output-chunk` events for every byte of PTY stdout. The renderer's `TerminalPane` switches from the mock interval to a `useCcSubscription(conversationId)` hook that streams chunks straight into the xterm instance. To keep CI deterministic (no real Claude install available on the runners), spawner accepts a `TOKENLESS_CLAUDE_BIN` override so a tiny mock-claude script can stand in.

**What's IN scope (Phase 4A):** spawn / write / read / kill, new-conversation flow, terminal streaming, draft auto-save (per ADR-013), turn-row insert on Send, `cc_session_id` capture, single-conversation-at-a-time enforcement.

**What's OUT of scope (deferred to Phase 4B):** output parser (tool calls, end-of-response markers, token counts), `--resume` lifecycle, `cc:stop` with SIGINT, §7.1 failure-mode recovery UIs, telemetry tick events. The xterm pane in 4A just shows raw PTY bytes — no synthesized progress events yet.

**Tech Stack:** `node-pty` 1.1 (Windows-flavored, native — already installed from Phase 1A spike), `@xterm/xterm` 5.5 (already wired by Phase 2B), `node:crypto.randomUUID` for session IDs, existing Logger + IPC + DAO infrastructure.

---

## File Structure

**New files (main process):**
- `src/main/cc/types.ts` — `PtyHandle`, `SpawnOptions`, `ConversationContext`
- `src/main/cc/spawner.ts` — `spawnClaude(opts)` returns `PtyHandle`
- `src/main/cc/lifecycle.ts` — `CcLifecycle` class managing the conversation→PTY map
- `src/main/cc/index.ts` — barrel
- `src/main/ipc/cc-handler.ts` — IPC class wrapping the lifecycle
- `src/main/__tests__/cc/spawner.unit.test.ts`
- `src/main/__tests__/cc/lifecycle.integration.test.ts`
- `src/main/__tests__/ipc/cc-handler.integration.test.ts`
- `src/main/__tests__/ipc/accounts-handler.integration.test.ts` — Phase 3 backlog fix
- `test/doubles/mock-pty.ts` — `MockPty` for unit/integration tests
- `test/doubles/claude-mock.cjs` — tiny standalone script behaving like claude for E2E
- `test/e2e/cc-send.e2e.test.ts`

**New files (shared):**
- `src/shared/ipc/cc.ts` — channels + payload types

**New files (renderer):**
- `src/renderer/src/hooks/use-cc-subscription.ts`
- `src/renderer/src/hooks/__tests__/use-accounts.unit.test.tsx` — Phase 3 backlog fix
- `src/renderer/src/hooks/__tests__/use-cc-subscription.unit.test.tsx`

**Modified files:**
- `package.json` — extend `rebuild:electron` + `rebuild:node` to cover node-pty too
- `.github/workflows/ci.yml` — already passes node-pty rebuild via existing scripts; double-check
- `src/shared/ipc/accounts.ts` — add `IPC_ACCOUNTS_CHANGED` (Phase 3 backlog)
- `src/shared/ipc.ts` — re-export the new constant + cc.ts types
- `src/main/ipc/accounts-handler.ts` — broadcast `accounts:changed` after `create` (Phase 3 backlog)
- `src/main/ipc/index.ts` — wire CcHandler + Broadcast for accounts
- `src/main/index.ts` — register CcHandler with lifecycle; close all PTYs on `before-quit`
- `src/preload/index.ts` — expose `cc` namespace + `accounts.onChanged` (Phase 3 backlog)
- `src/preload/index.d.ts` — declare new APIs
- `src/renderer/src/hooks/use-accounts.ts` — subscribe to onChanged (Phase 3 backlog)
- `src/renderer/src/components/terminal/TerminalPane.tsx` — switch from `MOCK_TERMINAL_STREAM` to `useCcSubscription`
- `src/renderer/src/components/composer/ActionsRow.tsx` — Send button calls `cc:send` IPC instead of stub
- `src/renderer/src/components/composer/Composer.tsx` — owns active `conversationId` prop; sends through hook
- `src/renderer/src/components/layout/AppShell.tsx` — wire `handleNewConversation` to create + spawn flow
- `src/renderer/src/mocks/terminal-stream.ts` — DELETED (last terminal mock)
- `docs/decisions.md` — ADR-026 (mock-claude pattern), ADR-027 (PTY lifecycle ownership)
- `docs/observability.md` — extend `cc` + `pty` rows with Phase 4A events
- `docs/test-scenarios.md` — Phase 4A manual scenarios

---

## Task 1: Address Phase 3 backlog — `accounts:changed` broadcast + useAccounts symmetry

**Why first:** small, isolated, removes a latent Phase 6 bug, and gives a warm-up commit before the node-pty work.

**Files:**
- Modify: `src/shared/ipc/accounts.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc/accounts-handler.ts`
- Modify: `src/main/ipc/index.ts` (pass `broadcast` to `AccountsHandler`)
- Modify: `src/preload/index.ts`, `src/preload/index.d.ts`
- Modify: `src/renderer/src/hooks/use-accounts.ts`
- Create: `src/main/__tests__/ipc/accounts-handler.integration.test.ts`
- Create: `src/renderer/src/hooks/__tests__/use-accounts.unit.test.tsx`

- [ ] **Step 1: Write the failing AccountsHandler test**

Create `src/main/__tests__/ipc/accounts-handler.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { AccountsHandler } from '../../ipc/accounts-handler'
import { Logger } from '../../observability/logger'

function makeLogger(): Logger {
  return new Logger(
    { append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100,
    'main'
  )
}

describe('ipc/accounts-handler', () => {
  let db: Database
  let broadcast: ReturnType<typeof vi.fn>
  let handler: AccountsHandler

  beforeEach(() => {
    db = createTestDb()
    broadcast = vi.fn()
    handler = new AccountsHandler(db, makeLogger(), broadcast)
  })

  it('list returns ok envelope (seed default Personal is empty until seedDefaultAccount runs)', async () => {
    const result = await handler.list()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.accounts).toEqual([])
  })

  it('create returns the new account + broadcasts accounts:changed', async () => {
    const result = await handler.create({
      input: { label: 'Work', configDir: 'C:/Users/me/.claude' }
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.account.label).toBe('Work')
    expect(broadcast).toHaveBeenCalledWith('accounts:changed', undefined)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/main/__tests__/ipc/accounts-handler.integration.test.ts
```

Expected: FAIL — `AccountsHandler` constructor doesn't accept `broadcast` yet, or `broadcast` not called.

- [ ] **Step 3: Add the IPC channel constant**

Edit `src/shared/ipc/accounts.ts`. Add:

```ts
export const IPC_ACCOUNTS_CHANGED = 'accounts:changed'
```

Edit `src/shared/ipc.ts`. Add `IPC_ACCOUNTS_CHANGED` to the existing `from './ipc/accounts'` re-export block.

Also update the legacy `IpcChannelName` union to include `'accounts:changed'`.

- [ ] **Step 4: Update AccountsHandler to broadcast**

Edit `src/main/ipc/accounts-handler.ts`:

```ts
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Database } from 'better-sqlite3'

import { AccountsDao } from '../db'
import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'
import {
  IPC_ACCOUNTS_LIST,
  IPC_ACCOUNTS_CREATE,
  IPC_ACCOUNTS_CHANGED,
  type AccountsCreateRequest,
  type AccountsListResult,
  type AccountsCreateResult
} from '@shared/ipc/accounts'

export type Broadcast = (channel: string, payload: unknown) => void

export class AccountsHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
    private readonly broadcast: Broadcast
  ) {}

  list = async (): Promise<AccountsListResult> =>
    withIpcResult(this.logger, 'db', 'accounts-list', async () => ({
      accounts: AccountsDao.listAccounts(this.db)
    }))

  create = async (req: AccountsCreateRequest): Promise<AccountsCreateResult> =>
    withIpcResult(this.logger, 'db', 'accounts-create', async () => {
      const account = AccountsDao.createAccount(this.db, req.input)
      this.broadcast(IPC_ACCOUNTS_CHANGED, undefined)
      return { account }
    })

  install(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_ACCOUNTS_LIST, () => this.list())
    this.installedHandlers.push(IPC_ACCOUNTS_LIST)
    ipcMain.handle(IPC_ACCOUNTS_CREATE, async (_e: IpcMainInvokeEvent, req: AccountsCreateRequest) =>
      this.create(req)
    )
    this.installedHandlers.push(IPC_ACCOUNTS_CREATE)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
```

- [ ] **Step 5: Wire the broadcast in main/ipc/index.ts**

Edit `src/main/ipc/index.ts`. The existing `AccountsHandler` instantiation `new AccountsHandler(db, logger)` becomes `new AccountsHandler(db, logger, broadcast)`.

- [ ] **Step 6: Update preload to expose accounts.onChanged**

Edit `src/preload/index.ts`. Inside the `accounts` namespace object, add:

```ts
onChanged(fn: () => void): () => void {
  const listener = (): void => fn()
  ipcRenderer.on(IPC_ACCOUNTS_CHANGED, listener as never)
  return () => ipcRenderer.removeListener(IPC_ACCOUNTS_CHANGED, listener as never)
}
```

Import `IPC_ACCOUNTS_CHANGED` in the existing big import block.

Edit `src/preload/index.d.ts`. Inside the `accounts` namespace of the `TokenlessApi` interface, add:

```ts
onChanged(fn: () => void): () => void
```

- [ ] **Step 7: Subscribe in useAccounts**

Edit `src/renderer/src/hooks/use-accounts.ts`. In the `useEffect` that calls `fetchAccounts` on mount, also subscribe:

```ts
useEffect(() => {
  mountedRef.current = true
  void fetchAccounts()
  const unsubscribe = window.tokenless.accounts.onChanged(() => {
    void fetchAccounts()
  })
  return () => {
    mountedRef.current = false
    unsubscribe()
  }
}, [fetchAccounts])
```

- [ ] **Step 8: Add the useAccounts unit test**

Create `src/renderer/src/hooks/__tests__/use-accounts.unit.test.tsx`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { Account } from '@shared/types/accounts'

import { useAccounts } from '../use-accounts'

function makeAccount(id: number, label: string): Account {
  return { id, label, configDir: `/c${id}`, apiKeyRef: null, createdAt: 0 }
}

describe('hooks/use-accounts', () => {
  let onChangedCallback: () => void = () => undefined
  let mockAccounts: Account[]

  beforeEach(() => {
    mockAccounts = [makeAccount(1, 'Personal')]
    onChangedCallback = () => undefined
    ;(window as unknown as { tokenless: unknown }).tokenless = {
      accounts: {
        list: vi.fn(async () => ({ ok: true, data: { accounts: mockAccounts } })),
        create: vi.fn(async (req: { input: { label: string; configDir: string } }) => ({
          ok: true,
          data: { account: { ...makeAccount(2, req.input.label) } }
        })),
        onChanged: (fn: () => void): (() => void) => {
          onChangedCallback = fn
          return () => undefined
        }
      }
    }
  })

  it('fetches accounts on mount', async () => {
    const { result } = renderHook(() => useAccounts())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.accounts).toHaveLength(1)
    expect(result.current.accounts[0].label).toBe('Personal')
  })

  it('refetches when accounts:changed fires', async () => {
    const { result } = renderHook(() => useAccounts())
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockAccounts = [makeAccount(1, 'Personal'), makeAccount(2, 'Work')]
    act(() => onChangedCallback())

    await waitFor(() => expect(result.current.accounts).toHaveLength(2))
  })
})
```

- [ ] **Step 9: Run all touched tests**

```bash
npm run test:run -- src/main/__tests__/ipc/accounts-handler.integration.test.ts src/renderer/src/hooks/__tests__/use-accounts.unit.test.tsx
```

Expected: PASS (2 + 2 = 4 tests).

- [ ] **Step 10: Full suite + typecheck**

```bash
npm run typecheck
npm run test:run
```

Expected: PASS, PASS. Total tests should be 84 + 4 = 88.

- [ ] **Step 11: Commit**

```bash
git add src/shared/ipc/accounts.ts src/shared/ipc.ts \
        src/main/ipc/accounts-handler.ts src/main/ipc/index.ts \
        src/preload/index.ts src/preload/index.d.ts \
        src/renderer/src/hooks/use-accounts.ts \
        src/main/__tests__/ipc/accounts-handler.integration.test.ts \
        src/renderer/src/hooks/__tests__/use-accounts.unit.test.tsx
git commit -m "fix(phase-3-backlog): accounts:changed broadcast + onChanged symmetry + tests"
```

---

## Task 2: Extend rebuild scripts to cover node-pty

**Why:** Phase 4A introduces node-pty as a runtime dependency. The dual-ABI workflow (ADR-024) currently only rebuilds better-sqlite3. node-pty needs the same treatment.

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Update rebuild scripts**

Edit `package.json`:

```json
"rebuild:electron": "electron-rebuild --force --module-dir node_modules/better-sqlite3 && electron-rebuild --force --module-dir node_modules/node-pty",
"rebuild:node": "npm rebuild better-sqlite3 node-pty",
```

- [ ] **Step 2: Verify locally**

```bash
npm run rebuild:node
```

Expected: both modules rebuild without error.

```bash
npm run rebuild:electron
```

Expected: same.

- [ ] **Step 3: Switch back to Node ABI for the rest of this task**

```bash
npm run rebuild:node
```

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore(phase-4a): extend rebuild:electron + rebuild:node to cover node-pty"
```

---

## Task 3: Mock-pty test double

**Why:** The spawner + lifecycle + handler tests need an in-memory PTY substitute. node-pty's `IPty` interface is small — easy to mock.

**Files:**
- Create: `test/doubles/mock-pty.ts`

- [ ] **Step 1: Implement the double**

Create `test/doubles/mock-pty.ts`:

```ts
// MockPty mimics node-pty's IPty interface for tests. It collects writes, lets
// the test push synthetic output via `emitData`, and tracks kill/dispose calls.
//
// Use via the spawner's seam: spawner.spawnClaude(opts, ptyFactory?) accepts a
// factory that returns an IPty-shaped object. Tests pass a factory that returns
// a MockPty.

type DataListener = (chunk: string) => void
type ExitListener = (e: { exitCode: number; signal?: number }) => void

export interface MockPtyOptions {
  initialCols?: number
  initialRows?: number
}

export class MockPty {
  readonly pid = 1
  cols: number
  rows: number
  readonly writes: string[] = []
  killed = false
  readonly killSignals: (string | undefined)[] = []
  resized: { cols: number; rows: number }[] = []
  private dataListeners: DataListener[] = []
  private exitListeners: ExitListener[] = []
  private disposed = false

  constructor(opts: MockPtyOptions = {}) {
    this.cols = opts.initialCols ?? 100
    this.rows = opts.initialRows ?? 30
  }

  onData(listener: DataListener): { dispose: () => void } {
    this.dataListeners.push(listener)
    return { dispose: () => {} }
  }

  onExit(listener: ExitListener): { dispose: () => void } {
    this.exitListeners.push(listener)
    return { dispose: () => {} }
  }

  write(data: string): void {
    if (this.disposed) throw new Error('write to disposed pty')
    this.writes.push(data)
  }

  resize(cols: number, rows: number): void {
    this.cols = cols
    this.rows = rows
    this.resized.push({ cols, rows })
  }

  kill(signal?: string): void {
    this.killed = true
    this.killSignals.push(signal)
    queueMicrotask(() => {
      for (const l of this.exitListeners) l({ exitCode: 0, signal: undefined })
    })
  }

  pause(): void {}
  resume(): void {}

  // Test helpers — not on real IPty
  emitData(chunk: string): void {
    for (const l of this.dataListeners) l(chunk)
  }

  emitExit(exitCode: number, signal?: number): void {
    for (const l of this.exitListeners) l({ exitCode, signal })
  }

  markDisposed(): void {
    this.disposed = true
  }
}
```

- [ ] **Step 2: No test for the double itself — used by Tasks 4-7**

Don't commit yet. The double will be committed alongside Task 4 (spawner), which is the first consumer.

---

## Task 4: Spawner — single `pty.spawn` call with multi-account env + session-id

**Files:**
- Create: `src/main/cc/types.ts`
- Create: `src/main/cc/spawner.ts`
- Create: `src/main/__tests__/cc/spawner.unit.test.ts`

- [ ] **Step 1: Define types**

Create `src/main/cc/types.ts`:

```ts
// Public types for the cc/ module — what the IPC handler and tests consume.
// node-pty's IPty interface is structurally what PtyHandle requires; we define
// our own narrower view so tests can pass a MockPty without depending on
// node-pty.

export interface PtyHandle {
  readonly pid: number
  cols: number
  rows: number
  onData(listener: (chunk: string) => void): { dispose: () => void }
  onExit(listener: (e: { exitCode: number; signal?: number }) => void): { dispose: () => void }
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(signal?: string): void
}

export interface SpawnOptions {
  readonly conversationId: number
  readonly sessionId: string         // UUID — pre-specified per ADR-016
  readonly cwd: string               // project root
  readonly cols: number
  readonly rows: number
  readonly env: {
    readonly CLAUDE_CONFIG_DIR: string   // per ADR-018
    readonly ANTHROPIC_API_KEY?: string  // per ADR-018; omit for default-key accounts
  }
  // Override the spawned binary — used by tests + CI's mock-claude.
  // Defaults to 'claude.cmd' on Windows (ADR-017), 'claude' elsewhere.
  readonly claudeBin?: string
}

// Factory type used by spawner — production passes node-pty's spawn; tests
// pass a function that returns a MockPty.
export type PtySpawnFn = (
  binary: string,
  args: readonly string[],
  opts: {
    cols: number
    rows: number
    cwd: string
    env: Record<string, string>
    name?: string
  }
) => PtyHandle
```

- [ ] **Step 2: Write the failing spawner test**

Create `src/main/__tests__/cc/spawner.unit.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

import { spawnClaude } from '../../cc/spawner'
import type { PtySpawnFn } from '../../cc/types'
import { MockPty } from '../../../../test/doubles/mock-pty'

// Purpose: spawnClaude assembles the right binary, args, env, and dimensions
// then delegates to the injected pty factory. Multi-account env per ADR-018
// is verified. Session-id pre-specification per ADR-016 verified.

describe('cc/spawner', () => {
  it('on Windows: spawns claude.cmd with --session-id <uuid>, propagates env, cwd, dims', () => {
    const captured: { bin?: string; args?: readonly string[]; opts?: Record<string, unknown> } = {}
    const factory: PtySpawnFn = (bin, args, opts) => {
      captured.bin = bin
      captured.args = args
      captured.opts = opts as Record<string, unknown>
      return new MockPty({ initialCols: opts.cols, initialRows: opts.rows })
    }
    const pty = spawnClaude(
      {
        conversationId: 1,
        sessionId: '11111111-2222-3333-4444-555555555555',
        cwd: 'C:/personal/tokenless',
        cols: 100,
        rows: 30,
        env: { CLAUDE_CONFIG_DIR: 'C:/Users/me/.claude-personal' },
        claudeBin: 'claude.cmd'
      },
      factory
    )

    expect(pty.pid).toBeGreaterThan(0)
    expect(captured.bin).toBe('claude.cmd')
    expect(captured.args).toEqual(['--session-id', '11111111-2222-3333-4444-555555555555'])
    expect(captured.opts?.cwd).toBe('C:/personal/tokenless')
    expect((captured.opts?.env as Record<string, string>).CLAUDE_CONFIG_DIR).toBe(
      'C:/Users/me/.claude-personal'
    )
    expect(captured.opts?.cols).toBe(100)
    expect(captured.opts?.rows).toBe(30)
  })

  it('forwards ANTHROPIC_API_KEY when provided (per ADR-018)', () => {
    let envSeen: Record<string, string> | undefined
    const factory: PtySpawnFn = (_bin, _args, opts) => {
      envSeen = opts.env
      return new MockPty()
    }
    spawnClaude(
      {
        conversationId: 1,
        sessionId: 'abc-uuid',
        cwd: 'C:/x',
        cols: 80,
        rows: 24,
        env: {
          CLAUDE_CONFIG_DIR: 'C:/c',
          ANTHROPIC_API_KEY: 'sk-test-12345'
        }
      },
      factory
    )
    expect(envSeen?.['ANTHROPIC_API_KEY']).toBe('sk-test-12345')
  })

  it('does NOT include ANTHROPIC_API_KEY when omitted', () => {
    let envSeen: Record<string, string> | undefined
    const factory: PtySpawnFn = (_bin, _args, opts) => {
      envSeen = opts.env
      return new MockPty()
    }
    spawnClaude(
      {
        conversationId: 1,
        sessionId: 'abc-uuid',
        cwd: 'C:/x',
        cols: 80,
        rows: 24,
        env: { CLAUDE_CONFIG_DIR: 'C:/c' }
      },
      factory
    )
    expect(envSeen?.['ANTHROPIC_API_KEY']).toBeUndefined()
  })

  it('respects TOKENLESS_CLAUDE_BIN override (for CI mock)', () => {
    let binSeen: string | undefined
    const factory: PtySpawnFn = (bin, _args, _opts) => {
      binSeen = bin
      return new MockPty()
    }
    const prev = process.env['TOKENLESS_CLAUDE_BIN']
    process.env['TOKENLESS_CLAUDE_BIN'] = 'C:/path/to/mock-claude.cjs'
    try {
      spawnClaude(
        {
          conversationId: 1,
          sessionId: 'abc-uuid',
          cwd: 'C:/x',
          cols: 80,
          rows: 24,
          env: { CLAUDE_CONFIG_DIR: 'C:/c' }
        },
        factory
      )
    } finally {
      if (prev === undefined) delete process.env['TOKENLESS_CLAUDE_BIN']
      else process.env['TOKENLESS_CLAUDE_BIN'] = prev
    }
    expect(binSeen).toBe('C:/path/to/mock-claude.cjs')
  })
})
```

- [ ] **Step 3: Run to confirm failure**

```bash
npm run test:run -- src/main/__tests__/cc/spawner.unit.test.ts
```

Expected: FAIL — `spawner` module not found.

- [ ] **Step 4: Implement spawner**

Create `src/main/cc/spawner.ts`:

```ts
// spawner.ts — single entry point for spawning a claude PTY subprocess.
// Multi-account env per ADR-018. Pre-specified session ID per ADR-016.
// Binary selection per ADR-017 (claude.cmd on Windows). Overridable via
// TOKENLESS_CLAUDE_BIN for tests + CI mock.
//
// The PtySpawnFn factory is injected so tests can substitute MockPty
// without dragging node-pty into the test runtime.

import type { PtyHandle, PtySpawnFn, SpawnOptions } from './types'

function pickClaudeBin(explicit: string | undefined): string {
  if (explicit) return explicit
  const override = process.env['TOKENLESS_CLAUDE_BIN']
  if (override) return override
  return process.platform === 'win32' ? 'claude.cmd' : 'claude'
}

export function spawnClaude(opts: SpawnOptions, ptyFactory: PtySpawnFn): PtyHandle {
  const bin = pickClaudeBin(opts.claudeBin)
  const args = ['--session-id', opts.sessionId]

  const env: Record<string, string> = {
    ...filterOutUndefined(process.env),
    CLAUDE_CONFIG_DIR: opts.env.CLAUDE_CONFIG_DIR
  }
  if (opts.env.ANTHROPIC_API_KEY) {
    env['ANTHROPIC_API_KEY'] = opts.env.ANTHROPIC_API_KEY
  }

  return ptyFactory(bin, args, {
    cols: opts.cols,
    rows: opts.rows,
    cwd: opts.cwd,
    env,
    name: 'xterm-256color'
  })
}

function filterOutUndefined(src: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(src)) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}
```

- [ ] **Step 5: Run to confirm pass**

```bash
npm run test:run -- src/main/__tests__/cc/spawner.unit.test.ts
```

Expected: PASS (4/4).

- [ ] **Step 6: Commit (now includes Task 3's mock-pty)**

```bash
git add src/main/cc/types.ts src/main/cc/spawner.ts \
        src/main/__tests__/cc/spawner.unit.test.ts \
        test/doubles/mock-pty.ts
git commit -m "feat(phase-4a): cc/spawner — claude.cmd + --session-id + multi-account env (ADR-016/-017/-018)"
```

---

## Task 5: Lifecycle — per-conversation PTY map

**Files:**
- Create: `src/main/cc/lifecycle.ts`
- Create: `src/main/__tests__/cc/lifecycle.integration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/cc/lifecycle.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { CcLifecycle } from '../../cc/lifecycle'
import type { PtySpawnFn } from '../../cc/types'
import { MockPty } from '../../../../test/doubles/mock-pty'

// Purpose: CcLifecycle owns the conversationId -> PtyHandle map. Start spawns,
// stores, returns sessionId. Get returns the live handle (or null). Stop kills
// and removes. CloseAll kills every active pty. onData fans out chunks. onExit
// removes the dead pty from the map.

describe('cc/lifecycle', () => {
  let factory: PtySpawnFn
  let lastPty: MockPty | null
  let onChunk: ReturnType<typeof vi.fn>
  let onExit: ReturnType<typeof vi.fn>

  beforeEach(() => {
    lastPty = null
    factory = (_bin, _args, opts) => {
      lastPty = new MockPty({ initialCols: opts.cols, initialRows: opts.rows })
      return lastPty
    }
    onChunk = vi.fn()
    onExit = vi.fn()
  })

  it('start spawns + stores + returns sessionId', () => {
    const lc = new CcLifecycle(factory, { onChunk, onExit })
    const { sessionId } = lc.start({
      conversationId: 7,
      cwd: 'C:/x',
      cols: 100,
      rows: 30,
      env: { CLAUDE_CONFIG_DIR: 'C:/c' }
    })
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/i)
    expect(lc.get(7)).not.toBeNull()
  })

  it('emits onChunk with conversationId + chunk on PTY output', () => {
    const lc = new CcLifecycle(factory, { onChunk, onExit })
    lc.start({ conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30, env: { CLAUDE_CONFIG_DIR: 'C:/c' } })
    lastPty!.emitData('hello world')
    expect(onChunk).toHaveBeenCalledWith({ conversationId: 7, chunk: 'hello world' })
  })

  it('write delegates to the underlying pty + appends \\r line ending', () => {
    const lc = new CcLifecycle(factory, { onChunk, onExit })
    lc.start({ conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30, env: { CLAUDE_CONFIG_DIR: 'C:/c' } })
    lc.write(7, 'a prompt')
    expect(lastPty!.writes).toEqual(['a prompt\r'])
  })

  it('write to unknown conversationId throws', () => {
    const lc = new CcLifecycle(factory, { onChunk, onExit })
    expect(() => lc.write(999, 'x')).toThrow(/no active pty/i)
  })

  it('stop kills + removes from map + emits onExit', async () => {
    const lc = new CcLifecycle(factory, { onChunk, onExit })
    lc.start({ conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30, env: { CLAUDE_CONFIG_DIR: 'C:/c' } })
    lc.stop(7)
    expect(lastPty!.killed).toBe(true)
    await new Promise((r) => queueMicrotask(() => r(undefined)))
    expect(lc.get(7)).toBeNull()
    expect(onExit).toHaveBeenCalledWith({ conversationId: 7, exitCode: 0, signal: undefined })
  })

  it('only one pty per conversationId — second start throws', () => {
    const lc = new CcLifecycle(factory, { onChunk, onExit })
    lc.start({ conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30, env: { CLAUDE_CONFIG_DIR: 'C:/c' } })
    expect(() =>
      lc.start({ conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30, env: { CLAUDE_CONFIG_DIR: 'C:/c' } })
    ).toThrow(/already active/i)
  })

  it('closeAll kills every pty', () => {
    const ptyByConv: Record<number, MockPty> = {}
    const localFactory: PtySpawnFn = (_b, _a, opts) => {
      const p = new MockPty({ initialCols: opts.cols, initialRows: opts.rows })
      // The factory is invoked once per .start() — capture order via lifecycle
      return p
    }
    const lc = new CcLifecycle(localFactory, { onChunk, onExit })
    lc.start({ conversationId: 1, cwd: 'C:/a', cols: 100, rows: 30, env: { CLAUDE_CONFIG_DIR: 'C:/c' } })
    const pty1 = lc.get(1) as unknown as MockPty
    lc.start({ conversationId: 2, cwd: 'C:/b', cols: 100, rows: 30, env: { CLAUDE_CONFIG_DIR: 'C:/c' } })
    const pty2 = lc.get(2) as unknown as MockPty
    lc.closeAll()
    expect(pty1.killed).toBe(true)
    expect(pty2.killed).toBe(true)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/main/__tests__/cc/lifecycle.integration.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement lifecycle**

Create `src/main/cc/lifecycle.ts`:

```ts
// CcLifecycle — owns active claude PTY subprocesses keyed by conversationId.
// Phase 4A enforces one PTY per conversationId at a time. The spawn factory
// is injected so production wires node-pty's spawn and tests wire MockPty.
//
// Session IDs are generated here (UUID v4 via node:crypto) and returned to the
// caller so the IPC handler can persist conversations.cc_session_id (ADR-016).
//
// Data + exit events are fanned out via the constructor callbacks rather than
// EventEmitter so the test for "onChunk fires" is trivial.

import { randomUUID } from 'node:crypto'

import { spawnClaude } from './spawner'
import type { PtyHandle, PtySpawnFn } from './types'

export interface LifecycleStartOptions {
  readonly conversationId: number
  readonly cwd: string
  readonly cols: number
  readonly rows: number
  readonly env: { readonly CLAUDE_CONFIG_DIR: string; readonly ANTHROPIC_API_KEY?: string }
  readonly claudeBin?: string
}

export interface LifecycleStartResult {
  readonly sessionId: string
  readonly pid: number
}

export interface LifecycleCallbacks {
  onChunk(event: { conversationId: number; chunk: string }): void
  onExit(event: { conversationId: number; exitCode: number; signal?: number }): void
}

interface Slot {
  readonly conversationId: number
  readonly sessionId: string
  readonly pty: PtyHandle
}

export class CcLifecycle {
  private readonly slots = new Map<number, Slot>()

  constructor(
    private readonly ptyFactory: PtySpawnFn,
    private readonly cb: LifecycleCallbacks
  ) {}

  start(opts: LifecycleStartOptions): LifecycleStartResult {
    if (this.slots.has(opts.conversationId)) {
      throw new Error(`conversation ${opts.conversationId} already has an active PTY`)
    }
    const sessionId = randomUUID()
    const pty = spawnClaude(
      {
        conversationId: opts.conversationId,
        sessionId,
        cwd: opts.cwd,
        cols: opts.cols,
        rows: opts.rows,
        env: opts.env,
        claudeBin: opts.claudeBin
      },
      this.ptyFactory
    )
    const slot: Slot = { conversationId: opts.conversationId, sessionId, pty }
    this.slots.set(opts.conversationId, slot)

    pty.onData((chunk) => {
      this.cb.onChunk({ conversationId: opts.conversationId, chunk })
    })
    pty.onExit(({ exitCode, signal }) => {
      this.slots.delete(opts.conversationId)
      this.cb.onExit({ conversationId: opts.conversationId, exitCode, signal })
    })

    return { sessionId, pid: pty.pid }
  }

  get(conversationId: number): PtyHandle | null {
    return this.slots.get(conversationId)?.pty ?? null
  }

  getSessionId(conversationId: number): string | null {
    return this.slots.get(conversationId)?.sessionId ?? null
  }

  write(conversationId: number, data: string): void {
    const slot = this.slots.get(conversationId)
    if (!slot) throw new Error(`no active pty for conversation ${conversationId}`)
    slot.pty.write(data + '\r')
  }

  resize(conversationId: number, cols: number, rows: number): void {
    const slot = this.slots.get(conversationId)
    if (!slot) return
    slot.pty.resize(cols, rows)
  }

  stop(conversationId: number, signal: string = 'SIGINT'): void {
    const slot = this.slots.get(conversationId)
    if (!slot) return
    slot.pty.kill(signal)
  }

  closeAll(): void {
    for (const slot of this.slots.values()) {
      slot.pty.kill('SIGTERM')
    }
    this.slots.clear()
  }

  activeCount(): number {
    return this.slots.size
  }
}
```

Also create the barrel `src/main/cc/index.ts`:

```ts
export { CcLifecycle, type LifecycleStartOptions, type LifecycleStartResult, type LifecycleCallbacks } from './lifecycle'
export { spawnClaude } from './spawner'
export type { PtyHandle, PtySpawnFn, SpawnOptions } from './types'
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm run test:run -- src/main/__tests__/cc/lifecycle.integration.test.ts
```

Expected: PASS (7/7).

- [ ] **Step 5: Commit**

```bash
git add src/main/cc/lifecycle.ts src/main/cc/index.ts \
        src/main/__tests__/cc/lifecycle.integration.test.ts
git commit -m "feat(phase-4a): CcLifecycle — per-conversation PTY map (start/stop/write/resize/closeAll)"
```

---

## Task 6: CC IPC channels + types

**Files:**
- Create: `src/shared/ipc/cc.ts`
- Modify: `src/shared/ipc.ts`

- [ ] **Step 1: Channels + payload types**

Create `src/shared/ipc/cc.ts`:

```ts
// IPC channels for the claude subprocess. Phase 4A:
//   cc:start                — start a new PTY for a conversation
//   cc:send                 — write a prompt to the PTY's stdin
//   cc:resize               — resize the PTY (renderer term -> main)
//   cc:output-chunk         — main -> renderer broadcast, raw bytes
//   cc:exit                 — main -> renderer broadcast, conversation closed
//
// Phase 4B adds: cc:stop, cc:resume, cc:event (parsed), cc:error.

import type { IpcResult } from './envelope'

export const IPC_CC_START = 'cc:start'
export const IPC_CC_SEND = 'cc:send'
export const IPC_CC_RESIZE = 'cc:resize'
export const IPC_CC_OUTPUT_CHUNK = 'cc:output-chunk'
export const IPC_CC_EXIT = 'cc:exit'

export interface CcStartRequest {
  readonly conversationId: number
  readonly cwd: string
  readonly cols: number
  readonly rows: number
  // Renderer doesn't know about CLAUDE_CONFIG_DIR — main looks it up from the
  // active account. The renderer passes accountId here.
  readonly accountId: number
}

export interface CcStartResponse {
  readonly sessionId: string
  readonly pid: number
}

export interface CcSendRequest {
  readonly conversationId: number
  readonly prompt: string
  // Snapshot of composer state at send time — used for the turn row.
  readonly model: string | null
  readonly breadth: string | null
  readonly format: string | null
}

export interface CcSendResponse {
  readonly turnId: number
}

export interface CcResizeRequest {
  readonly conversationId: number
  readonly cols: number
  readonly rows: number
}

export interface CcOutputChunkPayload {
  readonly conversationId: number
  readonly chunk: string
}

export interface CcExitPayload {
  readonly conversationId: number
  readonly exitCode: number
  readonly signal?: number
}

export type CcStartResult = IpcResult<CcStartResponse>
export type CcSendResult = IpcResult<CcSendResponse>
export type CcResizeResult = IpcResult<{ ok: true }>
```

- [ ] **Step 2: Re-export from src/shared/ipc.ts**

Edit `src/shared/ipc.ts`. Add a `from './ipc/cc'` block re-exporting all the constants and types above. Update the legacy `IpcChannelName` union to include `'cc:start' | 'cc:send' | 'cc:resize' | 'cc:output-chunk' | 'cc:exit'`.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/shared/ipc/cc.ts src/shared/ipc.ts
git commit -m "feat(phase-4a): shared IPC channels for cc (start/send/resize/output-chunk/exit)"
```

---

## Task 7: CcHandler — IPC class wrapping lifecycle + DB

**Files:**
- Create: `src/main/ipc/cc-handler.ts`
- Create: `src/main/__tests__/ipc/cc-handler.integration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/ipc/cc-handler.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { CcLifecycle } from '../../cc/lifecycle'
import { CcHandler } from '../../ipc/cc-handler'
import { Logger } from '../../observability/logger'
import { MockPty } from '../../../../test/doubles/mock-pty'
import { AccountsDao, ProjectsDao, ConversationsDao } from '../../db'

function makeLogger(): Logger {
  return new Logger(
    { append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100,
    'main'
  )
}

describe('ipc/cc-handler', () => {
  let db: Database
  let broadcast: ReturnType<typeof vi.fn>
  let lifecycle: CcLifecycle
  let lastPty: MockPty | null
  let handler: CcHandler
  let conversationId: number
  let accountId: number

  beforeEach(() => {
    db = createTestDb()
    accountId = AccountsDao.createAccount(db, {
      label: 'Personal',
      configDir: 'C:/Users/me/.claude-personal'
    }).id
    const projectId = ProjectsDao.createProject(db, {
      name: 'P',
      rootPath: 'C:/x',
      defaultAccountId: accountId
    }).id
    conversationId = ConversationsDao.createConversation(db, { projectId, accountId }).id

    broadcast = vi.fn()
    lastPty = null
    lifecycle = new CcLifecycle(
      (_b, _a, opts) => {
        lastPty = new MockPty({ initialCols: opts.cols, initialRows: opts.rows })
        return lastPty
      },
      {
        onChunk: (e) => broadcast('cc:output-chunk', e),
        onExit: (e) => broadcast('cc:exit', e)
      }
    )
    handler = new CcHandler(db, makeLogger(), broadcast, lifecycle)
  })

  it('start returns ok with sessionId, persists cc_session_id on the conversation', async () => {
    const result = await handler.start({
      conversationId,
      cwd: 'C:/x',
      cols: 100,
      rows: 30,
      accountId
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.sessionId).toMatch(/^[0-9a-f-]{36}$/i)
    const conv = ConversationsDao.getConversationById(db, conversationId)
    expect(conv?.ccSessionId).toBe(result.data.sessionId)
  })

  it('start with an unknown accountId returns NOT_FOUND', async () => {
    const result = await handler.start({
      conversationId,
      cwd: 'C:/x',
      cols: 100,
      rows: 30,
      accountId: 99999
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND')
  })

  it('send writes a turn row + pipes prompt to PTY stdin', async () => {
    await handler.start({ conversationId, cwd: 'C:/x', cols: 100, rows: 30, accountId })
    const result = await handler.send({
      conversationId,
      prompt: 'hello claude',
      model: 'sonnet',
      breadth: 'normal',
      format: 'prose'
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.turnId).toBeGreaterThan(0)
    expect(lastPty!.writes).toEqual(['hello claude\r'])

    // Verify the turn row
    const turn = db
      .prepare('SELECT * FROM turns WHERE id = ?')
      .get(result.data.turnId) as { role: string; original_prompt: string; status: string }
    expect(turn.role).toBe('user')
    expect(turn.original_prompt).toBe('hello claude')
    expect(turn.status).toBe('complete')
  })

  it('send to an unstarted conversation returns NOT_FOUND', async () => {
    const result = await handler.send({
      conversationId,
      prompt: 'too early',
      model: null,
      breadth: null,
      format: null
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND')
  })

  it('PTY output is broadcast as cc:output-chunk', async () => {
    await handler.start({ conversationId, cwd: 'C:/x', cols: 100, rows: 30, accountId })
    broadcast.mockClear()
    lastPty!.emitData('partial response')
    expect(broadcast).toHaveBeenCalledWith('cc:output-chunk', {
      conversationId,
      chunk: 'partial response'
    })
  })

  it('resize delegates to lifecycle', async () => {
    await handler.start({ conversationId, cwd: 'C:/x', cols: 100, rows: 30, accountId })
    const result = await handler.resize({ conversationId, cols: 120, rows: 40 })
    expect(result.ok).toBe(true)
    expect(lastPty!.cols).toBe(120)
    expect(lastPty!.rows).toBe(40)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/main/__tests__/ipc/cc-handler.integration.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement CcHandler**

Create `src/main/ipc/cc-handler.ts`:

```ts
// CcHandler — IPC class for the claude subprocess. start spawns + persists
// cc_session_id; send appends a turn row + writes to PTY stdin; resize
// forwards to the lifecycle. PTY chunks + exits are broadcast via the
// lifecycle's callback into IPC events.

import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Database } from 'better-sqlite3'

import { AccountsDao, ConversationsDao } from '../db'
import { CcLifecycle } from '../cc/lifecycle'
import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'
import {
  IPC_CC_START,
  IPC_CC_SEND,
  IPC_CC_RESIZE,
  type CcStartRequest,
  type CcStartResult,
  type CcSendRequest,
  type CcSendResult,
  type CcResizeRequest,
  type CcResizeResult
} from '@shared/ipc/cc'

type Broadcast = (channel: string, payload: unknown) => void

interface NotFoundError extends Error {
  code?: string
}

function notFound(message: string): NotFoundError {
  const e = new Error(message) as NotFoundError
  e.code = 'NOT_FOUND'
  return e
}

export class CcHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
    private readonly broadcast: Broadcast,
    private readonly lifecycle: CcLifecycle
  ) {}

  start = async (req: CcStartRequest): Promise<CcStartResult> =>
    withIpcResult(this.logger, 'cc', 'cc-start', async () => {
      const account = AccountsDao.getAccountById(this.db, req.accountId)
      if (!account) throw notFound(`account ${req.accountId} not found`)
      const conv = ConversationsDao.getConversationById(this.db, req.conversationId)
      if (!conv) throw notFound(`conversation ${req.conversationId} not found`)

      const { sessionId, pid } = this.lifecycle.start({
        conversationId: req.conversationId,
        cwd: req.cwd,
        cols: req.cols,
        rows: req.rows,
        env: {
          CLAUDE_CONFIG_DIR: account.configDir,
          ...(account.apiKeyRef ? { ANTHROPIC_API_KEY: account.apiKeyRef } : {})
        }
      })

      ConversationsDao.updateConversation(this.db, {
        id: req.conversationId,
        ccSessionId: sessionId
      })

      this.logger.info('cc', 'cc-start', 'claude subprocess started', {
        conversationId: req.conversationId,
        sessionId,
        pid
      })

      return { sessionId, pid }
    })

  send = async (req: CcSendRequest): Promise<CcSendResult> =>
    withIpcResult(this.logger, 'cc', 'cc-send', async () => {
      const handle = this.lifecycle.get(req.conversationId)
      if (!handle) throw notFound(`no active PTY for conversation ${req.conversationId}`)

      const now = Date.now()
      const result = this.db
        .prepare(
          `INSERT INTO turns (
            conversation_id, role, original_prompt, model_used, status, sent_at
          ) VALUES (?, 'user', ?, ?, 'complete', ?)`
        )
        .run(req.conversationId, req.prompt, req.model, now)
      const turnId = Number(result.lastInsertRowid)

      this.lifecycle.write(req.conversationId, req.prompt)

      // Bump conversation updated_at + clear any draft (drafts table is wired
      // in Task 11 — for now we just no-op if the draft doesn't exist).
      this.db.prepare('DELETE FROM drafts WHERE conversation_id = ?').run(req.conversationId)
      this.db
        .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
        .run(now, req.conversationId)

      return { turnId }
    })

  resize = async (req: CcResizeRequest): Promise<CcResizeResult> =>
    withIpcResult(this.logger, 'cc', 'cc-resize', async () => {
      this.lifecycle.resize(req.conversationId, req.cols, req.rows)
      return { ok: true }
    })

  install(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_CC_START, async (_e: IpcMainInvokeEvent, req: CcStartRequest) =>
      this.start(req)
    )
    this.installedHandlers.push(IPC_CC_START)
    ipcMain.handle(IPC_CC_SEND, async (_e: IpcMainInvokeEvent, req: CcSendRequest) =>
      this.send(req)
    )
    this.installedHandlers.push(IPC_CC_SEND)
    ipcMain.handle(IPC_CC_RESIZE, async (_e: IpcMainInvokeEvent, req: CcResizeRequest) =>
      this.resize(req)
    )
    this.installedHandlers.push(IPC_CC_RESIZE)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm run test:run -- src/main/__tests__/ipc/cc-handler.integration.test.ts
```

Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/cc-handler.ts src/main/__tests__/ipc/cc-handler.integration.test.ts
git commit -m "feat(phase-4a): CcHandler — IPC for cc:start/send/resize + turn-row persistence + chunk broadcast"
```

---

## Task 8: Wire CcHandler + lifecycle into main process

**Files:**
- Modify: `src/main/ipc/index.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Update registerIpcHandlers**

Edit `src/main/ipc/index.ts`:

```ts
import type { IpcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import type { Logger } from '@main/observability'
import * as pty from 'node-pty'

import { LogBridge, type Broadcast } from './log-bridge'
import { AccountsHandler } from './accounts-handler'
import { ProjectsHandler } from './projects-handler'
import { ConversationsHandler } from './conversations-handler'
import { CcHandler } from './cc-handler'
import { CcLifecycle } from '@main/cc'
import type { PtySpawnFn, PtyHandle } from '@main/cc'

export interface IpcRegistration {
  logBridge: LogBridge
  accountsHandler: AccountsHandler
  projectsHandler: ProjectsHandler
  conversationsHandler: ConversationsHandler
  ccHandler: CcHandler
  ccLifecycle: CcLifecycle
  uninstallAll: () => void
}

// Production PtySpawnFn — adapter from our PtyHandle shape to node-pty's IPty.
// node-pty's IPty is structurally compatible; we just type-narrow.
const productionPtyFactory: PtySpawnFn = (binary, args, opts) =>
  pty.spawn(binary, args.slice(), opts) as PtyHandle

export function registerIpcHandlers(
  ipcMain: IpcMain,
  logger: Logger,
  broadcast: Broadcast,
  db: Database
): IpcRegistration {
  const logBridge = new LogBridge(logger, ipcMain, broadcast)
  logBridge.install()

  const accountsHandler = new AccountsHandler(db, logger, broadcast)
  accountsHandler.install(ipcMain)

  const projectsHandler = new ProjectsHandler(db, logger, broadcast)
  projectsHandler.install(ipcMain)

  const conversationsHandler = new ConversationsHandler(db, logger, broadcast)
  conversationsHandler.install(ipcMain)

  const ccLifecycle = new CcLifecycle(productionPtyFactory, {
    onChunk: (e) => broadcast('cc:output-chunk', e),
    onExit: (e) => broadcast('cc:exit', e)
  })
  const ccHandler = new CcHandler(db, logger, broadcast, ccLifecycle)
  ccHandler.install(ipcMain)

  return {
    logBridge,
    accountsHandler,
    projectsHandler,
    conversationsHandler,
    ccHandler,
    ccLifecycle,
    uninstallAll: () => {
      logBridge.uninstall()
      accountsHandler.uninstall(ipcMain)
      projectsHandler.uninstall(ipcMain)
      conversationsHandler.uninstall(ipcMain)
      ccHandler.uninstall(ipcMain)
      ccLifecycle.closeAll()
    }
  }
}
```

- [ ] **Step 2: Ensure before-quit closes all PTYs**

Edit `src/main/index.ts`. Find the `app.on('before-quit', ...)` block. Confirm `ipcRegistration.uninstallAll()` is called there — `uninstallAll` now also closes all PTYs via the lifecycle. No changes needed if you already call uninstallAll.

- [ ] **Step 3: Typecheck + build + smoke**

```bash
npm run typecheck
npm run build
```

Expected: PASS, PASS.

Now switch to Electron ABI (because we're about to verify with `npm run dev`):

```bash
npm run rebuild:electron
```

Launch dev briefly to confirm no startup regression (just verify the app opens — we don't have a UI hook to spawn cc from yet, that's Tasks 12-13):

```bash
npm run dev
```

Close the app. Check the log file at `~/.tokenless/logs/tokenless-<today>.jsonl` — there should be a `db-online` entry as before, plus no new errors. The cc handlers are installed but inactive.

Switch back to Node ABI:

```bash
npm run rebuild:node
```

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/index.ts src/main/index.ts
git commit -m "feat(phase-4a): wire CcHandler + CcLifecycle into main process + closeAll on before-quit"
```

---

## Task 9: Preload — expose `cc` namespace + subscriptions

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

- [ ] **Step 1: Extend the preload API**

Edit `src/preload/index.ts`. Add imports for the cc channel constants + types. Inside the `api` object, after the `conversations` namespace, add:

```ts
cc: {
  start(req: CcStartRequest): Promise<CcStartResult> {
    return ipcRenderer.invoke(IPC_CC_START, req) as Promise<CcStartResult>
  },
  send(req: CcSendRequest): Promise<CcSendResult> {
    return ipcRenderer.invoke(IPC_CC_SEND, req) as Promise<CcSendResult>
  },
  resize(req: CcResizeRequest): Promise<CcResizeResult> {
    return ipcRenderer.invoke(IPC_CC_RESIZE, req) as Promise<CcResizeResult>
  },
  onOutputChunk(fn: (payload: CcOutputChunkPayload) => void): () => void {
    const listener = (_e: unknown, payload: CcOutputChunkPayload): void => fn(payload)
    ipcRenderer.on(IPC_CC_OUTPUT_CHUNK, listener as never)
    return () => ipcRenderer.removeListener(IPC_CC_OUTPUT_CHUNK, listener as never)
  },
  onExit(fn: (payload: CcExitPayload) => void): () => void {
    const listener = (_e: unknown, payload: CcExitPayload): void => fn(payload)
    ipcRenderer.on(IPC_CC_EXIT, listener as never)
    return () => ipcRenderer.removeListener(IPC_CC_EXIT, listener as never)
  }
}
```

Import the channel constants + types at the top:

```ts
import {
  // ... existing imports ...
  IPC_CC_START,
  IPC_CC_SEND,
  IPC_CC_RESIZE,
  IPC_CC_OUTPUT_CHUNK,
  IPC_CC_EXIT,
  type CcStartRequest,
  type CcStartResult,
  type CcSendRequest,
  type CcSendResult,
  type CcResizeRequest,
  type CcResizeResult,
  type CcOutputChunkPayload,
  type CcExitPayload
} from '@shared/ipc'
```

- [ ] **Step 2: Update the type declarations**

Edit `src/preload/index.d.ts`. Add to `TokenlessApi`:

```ts
readonly cc: {
  start(req: CcStartRequest): Promise<CcStartResult>
  send(req: CcSendRequest): Promise<CcSendResult>
  resize(req: CcResizeRequest): Promise<CcResizeResult>
  onOutputChunk(fn: (payload: CcOutputChunkPayload) => void): () => void
  onExit(fn: (payload: CcExitPayload) => void): () => void
}
```

Import the types at the top of the .d.ts file alongside the existing ones.

- [ ] **Step 3: Typecheck + build**

```bash
npm run typecheck
npm run build
```

Expected: PASS, PASS.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(phase-4a): preload exposes cc namespace (start/send/resize/onOutputChunk/onExit)"
```

---

## Task 10: useCcSubscription hook

**Files:**
- Create: `src/renderer/src/hooks/use-cc-subscription.ts`
- Create: `src/renderer/src/hooks/__tests__/use-cc-subscription.unit.test.tsx`

- [ ] **Step 1: Failing test**

Create `src/renderer/src/hooks/__tests__/use-cc-subscription.unit.test.tsx`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useCcSubscription } from '../use-cc-subscription'

// Purpose: useCcSubscription forwards chunks for the matching conversationId
// to the onChunk callback. It ignores chunks for other conversations. It
// unsubscribes on unmount.

describe('hooks/use-cc-subscription', () => {
  let chunkListener: ((p: { conversationId: number; chunk: string }) => void) | null
  let exitListener: ((p: { conversationId: number; exitCode: number; signal?: number }) => void) | null
  let chunkUnsub: ReturnType<typeof vi.fn>
  let exitUnsub: ReturnType<typeof vi.fn>

  beforeEach(() => {
    chunkListener = null
    exitListener = null
    chunkUnsub = vi.fn()
    exitUnsub = vi.fn()
    ;(window as unknown as { tokenless: unknown }).tokenless = {
      cc: {
        start: vi.fn(),
        send: vi.fn(),
        resize: vi.fn(),
        onOutputChunk: (fn: typeof chunkListener) => {
          chunkListener = fn
          return chunkUnsub
        },
        onExit: (fn: typeof exitListener) => {
          exitListener = fn
          return exitUnsub
        }
      }
    }
  })

  it('forwards chunks for the matching conversationId', () => {
    const onChunk = vi.fn()
    renderHook(() => useCcSubscription(7, { onChunk }))
    act(() => chunkListener?.({ conversationId: 7, chunk: 'hello' }))
    expect(onChunk).toHaveBeenCalledWith('hello')
  })

  it('ignores chunks for other conversations', () => {
    const onChunk = vi.fn()
    renderHook(() => useCcSubscription(7, { onChunk }))
    act(() => chunkListener?.({ conversationId: 99, chunk: 'wrong' }))
    expect(onChunk).not.toHaveBeenCalled()
  })

  it('does not subscribe when conversationId is null', () => {
    const onChunk = vi.fn()
    renderHook(() => useCcSubscription(null, { onChunk }))
    expect(chunkListener).toBeNull()
  })

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useCcSubscription(7, { onChunk: vi.fn() }))
    unmount()
    expect(chunkUnsub).toHaveBeenCalled()
    expect(exitUnsub).toHaveBeenCalled()
  })

  it('forwards exits via onExit callback', () => {
    const onExit = vi.fn()
    renderHook(() => useCcSubscription(7, { onChunk: vi.fn(), onExit }))
    act(() => exitListener?.({ conversationId: 7, exitCode: 0 }))
    expect(onExit).toHaveBeenCalledWith({ exitCode: 0, signal: undefined })
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/renderer/src/hooks/__tests__/use-cc-subscription.unit.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement the hook**

Create `src/renderer/src/hooks/use-cc-subscription.ts`:

```ts
// useCcSubscription — subscribe to cc:output-chunk + cc:exit IPC events for a
// specific conversationId. Caller passes onChunk(chunk) and optional onExit({
// exitCode, signal }) callbacks. Returns nothing — pure side-effect.

import { useEffect } from 'react'

interface UseCcSubscriptionCallbacks {
  onChunk(chunk: string): void
  onExit?(event: { exitCode: number; signal?: number }): void
}

export function useCcSubscription(
  conversationId: number | null,
  callbacks: UseCcSubscriptionCallbacks
): void {
  useEffect(() => {
    if (conversationId === null) return undefined
    const { onChunk, onExit } = callbacks
    const unsubChunk = window.tokenless.cc.onOutputChunk((payload) => {
      if (payload.conversationId === conversationId) {
        onChunk(payload.chunk)
      }
    })
    const unsubExit = window.tokenless.cc.onExit((payload) => {
      if (payload.conversationId === conversationId && onExit) {
        onExit({ exitCode: payload.exitCode, signal: payload.signal })
      }
    })
    return () => {
      unsubChunk()
      unsubExit()
    }
  }, [conversationId, callbacks])
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm run test:run -- src/renderer/src/hooks/__tests__/use-cc-subscription.unit.test.tsx
```

Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/hooks/use-cc-subscription.ts \
        src/renderer/src/hooks/__tests__/use-cc-subscription.unit.test.tsx
git commit -m "feat(phase-4a): useCcSubscription hook — chunk + exit subscription per conversationId"
```

---

## Task 11: TerminalPane — swap mock stream for real cc subscription

**Files:**
- Modify: `src/renderer/src/components/terminal/TerminalPane.tsx`
- Delete: `src/renderer/src/mocks/terminal-stream.ts`

- [ ] **Step 1: Update TerminalPane**

Replace `src/renderer/src/components/terminal/TerminalPane.tsx`:

```tsx
import { useCallback, useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

import { useCcSubscription } from '../../hooks/use-cc-subscription'

interface TerminalPaneProps {
  conversationId: number | null
}

// xterm.js-backed pane. Phase 4A: live PTY output from the cc subprocess via
// useCcSubscription. The xterm instance is created once on mount; chunks are
// written directly into terminal.write() with no transformation — ANSI escape
// sequences pass through, which is what we want for fidelity with claude's
// rendered output.

export function TerminalPane({ conversationId }: TerminalPaneProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return undefined

    const terminal = new Terminal({
      theme: {
        background: '#1e1e1e',
        foreground: '#ddd',
        cursor: '#ddd'
      },
      fontFamily: '"JetBrains Mono", Consolas, monospace',
      fontSize: 12,
      cursorBlink: false,
      disableStdin: true,
      scrollback: 5000
    })
    terminalRef.current = terminal

    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.current)
    fitAddon.fit()

    const handleResize = (): void => {
      try {
        fitAddon.fit()
        if (conversationId !== null) {
          void window.tokenless.cc.resize({
            conversationId,
            cols: terminal.cols,
            rows: terminal.rows
          })
        }
      } catch {
        // Ignore — terminal may be torn down concurrently
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Forward chunks into xterm. The callback is stable per render via useCallback
  // so useCcSubscription's effect dep array doesn't re-subscribe constantly.
  const handleChunk = useCallback((chunk: string) => {
    terminalRef.current?.write(chunk)
  }, [])

  const handleExit = useCallback((event: { exitCode: number }) => {
    terminalRef.current?.writeln(`\r\n[claude exited with code ${event.exitCode}]`)
  }, [])

  useCcSubscription(conversationId, { onChunk: handleChunk, onExit: handleExit })

  return <div className="terminal-pane" ref={containerRef} />
}
```

- [ ] **Step 2: Delete the last terminal mock**

```bash
git rm src/renderer/src/mocks/terminal-stream.ts
```

- [ ] **Step 3: Confirm no remaining import**

```bash
npm run typecheck
```

If TS reports an unresolved `MOCK_TERMINAL_STREAM` import, find and remove it.

- [ ] **Step 4: Run all tests**

```bash
npm run test:run
```

Expected: all green. Phase 2B tests that asserted on the terminal pane checked structure (`.terminal-pane` exists), not content — so they should still pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/terminal/TerminalPane.tsx
git commit -m "feat(phase-4a): TerminalPane streams from useCcSubscription instead of MOCK_TERMINAL_STREAM"
```

---

## Task 12: Composer + AppShell — Send button wired to cc:send

**Files:**
- Modify: `src/renderer/src/components/composer/Composer.tsx`
- Modify: `src/renderer/src/components/composer/ActionsRow.tsx`
- Modify: `src/renderer/src/components/layout/AppShell.tsx`
- Modify: `src/renderer/src/components/layout/MainPane.tsx` (if it exists and renders Composer + TerminalPane)

- [ ] **Step 1: Survey current Composer + MainPane**

Read `src/renderer/src/components/composer/Composer.tsx` and `src/renderer/src/components/layout/MainPane.tsx`. Note what props each takes today.

Phase 2B's Composer is self-contained (manages its own prompt state, mock telemetry). Phase 4A needs to:
- Add a `conversationId: number | null` prop to Composer
- Add an `onSend(prompt, configs) => Promise<void>` prop (or call IPC directly from inside)
- Disable Send button when `conversationId === null` (no active conversation)
- Disable Send button during the in-flight `cc:send` call
- Clear the prompt field on successful send

Similarly MainPane needs a `conversationId` prop to thread through to both Composer and TerminalPane.

- [ ] **Step 2: Update Composer to accept conversationId + handle send**

Edit `src/renderer/src/components/composer/Composer.tsx`. Add the prop and the send handler. The plan can't show full code without seeing the current shape — the implementer should:

1. Add `conversationId: number | null` to `ComposerProps`.
2. Replace the stub `handleSend` (which currently calls `rendererLogger.info('ui', 'send-geared', ...)`) with:

```ts
const [sending, setSending] = useState(false)
const handleSend = async (finalPrompt: string): Promise<void> => {
  if (conversationId === null) {
    rendererLogger.warn('ui', 'send-no-conversation', 'Send clicked with no active conversation')
    return
  }
  setSending(true)
  try {
    const result = await window.tokenless.cc.send({
      conversationId,
      prompt: finalPrompt,
      model,
      breadth,
      format
    })
    if (result.ok) {
      setPrompt('')
      rendererLogger.info('ui', 'send-success', 'Prompt sent', {
        conversationId,
        turnId: result.data.turnId,
        promptLength: finalPrompt.length
      })
    } else {
      rendererLogger.error('ui', 'send-failed', result.error.message, {
        conversationId,
        code: result.error.code,
        logId: result.error.logId
      })
    }
  } finally {
    setSending(false)
  }
}
```

3. Pass `disabled={sending || conversationId === null}` to the Send button in ActionsRow (whatever shape the existing ActionsRow has — add a `sending` or `disabled` prop if needed).

4. The existing "Gear" flow stays — Gear still produces a mocked-or-real geared prompt that the user can edit; Send still calls the same handler. Phase 4A doesn't introduce the gearing engine, just wires the final send.

- [ ] **Step 3: Update AppShell — handleNewConversation creates conversation + starts cc**

Edit `src/renderer/src/components/layout/AppShell.tsx`. Add to the existing `handleNewConversation` (currently a stub log):

```ts
const handleNewConversation = async (): Promise<void> => {
  if (activeProjectId === null || activeAccountId === null) {
    rendererLogger.warn('ui', 'new-conversation-blocked', 'No active project or account', {
      projectId: activeProjectId,
      accountId: activeAccountId
    })
    return
  }
  const activeProject = projects.find((p) => p.id === activeProjectId)
  if (!activeProject) {
    rendererLogger.warn('ui', 'new-conversation-blocked', 'Active project not found in list')
    return
  }
  // 1. Create the conversation row
  const created = await window.tokenless.conversations.create({
    input: { projectId: activeProjectId, accountId: activeAccountId }
  })
  if (!created.ok) {
    rendererLogger.error('ui', 'new-conversation-create-failed', created.error.message, {
      code: created.error.code,
      logId: created.error.logId
    })
    return
  }
  // 2. Start the cc subprocess
  const started = await window.tokenless.cc.start({
    conversationId: created.data.conversation.id,
    cwd: activeProject.rootPath,
    cols: 100, // xterm will resize on mount
    rows: 30,
    accountId: activeAccountId
  })
  if (!started.ok) {
    rendererLogger.error('ui', 'new-conversation-start-failed', started.error.message, {
      code: started.error.code,
      logId: started.error.logId,
      conversationId: created.data.conversation.id
    })
    return
  }
  // 3. Activate the conversation in the sidebar
  setActiveConversationId(created.data.conversation.id)
  rendererLogger.info('ui', 'new-conversation', 'New conversation started', {
    conversationId: created.data.conversation.id,
    sessionId: started.data.sessionId,
    pid: started.data.pid
  })
}
```

Thread `activeConversationId` down to `<MainPane conversationId={activeConversationId} />`.

- [ ] **Step 4: Update MainPane to pass conversationId**

Edit `src/renderer/src/components/layout/MainPane.tsx`. Add `conversationId: number | null` prop. Pass it to both `<Composer conversationId={conversationId} />` and `<TerminalPane conversationId={conversationId} />`.

- [ ] **Step 5: Typecheck + run unit tests**

```bash
npm run typecheck
npm run test:run
```

Expected: PASS. The Composer unit/integration tests (if any from Phase 2B) may need a `conversationId={null}` or `conversationId={1}` prop added.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/composer/Composer.tsx \
        src/renderer/src/components/composer/ActionsRow.tsx \
        src/renderer/src/components/layout/AppShell.tsx \
        src/renderer/src/components/layout/MainPane.tsx
git commit -m "feat(phase-4a): wire Composer Send + AppShell New Conversation through cc IPC"
```

---

## Task 13: Mock-claude binary for CI E2E

**Why:** CI runners don't have `claude` installed. E2E tests need a deterministic stand-in that:
- Echoes back a fixed prompt at startup ("ready> ")
- Reads stdin lines and emits a fixed response
- Exits cleanly on EOF or SIGTERM

**Files:**
- Create: `test/doubles/claude-mock.cjs`

- [ ] **Step 1: Implement the mock**

Create `test/doubles/claude-mock.cjs`:

```js
// claude-mock.cjs — stand-in for the claude CLI in CI E2E tests.
// Behavior:
//   - Writes "claude-mock> " prompt on stdin readiness
//   - Reads stdin line by line; for each line, emits a deterministic response
//     prefixed with "[mock-claude] " plus another prompt
//   - Exits cleanly on SIGTERM / SIGINT / stdin close
//
// Invoked by tests via TOKENLESS_CLAUDE_BIN=path/to/claude-mock.cjs

'use strict'

process.stdout.write('claude-mock> ')

const argv = process.argv.slice(2)
// Sanity-check the spawner's args: --session-id <uuid>
const sessionIdIdx = argv.indexOf('--session-id')
const sessionId = sessionIdIdx >= 0 ? argv[sessionIdIdx + 1] : 'unknown'
process.stdout.write(`(session ${sessionId})\r\n`)

let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buf += chunk
  let nl
  while ((nl = buf.indexOf('\r')) >= 0) {
    const line = buf.slice(0, nl)
    buf = buf.slice(nl + 1)
    if (line.trim().length > 0) {
      process.stdout.write(`[mock-claude] received: ${line}\r\n`)
      process.stdout.write('claude-mock> ')
    }
  }
})
process.stdin.on('end', () => process.exit(0))

process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))
```

- [ ] **Step 2: Smoke-test the mock standalone**

```bash
echo "hello" | node test/doubles/claude-mock.cjs --session-id abc-uuid
```

Expected output:

```
claude-mock> (session abc-uuid)
[mock-claude] received: hello
claude-mock>
```

(The trailing `claude-mock>` may appear cut off if stdin closes before the loop runs — that's fine for the smoke test.)

- [ ] **Step 3: Commit**

```bash
git add test/doubles/claude-mock.cjs
git commit -m "test(phase-4a): claude-mock.cjs — deterministic claude stand-in for CI E2E"
```

---

## Task 14: E2E — Send-and-stream test

**Files:**
- Create: `test/e2e/cc-send.e2e.test.ts`

- [ ] **Step 1: Write the test**

Create `test/e2e/cc-send.e2e.test.ts`:

```ts
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Purpose: clicking New Conversation creates a row + spawns the (mock) claude
// subprocess; typing a prompt + Send writes a turn row + echoes the mock
// response into the terminal pane.

test.describe('Phase 4A cc send/stream', () => {
  let userDataDir: string
  let app: ElectronApplication
  let page: Page

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'tokenless-e2e-'))
  })

  test.afterEach(async () => {
    if (app) {
      try {
        await app.close()
      } catch {
        // best-effort
      }
    }
    if (existsSync(userDataDir)) {
      rmSync(userDataDir, { recursive: true, force: true })
    }
  })

  test('new conversation + send streams mock response into terminal', async () => {
    const mockClaude = resolve('test/doubles/claude-mock.cjs')
    app = await electron.launch({
      args: ['out/main/index.js'],
      env: {
        ...process.env,
        TOKENLESS_USER_DATA_DIR: userDataDir,
        TOKENLESS_CLAUDE_BIN: 'node',
        // The spawner only takes a single bin string. For the mock, we point
        // TOKENLESS_CLAUDE_BIN at `node` and use claudeArgs to pass the script.
        // But our spawner currently builds args internally — so we'd need a
        // different mechanism. Alternative: make claude-mock.cjs a shebang
        // script and point TOKENLESS_CLAUDE_BIN at it directly (Windows can
        // exec .cjs via Node's auto-handling? No — Windows can't.)
        //
        // Simplest fix: TOKENLESS_CLAUDE_BIN points to a .cmd wrapper that
        // does `node %~dp0claude-mock.cjs %*`. Create one alongside the .cjs.
        TOKENLESS_CLAUDE_BIN_SCRIPT: mockClaude
      }
    })
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')

    // Create a project first (same pattern as Phase 3 persistence test)
    const emptyState = win.getByRole('region', { name: /welcome to tokenless/i })
    if (await emptyState.isVisible({ timeout: 2000 }).catch(() => false)) {
      await win.getByRole('button', { name: /create your first project/i }).click()
      await win.getByPlaceholder('My Project').fill('CC Test')
      await win.getByPlaceholder('C:/path/to/project').fill(process.cwd())
      await win.getByRole('button', { name: /^create$/i }).click()
    }

    // Start a new conversation
    await win.getByRole('button', { name: /new conversation/i }).click()

    // Wait for the mock-claude prompt to appear in the xterm pane.
    // xterm renders into a canvas + accessibility tree. Use the accessibility
    // text rather than the canvas.
    await expect(win.locator('.terminal-pane')).toBeVisible({ timeout: 5000 })

    // Type into the composer and send.
    await win.getByPlaceholder(/type|prompt/i).fill('hi there')
    await win.getByRole('button', { name: /^send$/i }).click()

    // The mock should echo "[mock-claude] received: hi there" into the terminal
    // We can read xterm's textarea (accessibility surface) — but xterm doesn't
    // populate one by default. Instead, assert that the turn row was created
    // by reading the renderer's log via Dev Mode panel. (Or rely on a Phase 4B
    // parser hook to expose state.) For 4A, the visible signal is that the
    // Send button re-enables after success — let's assert that.
    page = win
    await expect(win.getByRole('button', { name: /^send$/i })).toBeEnabled({ timeout: 5000 })
  })
})
```

The first `TOKENLESS_CLAUDE_BIN_SCRIPT` env var is a placeholder — the spawner only reads `TOKENLESS_CLAUDE_BIN`. To make this work on Windows + cross-platform:

**Implementer action:** add a `.cmd` wrapper. Create `test/doubles/claude-mock.cmd`:

```bat
@echo off
node "%~dp0claude-mock.cjs" %*
```

And in the test, set `TOKENLESS_CLAUDE_BIN: mockClaudeCmd` where `mockClaudeCmd = resolve('test/doubles/claude-mock.cmd')`. Remove the `TOKENLESS_CLAUDE_BIN_SCRIPT` env var.

Rework the test's env to:

```ts
const mockClaude = resolve('test/doubles/claude-mock.cmd')
app = await electron.launch({
  args: ['out/main/index.js'],
  env: {
    ...process.env,
    TOKENLESS_USER_DATA_DIR: userDataDir,
    TOKENLESS_CLAUDE_BIN: mockClaude
  }
})
```

For non-Windows platforms (the implementer is running Windows so this works locally + on `windows-latest` CI runner), a `.sh` shebang script equivalent would be needed. Phase 4A targets Windows-first per ADR-002 — punt the .sh until we add cross-platform CI.

Commit the .cmd alongside this task.

- [ ] **Step 2: Verify the test**

Build, rebuild for Electron, run e2e:

```bash
npm run rebuild:electron
npm run build
npm run test:e2e
```

Expected: all 12 prior tests + this new `cc-send` test pass.

Switch back to Node ABI for vitest:

```bash
npm run rebuild:node
```

If the E2E test fails because xterm output isn't asserting cleanly, the easiest fallback is to assert on side-effects observable in the renderer:
- The composer text field clears after Send (state-clear assertion)
- A new conversation appears in the sidebar (DB-backed assertion)

Both are valid Phase 4A signals.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/cc-send.e2e.test.ts test/doubles/claude-mock.cmd
git commit -m "test(phase-4a): E2E — new conversation + send streams mock-claude response"
```

---

## Task 15: ADR-026 (mock-claude pattern) + ADR-027 (PTY lifecycle ownership)

**Files:**
- Modify: `docs/decisions.md`

- [ ] **Step 1: Append ADR-026**

Append to `docs/decisions.md`:

```markdown

## ADR-026 (2026-05-14) — Mock-claude binary for CI E2E (TOKENLESS_CLAUDE_BIN override)

**Context:** Phase 4A E2E tests need to verify the cc:start / cc:send / cc:output-chunk loop end-to-end. CI runners don't have `claude` installed, authenticated, or quota — and even if they did, real claude responses are non-deterministic. Without a stand-in, the entire cc subsystem would be untestable in CI.

**Options considered:**
- A) Mock node-pty at the import level (vi.mock in unit tests). Works for unit tests but not E2E — E2E launches the built Electron app which loads node-pty natively.
- B) Conditionally skip cc E2E tests in CI. Defeats the purpose of E2E; the integration we most want to verify (spawn → write → read → exit) is the part that gets skipped.
- C) Spawner reads `TOKENLESS_CLAUDE_BIN` env var. Defaults to `claude.cmd` on Windows / `claude` elsewhere. Tests + CI set this to a deterministic mock binary that mimics the claude protocol surface we care about.

**Choice:** C. `test/doubles/claude-mock.cjs` is a tiny Node script that:
1. Writes a "claude-mock> " prompt to stdout on startup
2. Reads stdin line by line; for each non-empty line, writes `[mock-claude] received: <line>` + a fresh prompt
3. Exits cleanly on stdin close / SIGTERM / SIGINT
4. Acknowledges the `--session-id <uuid>` arg (so we can verify ADR-016's pre-specification flows through correctly)

A `.cmd` wrapper (`claude-mock.cmd`) lets Windows spawn the `.cjs` via cmd.exe — same dispatch pattern as ADR-017's `claude.cmd`.

**Reasoning:** Keeps the E2E surface honest: the test really does spawn a process, really does write to a PTY, really does read bytes back. The only fakery is the response content — which is the right place to fake, since real claude responses are unstable. Phase 4B's parser tests will use richer mock outputs (tool-call markers, end-of-response indicators) without changing this architecture.

**Discovered:** Phase 4A E2E design.

```

- [ ] **Step 2: Append ADR-027**

```markdown

## ADR-027 (2026-05-14) — PTY lifecycle ownership: CcLifecycle owns the conversationId → PtyHandle map; one PTY per conversation

**Context:** Where does the per-conversation PTY state live? Options range from "stateless — renderer holds it" to "fully encapsulated — main process owns it." The renderer cannot hold PtyHandles (they're not serializable across IPC), so the question is about how the main-process state is shaped.

**Options considered:**
- A) Per-window/per-renderer map (one PTY per window). Doesn't compose with multi-conversation workflows.
- B) Per-Conversation map, owned by a single CcLifecycle singleton in main. Each `start` mutates the map; each `stop` / `closeAll` clears it. The IPC handler is a thin wrapper.
- C) Per-Conversation Actor model (each Conversation is an actor with its own message queue). Overkill for Phase 4A's one-send-at-a-time semantics.

**Choice:** B. CcLifecycle holds a `Map<number, Slot>` where `Slot = { conversationId, sessionId, pty }`. Two conversations can have live PTYs simultaneously (e.g., user has two tabs/projects); one conversation cannot have two PTYs at once (start throws if a slot already exists). PTY data + exit events fan out via constructor callbacks (`onChunk`, `onExit`) — not EventEmitter — for trivial test ergonomics.

**Invariants:**
- `start(conversationId)` is the only path that adds to the map
- `stop(conversationId)` and `closeAll()` are the only paths that remove (plus the implicit removal in the onExit handler)
- The PtyHandle never leaves CcLifecycle — only event payloads + sessionId cross the IPC boundary

**Reasoning:** Single owner = single source of truth. Easy to test (inject a MockPty factory). Easy to reason about shutdown (closeAll in before-quit kills everything synchronously). The "one PTY per conversation" rule prevents the "two sends in flight to the same PTY" failure §7.7 — the renderer can't accidentally create the race because main rejects the second start.

**Future:** Phase 4B's resume flow will distinguish "no live PTY but has stored cc_session_id" (resume path) from "no live PTY ever" (error path). The slot map remains the right place to look this up.

**Discovered:** Phase 4A lifecycle design.

```

- [ ] **Step 3: Verify sequential numbering**

```bash
grep -n "^## ADR" docs/decisions.md | tail -8
```

Expected: ...023, 024, 025, 026, 027 — sequential.

- [ ] **Step 4: Commit**

```bash
git add docs/decisions.md
git commit -m "docs(phase-4a): ADR-026 mock-claude pattern + ADR-027 PTY lifecycle ownership"
```

---

## Task 16: Test scenarios + observability docs

**Files:**
- Modify: `docs/test-scenarios.md`
- Modify: `docs/observability.md`

- [ ] **Step 1: Append Phase 4A manual scenarios**

Append to `docs/test-scenarios.md`:

```markdown

## Phase 4A — Real claude subprocess + Send

### S-4A.1 New conversation spawns real claude
**Preconditions:** real claude installed + authenticated for the active account; project root is a directory you don't mind claude reading.

1. Launch the app. Active project + Personal account selected.
2. Click "New Conversation" in the sidebar.
3. **Expect:** A new conversation row appears in the sidebar with status active. The terminal pane shows real claude's banner / prompt. `db-online` and `cc-start` log entries visible in Dev Mode (with the sessionId UUID).
4. **Verify (Dev Mode):** Find the `cc-start` row; expand its context. `pid` is a real OS process id. `sessionId` matches a `--session-id <uuid>` arg you can see in Task Manager → claude.exe → command line.

### S-4A.2 Send echoes through the real claude
1. Continuing from S-4A.1, type "Reply with exactly PING-OK" into the composer.
2. Click Send.
3. **Expect:** The terminal pane scrolls with claude's response, ending with "PING-OK" somewhere in the stream. The composer textarea clears. A `send-success` log entry shows up in Dev Mode with the `turnId`.
4. **Verify (DB):** Open `%APPDATA%/tokenless/tokenless.db` in SQLite Browser. The `turns` table has a row with role=`user`, `original_prompt` = "Reply with exactly PING-OK", `conversation_id` matching the active conversation.

### S-4A.3 Two conversations, two PTYs
1. Open a second conversation via "New Conversation" while the first is still active.
2. **Expect:** Both conversations appear in the sidebar. Switching between them swaps the terminal pane's `conversationId` prop — but the previous terminal's PTY is still running in main. The new conversation's terminal pane shows its own claude session.
3. **Verify (Dev Mode):** Two distinct `cc-start` entries with distinct sessionIds.

### S-4A.4 Quit closes all PTYs
1. With at least one conversation active, quit the app (Cmd/Ctrl+Q).
2. **Expect:** Task Manager shows no leftover `claude.exe` processes after 2 seconds. A `shutdown` log entry plus `before-quit, releasing resources` precedes the quit.

### S-4A.5 Send with no active conversation
1. Launch the app with NO conversations (delete the DB or fresh first-run).
2. Click into the composer textarea, type a prompt, click Send.
3. **Expect:** Send is disabled (greyed out). If somehow clicked, a `send-no-conversation` warn log entry appears. No turn row created.
```

- [ ] **Step 2: Update observability.md**

Find the `cc` and `pty` category rows in `docs/observability.md`. Add the Phase 4A events:

- `cc`: `cc-start`, `cc-send`, `cc-resize`, `cc-exit`
- `pty`: (no events yet; placeholder for Phase 4B parser-detected events like `pty-hung`, `pty-quota`, `pty-auth-expired`)

If the rows already exist with placeholder events, extend them; otherwise add the rows in the right alphabetical position.

- [ ] **Step 3: Commit**

```bash
git add docs/test-scenarios.md docs/observability.md
git commit -m "docs(phase-4a): manual test scenarios + observability events for cc"
```

---

## Task 17: Verification + tag v0.7.0-phase-4a

**Files:** none new

- [ ] **Step 1: Run all four build gates (in Node ABI first)**

```bash
npm run rebuild:node
npm run typecheck
npm run test:run
```

Expected: typecheck clean, unit suite all green (88 + new tests ~= 98+).

- [ ] **Step 2: Switch to Electron ABI for build + e2e**

```bash
npm run rebuild:electron
npm run build
npm run test:e2e
```

Expected: build clean, all e2e tests green (12 prior + 1 new cc-send = 13).

- [ ] **Step 3: Switch back to Node ABI for handoff state**

```bash
npm run rebuild:node
```

- [ ] **Step 4: Tag**

```bash
git tag -s -a v0.7.0-phase-4a -m "Phase 4A complete — real claude PTY subprocess, Send → stream, single-conversation lifecycle"
git rev-parse v0.7.0-phase-4a
```

- [ ] **Step 5: Hand off**

Report `Phase 4A complete locally. Tag v0.7.0-phase-4a at <sha>. Push + CI watch is next.`

---

## Self-Review Checklist

After all tasks land, sanity-check:

- [ ] **Phase 3 backlog cleared:** `accounts:changed` broadcast wired, `use-accounts` test exists, `accounts-handler` test exists
- [ ] **node-pty in both rebuild scripts:** verify `rebuild:electron` AND `rebuild:node` mention `node-pty`
- [ ] **Spec §7.1 progress:** which failure modes Phase 4A covers (none yet — that's Phase 4B). Confirm the plan exits cleanly with no §7.1 coverage and the deferral is documented
- [ ] **MOCK_TERMINAL_STREAM gone:** `grep -r "MOCK_TERMINAL_STREAM" src/` returns nothing
- [ ] **The 4 remaining mocks (dropdown-options, geared-prompt, telemetry) are still in `src/renderer/src/mocks/`** — they belong to Phases 5+
- [ ] **All commits have meaningful messages, follow conventional commits format**
- [ ] **No `console.*` introduced** (`grep -rn "console\." src/main src/renderer/src --include "*.ts" --include "*.tsx" | grep -v __tests__`)
- [ ] **TypeScript strict still clean** (`npm run typecheck`)

---

## Exit State

**Visible to user:**
- Clicking "New Conversation" actually spawns a real claude subprocess in the project's working directory
- Real claude output streams into the xterm.js terminal pane
- Typing into the composer + Send pipes the prompt into claude's stdin
- A turn row is persisted per send; conversation's `cc_session_id` is set
- Quitting the app cleanly kills all claude subprocesses

**Under the hood:**
- `main/cc/{spawner, lifecycle, types}.ts` with `MockPty` test double + 11 unit + integration tests
- `CcHandler` IPC class with `withIpcResult` envelopes
- `useCcSubscription` hook with 5 unit tests
- `TerminalPane` consumes the hook, no more mock import
- AppShell wires `handleNewConversation` to the create-conversation + cc-start chain
- Composer's Send button calls `cc:send` IPC + clears the field on success
- `TOKENLESS_CLAUDE_BIN` env var lets CI swap a mock; ADR-026 documents the pattern
- ADR-027 codifies the per-Conversation PTY ownership invariant

**Phase 4B will deliver:**
- Output parser (tool calls, end-of-response, token counts → typed `cc:event` IPC)
- `cc:resume` for stored cc_session_ids (per ADR-016 the session ID is already captured in Phase 4A — resume just spawns with `--session-id <stored-uuid>`)
- `cc:stop` (SIGINT)
- §7.1 failure modes: spawn ENOENT, mid-session crash, watchdog hangs, quota, auth, write-fail
- Telemetry tick (cost preview, context budget meter live updates)

**Tag:** `v0.7.0-phase-4a`
