# Phase 3: Real Database + Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock projects/conversations/accounts data with a real SQLite-backed persistence layer. Projects and conversations survive app restarts; the sidebar populates from the database via typed IPC.

**Architecture:** Main process owns a singleton `Database` instance (better-sqlite3) opened at boot from `app.getPath('userData')/tokenless.db`. A migration runner applies version-numbered SQL files at startup. DAOs (one module per table) wrap the connection and expose typed methods. IPC handlers wrap each DAO method in `logger.errorBoundary('db', …)` and return `{ok, data} | {ok, error}` envelopes. Renderer hooks (`useProjects`, `useConversations`, `useAccounts`) subscribe to IPC + a lightweight `change` event so multiple components stay in sync. The mocks directory is removed at the end of the phase.

**Tech Stack:** better-sqlite3 9 (native Windows rebuild via @electron/rebuild), node:fs/promises, existing Logger + IPC infrastructure, existing React 18 hooks.

---

## File Structure

**New files (main process):**
- `src/main/db/connection.ts` — opens / closes singleton DB, sets pragmas
- `src/main/db/migrations/runner.ts` — applies pending migrations in order
- `src/main/db/migrations/001_init.sql` — full schema from spec §3 + indexes
- `src/main/db/migrations/index.ts` — registers migrations (ordered list)
- `src/main/db/dao/accounts.ts` — Account CRUD
- `src/main/db/dao/projects.ts` — Project CRUD
- `src/main/db/dao/conversations.ts` — Conversation CRUD
- `src/main/db/seed.ts` — first-run default account
- `src/main/db/index.ts` — barrel
- `src/main/ipc/accounts-handler.ts`
- `src/main/ipc/projects-handler.ts`
- `src/main/ipc/conversations-handler.ts`
- `src/main/__tests__/db/connection.test.ts`
- `src/main/__tests__/db/migrations-runner.test.ts`
- `src/main/__tests__/db/dao-accounts.test.ts`
- `src/main/__tests__/db/dao-projects.test.ts`
- `src/main/__tests__/db/dao-conversations.test.ts`
- `src/main/__tests__/ipc/projects-handler.test.ts`
- `src/main/__tests__/ipc/conversations-handler.test.ts`
- `test/doubles/test-db.ts` — opens `:memory:` DB with migrations applied
- `spikes/sqlite/index.ts` — throwaway native-module probe

**New files (shared):**
- `src/shared/types/accounts.ts` — `Account` (camelCase, what crosses IPC)
- `src/shared/types/projects.ts` — `Project`
- `src/shared/types/conversations.ts` — `Conversation`
- `src/shared/ipc/accounts.ts` — channels + payload types
- `src/shared/ipc/projects.ts` — channels + payload types
- `src/shared/ipc/conversations.ts` — channels + payload types
- `src/shared/ipc/envelope.ts` — `IpcResult<T>` `{ok, data}|{ok, error}`

**New files (renderer):**
- `src/renderer/src/hooks/use-accounts.ts`
- `src/renderer/src/hooks/use-projects.ts`
- `src/renderer/src/hooks/use-conversations.ts`
- `src/renderer/src/components/layout/CreateProjectModal.tsx`
- `src/renderer/src/components/layout/EmptyProjectsState.tsx`
- `src/renderer/src/components/onboarding/OnboardingBanner.tsx`

**Modified files:**
- `package.json` — add `better-sqlite3` + tsx-only `node-gyp` config
- `electron.vite.config.ts` — add `better-sqlite3` to `external`
- `src/preload/index.ts` — expose `accounts`, `projects`, `conversations` APIs
- `src/preload/index.d.ts` — declare new API surface
- `src/main/index.ts` — initialize DB + run migrations + seed + register handlers
- `src/main/ipc/index.ts` — register the 3 new handler families
- `src/renderer/src/components/layout/AppShell.tsx` — consume hooks, remove mock imports
- `src/renderer/src/components/layout/ProjectSwitcher.tsx` — use `Project` type from shared
- `src/renderer/src/components/layout/ConversationList.tsx` + `ConversationListItem.tsx` — use `Conversation` type
- `src/renderer/src/components/layout/AccountSwitcher.tsx` — use `Account` type
- `docs/decisions.md` — append ADR-023 + ADR-025
- `docs/observability.md` — document `db` category usage rows
- `docs/test-scenarios.md` — append Phase 3 manual scenarios
- `test/e2e/persistence.e2e.test.ts` — new file

**Deleted files (end of phase):**
- `src/renderer/src/mocks/projects.ts`
- `src/renderer/src/mocks/conversations.ts`
- `src/renderer/src/mocks/accounts.ts`
- (kept: `terminal-stream.ts`, `geared-prompt.ts`, `dropdown-options.ts`, `telemetry.ts` — replaced in later phases)

---

## Task 1: Install better-sqlite3 + verify native rebuild on Windows

**Files:**
- Modify: `package.json`
- Create: `spikes/sqlite/index.ts`

- [ ] **Step 1: Install better-sqlite3 + ensure @electron/rebuild is wired**

Run from repo root:

```bash
npm install better-sqlite3@^11.5.0
npm install --save-dev @types/better-sqlite3@^7.6.11
```

- [ ] **Step 2: Add postinstall rebuild hook**

Edit `package.json` `scripts`:

```json
"scripts": {
  ...
  "postinstall": "electron-rebuild --force --module-dir node_modules/better-sqlite3",
  "rebuild:native": "electron-rebuild --force"
}
```

Note: `rebuild:native` already exists from Phase 0; `postinstall` ensures fresh clones get the native build for Electron's ABI automatically.

- [ ] **Step 3: Mark better-sqlite3 external in electron.vite.config.ts**

Open `electron.vite.config.ts`. In the `main` section, ensure `rollupOptions.external` includes `'better-sqlite3'`:

```ts
main: {
  // ...
  build: {
    rollupOptions: {
      external: ['better-sqlite3', 'node-pty'] // node-pty already there
    }
  }
}
```

If `node-pty` is not already in the external list, leave as-is and add only `'better-sqlite3'` (node-pty's exclusion will be wired in Phase 4).

- [ ] **Step 4: Create the SQLite spike**

Create `spikes/sqlite/index.ts`:

```ts
// Throwaway spike: confirms better-sqlite3 builds for Electron's ABI on Windows
// and that the basic open / migrate / insert / select cycle works.
// Run via: npm run dev (this file is imported from main/index.ts under a flag)
// or manually: npx tsx spikes/sqlite/index.ts (uses Node ABI — won't catch
// Electron ABI mismatch, but is fine for sanity).

import Database from 'better-sqlite3'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unlinkSync, existsSync } from 'node:fs'

const dbPath = join(tmpdir(), `tokenless-spike-${Date.now()}.db`)

try {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `)

  const insert = db.prepare('INSERT INTO accounts (label, created_at) VALUES (?, ?)')
  const result = insert.run('Personal', Date.now())
  console.log('Inserted id:', result.lastInsertRowid)

  const rows = db.prepare('SELECT * FROM accounts').all()
  console.log('Rows:', rows)

  db.close()
  console.log('SQLite spike OK')
} finally {
  if (existsSync(dbPath)) unlinkSync(dbPath)
}
```

- [ ] **Step 5: Run the spike under Electron**

The spike must run inside Electron (not just Node) to catch ABI mismatches. Easiest path: temporarily import the spike from `src/main/index.ts` behind an env flag, then `npm run dev`:

Add to `src/main/index.ts` (temporary — removed before commit):

```ts
if (process.env['TOKENLESS_RUN_SPIKE'] === 'sqlite') {
  await import('../../spikes/sqlite/index.js')
}
```

Then run:

```bash
$env:TOKENLESS_RUN_SPIKE='sqlite'; npm run dev
```

Expected: window opens, terminal shows `Inserted id: 1`, `Rows: [{...}]`, `SQLite spike OK`. Close the app.

Remove the temporary import from `src/main/index.ts`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json electron.vite.config.ts spikes/sqlite/index.ts
git commit -m "feat(phase-3): install better-sqlite3 + Electron-ABI native rebuild spike"
```

---

## Task 2: ADR-023 — Database location, native build, migration strategy

**Files:**
- Modify: `docs/decisions.md`

- [ ] **Step 1: Append ADR-023**

Add to `docs/decisions.md`:

```markdown

## ADR-023 (2026-05-14) — SQLite via better-sqlite3, stored under `app.getPath('userData')`, schema applied by an idempotent migration runner

**Context:** Phase 3 needs persistent storage for projects, conversations, turns, accounts, drafts, templates, and settings. The spec (§3) prescribes "all persistence in one SQLite file" with version-numbered migrations and no ORM.

**Options considered:**
- A) better-sqlite3 (synchronous, native, fastest read path; well-supported on Electron)
- B) sql.js (pure-JS, WASM-backed; no native build but slow + can't write to disk transactionally)
- C) node-sqlite3 (async, callback-style, slower than better-sqlite3 in practice)

**Choice:** A — better-sqlite3 11.x. DB path = `path.join(app.getPath('userData'), 'tokenless.db')` (resolves to `%APPDATA%/tokenless/tokenless.db` on Windows). Native module rebuilt for Electron's ABI via `@electron/rebuild` in `postinstall`.

**Schema strategy:** All DDL lives in `src/main/db/migrations/NNN_*.sql`. A `_meta` table tracks `(version INTEGER PRIMARY KEY, applied_at INTEGER)`. At startup, the migration runner reads applied versions, applies any newer ones inside a transaction, and records the version. Order is deterministic via the numeric prefix. The whole startup is wrapped in `logger.errorBoundary('db', …)` — a corrupt DB surfaces as a fatal log and a user-facing error rather than a silent crash.

**Why `userData` over the spec's `~/.tokenless/`:** the spec was written platform-agnostically. `app.getPath('userData')` is the Electron convention, gets backed up with the user profile on Windows, and avoids polluting the user's home directory. Log files (Phase 1B) live under `~/.tokenless/logs/` for now — we'll consider migrating them in Phase 8 polish if it matters.

**Reasoning:** better-sqlite3's synchronous API drastically simplifies DAO code (no `await` rabbit hole through every handler), and its per-op latency on small queries is in the microsecond range — well under the IPC roundtrip cost. We accept the native-rebuild cost (mitigated by `postinstall` hook) because the alternative (sql.js) can't durable-write and the async wrapper (node-sqlite3) makes the code harder to test.

```

- [ ] **Step 2: Commit**

```bash
git add docs/decisions.md
git commit -m "docs(phase-3): ADR-023 better-sqlite3 + userData location + migration runner"
```

---

## Task 3: Test double — in-memory database with migrations applied

**Files:**
- Create: `test/doubles/test-db.ts`

- [ ] **Step 1: Write the test double**

Create `test/doubles/test-db.ts`:

```ts
// In-memory SQLite for unit/integration tests. Returns a fresh, fully migrated
// DB on each call. Tests do not share state. Used by DAO + IPC-handler tests.

import Database, { type Database as DB } from 'better-sqlite3'

import { runMigrations } from '../../src/main/db/migrations/runner'

export function createTestDb(): DB {
  const db = new Database(':memory:')
  db.pragma('journal_mode = MEMORY')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}
```

Note: This file imports from `src/main/db/migrations/runner`, which doesn't exist yet — Tasks 4-7 create it. The test double is created here so it can be referenced in the very first migration runner test in Task 5.

- [ ] **Step 2: Commit (will commit alongside Task 4 — leave file uncommitted)**

Do not commit yet. The file references modules that don't compile. Task 4 will land first, then we commit this test double together with Task 5's first DAO test.

---

## Task 4: DB connection module

**Files:**
- Create: `src/main/db/connection.ts`
- Create: `src/main/__tests__/db/connection.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/db/connection.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { openDatabase, closeDatabase } from '../../db/connection'

// Purpose: openDatabase returns a working connection with WAL + FKs enabled,
// closeDatabase is idempotent, and the file is created at the requested path.

describe('db/connection', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'tokenless-conn-'))
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('opens a writable database at the given path with WAL + foreign keys', () => {
    const db = openDatabase(join(tmp, 'test.db'))
    expect(db.open).toBe(true)
    const journalMode = db.pragma('journal_mode', { simple: true })
    const fks = db.pragma('foreign_keys', { simple: true })
    expect(journalMode).toBe('wal')
    expect(fks).toBe(1)
    closeDatabase(db)
  })

  it('closeDatabase is idempotent — calling twice does not throw', () => {
    const db = openDatabase(join(tmp, 'test.db'))
    closeDatabase(db)
    expect(() => closeDatabase(db)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/main/__tests__/db/connection.test.ts
```

Expected: FAIL — `connection` module not found.

- [ ] **Step 3: Implement the module**

Create `src/main/db/connection.ts`:

```ts
// Opens, configures, and closes the SQLite connection for the main process.
// Single-purpose: pragmas + close idempotency. Migration application is the
// runner's job (db/migrations/runner.ts). Tests use :memory: paths.

import BetterSqlite3, { type Database } from 'better-sqlite3'

export function openDatabase(filePath: string): Database {
  const db = new BetterSqlite3(filePath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

export function closeDatabase(db: Database): void {
  if (db.open) {
    db.close()
  }
}

export type { Database }
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm run test:run -- src/main/__tests__/db/connection.test.ts
```

Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add src/main/db/connection.ts src/main/__tests__/db/connection.test.ts
git commit -m "feat(phase-3): db connection module (open, close, WAL, FKs)"
```

---

## Task 5: Migration runner

**Files:**
- Create: `src/main/db/migrations/runner.ts`
- Create: `src/main/db/migrations/index.ts`
- Create: `src/main/__tests__/db/migrations-runner.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/db/migrations-runner.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'

import { runMigrations, listAppliedVersions } from '../../db/migrations/runner'
import type { Migration } from '../../db/migrations/runner'

// Purpose: the runner applies pending migrations in version order, records them
// in _meta, is idempotent across runs, and atomically rolls back a batch on
// failure (so we never end up with a half-applied schema).

describe('db/migrations/runner', () => {
  const m1: Migration = {
    version: 1,
    name: 'create_users',
    sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)'
  }
  const m2: Migration = {
    version: 2,
    name: 'add_email',
    sql: 'ALTER TABLE users ADD COLUMN email TEXT'
  }
  const broken: Migration = {
    version: 3,
    name: 'broken',
    sql: 'CREATE TABLE BAD SYNTAX(((' // invalid SQL
  }

  it('applies migrations in order and records versions in _meta', () => {
    const db = new BetterSqlite3(':memory:')
    runMigrations(db, [m1, m2])
    expect(listAppliedVersions(db)).toEqual([1, 2])
  })

  it('is idempotent — running twice applies each migration once', () => {
    const db = new BetterSqlite3(':memory:')
    runMigrations(db, [m1, m2])
    runMigrations(db, [m1, m2])
    expect(listAppliedVersions(db)).toEqual([1, 2])
  })

  it('skips migrations whose version is already in _meta', () => {
    const db = new BetterSqlite3(':memory:')
    runMigrations(db, [m1])
    // Re-running with both should apply only m2
    runMigrations(db, [m1, m2])
    expect(listAppliedVersions(db)).toEqual([1, 2])
  })

  it('rolls back on failure so a half-applied batch is impossible', () => {
    const db = new BetterSqlite3(':memory:')
    expect(() => runMigrations(db, [m1, broken])).toThrow()
    // m1 should NOT have been applied because the transaction wrapping the
    // batch rolls back.
    expect(listAppliedVersions(db)).toEqual([])
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/main/__tests__/db/migrations-runner.test.ts
```

Expected: FAIL — `migrations/runner` module not found.

- [ ] **Step 3: Implement the runner**

Create `src/main/db/migrations/runner.ts`:

```ts
// Migration runner. Applies version-numbered SQL chunks in order, recording
// applied versions in a `_meta` table. The batch is wrapped in a transaction
// — any failure rolls the whole batch back so we never have a partial schema.

import type { Database } from 'better-sqlite3'

export interface Migration {
  readonly version: number
  readonly name: string
  readonly sql: string
}

function ensureMetaTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _meta (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `)
}

export function listAppliedVersions(db: Database): readonly number[] {
  ensureMetaTable(db)
  const rows = db
    .prepare<[], { version: number }>('SELECT version FROM _meta ORDER BY version ASC')
    .all()
  return rows.map((r) => r.version)
}

export function runMigrations(db: Database, migrations: readonly Migration[]): void {
  ensureMetaTable(db)
  const applied = new Set(listAppliedVersions(db))
  const pending = migrations
    .filter((m) => !applied.has(m.version))
    .slice()
    .sort((a, b) => a.version - b.version)
  if (pending.length === 0) return

  const apply = db.transaction((batch: readonly Migration[]) => {
    const record = db.prepare(
      'INSERT INTO _meta (version, name, applied_at) VALUES (?, ?, ?)'
    )
    for (const m of batch) {
      db.exec(m.sql)
      record.run(m.version, m.name, Date.now())
    }
  })

  apply(pending)
}
```

- [ ] **Step 4: Create the registered-migrations index (empty initial schema for now — Task 6 fills it in)**

Create `src/main/db/migrations/index.ts`:

```ts
// Registered, ordered migrations. Numeric prefix in the file name determines
// version. Append-only: never edit an existing migration; add a new one.

import type { Migration } from './runner'

// Will be populated by Task 6 with the initial schema migration.
export const MIGRATIONS: readonly Migration[] = []
```

- [ ] **Step 5: Run to confirm pass**

```bash
npm run test:run -- src/main/__tests__/db/migrations-runner.test.ts
```

Expected: PASS (4/4).

- [ ] **Step 6: Commit (now also includes the test double from Task 3)**

```bash
git add src/main/db/migrations/runner.ts src/main/db/migrations/index.ts \
        src/main/__tests__/db/migrations-runner.test.ts test/doubles/test-db.ts
git commit -m "feat(phase-3): idempotent migration runner with transactional rollback + in-memory test double"
```

---

## Task 6: Initial schema migration (spec §3 — all tables)

**Files:**
- Create: `src/main/db/migrations/001_init.sql`
- Modify: `src/main/db/migrations/index.ts`
- Modify: `src/main/__tests__/db/migrations-runner.test.ts` (add a test that uses the real migration)

- [ ] **Step 1: Write the initial schema**

Create `src/main/db/migrations/001_init.sql`:

```sql
-- Initial schema. Mirrors spec §3 exactly. Indexes follow each table.
-- All TEXT columns use NULL semantics (no NOT NULL unless required by spec).

CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  config_dir TEXT NOT NULL,
  api_key_ref TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  default_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  default_model TEXT,
  default_breadth TEXT,
  default_format TEXT,
  default_commit_prompt TEXT,
  default_push_prompt TEXT,
  notes TEXT,
  always_include_files_json TEXT,
  relevant_skill_ids_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  path TEXT NOT NULL,
  favorited INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER
);

CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  cc_session_id TEXT,
  title TEXT,
  model TEXT,
  breadth TEXT,
  format TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  summary TEXT,
  summary_updated_at INTEGER,
  parent_conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
  branched_at_turn_id INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ended_at INTEGER,
  archived_at INTEGER
);

CREATE TABLE turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  original_prompt TEXT,
  geared_prompt TEXT,
  response_text TEXT,
  original_tokens INTEGER,
  geared_tokens INTEGER,
  response_tokens INTEGER,
  haiku_meta_tokens INTEGER,
  model_used TEXT,
  feedback TEXT,
  critique_flags_json TEXT,
  status TEXT,
  sent_at INTEGER NOT NULL
);

CREATE TABLE drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(conversation_id)
);

CREATE TABLE templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  description TEXT,
  category TEXT,
  builtin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Indexes (spec §3)
CREATE INDEX idx_conversations_project_updated ON conversations(project_id, updated_at DESC);
CREATE INDEX idx_turns_conversation_sent ON turns(conversation_id, sent_at ASC);
CREATE INDEX idx_skills_favorited_hidden_name ON skills(favorited DESC, hidden ASC, name);
CREATE INDEX idx_turns_sent_at ON turns(sent_at);
CREATE INDEX idx_turns_feedback ON turns(feedback);
CREATE INDEX idx_drafts_conversation ON drafts(conversation_id);
```

Note: We added `api_key_ref` to `accounts` per ADR-018 (per-account `ANTHROPIC_API_KEY`); the spec's bare schema predates that ADR. The reference is a logical key into the OS keychain — empty string until Phase 6 wires real key storage.

- [ ] **Step 2: Wire the SQL into the migrations index**

Replace the contents of `src/main/db/migrations/index.ts`:

```ts
// Registered, ordered migrations. Numeric prefix in the file name determines
// version. Append-only: never edit an existing migration; add a new one.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Migration } from './runner'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadSql(file: string): string {
  return readFileSync(join(__dirname, file), 'utf8')
}

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'init', sql: loadSql('001_init.sql') }
]
```

- [ ] **Step 3: Configure electron-vite to copy SQL files into the build**

Open `electron.vite.config.ts`. In the `main` section, ensure `.sql` files are emitted as assets. If a plugin or `assetsInclude` is not already present, add:

```ts
main: {
  // existing config…
  assetsInclude: ['**/*.sql'],
  build: {
    rollupOptions: {
      external: ['better-sqlite3'],
      // Copy SQL files into the same relative location in out/main
      output: {
        assetFileNames: 'migrations/[name][extname]'
      }
    }
  }
}
```

Actually simpler — since `import.meta.url` will resolve to the bundled location, and we're using `readFileSync`, we need the SQL files **alongside** the bundled `index.js`. The cleanest approach: bundle the SQL content **inline** using Vite's `?raw` import.

Replace `src/main/db/migrations/index.ts` again — use `?raw` imports:

```ts
// Registered, ordered migrations. SQL files are inlined via Vite's ?raw
// import so they're present in the bundled main process.

import type { Migration } from './runner'

// eslint-disable-next-line import/no-unresolved
import init001 from './001_init.sql?raw'

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'init', sql: init001 }
]
```

Add the type declaration so TS recognizes `?raw`. Create `src/main/db/migrations/sql.d.ts`:

```ts
declare module '*.sql?raw' {
  const content: string
  export default content
}
```

- [ ] **Step 4: Add a test that applies the real migration**

Append to `src/main/__tests__/db/migrations-runner.test.ts`:

```ts
import { MIGRATIONS } from '../../db/migrations'

// Purpose: the real 001_init.sql migration applies cleanly and creates all
// expected tables.
describe('db/migrations/index — real schema', () => {
  it('applies 001_init and creates all spec §3 tables', () => {
    const db = new BetterSqlite3(':memory:')
    runMigrations(db, MIGRATIONS)
    const tables = db
      .prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_%'"
      )
      .all()
      .map((r) => r.name)
      .sort()
    expect(tables).toEqual([
      'accounts',
      'conversations',
      'drafts',
      'projects',
      'settings',
      'skills',
      'templates',
      'turns'
    ])
  })
})
```

- [ ] **Step 5: Run all migration tests**

```bash
npm run test:run -- src/main/__tests__/db/migrations-runner.test.ts
```

Expected: PASS (5/5).

- [ ] **Step 6: Commit**

```bash
git add src/main/db/migrations/001_init.sql src/main/db/migrations/index.ts \
        src/main/db/migrations/sql.d.ts src/main/__tests__/db/migrations-runner.test.ts
git commit -m "feat(phase-3): initial schema migration (spec §3 tables + indexes)"
```

---

## Task 7: Shared types — Account, Project, Conversation, IpcResult

**Files:**
- Create: `src/shared/ipc/envelope.ts`
- Create: `src/shared/types/accounts.ts`
- Create: `src/shared/types/projects.ts`
- Create: `src/shared/types/conversations.ts`

- [ ] **Step 1: Result envelope**

Create `src/shared/ipc/envelope.ts`:

```ts
// Every IPC handler that can fail returns one of these. The renderer never
// receives a thrown exception across the wire — handlers wrap their body in
// logger.errorBoundary and convert any throw into an IpcError envelope. The
// logId lets the user click "Open in Dev Mode" to see the full trace.

export interface IpcOk<T> {
  readonly ok: true
  readonly data: T
}

export interface IpcError {
  readonly ok: false
  readonly error: {
    readonly message: string
    readonly code: string
    readonly logId: string
  }
}

export type IpcResult<T> = IpcOk<T> | IpcError
```

- [ ] **Step 2: Account type**

Create `src/shared/types/accounts.ts`:

```ts
// Public Account shape that crosses the IPC boundary. Fields are camelCase
// (DAO maps snake_case <-> camelCase). config_dir per ADR-018 + ADR-005.

export interface Account {
  readonly id: number
  readonly label: string
  readonly configDir: string
  readonly apiKeyRef: string | null
  readonly createdAt: number
}

export interface CreateAccountInput {
  readonly label: string
  readonly configDir: string
  readonly apiKeyRef?: string | null
}
```

- [ ] **Step 3: Project type**

Create `src/shared/types/projects.ts`:

```ts
// Public Project shape that crosses the IPC boundary.

export type ModelHint = 'haiku' | 'sonnet' | 'opus'
export type BreadthHint = 'terse' | 'normal' | 'thorough'
export type FormatHint = 'prose' | 'bullets' | 'code' | 'json'

export interface Project {
  readonly id: number
  readonly name: string
  readonly rootPath: string
  readonly defaultAccountId: number | null
  readonly defaultModel: ModelHint | null
  readonly defaultBreadth: BreadthHint | null
  readonly defaultFormat: FormatHint | null
  readonly defaultCommitPrompt: string | null
  readonly defaultPushPrompt: string | null
  readonly notes: string | null
  readonly alwaysIncludeFiles: readonly string[]
  readonly relevantSkillIds: readonly number[]
  readonly createdAt: number
  readonly updatedAt: number
}

export interface CreateProjectInput {
  readonly name: string
  readonly rootPath: string
  readonly defaultAccountId?: number | null
  readonly defaultModel?: ModelHint | null
  readonly defaultBreadth?: BreadthHint | null
  readonly defaultFormat?: FormatHint | null
  readonly notes?: string | null
}

export interface UpdateProjectInput {
  readonly id: number
  readonly name?: string
  readonly rootPath?: string
  readonly defaultAccountId?: number | null
  readonly defaultModel?: ModelHint | null
  readonly defaultBreadth?: BreadthHint | null
  readonly defaultFormat?: FormatHint | null
  readonly defaultCommitPrompt?: string | null
  readonly defaultPushPrompt?: string | null
  readonly notes?: string | null
  readonly alwaysIncludeFiles?: readonly string[]
  readonly relevantSkillIds?: readonly number[]
}
```

- [ ] **Step 4: Conversation type**

Create `src/shared/types/conversations.ts`:

```ts
// Public Conversation shape that crosses the IPC boundary.

import type { ModelHint, BreadthHint, FormatHint } from './projects'

export type ConversationStatus = 'active' | 'ended'

export interface Conversation {
  readonly id: number
  readonly projectId: number
  readonly accountId: number | null
  readonly ccSessionId: string | null
  readonly title: string | null
  readonly model: ModelHint | null
  readonly breadth: BreadthHint | null
  readonly format: FormatHint | null
  readonly status: ConversationStatus
  readonly summary: string | null
  readonly summaryUpdatedAt: number | null
  readonly parentConversationId: number | null
  readonly branchedAtTurnId: number | null
  readonly createdAt: number
  readonly updatedAt: number
  readonly endedAt: number | null
  readonly archivedAt: number | null
}

export interface CreateConversationInput {
  readonly projectId: number
  readonly accountId?: number | null
  readonly title?: string | null
  readonly model?: ModelHint | null
  readonly breadth?: BreadthHint | null
  readonly format?: FormatHint | null
}

export interface UpdateConversationInput {
  readonly id: number
  readonly title?: string | null
  readonly status?: ConversationStatus
  readonly ccSessionId?: string | null
  readonly summary?: string | null
}
```

- [ ] **Step 5: Commit**

```bash
git add src/shared/ipc/envelope.ts src/shared/types
git commit -m "feat(phase-3): shared types — Account, Project, Conversation, IpcResult envelope"
```

---

## Task 8: AccountsDao

**Files:**
- Create: `src/main/db/dao/accounts.ts`
- Create: `src/main/__tests__/db/dao-accounts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/db/dao-accounts.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import {
  createAccount,
  getAccountById,
  listAccounts
} from '../../db/dao/accounts'

// Purpose: AccountsDao creates rows with createdAt set, retrieves by id, and
// lists in insertion order.

describe('db/dao/accounts', () => {
  let db: Database

  beforeEach(() => {
    db = createTestDb()
  })

  it('createAccount inserts a row and returns the new Account', () => {
    const a = createAccount(db, { label: 'Personal', configDir: 'C:/Users/me/.claude-personal' })
    expect(a.id).toBeGreaterThan(0)
    expect(a.label).toBe('Personal')
    expect(a.configDir).toBe('C:/Users/me/.claude-personal')
    expect(a.apiKeyRef).toBeNull()
    expect(a.createdAt).toBeGreaterThan(0)
  })

  it('getAccountById returns the account or null', () => {
    const a = createAccount(db, { label: 'Work', configDir: 'C:/Users/me/.claude' })
    expect(getAccountById(db, a.id)).toEqual(a)
    expect(getAccountById(db, 99999)).toBeNull()
  })

  it('listAccounts returns rows in id order (insertion order)', () => {
    const a = createAccount(db, { label: 'Personal', configDir: '/p' })
    const b = createAccount(db, { label: 'Work', configDir: '/w' })
    expect(listAccounts(db)).toEqual([a, b])
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/main/__tests__/db/dao-accounts.test.ts
```

Expected: FAIL — `dao/accounts` not found.

- [ ] **Step 3: Implement the DAO**

Create `src/main/db/dao/accounts.ts`:

```ts
// AccountsDao — Account CRUD. All functions take a Database connection as
// their first argument (no module-level state) so tests can use :memory: and
// production uses the singleton from connection.ts.

import type { Database } from 'better-sqlite3'

import type { Account, CreateAccountInput } from '@shared/types/accounts'

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
    apiKeyRef: r.api_key_ref,
    createdAt: r.created_at
  }
}

export function createAccount(db: Database, input: CreateAccountInput): Account {
  const now = Date.now()
  const stmt = db.prepare(
    'INSERT INTO accounts (label, config_dir, api_key_ref, created_at) VALUES (?, ?, ?, ?)'
  )
  const result = stmt.run(input.label, input.configDir, input.apiKeyRef ?? null, now)
  const id = Number(result.lastInsertRowid)
  return getAccountById(db, id) as Account
}

export function getAccountById(db: Database, id: number): Account | null {
  const row = db.prepare<[number], AccountRow>('SELECT * FROM accounts WHERE id = ?').get(id)
  return row ? rowToAccount(row) : null
}

export function listAccounts(db: Database): readonly Account[] {
  const rows = db
    .prepare<[], AccountRow>('SELECT * FROM accounts ORDER BY id ASC')
    .all()
  return rows.map(rowToAccount)
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm run test:run -- src/main/__tests__/db/dao-accounts.test.ts
```

Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/main/db/dao/accounts.ts src/main/__tests__/db/dao-accounts.test.ts
git commit -m "feat(phase-3): AccountsDao (create, getById, list)"
```

---

## Task 9: ProjectsDao

**Files:**
- Create: `src/main/db/dao/projects.ts`
- Create: `src/main/__tests__/db/dao-projects.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/db/dao-projects.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { createAccount } from '../../db/dao/accounts'
import {
  createProject,
  getProjectById,
  listProjects,
  updateProject,
  deleteProject
} from '../../db/dao/projects'

// Purpose: ProjectsDao supports full CRUD, serializes the json array columns
// correctly, and survives "no default account" (null FK).

describe('db/dao/projects', () => {
  let db: Database
  let accountId: number

  beforeEach(() => {
    db = createTestDb()
    accountId = createAccount(db, { label: 'Personal', configDir: '/p' }).id
  })

  it('createProject inserts and returns with defaults populated', () => {
    const p = createProject(db, {
      name: 'TokenLess',
      rootPath: 'C:/personal/tokenless',
      defaultAccountId: accountId
    })
    expect(p.id).toBeGreaterThan(0)
    expect(p.name).toBe('TokenLess')
    expect(p.alwaysIncludeFiles).toEqual([])
    expect(p.relevantSkillIds).toEqual([])
    expect(p.createdAt).toBeGreaterThan(0)
    expect(p.updatedAt).toBe(p.createdAt)
  })

  it('createProject works with no defaultAccountId', () => {
    const p = createProject(db, { name: 'Anon', rootPath: '/x' })
    expect(p.defaultAccountId).toBeNull()
  })

  it('listProjects returns rows ordered by name asc', () => {
    const a = createProject(db, { name: 'Zebra', rootPath: '/z' })
    const b = createProject(db, { name: 'Apple', rootPath: '/a' })
    expect(listProjects(db).map((p) => p.id)).toEqual([b.id, a.id])
  })

  it('updateProject sets fields, bumps updatedAt, and persists json columns', () => {
    const p = createProject(db, { name: 'Initial', rootPath: '/init' })
    const updated = updateProject(db, {
      id: p.id,
      name: 'Renamed',
      alwaysIncludeFiles: ['README.md', 'package.json']
    })
    expect(updated?.name).toBe('Renamed')
    expect(updated?.alwaysIncludeFiles).toEqual(['README.md', 'package.json'])
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(p.updatedAt)
  })

  it('updateProject returns null when id does not exist', () => {
    expect(updateProject(db, { id: 99999, name: 'X' })).toBeNull()
  })

  it('deleteProject removes the row and returns true', () => {
    const p = createProject(db, { name: 'Doomed', rootPath: '/x' })
    expect(deleteProject(db, p.id)).toBe(true)
    expect(getProjectById(db, p.id)).toBeNull()
  })

  it('deleteProject returns false when id does not exist', () => {
    expect(deleteProject(db, 99999)).toBe(false)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/main/__tests__/db/dao-projects.test.ts
```

Expected: FAIL — `dao/projects` not found.

- [ ] **Step 3: Implement the DAO**

Create `src/main/db/dao/projects.ts`:

```ts
// ProjectsDao — Project CRUD with snake_case <-> camelCase mapping and
// JSON serialization for array columns (always_include_files_json,
// relevant_skill_ids_json).

import type { Database } from 'better-sqlite3'

import type {
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  ModelHint,
  BreadthHint,
  FormatHint
} from '@shared/types/projects'

interface ProjectRow {
  id: number
  name: string
  root_path: string
  default_account_id: number | null
  default_model: string | null
  default_breadth: string | null
  default_format: string | null
  default_commit_prompt: string | null
  default_push_prompt: string | null
  notes: string | null
  always_include_files_json: string | null
  relevant_skill_ids_json: string | null
  created_at: number
  updated_at: number
}

function parseJsonArray<T>(value: string | null): readonly T[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function rowToProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    rootPath: r.root_path,
    defaultAccountId: r.default_account_id,
    defaultModel: r.default_model as ModelHint | null,
    defaultBreadth: r.default_breadth as BreadthHint | null,
    defaultFormat: r.default_format as FormatHint | null,
    defaultCommitPrompt: r.default_commit_prompt,
    defaultPushPrompt: r.default_push_prompt,
    notes: r.notes,
    alwaysIncludeFiles: parseJsonArray<string>(r.always_include_files_json),
    relevantSkillIds: parseJsonArray<number>(r.relevant_skill_ids_json),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export function createProject(db: Database, input: CreateProjectInput): Project {
  const now = Date.now()
  const stmt = db.prepare(`
    INSERT INTO projects (
      name, root_path, default_account_id, default_model, default_breadth,
      default_format, notes, always_include_files_json, relevant_skill_ids_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run(
    input.name,
    input.rootPath,
    input.defaultAccountId ?? null,
    input.defaultModel ?? null,
    input.defaultBreadth ?? null,
    input.defaultFormat ?? null,
    input.notes ?? null,
    JSON.stringify([]),
    JSON.stringify([]),
    now,
    now
  )
  return getProjectById(db, Number(result.lastInsertRowid)) as Project
}

export function getProjectById(db: Database, id: number): Project | null {
  const row = db.prepare<[number], ProjectRow>('SELECT * FROM projects WHERE id = ?').get(id)
  return row ? rowToProject(row) : null
}

export function listProjects(db: Database): readonly Project[] {
  const rows = db
    .prepare<[], ProjectRow>('SELECT * FROM projects ORDER BY name COLLATE NOCASE ASC')
    .all()
  return rows.map(rowToProject)
}

export function updateProject(db: Database, input: UpdateProjectInput): Project | null {
  const current = getProjectById(db, input.id)
  if (!current) return null

  const next: Project = {
    ...current,
    ...(input.name !== undefined && { name: input.name }),
    ...(input.rootPath !== undefined && { rootPath: input.rootPath }),
    ...(input.defaultAccountId !== undefined && { defaultAccountId: input.defaultAccountId }),
    ...(input.defaultModel !== undefined && { defaultModel: input.defaultModel }),
    ...(input.defaultBreadth !== undefined && { defaultBreadth: input.defaultBreadth }),
    ...(input.defaultFormat !== undefined && { defaultFormat: input.defaultFormat }),
    ...(input.defaultCommitPrompt !== undefined && { defaultCommitPrompt: input.defaultCommitPrompt }),
    ...(input.defaultPushPrompt !== undefined && { defaultPushPrompt: input.defaultPushPrompt }),
    ...(input.notes !== undefined && { notes: input.notes }),
    ...(input.alwaysIncludeFiles !== undefined && { alwaysIncludeFiles: input.alwaysIncludeFiles }),
    ...(input.relevantSkillIds !== undefined && { relevantSkillIds: input.relevantSkillIds }),
    updatedAt: Date.now()
  }

  db.prepare(`
    UPDATE projects SET
      name = ?,
      root_path = ?,
      default_account_id = ?,
      default_model = ?,
      default_breadth = ?,
      default_format = ?,
      default_commit_prompt = ?,
      default_push_prompt = ?,
      notes = ?,
      always_include_files_json = ?,
      relevant_skill_ids_json = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    next.name,
    next.rootPath,
    next.defaultAccountId,
    next.defaultModel,
    next.defaultBreadth,
    next.defaultFormat,
    next.defaultCommitPrompt,
    next.defaultPushPrompt,
    next.notes,
    JSON.stringify(next.alwaysIncludeFiles),
    JSON.stringify(next.relevantSkillIds),
    next.updatedAt,
    next.id
  )
  return next
}

export function deleteProject(db: Database, id: number): boolean {
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  return result.changes > 0
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm run test:run -- src/main/__tests__/db/dao-projects.test.ts
```

Expected: PASS (7/7).

- [ ] **Step 5: Commit**

```bash
git add src/main/db/dao/projects.ts src/main/__tests__/db/dao-projects.test.ts
git commit -m "feat(phase-3): ProjectsDao (create, getById, list, update, delete)"
```

---

## Task 10: ConversationsDao

**Files:**
- Create: `src/main/db/dao/conversations.ts`
- Create: `src/main/__tests__/db/dao-conversations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/db/dao-conversations.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { createAccount } from '../../db/dao/accounts'
import { createProject } from '../../db/dao/projects'
import {
  createConversation,
  getConversationById,
  listConversationsByProject,
  updateConversation,
  deleteConversation
} from '../../db/dao/conversations'

// Purpose: ConversationsDao supports create/read/list-by-project/update/delete
// with the project-scoped index used by the sidebar and correct default status.

describe('db/dao/conversations', () => {
  let db: Database
  let projectId: number
  let accountId: number

  beforeEach(() => {
    db = createTestDb()
    accountId = createAccount(db, { label: 'P', configDir: '/p' }).id
    projectId = createProject(db, {
      name: 'TokenLess',
      rootPath: '/x',
      defaultAccountId: accountId
    }).id
  })

  it('createConversation inserts with status=active and timestamps', () => {
    const c = createConversation(db, { projectId, accountId, title: 'Hello' })
    expect(c.id).toBeGreaterThan(0)
    expect(c.projectId).toBe(projectId)
    expect(c.status).toBe('active')
    expect(c.createdAt).toBeGreaterThan(0)
    expect(c.updatedAt).toBe(c.createdAt)
  })

  it('listConversationsByProject returns project-scoped rows in updated_at DESC order', async () => {
    const c1 = createConversation(db, { projectId, title: 'first' })
    // Force distinct timestamps
    await new Promise((r) => setTimeout(r, 5))
    const c2 = createConversation(db, { projectId, title: 'second' })
    // A conversation in a different project should not show up
    const otherProject = createProject(db, { name: 'Other', rootPath: '/o' }).id
    createConversation(db, { projectId: otherProject, title: 'elsewhere' })

    const list = listConversationsByProject(db, projectId)
    expect(list.map((c) => c.id)).toEqual([c2.id, c1.id])
  })

  it('updateConversation patches title + ccSessionId and bumps updatedAt', async () => {
    const c = createConversation(db, { projectId, title: 'before' })
    await new Promise((r) => setTimeout(r, 5))
    const updated = updateConversation(db, {
      id: c.id,
      title: 'after',
      ccSessionId: 'uuid-123'
    })
    expect(updated?.title).toBe('after')
    expect(updated?.ccSessionId).toBe('uuid-123')
    expect(updated?.updatedAt).toBeGreaterThan(c.updatedAt)
  })

  it('updateConversation status="ended" sets endedAt', () => {
    const c = createConversation(db, { projectId, title: 'live' })
    const updated = updateConversation(db, { id: c.id, status: 'ended' })
    expect(updated?.status).toBe('ended')
    expect(updated?.endedAt).not.toBeNull()
    expect(updated?.endedAt).toBeGreaterThan(0)
  })

  it('deleteConversation removes the row', () => {
    const c = createConversation(db, { projectId, title: 'doomed' })
    expect(deleteConversation(db, c.id)).toBe(true)
    expect(getConversationById(db, c.id)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/main/__tests__/db/dao-conversations.test.ts
```

Expected: FAIL — `dao/conversations` not found.

- [ ] **Step 3: Implement the DAO**

Create `src/main/db/dao/conversations.ts`:

```ts
// ConversationsDao — Conversation CRUD scoped to projects.
// listByProject uses the (project_id, updated_at DESC) index.

import type { Database } from 'better-sqlite3'

import type {
  Conversation,
  CreateConversationInput,
  UpdateConversationInput,
  ConversationStatus
} from '@shared/types/conversations'
import type { ModelHint, BreadthHint, FormatHint } from '@shared/types/projects'

interface ConversationRow {
  id: number
  project_id: number
  account_id: number | null
  cc_session_id: string | null
  title: string | null
  model: string | null
  breadth: string | null
  format: string | null
  status: string
  summary: string | null
  summary_updated_at: number | null
  parent_conversation_id: number | null
  branched_at_turn_id: number | null
  created_at: number
  updated_at: number
  ended_at: number | null
  archived_at: number | null
}

function rowToConversation(r: ConversationRow): Conversation {
  return {
    id: r.id,
    projectId: r.project_id,
    accountId: r.account_id,
    ccSessionId: r.cc_session_id,
    title: r.title,
    model: r.model as ModelHint | null,
    breadth: r.breadth as BreadthHint | null,
    format: r.format as FormatHint | null,
    status: r.status as ConversationStatus,
    summary: r.summary,
    summaryUpdatedAt: r.summary_updated_at,
    parentConversationId: r.parent_conversation_id,
    branchedAtTurnId: r.branched_at_turn_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    endedAt: r.ended_at,
    archivedAt: r.archived_at
  }
}

export function createConversation(
  db: Database,
  input: CreateConversationInput
): Conversation {
  const now = Date.now()
  const stmt = db.prepare(`
    INSERT INTO conversations (
      project_id, account_id, title, model, breadth, format, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `)
  const result = stmt.run(
    input.projectId,
    input.accountId ?? null,
    input.title ?? null,
    input.model ?? null,
    input.breadth ?? null,
    input.format ?? null,
    now,
    now
  )
  return getConversationById(db, Number(result.lastInsertRowid)) as Conversation
}

export function getConversationById(db: Database, id: number): Conversation | null {
  const row = db
    .prepare<[number], ConversationRow>('SELECT * FROM conversations WHERE id = ?')
    .get(id)
  return row ? rowToConversation(row) : null
}

export function listConversationsByProject(
  db: Database,
  projectId: number
): readonly Conversation[] {
  const rows = db
    .prepare<[number], ConversationRow>(
      'SELECT * FROM conversations WHERE project_id = ? AND archived_at IS NULL ORDER BY updated_at DESC, id DESC'
    )
    .all(projectId)
  return rows.map(rowToConversation)
}

export function updateConversation(
  db: Database,
  input: UpdateConversationInput
): Conversation | null {
  const current = getConversationById(db, input.id)
  if (!current) return null

  const now = Date.now()
  const status = input.status ?? current.status
  const endedAt =
    status === 'ended' && current.endedAt === null
      ? now
      : status === 'active' && current.endedAt !== null
        ? null
        : current.endedAt

  db.prepare(`
    UPDATE conversations SET
      title = ?,
      cc_session_id = ?,
      status = ?,
      summary = ?,
      updated_at = ?,
      ended_at = ?
    WHERE id = ?
  `).run(
    input.title !== undefined ? input.title : current.title,
    input.ccSessionId !== undefined ? input.ccSessionId : current.ccSessionId,
    status,
    input.summary !== undefined ? input.summary : current.summary,
    now,
    endedAt,
    input.id
  )
  return getConversationById(db, input.id)
}

export function deleteConversation(db: Database, id: number): boolean {
  const result = db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
  return result.changes > 0
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm run test:run -- src/main/__tests__/db/dao-conversations.test.ts
```

Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/main/db/dao/conversations.ts src/main/__tests__/db/dao-conversations.test.ts
git commit -m "feat(phase-3): ConversationsDao (create, getById, listByProject, update, delete)"
```

---

## Task 11: DB barrel + seed default account

**Files:**
- Create: `src/main/db/index.ts`
- Create: `src/main/db/seed.ts`
- Create: `src/main/__tests__/db/seed.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/db/seed.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { seedDefaultAccount } from '../../db/seed'
import { listAccounts } from '../../db/dao/accounts'

// Purpose: seedDefaultAccount creates a "Personal" account on first boot
// (empty DB) and is a no-op on subsequent boots.

describe('db/seed', () => {
  let db: Database

  beforeEach(() => {
    db = createTestDb()
  })

  it('creates a default account when the table is empty', () => {
    seedDefaultAccount(db)
    const accounts = listAccounts(db)
    expect(accounts).toHaveLength(1)
    expect(accounts[0].label).toBe('Personal')
  })

  it('is a no-op when at least one account already exists', () => {
    seedDefaultAccount(db)
    seedDefaultAccount(db)
    seedDefaultAccount(db)
    expect(listAccounts(db)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/main/__tests__/db/seed.test.ts
```

Expected: FAIL — `db/seed` not found.

- [ ] **Step 3: Implement seed**

Create `src/main/db/seed.ts`:

```ts
// First-run seed data. Idempotent — safe to call on every boot.

import type { Database } from 'better-sqlite3'

import { createAccount, listAccounts } from './dao/accounts'

export function seedDefaultAccount(db: Database): void {
  const existing = listAccounts(db)
  if (existing.length > 0) return
  createAccount(db, {
    label: 'Personal',
    configDir: '',
    apiKeyRef: null
  })
}
```

- [ ] **Step 4: Create the db barrel**

Create `src/main/db/index.ts`:

```ts
// Public surface of the db module. Importers go through this barrel; nothing
// reaches into db/dao/* or db/migrations/* directly outside the db module.

export { openDatabase, closeDatabase, type Database } from './connection'
export { runMigrations } from './migrations/runner'
export { MIGRATIONS } from './migrations'
export { seedDefaultAccount } from './seed'

export * as AccountsDao from './dao/accounts'
export * as ProjectsDao from './dao/projects'
export * as ConversationsDao from './dao/conversations'
```

- [ ] **Step 5: Run the test**

```bash
npm run test:run -- src/main/__tests__/db/seed.test.ts
```

Expected: PASS (2/2).

- [ ] **Step 6: Commit**

```bash
git add src/main/db/seed.ts src/main/db/index.ts src/main/__tests__/db/seed.test.ts
git commit -m "feat(phase-3): db barrel + default-account seed (idempotent)"
```

---

## Task 12: IPC channel constants — accounts/projects/conversations

**Files:**
- Create: `src/shared/ipc/accounts.ts`
- Create: `src/shared/ipc/projects.ts`
- Create: `src/shared/ipc/conversations.ts`
- Modify: `src/shared/ipc.ts`

- [ ] **Step 1: Accounts channels**

Create `src/shared/ipc/accounts.ts`:

```ts
// IPC channels for accounts CRUD.

import type { Account, CreateAccountInput } from '../types/accounts'
import type { IpcResult } from './envelope'

export const IPC_ACCOUNTS_LIST = 'accounts:list'
export const IPC_ACCOUNTS_CREATE = 'accounts:create'

export interface AccountsListResponse {
  readonly accounts: readonly Account[]
}

export interface AccountsCreateRequest {
  readonly input: CreateAccountInput
}

export interface AccountsCreateResponse {
  readonly account: Account
}

export type AccountsListResult = IpcResult<AccountsListResponse>
export type AccountsCreateResult = IpcResult<AccountsCreateResponse>
```

- [ ] **Step 2: Projects channels**

Create `src/shared/ipc/projects.ts`:

```ts
// IPC channels for projects CRUD + a change broadcast (main -> renderer) that
// lets hooks invalidate cached lists across windows.

import type { Project, CreateProjectInput, UpdateProjectInput } from '../types/projects'
import type { IpcResult } from './envelope'

export const IPC_PROJECTS_LIST = 'projects:list'
export const IPC_PROJECTS_CREATE = 'projects:create'
export const IPC_PROJECTS_UPDATE = 'projects:update'
export const IPC_PROJECTS_DELETE = 'projects:delete'
export const IPC_PROJECTS_CHANGED = 'projects:changed' // main -> renderer broadcast

export interface ProjectsListResponse {
  readonly projects: readonly Project[]
}
export interface ProjectsCreateRequest {
  readonly input: CreateProjectInput
}
export interface ProjectsCreateResponse {
  readonly project: Project
}
export interface ProjectsUpdateRequest {
  readonly input: UpdateProjectInput
}
export interface ProjectsUpdateResponse {
  readonly project: Project
}
export interface ProjectsDeleteRequest {
  readonly id: number
}
export interface ProjectsDeleteResponse {
  readonly id: number
}

export type ProjectsListResult = IpcResult<ProjectsListResponse>
export type ProjectsCreateResult = IpcResult<ProjectsCreateResponse>
export type ProjectsUpdateResult = IpcResult<ProjectsUpdateResponse>
export type ProjectsDeleteResult = IpcResult<ProjectsDeleteResponse>
```

- [ ] **Step 3: Conversations channels**

Create `src/shared/ipc/conversations.ts`:

```ts
// IPC channels for conversations CRUD.

import type {
  Conversation,
  CreateConversationInput,
  UpdateConversationInput
} from '../types/conversations'
import type { IpcResult } from './envelope'

export const IPC_CONVERSATIONS_LIST_BY_PROJECT = 'conversations:list-by-project'
export const IPC_CONVERSATIONS_CREATE = 'conversations:create'
export const IPC_CONVERSATIONS_UPDATE = 'conversations:update'
export const IPC_CONVERSATIONS_DELETE = 'conversations:delete'
export const IPC_CONVERSATIONS_CHANGED = 'conversations:changed' // broadcast

export interface ConversationsListRequest {
  readonly projectId: number
}
export interface ConversationsListResponse {
  readonly conversations: readonly Conversation[]
}
export interface ConversationsCreateRequest {
  readonly input: CreateConversationInput
}
export interface ConversationsCreateResponse {
  readonly conversation: Conversation
}
export interface ConversationsUpdateRequest {
  readonly input: UpdateConversationInput
}
export interface ConversationsUpdateResponse {
  readonly conversation: Conversation
}
export interface ConversationsDeleteRequest {
  readonly id: number
}
export interface ConversationsDeleteResponse {
  readonly id: number
}

export type ConversationsListResult = IpcResult<ConversationsListResponse>
export type ConversationsCreateResult = IpcResult<ConversationsCreateResponse>
export type ConversationsUpdateResult = IpcResult<ConversationsUpdateResponse>
export type ConversationsDeleteResult = IpcResult<ConversationsDeleteResponse>
```

- [ ] **Step 4: Update legacy IpcChannelName union (housekeeping)**

Edit `src/shared/ipc.ts`. Replace the file with:

```ts
// Typed IPC contract surface. Specific channel sets now live under
// src/shared/ipc/*.ts (accounts, projects, conversations, envelope).
// This file remains the place for the original log-bridge channels.

import type { LogRecord } from './observability'

export const IPC_LOG_FROM_RENDERER = 'log:event-from-renderer'
export const IPC_LOG_TO_RENDERER = 'log:event-to-renderer'
export const IPC_LOG_GET_RECENT = 'log:get-recent'

export interface LogFromRendererPayload {
  record: LogRecord
}
export interface LogToRendererPayload {
  record: LogRecord
}
export interface LogGetRecentRequest {
  count?: number
}
export interface LogGetRecentResponse {
  records: readonly LogRecord[]
}

// Re-export new domain channel constants for ergonomic single imports.
export {
  IPC_ACCOUNTS_LIST,
  IPC_ACCOUNTS_CREATE,
  type AccountsListResult,
  type AccountsCreateResult,
  type AccountsListResponse,
  type AccountsCreateRequest,
  type AccountsCreateResponse
} from './ipc/accounts'

export {
  IPC_PROJECTS_LIST,
  IPC_PROJECTS_CREATE,
  IPC_PROJECTS_UPDATE,
  IPC_PROJECTS_DELETE,
  IPC_PROJECTS_CHANGED,
  type ProjectsListResult,
  type ProjectsCreateResult,
  type ProjectsUpdateResult,
  type ProjectsDeleteResult,
  type ProjectsListResponse,
  type ProjectsCreateRequest,
  type ProjectsCreateResponse,
  type ProjectsUpdateRequest,
  type ProjectsUpdateResponse,
  type ProjectsDeleteRequest,
  type ProjectsDeleteResponse
} from './ipc/projects'

export {
  IPC_CONVERSATIONS_LIST_BY_PROJECT,
  IPC_CONVERSATIONS_CREATE,
  IPC_CONVERSATIONS_UPDATE,
  IPC_CONVERSATIONS_DELETE,
  IPC_CONVERSATIONS_CHANGED,
  type ConversationsListResult,
  type ConversationsCreateResult,
  type ConversationsUpdateResult,
  type ConversationsDeleteResult,
  type ConversationsListRequest,
  type ConversationsListResponse,
  type ConversationsCreateRequest,
  type ConversationsCreateResponse,
  type ConversationsUpdateRequest,
  type ConversationsUpdateResponse,
  type ConversationsDeleteRequest,
  type ConversationsDeleteResponse
} from './ipc/conversations'

export type { IpcResult, IpcOk, IpcError } from './ipc/envelope'

export type IpcChannelName =
  | typeof IPC_LOG_FROM_RENDERER
  | typeof IPC_LOG_TO_RENDERER
  | typeof IPC_LOG_GET_RECENT
  | 'accounts:list'
  | 'accounts:create'
  | 'projects:list'
  | 'projects:create'
  | 'projects:update'
  | 'projects:delete'
  | 'projects:changed'
  | 'conversations:list-by-project'
  | 'conversations:create'
  | 'conversations:update'
  | 'conversations:delete'
  | 'conversations:changed'
```

- [ ] **Step 5: Type-check**

```bash
npm run typecheck
```

Expected: PASS (no type errors).

- [ ] **Step 6: Commit**

```bash
git add src/shared/ipc src/shared/ipc.ts
git commit -m "feat(phase-3): shared IPC channel constants for accounts/projects/conversations + change broadcast events"
```

---

## Task 13: Projects IPC handler

**Files:**
- Create: `src/main/ipc/projects-handler.ts`
- Create: `src/main/__tests__/ipc/projects-handler.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/ipc/projects-handler.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { ProjectsHandler } from '../../ipc/projects-handler'
import { Logger } from '../../observability/logger'

// Purpose: ProjectsHandler routes IPC requests through the DAO, returns
// IpcResult envelopes, and broadcasts a `projects:changed` event after writes.

function makeLogger(): Logger {
  // tiny fake — Phase 1B's Logger constructor takes (fileSink, ringSize, source)
  // here we pass a noop sink and small ring
  return new Logger(
    { append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100,
    'main'
  )
}

describe('ipc/projects-handler', () => {
  let db: Database
  let broadcast: ReturnType<typeof vi.fn>
  let handler: ProjectsHandler

  beforeEach(() => {
    db = createTestDb()
    broadcast = vi.fn()
    handler = new ProjectsHandler(db, makeLogger(), broadcast)
  })

  it('list returns ok envelope with empty array initially', async () => {
    const result = await handler.list()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.projects).toEqual([])
  })

  it('create returns ok envelope and broadcasts projects:changed', async () => {
    const result = await handler.create({
      input: { name: 'Demo', rootPath: '/x' }
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.project.name).toBe('Demo')
    expect(broadcast).toHaveBeenCalledWith('projects:changed', undefined)
  })

  it('update returns error envelope when id does not exist', async () => {
    const result = await handler.update({
      input: { id: 99999, name: 'X' }
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND')
      expect(result.error.logId).toMatch(/.+/)
    }
  })

  it('delete returns ok and broadcasts after removing', async () => {
    const created = await handler.create({ input: { name: 'P', rootPath: '/p' } })
    if (!created.ok) throw new Error('precondition')
    broadcast.mockClear()

    const result = await handler.delete({ id: created.data.project.id })
    expect(result.ok).toBe(true)
    expect(broadcast).toHaveBeenCalledWith('projects:changed', undefined)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/main/__tests__/ipc/projects-handler.test.ts
```

Expected: FAIL — `ipc/projects-handler` not found.

- [ ] **Step 3: Implement the handler**

Create `src/main/ipc/projects-handler.ts`:

```ts
// ProjectsHandler — wraps ProjectsDao with logger.errorBoundary and converts
// throws into IpcResult envelopes. After every write, broadcasts
// `projects:changed` so renderer hooks invalidate.
//
// Class shape (not IpcMain.handle) so tests can call methods directly.
// install() wires the methods to ipcMain.

import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Database } from 'better-sqlite3'

import { ProjectsDao } from '../db'
import { Logger } from '../observability/logger'
import {
  IPC_PROJECTS_LIST,
  IPC_PROJECTS_CREATE,
  IPC_PROJECTS_UPDATE,
  IPC_PROJECTS_DELETE,
  IPC_PROJECTS_CHANGED,
  type ProjectsListResult,
  type ProjectsCreateRequest,
  type ProjectsCreateResult,
  type ProjectsUpdateRequest,
  type ProjectsUpdateResult,
  type ProjectsDeleteRequest,
  type ProjectsDeleteResult
} from '@shared/ipc/projects'

export type Broadcast = (channel: string, payload: unknown) => void

export class ProjectsHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
    private readonly broadcast: Broadcast
  ) {}

  list = async (): Promise<ProjectsListResult> => {
    return this.logger.errorBoundary('db', async () => {
      const projects = ProjectsDao.listProjects(this.db)
      return { ok: true as const, data: { projects } }
    }, 'projects-list')
  }

  create = async (req: ProjectsCreateRequest): Promise<ProjectsCreateResult> => {
    return this.logger.errorBoundary('db', async () => {
      const project = ProjectsDao.createProject(this.db, req.input)
      this.broadcast(IPC_PROJECTS_CHANGED, undefined)
      return { ok: true as const, data: { project } }
    }, 'projects-create')
  }

  update = async (req: ProjectsUpdateRequest): Promise<ProjectsUpdateResult> => {
    return this.logger.errorBoundary('db', async () => {
      const project = ProjectsDao.updateProject(this.db, req.input)
      if (!project) {
        return this.notFound('projects-update', { id: req.input.id })
      }
      this.broadcast(IPC_PROJECTS_CHANGED, undefined)
      return { ok: true as const, data: { project } }
    }, 'projects-update')
  }

  delete = async (req: ProjectsDeleteRequest): Promise<ProjectsDeleteResult> => {
    return this.logger.errorBoundary('db', async () => {
      const removed = ProjectsDao.deleteProject(this.db, req.id)
      if (!removed) {
        return this.notFound('projects-delete', { id: req.id })
      }
      this.broadcast(IPC_PROJECTS_CHANGED, undefined)
      return { ok: true as const, data: { id: req.id } }
    }, 'projects-delete')
  }

  private notFound(event: string, context: Record<string, unknown>): { ok: false; error: { message: string; code: string; logId: string } } {
    const logId = this.logger.warn('db', event, 'Project not found', context)
    return {
      ok: false,
      error: { message: 'Project not found', code: 'NOT_FOUND', logId }
    }
  }

  install(ipcMain: IpcMain): void {
    const wrap = <Req, Res>(channel: string, fn: (req: Req) => Promise<Res>): void => {
      ipcMain.handle(channel, async (_e: IpcMainInvokeEvent, req: Req) => fn(req))
      this.installedHandlers.push(channel)
    }
    ipcMain.handle(IPC_PROJECTS_LIST, () => this.list())
    this.installedHandlers.push(IPC_PROJECTS_LIST)
    wrap<ProjectsCreateRequest, ProjectsCreateResult>(IPC_PROJECTS_CREATE, this.create)
    wrap<ProjectsUpdateRequest, ProjectsUpdateResult>(IPC_PROJECTS_UPDATE, this.update)
    wrap<ProjectsDeleteRequest, ProjectsDeleteResult>(IPC_PROJECTS_DELETE, this.delete)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
```

The implementer must check the actual `Logger.errorBoundary` signature in `src/main/observability/logger.ts`. If it does not return an `IpcResult` envelope directly (it was designed in Phase 1B for general try/catch logging), the implementer should either:
- Adapt this handler to use the existing return shape and wrap the result in an envelope, **or**
- Add a small adapter `withIpcResult` inside this handler module that catches, logs, and returns an `IpcError`.

The test in Step 1 is the contract — make that pass.

- [ ] **Step 4: Run to confirm pass**

```bash
npm run test:run -- src/main/__tests__/ipc/projects-handler.test.ts
```

Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/projects-handler.ts src/main/__tests__/ipc/projects-handler.test.ts
git commit -m "feat(phase-3): ProjectsHandler — IPC handlers wrapped in error boundary + change broadcast"
```

---

## Task 14: Conversations IPC handler

**Files:**
- Create: `src/main/ipc/conversations-handler.ts`
- Create: `src/main/__tests__/ipc/conversations-handler.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/ipc/conversations-handler.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { ConversationsHandler } from '../../ipc/conversations-handler'
import { Logger } from '../../observability/logger'
import { ProjectsDao } from '../../db'

function makeLogger(): Logger {
  return new Logger(
    { append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100,
    'main'
  )
}

describe('ipc/conversations-handler', () => {
  let db: Database
  let projectId: number
  let broadcast: ReturnType<typeof vi.fn>
  let handler: ConversationsHandler

  beforeEach(() => {
    db = createTestDb()
    projectId = ProjectsDao.createProject(db, { name: 'P', rootPath: '/x' }).id
    broadcast = vi.fn()
    handler = new ConversationsHandler(db, makeLogger(), broadcast)
  })

  it('listByProject returns empty initially', async () => {
    const result = await handler.listByProject({ projectId })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.conversations).toEqual([])
  })

  it('create + broadcasts conversations:changed', async () => {
    const result = await handler.create({ input: { projectId, title: 'Demo' } })
    expect(result.ok).toBe(true)
    expect(broadcast).toHaveBeenCalledWith('conversations:changed', undefined)
  })

  it('update returns NOT_FOUND for unknown id', async () => {
    const r = await handler.update({ input: { id: 999, title: 'x' } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/main/__tests__/ipc/conversations-handler.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement (mirrors ProjectsHandler shape)**

Create `src/main/ipc/conversations-handler.ts`:

```ts
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Database } from 'better-sqlite3'

import { ConversationsDao } from '../db'
import { Logger } from '../observability/logger'
import {
  IPC_CONVERSATIONS_LIST_BY_PROJECT,
  IPC_CONVERSATIONS_CREATE,
  IPC_CONVERSATIONS_UPDATE,
  IPC_CONVERSATIONS_DELETE,
  IPC_CONVERSATIONS_CHANGED,
  type ConversationsListRequest,
  type ConversationsListResult,
  type ConversationsCreateRequest,
  type ConversationsCreateResult,
  type ConversationsUpdateRequest,
  type ConversationsUpdateResult,
  type ConversationsDeleteRequest,
  type ConversationsDeleteResult
} from '@shared/ipc/conversations'

export type Broadcast = (channel: string, payload: unknown) => void

export class ConversationsHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
    private readonly broadcast: Broadcast
  ) {}

  listByProject = async (req: ConversationsListRequest): Promise<ConversationsListResult> => {
    return this.logger.errorBoundary('db', async () => {
      const conversations = ConversationsDao.listConversationsByProject(this.db, req.projectId)
      return { ok: true as const, data: { conversations } }
    }, 'conversations-list-by-project')
  }

  create = async (req: ConversationsCreateRequest): Promise<ConversationsCreateResult> => {
    return this.logger.errorBoundary('db', async () => {
      const conversation = ConversationsDao.createConversation(this.db, req.input)
      this.broadcast(IPC_CONVERSATIONS_CHANGED, undefined)
      return { ok: true as const, data: { conversation } }
    }, 'conversations-create')
  }

  update = async (req: ConversationsUpdateRequest): Promise<ConversationsUpdateResult> => {
    return this.logger.errorBoundary('db', async () => {
      const conversation = ConversationsDao.updateConversation(this.db, req.input)
      if (!conversation) {
        const logId = this.logger.warn('db', 'conversations-update', 'Conversation not found', {
          id: req.input.id
        })
        return {
          ok: false as const,
          error: { message: 'Conversation not found', code: 'NOT_FOUND', logId }
        }
      }
      this.broadcast(IPC_CONVERSATIONS_CHANGED, undefined)
      return { ok: true as const, data: { conversation } }
    }, 'conversations-update')
  }

  delete = async (req: ConversationsDeleteRequest): Promise<ConversationsDeleteResult> => {
    return this.logger.errorBoundary('db', async () => {
      const removed = ConversationsDao.deleteConversation(this.db, req.id)
      if (!removed) {
        const logId = this.logger.warn('db', 'conversations-delete', 'Conversation not found', {
          id: req.id
        })
        return {
          ok: false as const,
          error: { message: 'Conversation not found', code: 'NOT_FOUND', logId }
        }
      }
      this.broadcast(IPC_CONVERSATIONS_CHANGED, undefined)
      return { ok: true as const, data: { id: req.id } }
    }, 'conversations-delete')
  }

  install(ipcMain: IpcMain): void {
    const wrap = <Req, Res>(channel: string, fn: (req: Req) => Promise<Res>): void => {
      ipcMain.handle(channel, async (_e: IpcMainInvokeEvent, req: Req) => fn(req))
      this.installedHandlers.push(channel)
    }
    wrap<ConversationsListRequest, ConversationsListResult>(IPC_CONVERSATIONS_LIST_BY_PROJECT, this.listByProject)
    wrap<ConversationsCreateRequest, ConversationsCreateResult>(IPC_CONVERSATIONS_CREATE, this.create)
    wrap<ConversationsUpdateRequest, ConversationsUpdateResult>(IPC_CONVERSATIONS_UPDATE, this.update)
    wrap<ConversationsDeleteRequest, ConversationsDeleteResult>(IPC_CONVERSATIONS_DELETE, this.delete)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm run test:run -- src/main/__tests__/ipc/conversations-handler.test.ts
```

Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/conversations-handler.ts src/main/__tests__/ipc/conversations-handler.test.ts
git commit -m "feat(phase-3): ConversationsHandler — IPC handlers + change broadcast"
```

---

## Task 15: Accounts IPC handler (list + create only)

**Files:**
- Create: `src/main/ipc/accounts-handler.ts`

- [ ] **Step 1: Implement the handler**

Phase 3 only needs `list` (for the AccountSwitcher dropdown source) and `create` (for the onboarding skeleton). Full Account CRUD lands in Phase 6.

Create `src/main/ipc/accounts-handler.ts`:

```ts
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Database } from 'better-sqlite3'

import { AccountsDao } from '../db'
import { Logger } from '../observability/logger'
import {
  IPC_ACCOUNTS_LIST,
  IPC_ACCOUNTS_CREATE,
  type AccountsCreateRequest,
  type AccountsListResult,
  type AccountsCreateResult
} from '@shared/ipc/accounts'

export class AccountsHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly db: Database,
    private readonly logger: Logger
  ) {}

  list = async (): Promise<AccountsListResult> => {
    return this.logger.errorBoundary('db', async () => {
      const accounts = AccountsDao.listAccounts(this.db)
      return { ok: true as const, data: { accounts } }
    }, 'accounts-list')
  }

  create = async (req: AccountsCreateRequest): Promise<AccountsCreateResult> => {
    return this.logger.errorBoundary('db', async () => {
      const account = AccountsDao.createAccount(this.db, req.input)
      return { ok: true as const, data: { account } }
    }, 'accounts-create')
  }

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

- [ ] **Step 2: Commit**

```bash
git add src/main/ipc/accounts-handler.ts
git commit -m "feat(phase-3): AccountsHandler (list, create)"
```

Note: no dedicated test file — the handler is a thin wrapper, and the renderer-side hook test in Task 21 exercises the channel end-to-end.

---

## Task 16: Wire DB + handlers into main/index.ts

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc/index.ts`

- [ ] **Step 1: Update the IPC registration entry point**

Edit `src/main/ipc/index.ts`:

```ts
// Single registration point for all IPC handlers. The DB-backed handlers
// receive the live Database connection from main/index.ts.

import type { IpcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import type { Logger } from '@main/observability'

import { LogBridge, type Broadcast } from './log-bridge'
import { AccountsHandler } from './accounts-handler'
import { ProjectsHandler } from './projects-handler'
import { ConversationsHandler } from './conversations-handler'

export interface IpcRegistration {
  logBridge: LogBridge
  accountsHandler: AccountsHandler
  projectsHandler: ProjectsHandler
  conversationsHandler: ConversationsHandler
  uninstallAll: () => void
}

export function registerIpcHandlers(
  ipcMain: IpcMain,
  logger: Logger,
  broadcast: Broadcast,
  db: Database
): IpcRegistration {
  const logBridge = new LogBridge(logger, ipcMain, broadcast)
  logBridge.install()

  const accountsHandler = new AccountsHandler(db, logger)
  accountsHandler.install(ipcMain)

  const projectsHandler = new ProjectsHandler(db, logger, broadcast)
  projectsHandler.install(ipcMain)

  const conversationsHandler = new ConversationsHandler(db, logger, broadcast)
  conversationsHandler.install(ipcMain)

  return {
    logBridge,
    accountsHandler,
    projectsHandler,
    conversationsHandler,
    uninstallAll: () => {
      logBridge.uninstall()
      accountsHandler.uninstall(ipcMain)
      projectsHandler.uninstall(ipcMain)
      conversationsHandler.uninstall(ipcMain)
    }
  }
}
```

- [ ] **Step 2: Boot the DB in main/index.ts**

Edit `src/main/index.ts`. Add imports at the top:

```ts
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { homedir } from 'node:os'
import {
  FileSink,
  installUncaughtHandlers,
  Logger
} from './observability'
import type { Broadcast } from './ipc/log-bridge'
import { registerIpcHandlers } from './ipc'
import {
  openDatabase,
  closeDatabase,
  runMigrations,
  MIGRATIONS,
  seedDefaultAccount,
  type Database
} from './db'
```

Replace the `app.whenReady().then(...)` block and add DB lifecycle:

```ts
let db: Database | null = null

app.whenReady().then(() => {
  logger.info('observability', 'app-ready', 'Electron ready, opening database')

  const dbPath = join(app.getPath('userData'), 'tokenless.db')
  try {
    db = openDatabase(dbPath)
    runMigrations(db, MIGRATIONS)
    seedDefaultAccount(db)
    logger.info('db', 'db-online', 'Database opened, migrations applied', { dbPath })
  } catch (error) {
    logger.fatal('db', 'db-init-failed', 'Failed to open database', {
      dbPath,
      errorString: String(error)
    })
    // Without a DB the app cannot function — show an error dialog and exit
    app.quit()
    return
  }

  const ipcRegistration = registerIpcHandlers(ipcMain, logger, broadcast, db)

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  app.on('before-quit', () => {
    logger.info('observability', 'shutdown', 'Before quit, releasing resources')
    ipcRegistration.uninstallAll()
    if (db) {
      closeDatabase(db)
      db = null
    }
  })
})

app.on('window-all-closed', () => {
  logger.info('observability', 'shutdown', 'All windows closed')
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

Remove the old top-level `const ipcRegistration = registerIpcHandlers(...)` call — it was called before `app.whenReady()`, but `app.getPath('userData')` is only valid after ready.

- [ ] **Step 3: Type-check + build**

```bash
npm run typecheck
npm run build
```

Expected: PASS, PASS.

- [ ] **Step 4: Smoke-run**

```bash
npm run dev
```

Open the app. Verify in Dev Mode panel (Ctrl+Shift+D or "Show Dev Mode" button): you should see `db-online` and `app-ready` entries in the log stream. Close the app.

Optional: open `%APPDATA%/tokenless/tokenless.db` in DB Browser for SQLite — it should have 8 tables + `_meta` populated with version 1.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/main/ipc/index.ts
git commit -m "feat(phase-3): wire database boot + migrations + seed + IPC handlers into main"
```

---

## Task 17: Preload — expose accounts/projects/conversations APIs

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

- [ ] **Step 1: Extend preload's exposed API**

Edit `src/preload/index.ts`. Add imports + extend the `api` object:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { LogRecord } from '@shared/observability'
import {
  IPC_LOG_FROM_RENDERER,
  IPC_LOG_GET_RECENT,
  IPC_LOG_TO_RENDERER,
  IPC_ACCOUNTS_LIST,
  IPC_ACCOUNTS_CREATE,
  IPC_PROJECTS_LIST,
  IPC_PROJECTS_CREATE,
  IPC_PROJECTS_UPDATE,
  IPC_PROJECTS_DELETE,
  IPC_PROJECTS_CHANGED,
  IPC_CONVERSATIONS_LIST_BY_PROJECT,
  IPC_CONVERSATIONS_CREATE,
  IPC_CONVERSATIONS_UPDATE,
  IPC_CONVERSATIONS_DELETE,
  IPC_CONVERSATIONS_CHANGED,
  type LogFromRendererPayload,
  type LogGetRecentRequest,
  type LogGetRecentResponse,
  type LogToRendererPayload,
  type AccountsListResult,
  type AccountsCreateRequest,
  type AccountsCreateResult,
  type ProjectsListResult,
  type ProjectsCreateRequest,
  type ProjectsCreateResult,
  type ProjectsUpdateRequest,
  type ProjectsUpdateResult,
  type ProjectsDeleteRequest,
  type ProjectsDeleteResult,
  type ConversationsListRequest,
  type ConversationsListResult,
  type ConversationsCreateRequest,
  type ConversationsCreateResult,
  type ConversationsUpdateRequest,
  type ConversationsUpdateResult,
  type ConversationsDeleteRequest,
  type ConversationsDeleteResult
} from '@shared/ipc'

const api = {
  version: '0.0.1',
  log: {
    send(record: LogRecord): void {
      const payload: LogFromRendererPayload = { record }
      ipcRenderer.send(IPC_LOG_FROM_RENDERER, payload)
    },
    subscribe(fn: (record: LogRecord) => void): () => void {
      const listener = (_event: unknown, payload: LogToRendererPayload): void => {
        fn(payload.record)
      }
      ipcRenderer.on(IPC_LOG_TO_RENDERER, listener as never)
      return () => {
        ipcRenderer.removeListener(IPC_LOG_TO_RENDERER, listener as never)
      }
    },
    async getRecent(count?: number): Promise<readonly LogRecord[]> {
      const req: LogGetRecentRequest = { count }
      const response = await ipcRenderer.invoke(IPC_LOG_GET_RECENT, req)
      return (response as LogGetRecentResponse).records
    }
  },
  accounts: {
    list(): Promise<AccountsListResult> {
      return ipcRenderer.invoke(IPC_ACCOUNTS_LIST) as Promise<AccountsListResult>
    },
    create(req: AccountsCreateRequest): Promise<AccountsCreateResult> {
      return ipcRenderer.invoke(IPC_ACCOUNTS_CREATE, req) as Promise<AccountsCreateResult>
    }
  },
  projects: {
    list(): Promise<ProjectsListResult> {
      return ipcRenderer.invoke(IPC_PROJECTS_LIST) as Promise<ProjectsListResult>
    },
    create(req: ProjectsCreateRequest): Promise<ProjectsCreateResult> {
      return ipcRenderer.invoke(IPC_PROJECTS_CREATE, req) as Promise<ProjectsCreateResult>
    },
    update(req: ProjectsUpdateRequest): Promise<ProjectsUpdateResult> {
      return ipcRenderer.invoke(IPC_PROJECTS_UPDATE, req) as Promise<ProjectsUpdateResult>
    },
    delete(req: ProjectsDeleteRequest): Promise<ProjectsDeleteResult> {
      return ipcRenderer.invoke(IPC_PROJECTS_DELETE, req) as Promise<ProjectsDeleteResult>
    },
    onChanged(fn: () => void): () => void {
      const listener = (): void => fn()
      ipcRenderer.on(IPC_PROJECTS_CHANGED, listener as never)
      return () => ipcRenderer.removeListener(IPC_PROJECTS_CHANGED, listener as never)
    }
  },
  conversations: {
    listByProject(req: ConversationsListRequest): Promise<ConversationsListResult> {
      return ipcRenderer.invoke(IPC_CONVERSATIONS_LIST_BY_PROJECT, req) as Promise<ConversationsListResult>
    },
    create(req: ConversationsCreateRequest): Promise<ConversationsCreateResult> {
      return ipcRenderer.invoke(IPC_CONVERSATIONS_CREATE, req) as Promise<ConversationsCreateResult>
    },
    update(req: ConversationsUpdateRequest): Promise<ConversationsUpdateResult> {
      return ipcRenderer.invoke(IPC_CONVERSATIONS_UPDATE, req) as Promise<ConversationsUpdateResult>
    },
    delete(req: ConversationsDeleteRequest): Promise<ConversationsDeleteResult> {
      return ipcRenderer.invoke(IPC_CONVERSATIONS_DELETE, req) as Promise<ConversationsDeleteResult>
    },
    onChanged(fn: () => void): () => void {
      const listener = (): void => fn()
      ipcRenderer.on(IPC_CONVERSATIONS_CHANGED, listener as never)
      return () => ipcRenderer.removeListener(IPC_CONVERSATIONS_CHANGED, listener as never)
    }
  }
}

// (logPreloadError + contextBridge bootstrap from before — unchanged)
```

The implementer should preserve the existing `logPreloadError` block and the `if (process.contextIsolated) { ... } else { ... }` block at the end of the file — only extend the `api` object.

- [ ] **Step 2: Update preload type declarations**

Edit `src/preload/index.d.ts`. Replace its contents:

```ts
import type { LogRecord } from '@shared/observability'
import type {
  AccountsListResult,
  AccountsCreateRequest,
  AccountsCreateResult,
  ProjectsListResult,
  ProjectsCreateRequest,
  ProjectsCreateResult,
  ProjectsUpdateRequest,
  ProjectsUpdateResult,
  ProjectsDeleteRequest,
  ProjectsDeleteResult,
  ConversationsListRequest,
  ConversationsListResult,
  ConversationsCreateRequest,
  ConversationsCreateResult,
  ConversationsUpdateRequest,
  ConversationsUpdateResult,
  ConversationsDeleteRequest,
  ConversationsDeleteResult
} from '@shared/ipc'

export interface TokenlessApi {
  readonly version: string
  readonly log: {
    send(record: LogRecord): void
    subscribe(fn: (record: LogRecord) => void): () => void
    getRecent(count?: number): Promise<readonly LogRecord[]>
  }
  readonly accounts: {
    list(): Promise<AccountsListResult>
    create(req: AccountsCreateRequest): Promise<AccountsCreateResult>
  }
  readonly projects: {
    list(): Promise<ProjectsListResult>
    create(req: ProjectsCreateRequest): Promise<ProjectsCreateResult>
    update(req: ProjectsUpdateRequest): Promise<ProjectsUpdateResult>
    delete(req: ProjectsDeleteRequest): Promise<ProjectsDeleteResult>
    onChanged(fn: () => void): () => void
  }
  readonly conversations: {
    listByProject(req: ConversationsListRequest): Promise<ConversationsListResult>
    create(req: ConversationsCreateRequest): Promise<ConversationsCreateResult>
    update(req: ConversationsUpdateRequest): Promise<ConversationsUpdateResult>
    delete(req: ConversationsDeleteRequest): Promise<ConversationsDeleteResult>
    onChanged(fn: () => void): () => void
  }
}

declare global {
  interface Window {
    readonly tokenless: TokenlessApi
  }
}

export {}
```

- [ ] **Step 3: Type-check + build**

```bash
npm run typecheck
npm run build
```

Expected: PASS, PASS.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(phase-3): preload exposes accounts/projects/conversations APIs"
```

---

## Task 18: useProjects hook + change-aware refresh

**Files:**
- Create: `src/renderer/src/hooks/use-projects.ts`
- Create: `src/renderer/src/hooks/__tests__/use-projects.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/hooks/__tests__/use-projects.test.tsx`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { Project } from '@shared/types/projects'

import { useProjects } from '../use-projects'

// Purpose: useProjects fetches projects on mount, exposes loading/error states,
// and refetches when projects:changed fires.

function makeProject(id: number, name: string): Project {
  return {
    id,
    name,
    rootPath: `/p${id}`,
    defaultAccountId: null,
    defaultModel: null,
    defaultBreadth: null,
    defaultFormat: null,
    defaultCommitPrompt: null,
    defaultPushPrompt: null,
    notes: null,
    alwaysIncludeFiles: [],
    relevantSkillIds: [],
    createdAt: 0,
    updatedAt: 0
  }
}

describe('hooks/use-projects', () => {
  let onChangedCallback: () => void = () => undefined
  let mockProjects: Project[]

  beforeEach(() => {
    mockProjects = [makeProject(1, 'Alpha')]
    onChangedCallback = () => undefined
    ;(window as unknown as { tokenless: unknown }).tokenless = {
      projects: {
        list: vi.fn(async () => ({ ok: true, data: { projects: mockProjects } })),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        onChanged: (fn: () => void): (() => void) => {
          onChangedCallback = fn
          return () => undefined
        }
      }
    }
  })

  it('fetches projects on mount and exposes them', async () => {
    const { result } = renderHook(() => useProjects())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.projects).toHaveLength(1)
    expect(result.current.projects[0].name).toBe('Alpha')
  })

  it('refetches when onChanged fires', async () => {
    const { result } = renderHook(() => useProjects())
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockProjects = [makeProject(1, 'Alpha'), makeProject(2, 'Bravo')]

    act(() => {
      onChangedCallback()
    })

    await waitFor(() => expect(result.current.projects).toHaveLength(2))
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/renderer/src/hooks/__tests__/use-projects.test.tsx
```

Expected: FAIL — `use-projects` not found.

- [ ] **Step 3: Implement the hook**

Create `src/renderer/src/hooks/use-projects.ts`:

```ts
// useProjects — subscribe to the live project list via IPC + projects:changed.
// Returns { projects, loading, error, refetch, create, update, delete }.

import { useCallback, useEffect, useRef, useState } from 'react'

import type { Project, CreateProjectInput, UpdateProjectInput } from '@shared/types/projects'

interface UseProjectsReturn {
  readonly projects: readonly Project[]
  readonly loading: boolean
  readonly error: string | null
  readonly refetch: () => Promise<void>
  readonly create: (input: CreateProjectInput) => Promise<Project | null>
  readonly update: (input: UpdateProjectInput) => Promise<Project | null>
  readonly remove: (id: number) => Promise<boolean>
}

export function useProjects(): UseProjectsReturn {
  const [projects, setProjects] = useState<readonly Project[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetchProjects = useCallback(async (): Promise<void> => {
    try {
      const result = await window.tokenless.projects.list()
      if (!mountedRef.current) return
      if (result.ok) {
        setProjects(result.data.projects)
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
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void fetchProjects()
    const unsubscribe = window.tokenless.projects.onChanged(() => {
      void fetchProjects()
    })
    return () => {
      mountedRef.current = false
      unsubscribe()
    }
  }, [fetchProjects])

  const create = useCallback(
    async (input: CreateProjectInput): Promise<Project | null> => {
      const result = await window.tokenless.projects.create({ input })
      return result.ok ? result.data.project : null
    },
    []
  )

  const update = useCallback(
    async (input: UpdateProjectInput): Promise<Project | null> => {
      const result = await window.tokenless.projects.update({ input })
      return result.ok ? result.data.project : null
    },
    []
  )

  const remove = useCallback(async (id: number): Promise<boolean> => {
    const result = await window.tokenless.projects.delete({ id })
    return result.ok
  }, [])

  return { projects, loading, error, refetch: fetchProjects, create, update, remove }
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm run test:run -- src/renderer/src/hooks/__tests__/use-projects.test.tsx
```

Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/hooks/use-projects.ts src/renderer/src/hooks/__tests__/use-projects.test.tsx
git commit -m "feat(phase-3): useProjects hook with onChanged refetch"
```

---

## Task 19: useConversations hook

**Files:**
- Create: `src/renderer/src/hooks/use-conversations.ts`
- Create: `src/renderer/src/hooks/__tests__/use-conversations.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/hooks/__tests__/use-conversations.test.tsx`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { Conversation } from '@shared/types/conversations'

import { useConversations } from '../use-conversations'

function makeConv(id: number, projectId: number, title: string): Conversation {
  return {
    id, projectId, accountId: null, ccSessionId: null, title,
    model: null, breadth: null, format: null, status: 'active',
    summary: null, summaryUpdatedAt: null,
    parentConversationId: null, branchedAtTurnId: null,
    createdAt: 0, updatedAt: 0, endedAt: null, archivedAt: null
  }
}

describe('hooks/use-conversations', () => {
  let onChangedCallback: () => void = () => undefined
  let mockConvs: Conversation[]

  beforeEach(() => {
    mockConvs = [makeConv(1, 7, 'one')]
    onChangedCallback = () => undefined
    ;(window as unknown as { tokenless: unknown }).tokenless = {
      conversations: {
        listByProject: vi.fn(async () => ({ ok: true, data: { conversations: mockConvs } })),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        onChanged: (fn: () => void): (() => void) => {
          onChangedCallback = fn
          return () => undefined
        }
      }
    }
  })

  it('returns empty + loading when projectId is null', () => {
    const { result } = renderHook(() => useConversations(null))
    expect(result.current.conversations).toEqual([])
    expect(result.current.loading).toBe(false)
  })

  it('fetches by project id on mount', async () => {
    const { result } = renderHook(() => useConversations(7))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.conversations).toHaveLength(1)
  })

  it('refetches when onChanged fires', async () => {
    const { result } = renderHook(() => useConversations(7))
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockConvs = [makeConv(1, 7, 'one'), makeConv(2, 7, 'two')]

    act(() => onChangedCallback())
    await waitFor(() => expect(result.current.conversations).toHaveLength(2))
  })

  it('refetches when projectId changes', async () => {
    const { result, rerender } = renderHook(({ id }: { id: number | null }) => useConversations(id), {
      initialProps: { id: 7 }
    })
    await waitFor(() => expect(result.current.conversations).toHaveLength(1))

    mockConvs = []
    rerender({ id: 8 })
    await waitFor(() => expect(result.current.conversations).toHaveLength(0))
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/renderer/src/hooks/__tests__/use-conversations.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement the hook**

Create `src/renderer/src/hooks/use-conversations.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  Conversation,
  CreateConversationInput,
  UpdateConversationInput
} from '@shared/types/conversations'

interface UseConversationsReturn {
  readonly conversations: readonly Conversation[]
  readonly loading: boolean
  readonly error: string | null
  readonly refetch: () => Promise<void>
  readonly create: (input: CreateConversationInput) => Promise<Conversation | null>
  readonly update: (input: UpdateConversationInput) => Promise<Conversation | null>
  readonly remove: (id: number) => Promise<boolean>
}

export function useConversations(projectId: number | null): UseConversationsReturn {
  const [conversations, setConversations] = useState<readonly Conversation[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetchConversations = useCallback(async (): Promise<void> => {
    if (projectId === null) {
      setConversations([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const result = await window.tokenless.conversations.listByProject({ projectId })
      if (!mountedRef.current) return
      if (result.ok) {
        setConversations(result.data.conversations)
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
  }, [projectId])

  useEffect(() => {
    mountedRef.current = true
    void fetchConversations()
    const unsubscribe = window.tokenless.conversations.onChanged(() => {
      void fetchConversations()
    })
    return () => {
      mountedRef.current = false
      unsubscribe()
    }
  }, [fetchConversations])

  const create = useCallback(
    async (input: CreateConversationInput): Promise<Conversation | null> => {
      const result = await window.tokenless.conversations.create({ input })
      return result.ok ? result.data.conversation : null
    },
    []
  )

  const update = useCallback(
    async (input: UpdateConversationInput): Promise<Conversation | null> => {
      const result = await window.tokenless.conversations.update({ input })
      return result.ok ? result.data.conversation : null
    },
    []
  )

  const remove = useCallback(async (id: number): Promise<boolean> => {
    const result = await window.tokenless.conversations.delete({ id })
    return result.ok
  }, [])

  return { conversations, loading, error, refetch: fetchConversations, create, update, remove }
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm run test:run -- src/renderer/src/hooks/__tests__/use-conversations.test.tsx
```

Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/hooks/use-conversations.ts src/renderer/src/hooks/__tests__/use-conversations.test.tsx
git commit -m "feat(phase-3): useConversations hook scoped to projectId"
```

---

## Task 20: useAccounts hook (read-only for now)

**Files:**
- Create: `src/renderer/src/hooks/use-accounts.ts`

- [ ] **Step 1: Implement (no test — covered indirectly by AccountSwitcher rewire test in Task 23)**

Create `src/renderer/src/hooks/use-accounts.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Account, CreateAccountInput } from '@shared/types/accounts'

interface UseAccountsReturn {
  readonly accounts: readonly Account[]
  readonly loading: boolean
  readonly error: string | null
  readonly refetch: () => Promise<void>
  readonly create: (input: CreateAccountInput) => Promise<Account | null>
}

export function useAccounts(): UseAccountsReturn {
  const [accounts, setAccounts] = useState<readonly Account[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetchAccounts = useCallback(async (): Promise<void> => {
    try {
      const result = await window.tokenless.accounts.list()
      if (!mountedRef.current) return
      if (result.ok) {
        setAccounts(result.data.accounts)
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
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void fetchAccounts()
    return () => {
      mountedRef.current = false
    }
  }, [fetchAccounts])

  const create = useCallback(async (input: CreateAccountInput): Promise<Account | null> => {
    const result = await window.tokenless.accounts.create({ input })
    return result.ok ? result.data.account : null
  }, [])

  return { accounts, loading, error, refetch: fetchAccounts, create }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/hooks/use-accounts.ts
git commit -m "feat(phase-3): useAccounts hook (list + create)"
```

---

## Task 21: CreateProjectModal component

**Files:**
- Create: `src/renderer/src/components/layout/CreateProjectModal.tsx`
- Modify: `src/renderer/src/components/layout/styles.css`

- [ ] **Step 1: Implement the modal**

Create `src/renderer/src/components/layout/CreateProjectModal.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'

interface CreateProjectModalProps {
  open: boolean
  onClose: () => void
  onCreate: (input: { name: string; rootPath: string }) => Promise<void>
}

export function CreateProjectModal({ open, onClose, onCreate }: CreateProjectModalProps): JSX.Element | null {
  const [name, setName] = useState('')
  const [rootPath, setRootPath] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setRootPath('')
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
    const trimmedName = name.trim()
    const trimmedPath = rootPath.trim()
    if (!trimmedName || !trimmedPath) {
      setError('Name and root path are both required.')
      return
    }
    setSubmitting(true)
    try {
      await onCreate({ name: trimmedName, rootPath: trimmedPath })
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
        aria-labelledby="create-project-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="create-project-title" className="modal__title">Create project</h2>
        <form onSubmit={handleSubmit} className="modal__form">
          <label className="modal__field">
            <span className="modal__label">Name</span>
            <input
              ref={firstFieldRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
              autoComplete="off"
            />
          </label>
          <label className="modal__field">
            <span className="modal__label">Root path</span>
            <input
              type="text"
              value={rootPath}
              onChange={(e) => setRootPath(e.target.value)}
              placeholder="C:/path/to/project"
              autoComplete="off"
            />
          </label>
          {error && <p className="modal__error">{error}</p>}
          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add modal styles to the layout stylesheet**

Append to `src/renderer/src/components/layout/styles.css`:

```css
/* Modal — used by CreateProjectModal and future modals */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--tl-z-modal);
}

.modal {
  background: var(--tl-bg-base);
  border: 1px solid var(--tl-rule-subtle);
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
  width: min(420px, 90vw);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.modal__title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.modal__form { display: flex; flex-direction: column; gap: 0.75rem; }
.modal__field { display: flex; flex-direction: column; gap: 0.25rem; }
.modal__label { font-size: 0.875rem; color: var(--tl-text-muted); }
.modal__field input {
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--tl-rule-subtle);
  border-radius: 4px;
  background: var(--tl-bg-mute);
  color: var(--tl-text-base);
  font-family: inherit;
  font-size: 0.95rem;
}
.modal__error {
  margin: 0;
  color: var(--tl-color-danger, #d22);
  font-size: 0.875rem;
}
.modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.25rem;
}
.btn {
  padding: 0.4rem 0.9rem;
  border-radius: 4px;
  border: 1px solid transparent;
  font: inherit;
  cursor: pointer;
}
.btn--primary {
  background: var(--tl-accent, #4a90e2);
  color: #fff;
}
.btn--primary:disabled { opacity: 0.6; cursor: default; }
.btn--ghost {
  background: transparent;
  border-color: var(--tl-rule-subtle);
  color: var(--tl-text-base);
}
```

If `--tl-color-danger` or `--tl-accent` don't exist in `tokens.css`, the CSS fallback values inside `var(...)` will kick in. The implementer should add the tokens to `tokens.css` if missing.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/layout/CreateProjectModal.tsx src/renderer/src/components/layout/styles.css
git commit -m "feat(phase-3): CreateProjectModal — keyboard a11y, validation, async create"
```

---

## Task 22: EmptyProjectsState + OnboardingBanner

**Files:**
- Create: `src/renderer/src/components/layout/EmptyProjectsState.tsx`
- Create: `src/renderer/src/components/onboarding/OnboardingBanner.tsx`

- [ ] **Step 1: EmptyProjectsState**

Create `src/renderer/src/components/layout/EmptyProjectsState.tsx`:

```tsx
interface EmptyProjectsStateProps {
  onCreate: () => void
}

export function EmptyProjectsState({ onCreate }: EmptyProjectsStateProps): JSX.Element {
  return (
    <div className="empty-projects-state" role="region" aria-labelledby="empty-projects-title">
      <h2 id="empty-projects-title">Welcome to TokenLess</h2>
      <p>You don't have any projects yet. Create one to get started.</p>
      <button type="button" className="btn btn--primary" onClick={onCreate}>
        Create your first project
      </button>
    </div>
  )
}
```

Append matching styles to `src/renderer/src/components/layout/styles.css`:

```css
.empty-projects-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 3rem 2rem;
  text-align: center;
  color: var(--tl-text-muted);
}
.empty-projects-state h2 { margin: 0; color: var(--tl-text-base); }
.empty-projects-state p { margin: 0; max-width: 32ch; }
```

- [ ] **Step 2: OnboardingBanner (lightweight skeleton — polish lives in Phase 8)**

Create `src/renderer/src/components/onboarding/OnboardingBanner.tsx`:

```tsx
interface OnboardingBannerProps {
  visible: boolean
  onCreateProject: () => void
  onDismiss: () => void
}

export function OnboardingBanner({ visible, onCreateProject, onDismiss }: OnboardingBannerProps): JSX.Element | null {
  if (!visible) return null
  return (
    <div className="onboarding-banner" role="status">
      <span>👋 New here? Create your first project to start gearing prompts.</span>
      <div className="onboarding-banner__actions">
        <button type="button" className="btn btn--primary btn--small" onClick={onCreateProject}>
          Create project
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={onDismiss}
          aria-label="Dismiss onboarding banner"
        >
          Later
        </button>
      </div>
    </div>
  )
}
```

Create `src/renderer/src/components/onboarding/styles.css`:

```css
.onboarding-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.6rem 1rem;
  background: var(--tl-bg-mute);
  border-bottom: 1px solid var(--tl-rule-subtle);
  font-size: 0.9rem;
}
.onboarding-banner__actions { display: flex; gap: 0.5rem; }
.btn--small { padding: 0.25rem 0.6rem; font-size: 0.85rem; }
```

Import the stylesheet at the top of `OnboardingBanner.tsx`:

```tsx
import './styles.css'
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/layout/EmptyProjectsState.tsx src/renderer/src/components/onboarding
git commit -m "feat(phase-3): EmptyProjectsState + OnboardingBanner (skeleton — Phase 8 polishes)"
```

---

## Task 23: Rewire AppShell + ProjectSwitcher + AccountSwitcher + ConversationList to IPC

**Files:**
- Modify: `src/renderer/src/components/layout/AppShell.tsx`
- Modify: `src/renderer/src/components/layout/ProjectSwitcher.tsx`
- Modify: `src/renderer/src/components/layout/AccountSwitcher.tsx`
- Modify: `src/renderer/src/components/layout/ConversationList.tsx`
- Modify: `src/renderer/src/components/layout/ConversationListItem.tsx`
- Modify: `src/renderer/src/components/layout/TopBar.tsx`

- [ ] **Step 1: Rewire AppShell**

Replace `src/renderer/src/components/layout/AppShell.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { rendererLogger } from '../../observability/logger-bridge'
import { useAccounts } from '../../hooks/use-accounts'
import { useConversations } from '../../hooks/use-conversations'
import { useProjects } from '../../hooks/use-projects'
import { ConversationSidebar } from './ConversationSidebar'
import { CreateProjectModal } from './CreateProjectModal'
import { EmptyProjectsState } from './EmptyProjectsState'
import { MainPane } from './MainPane'
import { TopBar } from './TopBar'
import { OnboardingBanner } from '../onboarding/OnboardingBanner'
import './styles.css'

const ONBOARDING_DISMISSED_KEY = 'tokenless.onboardingDismissed'

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

function writeDismissed(v: boolean): void {
  try {
    window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, v ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function AppShell(): JSX.Element {
  const { projects, loading: projectsLoading, create: createProject } = useProjects()
  const { accounts } = useAccounts()
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null)
  const [activeAccountId, setActiveAccountId] = useState<number | null>(null)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [onboardingDismissed, setOnboardingDismissed] = useState<boolean>(readDismissed)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Pick a sensible active project + account once data lands.
  useEffect(() => {
    if (activeProjectId === null && projects.length > 0) {
      setActiveProjectId(projects[0].id)
    }
  }, [projects, activeProjectId])

  useEffect(() => {
    if (activeAccountId === null && accounts.length > 0) {
      setActiveAccountId(accounts[0].id)
    }
  }, [accounts, activeAccountId])

  const { conversations } = useConversations(activeProjectId)
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null)

  // Reset active conversation when project changes.
  useEffect(() => {
    setActiveConversationId(conversations[0]?.id ?? null)
  }, [activeProjectId, conversations])

  const handleSelectProject = (id: number): void => {
    setActiveProjectId(id)
    rendererLogger.info('ui', 'project-switch', 'Switched project', { projectId: id })
  }

  const handleSelectAccount = (id: number): void => {
    setActiveAccountId(id)
    rendererLogger.info('ui', 'account-switch', 'Switched account', { accountId: id })
  }

  const handleSelectConversation = (id: number): void => {
    setActiveConversationId(id)
    rendererLogger.info('ui', 'conversation-select', 'Selected conversation', { conversationId: id })
  }

  const handleNewConversation = (): void => {
    rendererLogger.info('ui', 'new-conversation-clicked', 'New conversation button clicked (Phase 4 wires this)')
  }

  const handleOpenSettings = (): void => {
    rendererLogger.info('ui', 'settings-clicked', 'Settings button clicked (stub)')
  }

  const handleToggleSidebar = (): void => {
    setSidebarCollapsed((c) => !c)
  }

  const handleOpenCreateProject = (): void => {
    setCreateProjectOpen(true)
  }

  const handleCreateProject = async ({
    name,
    rootPath
  }: {
    name: string
    rootPath: string
  }): Promise<void> => {
    const created = await createProject({ name, rootPath, defaultAccountId: activeAccountId })
    if (created) {
      setActiveProjectId(created.id)
      rendererLogger.info('ui', 'project-create', 'Created project', { projectId: created.id, name })
    }
  }

  const handleDismissOnboarding = (): void => {
    setOnboardingDismissed(true)
    writeDismissed(true)
  }

  const showOnboarding = projects.length === 0 && !onboardingDismissed && !projectsLoading
  const showEmptyState = projects.length === 0 && !projectsLoading

  return (
    <div className="app-shell">
      <TopBar
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        accounts={accounts}
        activeAccountId={activeAccountId}
        onSelectAccount={handleSelectAccount}
        onOpenSettings={handleOpenSettings}
      />
      <OnboardingBanner
        visible={showOnboarding}
        onCreateProject={handleOpenCreateProject}
        onDismiss={handleDismissOnboarding}
      />
      <div className="app-shell__body">
        <ConversationSidebar
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={handleSelectConversation}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={handleToggleSidebar}
          onNewConversation={handleNewConversation}
        />
        {showEmptyState ? (
          <EmptyProjectsState onCreate={handleOpenCreateProject} />
        ) : (
          <MainPane />
        )}
      </div>
      <CreateProjectModal
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        onCreate={handleCreateProject}
      />
    </div>
  )
}
```

- [ ] **Step 2: Adapt ProjectSwitcher**

Replace `src/renderer/src/components/layout/ProjectSwitcher.tsx`:

```tsx
import { Dropdown, type DropdownItem } from '../common/Dropdown'
import type { Project } from '@shared/types/projects'

interface ProjectSwitcherProps {
  projects: readonly Project[]
  activeProjectId: number | null
  onSelect: (id: number) => void
}

export function ProjectSwitcher({ projects, activeProjectId, onSelect }: ProjectSwitcherProps): JSX.Element {
  const items: readonly DropdownItem[] = projects.map((p) => ({
    value: String(p.id),
    label: p.name,
    description: p.rootPath
  }))
  return (
    <Dropdown
      label="Project:"
      items={items}
      activeValue={activeProjectId !== null ? String(activeProjectId) : ''}
      onSelect={(v) => onSelect(Number(v))}
      fallbackLabel="No project"
    />
  )
}
```

- [ ] **Step 3: Adapt AccountSwitcher**

Open `src/renderer/src/components/layout/AccountSwitcher.tsx` and update its prop types:

```tsx
import { Dropdown, type DropdownItem } from '../common/Dropdown'
import type { Account } from '@shared/types/accounts'

interface AccountSwitcherProps {
  accounts: readonly Account[]
  activeAccountId: number | null
  onSelect: (id: number) => void
}

export function AccountSwitcher({ accounts, activeAccountId, onSelect }: AccountSwitcherProps): JSX.Element {
  const items: readonly DropdownItem[] = accounts.map((a) => ({
    value: String(a.id),
    label: a.label,
    description: a.configDir || '(no config dir)'
  }))
  return (
    <Dropdown
      label="Account:"
      items={items}
      activeValue={activeAccountId !== null ? String(activeAccountId) : ''}
      onSelect={(v) => onSelect(Number(v))}
      fallbackLabel="No account"
    />
  )
}
```

- [ ] **Step 4: Adapt TopBar**

Open `src/renderer/src/components/layout/TopBar.tsx`. Update its props interface to use `Project[]` + `Account[]` and `number | null` for ids:

```tsx
import type { Account } from '@shared/types/accounts'
import type { Project } from '@shared/types/projects'
import { AccountSwitcher } from './AccountSwitcher'
import { ProjectSwitcher } from './ProjectSwitcher'
import { SettingsButton } from './SettingsButton'

interface TopBarProps {
  projects: readonly Project[]
  activeProjectId: number | null
  onSelectProject: (id: number) => void
  accounts: readonly Account[]
  activeAccountId: number | null
  onSelectAccount: (id: number) => void
  onOpenSettings: () => void
}

export function TopBar({
  projects,
  activeProjectId,
  onSelectProject,
  accounts,
  activeAccountId,
  onSelectAccount,
  onOpenSettings
}: TopBarProps): JSX.Element {
  return (
    <header className="top-bar">
      <div className="top-bar__left">
        <ProjectSwitcher projects={projects} activeProjectId={activeProjectId} onSelect={onSelectProject} />
        <AccountSwitcher accounts={accounts} activeAccountId={activeAccountId} onSelect={onSelectAccount} />
      </div>
      <div className="top-bar__right">
        <SettingsButton onClick={onOpenSettings} />
      </div>
    </header>
  )
}
```

- [ ] **Step 5: Adapt ConversationList + ConversationListItem**

Replace `src/renderer/src/components/layout/ConversationListItem.tsx`:

```tsx
import type { Conversation } from '@shared/types/conversations'

interface ConversationListItemProps {
  conversation: Conversation
  isActive: boolean
  onSelect: (id: number) => void
}

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

function relativeTime(ts: number | null): string {
  if (ts === null) return ''
  const diff = Date.now() - ts
  if (diff < MIN) return 'just now'
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`
  return `${Math.floor(diff / DAY)}d ago`
}

export function ConversationListItem({ conversation, isActive, onSelect }: ConversationListItemProps): JSX.Element {
  const model = conversation.model ?? 'sonnet'
  return (
    <li className={`conversation-item ${isActive ? 'is-active' : ''}`}>
      <button
        type="button"
        className="conversation-item__button"
        onClick={() => onSelect(conversation.id)}
      >
        <span className="conversation-item__title">{conversation.title ?? 'Untitled'}</span>
        <span className="conversation-item__meta">
          <span className={`conversation-item__model conversation-item__model--${model}`}>{model}</span>
          <span className="conversation-item__time">{relativeTime(conversation.updatedAt)}</span>
        </span>
      </button>
    </li>
  )
}
```

Open `src/renderer/src/components/layout/ConversationList.tsx`. Update its props to:

```tsx
import type { Conversation } from '@shared/types/conversations'
import { ConversationListItem } from './ConversationListItem'

interface ConversationListProps {
  conversations: readonly Conversation[]
  activeId: number | null
  onSelect: (id: number) => void
}

export function ConversationList({ conversations, activeId, onSelect }: ConversationListProps): JSX.Element {
  if (conversations.length === 0) {
    return <p className="conversation-list__empty">No conversations yet.</p>
  }
  return (
    <ul className="conversation-list" role="list">
      {conversations.map((c) => (
        <ConversationListItem
          key={c.id}
          conversation={c}
          isActive={c.id === activeId}
          onSelect={onSelect}
        />
      ))}
    </ul>
  )
}
```

Open `src/renderer/src/components/layout/ConversationSidebar.tsx` — change its `conversations` prop to `readonly Conversation[]` and `activeId/onSelect` to `number`. Add `import type { Conversation } from '@shared/types/conversations'`.

- [ ] **Step 6: Type-check + build**

```bash
npm run typecheck
npm run build
```

Expected: PASS, PASS. Any remaining mock-typed callsite must be fixed at this point.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/layout src/renderer/src/components/onboarding
git commit -m "feat(phase-3): rewire AppShell + switchers + sidebar to IPC-backed hooks"
```

---

## Task 24: Delete the mock files no longer referenced

**Files:**
- Delete: `src/renderer/src/mocks/accounts.ts`
- Delete: `src/renderer/src/mocks/projects.ts`
- Delete: `src/renderer/src/mocks/conversations.ts`

- [ ] **Step 1: Confirm no remaining imports**

```bash
npm run typecheck
```

If references remain (e.g., a leftover `import { MOCK_PROJECTS }` somewhere), fix them. Run `Grep MOCK_PROJECTS` / `MOCK_ACCOUNTS` / `MOCK_CONVERSATIONS` and remove any callsites.

- [ ] **Step 2: Delete the files**

```bash
git rm src/renderer/src/mocks/accounts.ts src/renderer/src/mocks/projects.ts src/renderer/src/mocks/conversations.ts
```

- [ ] **Step 3: Run all tests**

```bash
npm run test:run
```

Expected: all tests pass. Phase 2B's Composer/GearReviewPane/TerminalSection tests still pass (they don't touch the mocks above).

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(phase-3): remove project/account/conversation mocks — replaced by IPC hooks"
```

---

## Task 25: Update Dev Mode panel categories + observability docs

**Files:**
- Modify: `docs/observability.md`

- [ ] **Step 1: Document `db` category usage**

Open `docs/observability.md`. Find the "Categories" or "Category catalogue" table and add (or update) the `db` row:

```markdown
| `db`            | SQLite schema migrations, DAO read/write failures, transaction rollbacks, connection lifecycle | `db-online`, `db-init-failed`, `projects-list`, `projects-create`, `projects-update`, `projects-delete`, `conversations-*`, `accounts-*` |
```

If the table has different columns or formatting, adapt to match — the goal is "the `db` category is documented for the same audience as the others."

- [ ] **Step 2: Commit**

```bash
git add docs/observability.md
git commit -m "docs(phase-3): document db category events"
```

---

## Task 26: Test scenarios + ADR-025 (renderer hook pattern)

**Files:**
- Modify: `docs/test-scenarios.md`
- Modify: `docs/decisions.md`

- [ ] **Step 1: Append Phase 3 manual scenarios**

Append to `docs/test-scenarios.md`:

```markdown

## Phase 3 — Database + persistence

### S-3.1 First-run welcome
1. Delete `%APPDATA%/tokenless/tokenless.db` (or run on a clean machine).
2. Launch the app.
3. **Expect:** TopBar shows "No project" in the ProjectSwitcher. Onboarding banner "👋 New here? Create your first project…" visible. EmptyProjectsState shows "Create your first project" CTA. Sidebar empty.

### S-3.2 Create first project
1. Continuing from S-3.1, click "Create your first project."
2. CreateProjectModal opens with focus on the Name field.
3. Type a name and root path; click Create.
4. **Expect:** Modal closes. Onboarding banner remains visible until dismissed. ProjectSwitcher now shows the new project as active. EmptyProjectsState is replaced by the Composer.
5. Click "Later" on the banner. Reload (Ctrl+R).
6. **Expect:** Banner does not return.

### S-3.3 Persistence across restart
1. Continuing from S-3.2, fully quit the app (Cmd/Ctrl+Q).
2. Relaunch.
3. **Expect:** The created project still appears in the ProjectSwitcher. Default account ("Personal") still in the AccountSwitcher.

### S-3.4 Multi-project switch
1. Create a second project via the UI ("Add project" affordance — TODO surface; can be invoked from Dev Mode for now or via SQL).
2. **Expect:** ProjectSwitcher dropdown lists both. Selecting either refreshes the (empty) ConversationList.

### S-3.5 DB failure recovery
1. Set `%APPDATA%/tokenless/tokenless.db` read-only.
2. Launch the app.
3. **Expect:** Fatal-severity log entry `db-init-failed` in Dev Mode panel (visible if you toggle Dev Mode in the prior session). App quits gracefully (does not white-screen). After making the file writable, restart succeeds.
```

- [ ] **Step 2: Append ADR-025**

Add to `docs/decisions.md`:

```markdown

## ADR-025 (2026-05-14) — Renderer hook pattern for IPC-backed data: fetch on mount, refetch on change-event broadcast

**Context:** The renderer needs project/conversation/account lists with reasonably current data without polling and without overcomplicating with a state library.

**Options considered:**
- A) React Query / SWR (rich cache, devtools, but adds 8–12 KB gzipped + a dependency)
- B) Zustand / Jotai global store (manual cache invalidation)
- C) Hand-rolled hooks: fetch on mount, refetch when main emits `<channel>:changed`

**Choice:** C — `useProjects`, `useConversations`, `useAccounts`. Each subscribes to its own `*:changed` IPC event. The mutation methods (`create/update/delete`) don't optimistically update — they return after the broadcast triggers a fresh fetch.

**Reasoning:** The dataset is tiny (projects + conversations measured in dozens), reads are near-free (in-memory SQLite via better-sqlite3), and we have only one window. Adding a cache library here would optimize a cost that doesn't exist. If Phase 7's branching or templates UI develops complex client cache behavior we can revisit.

```

- [ ] **Step 3: Commit**

```bash
git add docs/test-scenarios.md docs/decisions.md
git commit -m "docs(phase-3): manual test scenarios + ADR-025 renderer hook pattern"
```

---

## Task 27: E2E — persistence across app restart

**Files:**
- Create: `test/e2e/persistence.e2e.test.ts`

- [ ] **Step 1: Write the test**

Create `test/e2e/persistence.e2e.test.ts`:

```ts
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, rmSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Purpose: a project created in one launch persists across a full restart.
// Uses a per-test userData directory so we don't pollute the developer's real
// app data.

test.describe('Phase 3 persistence', () => {
  let userDataDir: string
  let app: ElectronApplication
  let page: Page

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'tokenless-e2e-'))
  })

  test.afterEach(async () => {
    if (app) {
      try { await app.close() } catch { /* ignore */ }
    }
    if (existsSync(userDataDir)) {
      rmSync(userDataDir, { recursive: true, force: true })
    }
  })

  async function launch(): Promise<{ app: ElectronApplication; page: Page }> {
    const application = await electron.launch({
      args: ['out/main/index.js', `--user-data-dir=${userDataDir}`],
      env: { ...process.env, TOKENLESS_USER_DATA_DIR: userDataDir }
    })
    const firstWindow = await application.firstWindow()
    await firstWindow.waitForLoadState('domcontentloaded')
    return { app: application, page: firstWindow }
  }

  test('project created in first launch survives restart', async () => {
    // First launch — empty DB → onboarding visible → create a project
    ;({ app, page } = await launch())
    await expect(page.getByRole('region', { name: /welcome to tokenless/i })).toBeVisible()
    await page.getByRole('button', { name: /create your first project/i }).click()
    await page.getByPlaceholder('My Project').fill('E2E Demo')
    await page.getByPlaceholder('C:/path/to/project').fill('C:/tmp/e2e-demo')
    await page.getByRole('button', { name: /^create$/i }).click()
    // Modal closes; ProjectSwitcher shows the new project
    await expect(page.getByText('E2E Demo')).toBeVisible()
    await app.close()

    // Second launch — same userData dir → project should still be there
    ;({ app, page } = await launch())
    await expect(page.getByText('E2E Demo')).toBeVisible()
    // Onboarding banner should NOT be visible since projects exist
    await expect(page.getByRole('region', { name: /welcome to tokenless/i })).not.toBeVisible()
  })
})
```

Note: Electron's `--user-data-dir` flag may not always be honored from Playwright's `args` depending on Electron version. If `app.getPath('userData')` does not pick it up, the implementer should add a small bootstrap to `src/main/index.ts` that respects `process.env['TOKENLESS_USER_DATA_DIR']`:

```ts
if (process.env['TOKENLESS_USER_DATA_DIR']) {
  app.setPath('userData', process.env['TOKENLESS_USER_DATA_DIR'])
}
```

Place this near the top of `main/index.ts`, before `openDatabase` is called. Commit alongside the E2E test.

- [ ] **Step 2: Run the E2E suite**

```bash
npm run build && npm run test:e2e
```

Expected: the new `persistence.e2e.test.ts` passes alongside the existing 11 Phase 2B E2E tests (total ≥ 12).

- [ ] **Step 3: Commit**

```bash
git add test/e2e/persistence.e2e.test.ts src/main/index.ts
git commit -m "test(phase-3): E2E — project persists across app restart"
```

---

## Task 28: Verification + tag v0.6.0-phase-3

**Files:** none new

- [ ] **Step 1: Run the four build gates**

```bash
npm run typecheck
npm run test:run
npm run build
npm run test:e2e
```

Expected: ALL PASS. Report the result for each as `TYPECHECK_OK`, `UNIT_OK (<N> tests / <M> suites)`, `BUILD_OK`, `E2E_OK (<N>/<N>)`.

If any gate fails, fix and re-run. Do not proceed to tagging.

- [ ] **Step 2: Tag the phase**

```bash
git tag v0.6.0-phase-3
git log --oneline -1
git rev-parse v0.6.0-phase-3
```

Verify the tag points to the latest commit.

- [ ] **Step 3: Hand off**

Report status: `Phase 3 complete locally. Tag v0.6.0-phase-3 at <sha>. Push + CI watch is next.`

Do NOT push automatically — the human/controller pushes and watches CI per the established phase-end workflow.

---

## Self-Review Checklist (run before handing off)

After all tasks land, sanity-check:

- [ ] Spec coverage: §3 schema (all 8 tables) created in 001_init.sql? §9 Phase 3 exit criteria met (projects + conversations persist)?
- [ ] No placeholders: scan for "TBD", "TODO", "implement later"
- [ ] Type consistency: `Project.id` is `number` everywhere (DAO + IPC + renderer)? `Conversation.projectId` matches `Project.id`?
- [ ] No silent failures: every DAO error path emits to logger.error or logger.warn
- [ ] All deleted mock imports removed (grep `MOCK_PROJECTS`, `MOCK_ACCOUNTS`, `MOCK_CONVERSATIONS`)
- [ ] `npm run typecheck` clean
- [ ] CLAUDE.md error-handling protocol respected: all new try/catches go through Logger; no stray `console.log`
- [ ] Phase 2B E2E tests still green

---

## Exit State

**Visible to user:**
- First-run app shows the welcome banner + EmptyProjectsState
- Creating a project via the modal adds it to the TopBar dropdown and persists across restarts
- Default "Personal" account is pre-seeded
- Sidebar populates from SQLite for the active project (empty initially — conversations are added by Phase 4)

**Under the hood:**
- SQLite database at `%APPDATA%/tokenless/tokenless.db` with all 8 tables from spec §3
- DAOs for accounts/projects/conversations (turns/drafts/templates/skills land in Phases 4–7)
- IPC handlers wrapped in `logger.errorBoundary('db', …)` returning `IpcResult<T>` envelopes
- Renderer hooks subscribe to `*:changed` broadcasts for live updates
- Test double `createTestDb()` provides fast in-memory DBs for unit + integration tests

**Tag:** `v0.6.0-phase-3`

**Next phase:** Phase 4 — Real Claude Code subprocess + terminal (PTY).
