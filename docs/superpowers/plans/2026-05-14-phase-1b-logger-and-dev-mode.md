# TokenLess v1 — Phase 1B: Logger + IPC Bridge + Dev Mode Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the observability cornerstone from spec §6 — a unified Logger service in `src/main/observability/`, an IPC bridge that ships renderer-side log records to the main-process Logger, and a Dev Mode panel UI in the renderer that displays a sortable JSON table of records. End state: every error path in the codebase (including the preload's lingering `TODO(phase-1)` console.error) flows through `logger.error()`; Dev Mode toggles on via a button in the app and shows real records streaming live.

**Architecture:** Logger is a singleton in main with three sinks (in-memory ring buffer, JSONL rotating file, IPC broadcast to renderer subscribers). Renderer has a thin `loggerBridge` shim that produces records and ships them to main via `ipcRenderer.send`. React `<ErrorBoundary>` at the App root catches renderer-side throws and routes them through the same bridge. Dev Mode panel subscribes to the broadcast and renders a sortable table; it tolerates being driven by either live records or a mock factory.

**Tech Stack:** Electron 32, React 18, TypeScript strict, Vitest 2 (unit + integration), Playwright 1.45 (E2E). Adds `happy-dom` as a dev dep for any DOM-touching unit tests we end up needing.

---

## Scope

Phase 1B only. Subsequent phases (Phase 2 — UI prototype with mocks; Phase 3 — Real DB + persistence; etc.) get their own plans.

## Prerequisites

- Phase 1A complete (`v0.2.0-phase-1a` tag exists; CI green on main)
- Working directory: `C:\personal\tokenless\`
- Node 20+, npm 10+
- All Phase 0 + 1A dependencies installed (`npm install` is a no-op or near-no-op)

## File structure

```
package.json                                                    [MODIFY] +happy-dom
package-lock.json                                               [MODIFY auto]

src/shared/
├── ipc.ts                                                      [REPLACE] extend with log channels
└── observability.ts                                            [CREATE] shared LogRecord/Severity/Category types

src/main/
├── index.ts                                                    [MODIFY] init Logger + IPC bridge + uncaught handlers
├── observability/                                              [CREATE]
│   ├── types.ts                                                [CREATE] main-side input types (re-exports shared)
│   ├── categories.ts                                           [CREATE] CATEGORIES const + isCategory helper
│   ├── ring-buffer.ts                                          [CREATE] RingBuffer<T>
│   ├── file-sink.ts                                            [CREATE] JSONL daily-rotation file writer
│   ├── logger.ts                                               [CREATE] Logger class
│   ├── error-boundary.ts                                       [CREATE] errorBoundary + asyncErrorBoundary
│   ├── uncaught-handlers.ts                                    [CREATE] installUncaughtHandlers
│   ├── index.ts                                                [CREATE] barrel export
│   └── __tests__/
│       ├── categories.unit.test.ts                             [CREATE]
│       ├── ring-buffer.unit.test.ts                            [CREATE]
│       ├── file-sink.integration.test.ts                       [CREATE]
│       ├── logger.unit.test.ts                                 [CREATE]
│       └── error-boundary.unit.test.ts                         [CREATE]
└── ipc/                                                        [CREATE]
    ├── log-bridge.ts                                           [CREATE] receives renderer logs, broadcasts to subscribers
    ├── index.ts                                                [CREATE] registerIpcHandlers
    └── __tests__/
        └── log-bridge.integration.test.ts                      [CREATE]

src/preload/
├── index.ts                                                    [MODIFY] expose tokenless.log API; remove TODO console.error
└── index.d.ts                                                  [MODIFY] extend Window.tokenless typing

src/renderer/src/
├── App.tsx                                                     [MODIFY] mount ErrorBoundary + Dev Mode toggle + panel
├── styles.css                                                  [MODIFY] tokens for dev-mode panel + toggle button
├── observability/                                              [CREATE]
│   ├── logger-bridge.ts                                        [CREATE] renderer-side rendererLogger
│   └── error-boundary.tsx                                      [CREATE] React <ErrorBoundary>
└── views/dev-mode/                                             [CREATE]
    ├── DevModePanel.tsx                                        [CREATE] top-level panel container
    ├── LogTable.tsx                                            [CREATE] sortable table
    ├── LogTableRow.tsx                                         [CREATE] row + expand state
    ├── LogDetail.tsx                                           [CREATE] expanded JSON view
    ├── Filters.tsx                                             [CREATE] chip filters + search
    ├── use-log-records.ts                                      [CREATE] hook subscribing to IPC stream
    ├── mock-records.ts                                         [CREATE] mock factory for dev/E2E
    └── styles.css                                              [CREATE] panel-specific styles

test/e2e/
└── dev-mode.e2e.test.ts                                        [CREATE] E2E: toggle on/off + records visible

docs/
├── observability.md                                            [MODIFY] add usage examples now that Logger exists
└── test-scenarios.md                                           [MODIFY] add Dev Mode scenarios
```

**Responsibilities:**

- `src/shared/observability.ts` — pure types and the `CATEGORIES` const + `isCategory` predicate. Importable from main OR renderer.
- `src/main/observability/logger.ts` — the only place that creates `LogRecord`s in the main process. Materializes with id, ts, source='main', fingerprint, then dispatches to ring buffer, file sink, and IPC subscribers.
- `src/main/observability/file-sink.ts` — JSONL writer. One file per day (`tokenless-YYYY-MM-DD.jsonl`). Retention by deletion at 30 days (no gzip in v1; cheap to add later).
- `src/main/observability/error-boundary.ts` — `errorBoundary(logger, category, event, fn)` wraps a sync fn; `asyncErrorBoundary` wraps an async fn. Returns the fn's result on success, `undefined` after logging on throw. Returning `undefined` (vs. rethrowing) is a deliberate choice — call sites decide whether to fall back or surface an error to the user, but they never let an uncaught throw escape an observability boundary.
- `src/main/ipc/log-bridge.ts` — listens for `log:event-from-renderer` (renderer ships pre-materialized records via `ipcRenderer.send`), then calls `logger.ingestFromRenderer(record)`. Also subscribes to the Logger and broadcasts records to every connected window via `webContents.send('log:event-to-renderer', record)`.
- `src/preload/index.ts` — exposes a narrow `tokenless.log` API to the renderer: `send(record)` to ship logs, `subscribe(fn)` to receive the broadcast. ALSO replaces the existing pre-Logger `console.error('contextBridge.exposeInMainWorld failed:', error)` with `tokenless.log.send(...)`-equivalent (using a minimal in-preload record builder since the renderer's logger bridge isn't loaded yet at preload time — preload errors get a fallback path).
- `src/renderer/src/observability/logger-bridge.ts` — renderer-side `rendererLogger` with `debug/info/warn/error/fatal` methods. Calls `window.tokenless.log.send()` under the hood. Fingerprint hash done locally (simple polynomial — `crypto.subtle.digest` is async-only, overkill for a fingerprint).
- `src/renderer/src/observability/error-boundary.tsx` — React `<ErrorBoundary>` class component (function components don't support `componentDidCatch`). On catch, calls `rendererLogger.fatal('ui', 'react-error-boundary', err.message, {componentStack}, err.stack)`.
- `src/renderer/src/views/dev-mode/use-log-records.ts` — hook that subscribes via `window.tokenless.log.subscribe`, maintains a stable record list with newest-first ordering, accepts an optional `mockRecords` array for test/dev use.
- `src/renderer/src/views/dev-mode/DevModePanel.tsx` — top-level panel. Manages filter + sort + search state internally. Renders `<Filters>` + `<LogTable>`.
- `src/renderer/src/App.tsx` — adds a "Dev Mode" toggle button to the app shell. State persisted in `localStorage` under `tokenless.devMode`. When on, mounts `<DevModePanel>` as a bottom drawer.

---

## Tasks

---

### Task 1: Install happy-dom for DOM-touching unit tests

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install happy-dom**

```bash
cd "C:/personal/tokenless"
npm install -D happy-dom
```

`happy-dom` is a lightweight DOM implementation for tests that need `window`, `document`, etc. (e.g., the renderer-side `loggerBridge` uses `window.tokenless`, but we'll mock that for unit tests — happy-dom provides the `window` skeleton).

- [ ] **Step 2: Verify**

```bash
node -e "const p = require('./package.json'); console.log(p.devDependencies['happy-dom'])"
```

Expected: a version string (e.g., `^15.x.x`).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(phase-1b): add happy-dom for DOM-touching unit tests"
```

---

### Task 2: Create shared observability types

**Files:**
- Create: `src/shared/observability.ts`

- [ ] **Step 1: Write the shared types**

```typescript
// Shared observability types. Importable from BOTH main and renderer.
// The full Logger service (sinks, dispatch, etc.) lives in src/main/observability/
// because it touches the filesystem and IPC — but the types themselves are pure
// data and need to be referenceable everywhere.

export const CATEGORIES = [
  'cc',
  'pty',
  'api',
  'db',
  'ipc',
  'ui',
  'skill',
  'auth',
  'gearing',
  'fs',
  'observability'
] as const

export type Category = (typeof CATEGORIES)[number]

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value)
}

export type Severity = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export type Source = 'main' | 'renderer'

export interface LogRecord {
  id: string
  ts: number
  severity: Severity
  category: Category
  event: string
  message: string
  context: Record<string, unknown>
  stack?: string
  fingerprint: string
  source: Source
}
```

- [ ] **Step 2: Verify typecheck still passes**

```bash
cd "C:/personal/tokenless"
npm run typecheck
```

Expected: exits 0 with no errors. The new file is well-formed and importable.

- [ ] **Step 3: Commit**

```bash
git add src/shared/observability.ts
git commit -m "feat(phase-1b): shared LogRecord/Severity/Category types"
```

---

### Task 3: Create CATEGORIES helper module

**Files:**
- Create: `src/main/observability/categories.ts`
- Create: `src/main/observability/__tests__/categories.unit.test.ts`

- [ ] **Step 1: Create the directories**

```bash
cd "C:/personal/tokenless"
mkdir -p src/main/observability/__tests__
```

- [ ] **Step 2: Write the failing test**

`src/main/observability/__tests__/categories.unit.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { CATEGORIES, isCategory } from '../categories'

describe('categories', () => {
  it('exposes the canonical 11-category list', () => {
    expect(CATEGORIES).toEqual([
      'cc',
      'pty',
      'api',
      'db',
      'ipc',
      'ui',
      'skill',
      'auth',
      'gearing',
      'fs',
      'observability'
    ])
  })

  it('isCategory accepts every entry in CATEGORIES', () => {
    for (const c of CATEGORIES) {
      expect(isCategory(c)).toBe(true)
    }
  })

  it('isCategory rejects unknown strings', () => {
    expect(isCategory('unknown')).toBe(false)
    expect(isCategory('')).toBe(false)
    expect(isCategory('CC')).toBe(false) // case-sensitive
  })
})
```

- [ ] **Step 3: Run the test (expected to fail)**

```bash
npm run test:run -- src/main/observability/__tests__/categories.unit.test.ts
```

Expected: FAIL — `../categories` does not exist yet.

- [ ] **Step 4: Implement**

`src/main/observability/categories.ts`:

```typescript
// Categories are re-exported from the shared module so main code can import
// them locally without crossing the shared/main boundary in every file.
// The canonical source of truth is src/shared/observability.ts.

export { CATEGORIES, isCategory, type Category } from '@shared/observability'
```

- [ ] **Step 5: Run the test (expected to pass)**

```bash
npm run test:run -- src/main/observability/__tests__/categories.unit.test.ts
```

Expected: 3 passing tests.

- [ ] **Step 6: Commit**

```bash
git add src/main/observability/categories.ts src/main/observability/__tests__/categories.unit.test.ts
git commit -m "feat(phase-1b): observability categories helper + tests"
```

---

### Task 4: Create RingBuffer with TDD

**Files:**
- Create: `src/main/observability/ring-buffer.ts`
- Create: `src/main/observability/__tests__/ring-buffer.unit.test.ts`

- [ ] **Step 1: Write the failing test**

`src/main/observability/__tests__/ring-buffer.unit.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { RingBuffer } from '../ring-buffer'

describe('RingBuffer', () => {
  it('throws on zero or negative capacity', () => {
    expect(() => new RingBuffer<number>(0)).toThrow()
    expect(() => new RingBuffer<number>(-1)).toThrow()
  })

  it('starts empty', () => {
    const rb = new RingBuffer<number>(3)
    expect(rb.size()).toBe(0)
    expect(rb.getAll()).toEqual([])
  })

  it('preserves insertion order up to capacity', () => {
    const rb = new RingBuffer<number>(3)
    rb.push(1)
    rb.push(2)
    rb.push(3)
    expect(rb.size()).toBe(3)
    expect(rb.getAll()).toEqual([1, 2, 3])
  })

  it('evicts oldest item when over capacity', () => {
    const rb = new RingBuffer<number>(3)
    rb.push(1)
    rb.push(2)
    rb.push(3)
    rb.push(4)
    expect(rb.size()).toBe(3)
    expect(rb.getAll()).toEqual([2, 3, 4])
  })

  it('continues to evict after many over-capacity pushes', () => {
    const rb = new RingBuffer<number>(2)
    for (let i = 1; i <= 10; i++) rb.push(i)
    expect(rb.getAll()).toEqual([9, 10])
  })

  it('clear empties the buffer', () => {
    const rb = new RingBuffer<number>(3)
    rb.push(1)
    rb.push(2)
    rb.clear()
    expect(rb.size()).toBe(0)
    expect(rb.getAll()).toEqual([])
  })

  it('getAll returns a defensive copy (mutating it does not affect the buffer)', () => {
    const rb = new RingBuffer<number>(3)
    rb.push(1)
    rb.push(2)
    const snapshot = rb.getAll()
    ;(snapshot as number[]).push(99)
    expect(rb.getAll()).toEqual([1, 2])
  })
})
```

- [ ] **Step 2: Run the test (expected to fail)**

```bash
npm run test:run -- src/main/observability/__tests__/ring-buffer.unit.test.ts
```

Expected: FAIL — `../ring-buffer` does not exist.

- [ ] **Step 3: Implement**

`src/main/observability/ring-buffer.ts`:

```typescript
// Fixed-capacity in-memory buffer. Used by the Logger to keep the most
// recent N records available for Dev Mode display without unbounded
// memory growth.

export class RingBuffer<T> {
  private items: T[] = []

  constructor(private readonly capacity: number) {
    if (capacity <= 0) {
      throw new Error(`RingBuffer capacity must be positive, got ${capacity}`)
    }
  }

  push(item: T): void {
    this.items.push(item)
    if (this.items.length > this.capacity) {
      this.items.shift()
    }
  }

  getAll(): readonly T[] {
    return [...this.items]
  }

  size(): number {
    return this.items.length
  }

  clear(): void {
    this.items = []
  }
}
```

- [ ] **Step 4: Run the test (expected to pass)**

```bash
npm run test:run -- src/main/observability/__tests__/ring-buffer.unit.test.ts
```

Expected: 7 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/observability/ring-buffer.ts src/main/observability/__tests__/ring-buffer.unit.test.ts
git commit -m "feat(phase-1b): RingBuffer<T> for in-memory log retention + tests"
```

---

### Task 5: Create FileSink with daily rotation

**Files:**
- Create: `src/main/observability/file-sink.ts`
- Create: `src/main/observability/__tests__/file-sink.integration.test.ts`

This task uses real filesystem operations against a tmp directory, so the test is an `.integration.test.ts` (not `.unit.test.ts`). Both globs are covered by `vitest.config.ts`.

- [ ] **Step 1: Write the failing test**

`src/main/observability/__tests__/file-sink.integration.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileSink } from '../file-sink'
import type { LogRecord } from '@shared/observability'

function makeRecord(overrides: Partial<LogRecord> = {}): LogRecord {
  return {
    id: 'test-id',
    ts: Date.now(),
    severity: 'info',
    category: 'observability',
    event: 'test-event',
    message: 'test message',
    context: {},
    fingerprint: 'abc123',
    source: 'main',
    ...overrides
  }
}

describe('FileSink', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tl-filesink-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates the log dir if missing', () => {
    const subDir = join(tmpDir, 'logs', 'nested')
    new FileSink(subDir)
    expect(readdirSync(join(tmpDir, 'logs')).length).toBeGreaterThanOrEqual(1)
  })

  it('writes a JSONL line per record to the current-day file', () => {
    const fixedDate = new Date('2026-05-14T10:00:00Z')
    const sink = new FileSink(tmpDir, 30, () => fixedDate)
    sink.write(makeRecord({ event: 'first' }))
    sink.write(makeRecord({ event: 'second' }))

    const files = readdirSync(tmpDir)
    expect(files).toEqual(['tokenless-2026-05-14.jsonl'])

    const contents = readFileSync(join(tmpDir, 'tokenless-2026-05-14.jsonl'), 'utf8')
    const lines = contents.trim().split('\n')
    expect(lines.length).toBe(2)
    const parsed = lines.map((l) => JSON.parse(l))
    expect(parsed[0].event).toBe('first')
    expect(parsed[1].event).toBe('second')
  })

  it('rotates to a new file when the date changes', () => {
    let now = new Date('2026-05-14T23:00:00Z')
    const sink = new FileSink(tmpDir, 30, () => now)
    sink.write(makeRecord({ event: 'late-on-14' }))

    now = new Date('2026-05-15T01:00:00Z')
    sink.write(makeRecord({ event: 'early-on-15' }))

    const files = readdirSync(tmpDir).sort()
    expect(files).toEqual([
      'tokenless-2026-05-14.jsonl',
      'tokenless-2026-05-15.jsonl'
    ])
  })

  it('prunes files older than retentionDays at rotation time', () => {
    // Seed with an old file
    const oldFile = join(tmpDir, 'tokenless-2026-04-01.jsonl')
    writeFileSync(oldFile, '{"event":"old"}\n')
    // Backdate its mtime to ~60 days ago
    const sixtyDaysAgo = new Date('2026-03-15T00:00:00Z')
    const fs = require('node:fs') as typeof import('node:fs')
    fs.utimesSync(oldFile, sixtyDaysAgo, sixtyDaysAgo)

    let now = new Date('2026-05-14T23:00:00Z')
    const sink = new FileSink(tmpDir, 30, () => now)
    sink.write(makeRecord({ event: 'still-on-14' }))

    // Cross a date boundary to trigger pruning
    now = new Date('2026-05-15T00:30:00Z')
    sink.write(makeRecord({ event: 'on-15' }))

    const files = readdirSync(tmpDir)
    expect(files).not.toContain('tokenless-2026-04-01.jsonl')
    expect(files).toContain('tokenless-2026-05-14.jsonl')
    expect(files).toContain('tokenless-2026-05-15.jsonl')
  })
})
```

- [ ] **Step 2: Run the test (expected to fail)**

```bash
npm run test:run -- src/main/observability/__tests__/file-sink.integration.test.ts
```

Expected: FAIL — `../file-sink` does not exist.

- [ ] **Step 3: Implement**

`src/main/observability/file-sink.ts`:

```typescript
import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync
} from 'node:fs'
import { join } from 'node:path'
import type { LogRecord } from '@shared/observability'

type Clock = () => Date

// JSONL writer. One file per day named `tokenless-YYYY-MM-DD.jsonl`.
// Daily boundaries are checked lazily on every write — when the date changes,
// the next write rolls to a new file and prunes files older than retentionDays.

export class FileSink {
  private currentDate: string
  private currentPath: string

  constructor(
    private readonly logDir: string,
    private readonly retentionDays: number = 30,
    private readonly clock: Clock = () => new Date()
  ) {
    mkdirSync(logDir, { recursive: true })
    this.currentDate = this.dateString(this.clock())
    this.currentPath = join(this.logDir, `tokenless-${this.currentDate}.jsonl`)
  }

  write(record: LogRecord): void {
    this.rotateIfNeeded()
    appendFileSync(this.currentPath, JSON.stringify(record) + '\n', 'utf8')
  }

  private rotateIfNeeded(): void {
    const today = this.dateString(this.clock())
    if (today !== this.currentDate) {
      this.currentDate = today
      this.currentPath = join(this.logDir, `tokenless-${today}.jsonl`)
      this.prune()
    }
  }

  private prune(): void {
    const cutoff = this.clock().getTime() - this.retentionDays * 86_400_000
    for (const file of readdirSync(this.logDir)) {
      const full = join(this.logDir, file)
      try {
        if (statSync(full).mtimeMs < cutoff) {
          unlinkSync(full)
        }
      } catch {
        // file may have been removed between readdir and stat — ignore
      }
    }
  }

  private dateString(d: Date): string {
    const yyyy = d.getUTCFullYear()
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }
}
```

- [ ] **Step 4: Run the test (expected to pass)**

```bash
npm run test:run -- src/main/observability/__tests__/file-sink.integration.test.ts
```

Expected: 4 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/observability/file-sink.ts src/main/observability/__tests__/file-sink.integration.test.ts
git commit -m "feat(phase-1b): FileSink JSONL writer with daily rotation + tests"
```

---

### Task 6: Create main-side Logger with TDD

**Files:**
- Create: `src/main/observability/types.ts`
- Create: `src/main/observability/logger.ts`
- Create: `src/main/observability/__tests__/logger.unit.test.ts`

- [ ] **Step 1: Write `src/main/observability/types.ts`**

This file re-exports the shared types and adds the main-only `LogRecordInput` shape (the bits the caller provides; the Logger fills in id/ts/source/fingerprint).

```typescript
// Re-export shared types for ergonomic imports inside main/observability.
// Plus add LogRecordInput — the slice of LogRecord the caller provides;
// id, ts, source, and fingerprint are populated by the Logger at materialize time.

export type {
  Category,
  LogRecord,
  Severity,
  Source
} from '@shared/observability'

import type { Category, Severity } from '@shared/observability'

export interface LogRecordInput {
  severity: Severity
  category: Category
  event: string
  message: string
  context: Record<string, unknown>
  stack?: string
}
```

- [ ] **Step 2: Write the failing test**

`src/main/observability/__tests__/logger.unit.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { Logger } from '../logger'
import type { LogRecord } from '@shared/observability'
import type { FileSink } from '../file-sink'

function fakeFileSink(): FileSink & { written: LogRecord[] } {
  const written: LogRecord[] = []
  return {
    written,
    write: (record: LogRecord) => {
      written.push(record)
    }
  } as unknown as FileSink & { written: LogRecord[] }
}

describe('Logger', () => {
  it('records info() call into ring buffer and file sink', () => {
    const sink = fakeFileSink()
    const logger = new Logger(sink, 100, 'main')
    logger.info('observability', 'startup', 'Logger online', { pid: 123 })

    expect(sink.written.length).toBe(1)
    const rec = sink.written[0]
    expect(rec.severity).toBe('info')
    expect(rec.category).toBe('observability')
    expect(rec.event).toBe('startup')
    expect(rec.message).toBe('Logger online')
    expect(rec.context).toEqual({ pid: 123 })
    expect(rec.source).toBe('main')
    expect(typeof rec.id).toBe('string')
    expect(rec.id.length).toBeGreaterThan(0)
    expect(typeof rec.ts).toBe('number')
    expect(rec.fingerprint.length).toBe(16)
  })

  it('all 5 severity methods produce records with correct severity', () => {
    const sink = fakeFileSink()
    const logger = new Logger(sink, 100, 'main')
    logger.debug('observability', 'd', 'd')
    logger.info('observability', 'i', 'i')
    logger.warn('observability', 'w', 'w')
    logger.error('observability', 'e', 'e')
    logger.fatal('observability', 'f', 'f')
    expect(sink.written.map((r) => r.severity)).toEqual(['debug', 'info', 'warn', 'error', 'fatal'])
  })

  it('error() and fatal() accept an optional stack', () => {
    const sink = fakeFileSink()
    const logger = new Logger(sink, 100, 'main')
    logger.error('observability', 'oops', 'broke', { x: 1 }, 'Error: broke\n  at foo')
    expect(sink.written[0].stack).toBe('Error: broke\n  at foo')
  })

  it('fingerprint is stable for identical event/category/stack and differs otherwise', () => {
    const sink = fakeFileSink()
    const logger = new Logger(sink, 100, 'main')
    logger.error('observability', 'a', 'x', {}, 'stack-1')
    logger.error('observability', 'a', 'x', {}, 'stack-1')
    logger.error('observability', 'a', 'x', {}, 'stack-2')
    expect(sink.written[0].fingerprint).toBe(sink.written[1].fingerprint)
    expect(sink.written[0].fingerprint).not.toBe(sink.written[2].fingerprint)
  })

  it('getRecent returns the last N records', () => {
    const sink = fakeFileSink()
    const logger = new Logger(sink, 100, 'main')
    for (let i = 0; i < 5; i++) logger.info('observability', `event-${i}`, `msg-${i}`)
    const recent = logger.getRecent(3)
    expect(recent.length).toBe(3)
    expect(recent.map((r) => r.event)).toEqual(['event-2', 'event-3', 'event-4'])
  })

  it('subscribers receive every dispatched record', () => {
    const sink = fakeFileSink()
    const logger = new Logger(sink, 100, 'main')
    const subscriber = vi.fn()
    const unsubscribe = logger.subscribe(subscriber)
    logger.info('observability', 'one', 'one')
    logger.info('observability', 'two', 'two')
    unsubscribe()
    logger.info('observability', 'three', 'three')
    expect(subscriber).toHaveBeenCalledTimes(2)
    expect(subscriber.mock.calls[0][0].event).toBe('one')
    expect(subscriber.mock.calls[1][0].event).toBe('two')
  })

  it('a throwing subscriber does not stop dispatch to others or break the logger', () => {
    const sink = fakeFileSink()
    const logger = new Logger(sink, 100, 'main')
    const bad = vi.fn(() => { throw new Error('subscriber failed') })
    const good = vi.fn()
    logger.subscribe(bad)
    logger.subscribe(good)
    logger.info('observability', 'event', 'msg')
    expect(bad).toHaveBeenCalled()
    expect(good).toHaveBeenCalled()
    expect(sink.written.length).toBe(1)
  })

  it('ingestFromRenderer pushes a pre-materialized record through dispatch (no re-materialize)', () => {
    const sink = fakeFileSink()
    const logger = new Logger(sink, 100, 'main')
    const rendererRecord: LogRecord = {
      id: 'renderer-uuid',
      ts: 1234567890,
      severity: 'warn',
      category: 'ui',
      event: 'react-warning',
      message: 'something weird',
      context: { component: 'App' },
      fingerprint: 'rendererfp123456',
      source: 'renderer'
    }
    logger.ingestFromRenderer(rendererRecord)
    expect(sink.written.length).toBe(1)
    expect(sink.written[0]).toEqual(rendererRecord)
  })
})
```

- [ ] **Step 3: Run the test (expected to fail)**

```bash
npm run test:run -- src/main/observability/__tests__/logger.unit.test.ts
```

Expected: FAIL — `../logger` does not exist.

- [ ] **Step 4: Implement `src/main/observability/logger.ts`**

```typescript
import { createHash, randomUUID } from 'node:crypto'
import type { Category, LogRecord, LogRecordInput, Source } from './types'
import { RingBuffer } from './ring-buffer'
import type { FileSink } from './file-sink'

type Subscriber = (record: LogRecord) => void

// Logger is the spine of TokenLess observability. Every error path routes
// through this class (or its renderer-side counterpart). Three fan-out sinks:
//   1. In-memory ring buffer for Dev Mode 'getRecent' queries.
//   2. FileSink for durable JSONL persistence.
//   3. Subscribers for live streaming (the IPC bridge subscribes here to
//      push records to the renderer's Dev Mode panel).

export class Logger {
  private readonly buffer: RingBuffer<LogRecord>
  private readonly subscribers = new Set<Subscriber>()

  constructor(
    private readonly fileSink: FileSink,
    bufferCapacity: number = 5000,
    private readonly source: Source = 'main'
  ) {
    this.buffer = new RingBuffer<LogRecord>(bufferCapacity)
  }

  debug(category: Category, event: string, message: string, context: Record<string, unknown> = {}): void {
    this.log({ severity: 'debug', category, event, message, context })
  }

  info(category: Category, event: string, message: string, context: Record<string, unknown> = {}): void {
    this.log({ severity: 'info', category, event, message, context })
  }

  warn(category: Category, event: string, message: string, context: Record<string, unknown> = {}): void {
    this.log({ severity: 'warn', category, event, message, context })
  }

  error(
    category: Category,
    event: string,
    message: string,
    context: Record<string, unknown> = {},
    stack?: string
  ): void {
    this.log({ severity: 'error', category, event, message, context, stack })
  }

  fatal(
    category: Category,
    event: string,
    message: string,
    context: Record<string, unknown> = {},
    stack?: string
  ): void {
    this.log({ severity: 'fatal', category, event, message, context, stack })
  }

  // Receives a record that was already materialized by the renderer side.
  // Source on those records is 'renderer'; we do NOT overwrite it.
  ingestFromRenderer(record: LogRecord): void {
    this.dispatch(record)
  }

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn)
    return () => {
      this.subscribers.delete(fn)
    }
  }

  getRecent(n: number = 1000): readonly LogRecord[] {
    const all = this.buffer.getAll()
    return all.slice(-n)
  }

  private log(input: LogRecordInput): void {
    const record = this.materialize(input)
    this.dispatch(record)
  }

  private dispatch(record: LogRecord): void {
    this.buffer.push(record)
    this.fileSink.write(record)
    for (const sub of this.subscribers) {
      try {
        sub(record)
      } catch {
        // Swallow subscriber errors so logging never cascades. If a subscriber
        // is failing repeatedly, that's an issue to surface separately — but
        // it never blocks downstream logging.
      }
    }
  }

  private materialize(input: LogRecordInput): LogRecord {
    return {
      severity: input.severity,
      category: input.category,
      event: input.event,
      message: input.message,
      context: input.context,
      stack: input.stack,
      id: randomUUID(),
      ts: Date.now(),
      source: this.source,
      fingerprint: this.fingerprint(input)
    }
  }

  private fingerprint(input: LogRecordInput): string {
    const key = `${input.category}::${input.event}::${input.stack ?? ''}`
    return createHash('sha256').update(key).digest('hex').slice(0, 16)
  }
}
```

- [ ] **Step 5: Run the test (expected to pass)**

```bash
npm run test:run -- src/main/observability/__tests__/logger.unit.test.ts
```

Expected: 8 passing tests.

- [ ] **Step 6: Commit**

```bash
git add src/main/observability/types.ts src/main/observability/logger.ts src/main/observability/__tests__/logger.unit.test.ts
git commit -m "feat(phase-1b): Logger class with sinks + subscribers + tests"
```

---

### Task 7: Create errorBoundary helpers with TDD

**Files:**
- Create: `src/main/observability/error-boundary.ts`
- Create: `src/main/observability/__tests__/error-boundary.unit.test.ts`

- [ ] **Step 1: Write the failing test**

`src/main/observability/__tests__/error-boundary.unit.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { asyncErrorBoundary, errorBoundary } from '../error-boundary'
import type { Logger } from '../logger'

function fakeLogger() {
  const calls: Array<{ category: string; event: string; message: string; stack?: string }> = []
  const logger = {
    error: vi.fn((category: string, event: string, message: string, _context: object, stack?: string) => {
      calls.push({ category, event, message, stack })
    })
  } as unknown as Logger
  return { logger, calls }
}

describe('errorBoundary', () => {
  it('returns the function result when no throw', () => {
    const { logger } = fakeLogger()
    const result = errorBoundary(logger, 'observability', 'safe-op', () => 42)
    expect(result).toBe(42)
  })

  it('does not call logger.error when no throw', () => {
    const { logger, calls } = fakeLogger()
    errorBoundary(logger, 'observability', 'safe-op', () => 'ok')
    expect(calls.length).toBe(0)
  })

  it('returns undefined and logs when the function throws an Error', () => {
    const { logger, calls } = fakeLogger()
    const result = errorBoundary(logger, 'fs', 'read-file', () => {
      throw new Error('ENOENT: no such file')
    })
    expect(result).toBeUndefined()
    expect(calls.length).toBe(1)
    expect(calls[0].category).toBe('fs')
    expect(calls[0].event).toBe('read-file')
    expect(calls[0].message).toBe('ENOENT: no such file')
    expect(calls[0].stack).toBeDefined()
  })

  it('returns undefined and logs when the function throws a non-Error', () => {
    const { logger, calls } = fakeLogger()
    const result = errorBoundary(logger, 'api', 'parse-response', () => {
      throw 'string thrown directly'
    })
    expect(result).toBeUndefined()
    expect(calls.length).toBe(1)
    expect(calls[0].message).toBe('string thrown directly')
  })
})

describe('asyncErrorBoundary', () => {
  it('awaits and returns the resolved value', async () => {
    const { logger } = fakeLogger()
    const result = await asyncErrorBoundary(logger, 'api', 'fetch', async () => 'data')
    expect(result).toBe('data')
  })

  it('returns undefined and logs when the promise rejects with an Error', async () => {
    const { logger, calls } = fakeLogger()
    const result = await asyncErrorBoundary(logger, 'api', 'fetch', async () => {
      throw new Error('network down')
    })
    expect(result).toBeUndefined()
    expect(calls.length).toBe(1)
    expect(calls[0].message).toBe('network down')
    expect(calls[0].stack).toBeDefined()
  })

  it('returns undefined and logs when the promise rejects with a non-Error', async () => {
    const { logger, calls } = fakeLogger()
    const result = await asyncErrorBoundary(logger, 'api', 'fetch', async () => {
      throw { code: 500 }
    })
    expect(result).toBeUndefined()
    expect(calls[0].message).toBe('[object Object]')
  })
})
```

- [ ] **Step 2: Run the test (expected to fail)**

```bash
npm run test:run -- src/main/observability/__tests__/error-boundary.unit.test.ts
```

Expected: FAIL — `../error-boundary` does not exist.

- [ ] **Step 3: Implement**

`src/main/observability/error-boundary.ts`:

```typescript
import type { Category } from './types'
import type { Logger } from './logger'

// errorBoundary wraps a sync function: if it throws, the throw is caught,
// logged, and undefined is returned. The caller decides whether to surface
// the failure or fall back to a default.
//
// asyncErrorBoundary is the same for async functions.
//
// Returning undefined (instead of rethrowing) is a deliberate choice: every
// call site is forced to handle the absence-of-result case explicitly, which
// in practice catches the "I forgot the error path existed" bug class.

export function errorBoundary<T>(
  logger: Logger,
  category: Category,
  event: string,
  fn: () => T
): T | undefined {
  try {
    return fn()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    logger.error(category, event, message, { errorString: String(err) }, stack)
    return undefined
  }
}

export async function asyncErrorBoundary<T>(
  logger: Logger,
  category: Category,
  event: string,
  fn: () => Promise<T>
): Promise<T | undefined> {
  try {
    return await fn()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    logger.error(category, event, message, { errorString: String(err) }, stack)
    return undefined
  }
}
```

- [ ] **Step 4: Run the test (expected to pass)**

```bash
npm run test:run -- src/main/observability/__tests__/error-boundary.unit.test.ts
```

Expected: 7 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/observability/error-boundary.ts src/main/observability/__tests__/error-boundary.unit.test.ts
git commit -m "feat(phase-1b): errorBoundary + asyncErrorBoundary helpers + tests"
```

---

### Task 8: Create uncaught-handlers installer

**Files:**
- Create: `src/main/observability/uncaught-handlers.ts`

(No dedicated unit test — installing process-level handlers and triggering them from a test would require process-level fault injection. The Logger's own tests cover the dispatch path; this file is a thin wiring function.)

- [ ] **Step 1: Implement**

`src/main/observability/uncaught-handlers.ts`:

```typescript
import type { Logger } from './logger'

// Installs process-level handlers for uncaught exceptions and unhandled
// promise rejections. Both route through the Logger.
//
// uncaughtException is treated as 'fatal' because the process is in an
// unknown state. unhandledRejection is 'error' because Node's behavior
// preserves the process for now (though that's changing in newer Node).
//
// This function should be called once, early in the main process startup,
// AFTER the Logger has been constructed but BEFORE any other code that
// might throw asynchronously.

export function installUncaughtHandlers(logger: Logger): void {
  process.on('uncaughtException', (err) => {
    logger.fatal(
      'observability',
      'uncaught-exception',
      err.message,
      { name: err.name },
      err.stack
    )
  })

  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : undefined
    logger.error(
      'observability',
      'unhandled-rejection',
      message,
      { reasonString: String(reason) },
      stack
    )
  })
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd "C:/personal/tokenless"
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/main/observability/uncaught-handlers.ts
git commit -m "feat(phase-1b): installUncaughtHandlers wires process handlers to Logger"
```

---

### Task 9: Create observability barrel export

**Files:**
- Create: `src/main/observability/index.ts`

- [ ] **Step 1: Write the barrel**

`src/main/observability/index.ts`:

```typescript
// Barrel export for the observability module. Everything other modules need.

export type { Category, LogRecord, LogRecordInput, Severity, Source } from './types'
export { CATEGORIES, isCategory } from './categories'
export { Logger } from './logger'
export { RingBuffer } from './ring-buffer'
export { FileSink } from './file-sink'
export { errorBoundary, asyncErrorBoundary } from './error-boundary'
export { installUncaughtHandlers } from './uncaught-handlers'
```

- [ ] **Step 2: Run all unit + integration tests**

```bash
npm run test:run
```

Expected: every test from Tasks 3-7 still passes (Task 8 has no test). The barrel doesn't break any imports.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/main/observability/index.ts
git commit -m "feat(phase-1b): observability barrel export"
```

---

### Task 10: Extend shared IPC contract with log channels

**Files:**
- Modify: `src/shared/ipc.ts`

- [ ] **Step 1: Replace `src/shared/ipc.ts` with extended content**

The current file has Phase 0's placeholder `phase-0:ping`. Replace with Phase 1B's log channels (keeping the placeholder for now — it'll get removed when an actual non-log channel is added in Phase 2+).

```typescript
// Typed IPC contract between main and renderer.
// Phase 1B populates this with the Logger bridge channels.
// Subsequent phases add cc:*, gear:*, projects:*, etc.

import type { LogRecord } from './observability'

// Channels: renderer -> main (fire-and-forget, ipcRenderer.send / ipcMain.on)
export const IPC_LOG_FROM_RENDERER = 'log:event-from-renderer'

// Channels: main -> renderer (push to all windows, webContents.send / ipcRenderer.on)
export const IPC_LOG_TO_RENDERER = 'log:event-to-renderer'

// Channels: renderer -> main (request/response, ipcRenderer.invoke / ipcMain.handle)
export const IPC_LOG_GET_RECENT = 'log:get-recent'

// Payload types for each channel
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

// Phase 0 placeholder — preserved for backward compat; remove when a
// real non-log channel takes its place (Phase 2+).
export type IpcChannelName =
  | 'phase-0:ping'
  | typeof IPC_LOG_FROM_RENDERER
  | typeof IPC_LOG_TO_RENDERER
  | typeof IPC_LOG_GET_RECENT
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/shared/ipc.ts
git commit -m "feat(phase-1b): extend shared IPC contract with log channels"
```

---

### Task 11: Create main-side IPC log bridge

**Files:**
- Create: `src/main/ipc/log-bridge.ts`
- Create: `src/main/ipc/__tests__/log-bridge.integration.test.ts`

- [ ] **Step 1: Create directories**

```bash
cd "C:/personal/tokenless"
mkdir -p src/main/ipc/__tests__
```

- [ ] **Step 2: Write the failing test**

`src/main/ipc/__tests__/log-bridge.integration.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { LogBridge } from '../log-bridge'
import type { Logger } from '@main/observability'
import type { LogRecord } from '@shared/observability'

function makeRecord(overrides: Partial<LogRecord> = {}): LogRecord {
  return {
    id: 'r-id',
    ts: 1234567890,
    severity: 'info',
    category: 'observability',
    event: 'test',
    message: 'msg',
    context: {},
    fingerprint: 'fp',
    source: 'renderer',
    ...overrides
  }
}

function fakeLogger() {
  const subscribers: Array<(r: LogRecord) => void> = []
  let ingestedRecords: LogRecord[] = []
  const logger = {
    ingestFromRenderer: vi.fn((r: LogRecord) => {
      ingestedRecords.push(r)
      subscribers.forEach((s) => s(r))
    }),
    subscribe: vi.fn((fn: (r: LogRecord) => void) => {
      subscribers.push(fn)
      return () => {
        const i = subscribers.indexOf(fn)
        if (i >= 0) subscribers.splice(i, 1)
      }
    }),
    getRecent: vi.fn((_n?: number) => [] as LogRecord[])
  } as unknown as Logger
  return { logger, ingestedRecords, subscribers }
}

function fakeIpcMain() {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {}
  const invokeHandlers: Record<string, (...args: unknown[]) => unknown> = {}
  const ipc = {
    on: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers[channel] = fn
    }),
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      invokeHandlers[channel] = fn
    }),
    removeAllListeners: vi.fn()
  }
  return { ipc, handlers, invokeHandlers }
}

function fakeBroadcast() {
  const sent: Array<{ channel: string; payload: unknown }> = []
  return {
    sent,
    fn: vi.fn((channel: string, payload: unknown) => {
      sent.push({ channel, payload })
    })
  }
}

describe('LogBridge', () => {
  it('forwards renderer records via ingestFromRenderer', () => {
    const { logger, ingestedRecords } = fakeLogger()
    const { ipc, handlers } = fakeIpcMain()
    const { fn: broadcast } = fakeBroadcast()

    const bridge = new LogBridge(logger, ipc as never, broadcast)
    bridge.install()

    const record = makeRecord({ event: 'from-renderer' })
    // simulate the renderer firing the channel
    handlers['log:event-from-renderer']!({} as never, { record })

    expect(ingestedRecords.length).toBe(1)
    expect(ingestedRecords[0].event).toBe('from-renderer')
  })

  it('broadcasts records dispatched in the Logger to all windows', () => {
    const { logger } = fakeLogger()
    const { ipc } = fakeIpcMain()
    const { sent, fn: broadcast } = fakeBroadcast()

    const bridge = new LogBridge(logger, ipc as never, broadcast)
    bridge.install()

    // Trigger via ingestFromRenderer (which calls subscribers, of which
    // the bridge is one)
    logger.ingestFromRenderer(makeRecord({ event: 'broadcasted' }))

    expect(sent.length).toBe(1)
    expect(sent[0].channel).toBe('log:event-to-renderer')
    expect((sent[0].payload as { record: LogRecord }).record.event).toBe('broadcasted')
  })

  it('responds to log:get-recent with logger.getRecent', () => {
    const { logger } = fakeLogger()
    const recentMock = [makeRecord({ event: 'a' }), makeRecord({ event: 'b' })]
    ;(logger.getRecent as ReturnType<typeof vi.fn>).mockReturnValue(recentMock)
    const { ipc, invokeHandlers } = fakeIpcMain()
    const { fn: broadcast } = fakeBroadcast()

    const bridge = new LogBridge(logger, ipc as never, broadcast)
    bridge.install()

    const result = invokeHandlers['log:get-recent']!({} as never, { count: 500 })
    expect(logger.getRecent).toHaveBeenCalledWith(500)
    expect(result).toEqual({ records: recentMock })
  })

  it('uninstall removes listeners and unsubscribes from the Logger', () => {
    const { logger } = fakeLogger()
    const { ipc, handlers } = fakeIpcMain()
    const { sent, fn: broadcast } = fakeBroadcast()

    const bridge = new LogBridge(logger, ipc as never, broadcast)
    bridge.install()
    bridge.uninstall()

    // After uninstall, dispatched records should NOT be broadcast
    logger.ingestFromRenderer(makeRecord({ event: 'after-uninstall' }))
    expect(sent.length).toBe(0)
    expect(ipc.removeAllListeners).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run the test (expected to fail)**

```bash
npm run test:run -- src/main/ipc/__tests__/log-bridge.integration.test.ts
```

Expected: FAIL — `../log-bridge` does not exist.

- [ ] **Step 4: Implement**

`src/main/ipc/log-bridge.ts`:

```typescript
import type { IpcMain } from 'electron'
import type { Logger } from '@main/observability'
import type { LogRecord } from '@shared/observability'
import {
  IPC_LOG_FROM_RENDERER,
  IPC_LOG_GET_RECENT,
  IPC_LOG_TO_RENDERER,
  type LogFromRendererPayload,
  type LogGetRecentRequest,
  type LogGetRecentResponse,
  type LogToRendererPayload
} from '@shared/ipc'

// Function that broadcasts a payload to all renderer windows.
// In production this wraps:
//   BrowserWindow.getAllWindows().forEach(w => w.webContents.send(channel, payload))
// In tests we inject a spy so we can assert calls.
export type Broadcast = (channel: string, payload: unknown) => void

// Default broadcaster used by main. Imported lazily to keep tests free of
// electron dependencies.
export function createDefaultBroadcast(): Broadcast {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { BrowserWindow } = require('electron') as typeof import('electron')
  return (channel: string, payload: unknown) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, payload)
      }
    }
  }
}

export class LogBridge {
  private unsubscribe: (() => void) | null = null

  constructor(
    private readonly logger: Logger,
    private readonly ipcMain: IpcMain,
    private readonly broadcast: Broadcast
  ) {}

  install(): void {
    // Renderer-to-main: ingest log events
    this.ipcMain.on(IPC_LOG_FROM_RENDERER, (_event, payload: LogFromRendererPayload) => {
      this.logger.ingestFromRenderer(payload.record)
    })

    // Renderer-to-main request/response: getRecent
    this.ipcMain.handle(IPC_LOG_GET_RECENT, (_event, payload: LogGetRecentRequest): LogGetRecentResponse => {
      return { records: this.logger.getRecent(payload?.count) }
    })

    // Main-to-renderer broadcast: subscribe to logger and forward to all windows
    this.unsubscribe = this.logger.subscribe((record: LogRecord) => {
      const payload: LogToRendererPayload = { record }
      this.broadcast(IPC_LOG_TO_RENDERER, payload)
    })
  }

  uninstall(): void {
    this.ipcMain.removeAllListeners(IPC_LOG_FROM_RENDERER)
    this.ipcMain.removeAllListeners(IPC_LOG_GET_RECENT)
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
  }
}
```

Note: the test uses `@main/observability` alias. Add it to the tsconfig.

- [ ] **Step 5: Add `@main` path alias to tsconfig.node.json**

Open `tsconfig.node.json` and update the `paths` block to include `@main/*`:

```json
"paths": {
  "@shared/*": ["src/shared/*"],
  "@main/*": ["src/main/*"]
}
```

Also update `vitest.config.ts` alias block to resolve `@main` for the test runner:

```typescript
resolve: {
  alias: {
    '@shared': resolve('src/shared'),
    '@renderer': resolve('src/renderer/src'),
    '@main': resolve('src/main')
  }
}
```

And `electron.vite.config.ts`'s `main` section to keep it consistent:

```typescript
main: {
  // ...
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@main': resolve('src/main')
    }
  }
}
```

- [ ] **Step 6: Run the test (expected to pass)**

```bash
npm run test:run -- src/main/ipc/__tests__/log-bridge.integration.test.ts
```

Expected: 4 passing tests.

- [ ] **Step 7: Run typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/main/ipc/log-bridge.ts src/main/ipc/__tests__/log-bridge.integration.test.ts tsconfig.node.json vitest.config.ts electron.vite.config.ts
git commit -m "feat(phase-1b): main-side IPC log bridge with @main path alias"
```

---

### Task 12: Create IPC index that registers all handlers

**Files:**
- Create: `src/main/ipc/index.ts`

- [ ] **Step 1: Implement**

`src/main/ipc/index.ts`:

```typescript
// Single registration point for all IPC handlers.
// Phase 1B: just the log bridge.
// Subsequent phases extend this to register cc, gearing, projects, etc.

import type { IpcMain } from 'electron'
import type { Logger } from '@main/observability'
import { LogBridge, type Broadcast } from './log-bridge'

export interface IpcRegistration {
  logBridge: LogBridge
  uninstallAll: () => void
}

export function registerIpcHandlers(
  ipcMain: IpcMain,
  logger: Logger,
  broadcast: Broadcast
): IpcRegistration {
  const logBridge = new LogBridge(logger, ipcMain, broadcast)
  logBridge.install()

  return {
    logBridge,
    uninstallAll: () => {
      logBridge.uninstall()
    }
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/index.ts
git commit -m "feat(phase-1b): registerIpcHandlers central registration point"
```

---

### Task 13: Initialize Logger + IPC in main process

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Update `src/main/index.ts`**

The current main is a minimal window-opener (Phase 0). Extend it to construct the Logger, install uncaught handlers, and register IPC bridges BEFORE creating the window.

```typescript
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { homedir } from 'node:os'
import {
  FileSink,
  installUncaughtHandlers,
  Logger
} from './observability'
import { createDefaultBroadcast } from './ipc/log-bridge'
import { registerIpcHandlers } from './ipc'

// Initialize the Logger as early as possible so even early-startup errors
// can be captured. Log files live under ~/.tokenless/logs/.
const logDir = join(homedir(), '.tokenless', 'logs')
const fileSink = new FileSink(logDir)
const logger = new Logger(fileSink, 5000, 'main')

installUncaughtHandlers(logger)

logger.info('observability', 'logger-online', 'Logger initialized', { logDir })

// Register IPC handlers before the window is created so renderer requests
// during app startup don't race.
const ipcRegistration = registerIpcHandlers(ipcMain, logger, createDefaultBroadcast())

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: 'TokenLess',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  logger.info('observability', 'app-ready', 'Electron ready, creating window')
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  logger.info('observability', 'shutdown', 'All windows closed')
  ipcRegistration.uninstallAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Run the build**

```bash
npm run build
```

Expected: build succeeds without errors.

- [ ] **Step 4: Manually verify Logger writes a file**

```bash
npm run preview
```

Wait for the app window to open, then close it. Then:

```bash
ls "$HOME/.tokenless/logs/"
```

Expected: a file named `tokenless-YYYY-MM-DD.jsonl` (today's date). Inspect with:

```bash
head -3 "$HOME/.tokenless/logs/tokenless-"*.jsonl
```

Expected: at least 2-3 JSONL records — `logger-online`, `app-ready`, `shutdown`. Each line is parseable JSON.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(phase-1b): wire Logger + IPC bridge + uncaught handlers into main"
```

---

### Task 14: Expose tokenless.log in preload + replace TODO console.error

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

- [ ] **Step 1: Replace `src/preload/index.ts`**

```typescript
import { contextBridge, ipcRenderer } from 'electron'
import type { LogRecord } from '@shared/observability'
import {
  IPC_LOG_FROM_RENDERER,
  IPC_LOG_GET_RECENT,
  IPC_LOG_TO_RENDERER,
  type LogFromRendererPayload,
  type LogGetRecentRequest,
  type LogGetRecentResponse,
  type LogToRendererPayload
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
  }
}

// Minimal in-preload log fallback for errors that happen during contextBridge
// setup itself — we can't use the api.log we're about to expose because it
// hasn't been exposed yet. Ship the record straight through ipcRenderer.
function logPreloadError(message: string, err: unknown): void {
  const stack = err instanceof Error ? err.stack : undefined
  const record: LogRecord = {
    id: `preload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    ts: Date.now(),
    severity: 'error',
    category: 'observability',
    event: 'preload-contextbridge-failed',
    message,
    context: { errorString: String(err) },
    stack,
    fingerprint: 'preload-bootstrap',
    source: 'renderer'
  }
  try {
    ipcRenderer.send(IPC_LOG_FROM_RENDERER, { record })
  } catch {
    // last-resort: if ipc itself isn't working, we have no recovery. Silent
    // failure is appropriate here — better than crashing the preload entirely.
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('tokenless', api)
  } catch (error) {
    logPreloadError('contextBridge.exposeInMainWorld failed', error)
  }
} else {
  // @ts-expect-error context isolation off, attach to window
  window.tokenless = api
}
```

- [ ] **Step 2: Replace `src/preload/index.d.ts`**

```typescript
import type { LogRecord } from '@shared/observability'

declare global {
  interface Window {
    tokenless: {
      version: string
      log: {
        send(record: LogRecord): void
        subscribe(fn: (record: LogRecord) => void): () => void
        getRecent(count?: number): Promise<readonly LogRecord[]>
      }
    }
  }
}

export {}
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 4: Run the build**

```bash
npm run build
```

Expected: build succeeds. The preload now bundles the shared types and IPC channel constants.

- [ ] **Step 5: Run the existing E2E (the Phase 0 smoke test) to ensure nothing regressed**

```bash
npm run test:e2e
```

Expected: 3 tests still passing. The smoke test asserts `window.tokenless.version === '0.0.1'` which still holds.

- [ ] **Step 6: Commit**

```bash
git add src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(phase-1b): expose tokenless.log API; remove TODO(phase-1) console.error from preload"
```

---

### Task 15: Renderer-side logger bridge

**Files:**
- Create: `src/renderer/src/observability/logger-bridge.ts`

- [ ] **Step 1: Create directory**

```bash
cd "C:/personal/tokenless"
mkdir -p src/renderer/src/observability
```

- [ ] **Step 2: Implement**

`src/renderer/src/observability/logger-bridge.ts`:

```typescript
import type { Category, LogRecord, Severity } from '@shared/observability'

// Renderer-side logger shim. Materializes LogRecords with source='renderer'
// and ships them to main via window.tokenless.log.send. Mirrors the main-side
// Logger's API (debug/info/warn/error/fatal) so call sites read the same way.
//
// Fingerprint uses a simple polynomial hash here rather than SHA-256 because
// crypto.subtle.digest is async-only and we want this call to stay synchronous
// for ergonomics. Fingerprints don't need cryptographic strength — they need
// stability per (category, event, stack) tuple, which a simple hash provides.

function fingerprint(category: string, event: string, stack: string | undefined): string {
  const key = `${category}::${event}::${stack ?? ''}`
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function makeRecord(
  severity: Severity,
  category: Category,
  event: string,
  message: string,
  context: Record<string, unknown>,
  stack?: string
): LogRecord {
  return {
    id: crypto.randomUUID(),
    ts: Date.now(),
    severity,
    category,
    event,
    message,
    context,
    stack,
    fingerprint: fingerprint(category, event, stack),
    source: 'renderer'
  }
}

function send(record: LogRecord): void {
  if (typeof window !== 'undefined' && window.tokenless?.log) {
    window.tokenless.log.send(record)
  }
  // If the bridge isn't available (e.g. SSR or unmocked test), silently drop.
}

export const rendererLogger = {
  debug(category: Category, event: string, message: string, context: Record<string, unknown> = {}): void {
    send(makeRecord('debug', category, event, message, context))
  },
  info(category: Category, event: string, message: string, context: Record<string, unknown> = {}): void {
    send(makeRecord('info', category, event, message, context))
  },
  warn(category: Category, event: string, message: string, context: Record<string, unknown> = {}): void {
    send(makeRecord('warn', category, event, message, context))
  },
  error(
    category: Category,
    event: string,
    message: string,
    context: Record<string, unknown> = {},
    stack?: string
  ): void {
    send(makeRecord('error', category, event, message, context, stack))
  },
  fatal(
    category: Category,
    event: string,
    message: string,
    context: Record<string, unknown> = {},
    stack?: string
  ): void {
    send(makeRecord('fatal', category, event, message, context, stack))
  }
}
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/observability/logger-bridge.ts
git commit -m "feat(phase-1b): renderer-side rendererLogger shim"
```

---

### Task 16: React error boundary at App root

**Files:**
- Create: `src/renderer/src/observability/error-boundary.tsx`

- [ ] **Step 1: Implement**

`src/renderer/src/observability/error-boundary.tsx`:

```typescript
import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react'
import { rendererLogger } from './logger-bridge'

interface State {
  hasError: boolean
  error?: Error
}

// Top-level React error boundary. Wraps the entire App. On uncaught render
// errors, logs to main via the renderer logger bridge and renders a minimal
// fallback that the user can recover from via reload.
//
// React error boundaries must be class components — function components
// don't support componentDidCatch / getDerivedStateFromError.

export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    rendererLogger.fatal(
      'ui',
      'react-error-boundary',
      error.message,
      { componentStack: errorInfo.componentStack ?? null },
      error.stack
    )
  }

  reload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h1 className="error-boundary__title">Something broke</h1>
          <p className="error-boundary__body">
            The UI hit an error and stopped rendering. The error has been logged.
            Reload to recover.
          </p>
          <p className="error-boundary__detail">{this.state.error?.message ?? 'Unknown error'}</p>
          <button className="error-boundary__reload" onClick={this.reload} type="button">
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/observability/error-boundary.tsx
git commit -m "feat(phase-1b): React <AppErrorBoundary> at app root"
```

---

### Task 17: Create mock-records factory

**Files:**
- Create: `src/renderer/src/views/dev-mode/mock-records.ts`

- [ ] **Step 1: Create directory + implement**

```bash
mkdir -p src/renderer/src/views/dev-mode
```

`src/renderer/src/views/dev-mode/mock-records.ts`:

```typescript
import type { Category, LogRecord, Severity, Source } from '@shared/observability'

// Mock log records for visual development and E2E testing of the Dev Mode panel.
// Not used in production — the live IPC stream provides real records.

function makeMockRecord(
  severity: Severity,
  category: Category,
  event: string,
  message: string,
  context: Record<string, unknown> = {},
  source: Source = 'main',
  tsOffsetSec = 0
): LogRecord {
  return {
    id: `mock-${event}-${tsOffsetSec}`,
    ts: Date.now() - tsOffsetSec * 1000,
    severity,
    category,
    event,
    message,
    context,
    fingerprint: `mock${event.slice(0, 8)}`,
    source
  }
}

export const MOCK_RECORDS: readonly LogRecord[] = [
  makeMockRecord('info', 'observability', 'logger-online', 'Logger initialized', { logDir: '~/.tokenless/logs' }, 'main', 30),
  makeMockRecord('info', 'observability', 'app-ready', 'Electron ready, creating window', {}, 'main', 28),
  makeMockRecord('debug', 'ipc', 'handler-registered', 'log:event-from-renderer registered', {}, 'main', 27),
  makeMockRecord('info', 'ui', 'mount', 'App mounted', { version: '0.0.1' }, 'renderer', 26),
  makeMockRecord('warn', 'api', 'retry', '429 from Anthropic — retrying', { attempt: 1 }, 'main', 18),
  makeMockRecord('warn', 'api', 'retry', '429 from Anthropic — retrying', { attempt: 2 }, 'main', 17),
  makeMockRecord('error', 'api', 'retry-exhausted', 'Anthropic 429 after 3 attempts', { model: 'haiku-4-5', conversation_id: 7 }, 'main', 16),
  makeMockRecord('info', 'gearing', 'gear-start', 'Gearing turn 42', { breadth: 'terse', model: 'opus' }, 'main', 12),
  makeMockRecord('info', 'gearing', 'gear-complete', 'Geared in 412ms', { savedTokens: 1200 }, 'main', 8),
  makeMockRecord('error', 'fs', 'permission-denied', 'EACCES reading ~/.claude/skills/', { path: '~/.claude/skills/' }, 'main', 4)
]
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/views/dev-mode/mock-records.ts
git commit -m "feat(phase-1b): mock-records factory for Dev Mode visual dev"
```

---

### Task 18: useLogRecords hook

**Files:**
- Create: `src/renderer/src/views/dev-mode/use-log-records.ts`

- [ ] **Step 1: Implement**

`src/renderer/src/views/dev-mode/use-log-records.ts`:

```typescript
import { useEffect, useRef, useState } from 'react'
import type { LogRecord } from '@shared/observability'

interface UseLogRecordsOptions {
  // If provided, use these as the initial set of records (useful for dev/E2E).
  // Live records subscribed via window.tokenless.log are still appended on top.
  mockRecords?: readonly LogRecord[]

  // If true, do NOT subscribe to the live IPC stream. Defaults to false.
  // Set to true in E2E tests that want to drive the panel purely with mocks.
  mockOnly?: boolean
}

// Hook that returns the current set of log records seen by the Dev Mode panel.
// Subscribes to the live IPC stream on mount and unsubscribes on unmount.
// Optionally seeds with mock records for dev/test workflows.

export function useLogRecords({ mockRecords = [], mockOnly = false }: UseLogRecordsOptions = {}): readonly LogRecord[] {
  const [records, setRecords] = useState<readonly LogRecord[]>(() => mockRecords)
  const seenIds = useRef<Set<string>>(new Set(mockRecords.map((r) => r.id)))

  useEffect(() => {
    if (mockOnly) return undefined
    if (typeof window === 'undefined' || !window.tokenless?.log) return undefined

    // Fetch initial recent records so the panel doesn't start empty
    void window.tokenless.log
      .getRecent(1000)
      .then((recent) => {
        setRecords((prev) => {
          const next = [...prev]
          for (const r of recent) {
            if (!seenIds.current.has(r.id)) {
              seenIds.current.add(r.id)
              next.push(r)
            }
          }
          return next
        })
      })
      .catch(() => {
        // Initial fetch failure is non-fatal — live stream still works
      })

    // Subscribe to the live stream
    const unsubscribe = window.tokenless.log.subscribe((record: LogRecord) => {
      setRecords((prev) => {
        if (seenIds.current.has(record.id)) return prev
        seenIds.current.add(record.id)
        return [...prev, record]
      })
    })

    return unsubscribe
  }, [mockOnly])

  return records
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/views/dev-mode/use-log-records.ts
git commit -m "feat(phase-1b): useLogRecords hook subscribes to IPC log stream"
```

---

### Task 19: LogDetail expanded JSON view

**Files:**
- Create: `src/renderer/src/views/dev-mode/LogDetail.tsx`

- [ ] **Step 1: Implement**

`src/renderer/src/views/dev-mode/LogDetail.tsx`:

```typescript
import type { LogRecord } from '@shared/observability'

interface LogDetailProps {
  record: LogRecord
}

// Renders a single log record as pretty-printed JSON for the expanded row view.
// Includes a "Copy as JSONL" button for sharing.

export function LogDetail({ record }: LogDetailProps): JSX.Element {
  const json = JSON.stringify(record, null, 2)
  const jsonl = JSON.stringify(record)

  const handleCopyJsonl = (): void => {
    void navigator.clipboard.writeText(jsonl)
  }

  return (
    <div className="log-detail">
      <div className="log-detail__actions">
        <button className="log-detail__copy" type="button" onClick={handleCopyJsonl}>
          Copy as JSONL
        </button>
      </div>
      <pre className="log-detail__json">{json}</pre>
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/views/dev-mode/LogDetail.tsx
git commit -m "feat(phase-1b): LogDetail expanded JSON view"
```

---

### Task 20: LogTableRow with expand/collapse

**Files:**
- Create: `src/renderer/src/views/dev-mode/LogTableRow.tsx`

- [ ] **Step 1: Implement**

`src/renderer/src/views/dev-mode/LogTableRow.tsx`:

```typescript
import { useState } from 'react'
import type { LogRecord } from '@shared/observability'
import { LogDetail } from './LogDetail'

interface LogTableRowProps {
  record: LogRecord
}

function formatTs(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number, w: number = 2): string => String(n).padStart(w, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

function summarizeContext(ctx: Record<string, unknown>): string {
  const entries = Object.entries(ctx)
  if (entries.length === 0) return ''
  const parts: string[] = []
  for (const [k, v] of entries) {
    parts.push(`${k}: ${typeof v === 'string' ? `"${v}"` : JSON.stringify(v)}`)
    if (parts.join(', ').length > 80) break
  }
  return `{ ${parts.join(', ')}${entries.length > parts.length ? ', …' : ''} }`
}

export function LogTableRow({ record }: LogTableRowProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  return (
    <>
      <tr
        className={`log-row log-row--${record.severity} log-row--source-${record.source}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="log-row__ts">{formatTs(record.ts)}</td>
        <td className="log-row__severity">{record.severity}</td>
        <td className="log-row__category">{record.category}</td>
        <td className="log-row__event">{record.event}</td>
        <td className="log-row__source">{record.source}</td>
        <td className="log-row__message">{record.message}</td>
        <td className="log-row__context">{summarizeContext(record.context)}</td>
      </tr>
      {expanded && (
        <tr className="log-row-detail">
          <td colSpan={7}>
            <LogDetail record={record} />
          </td>
        </tr>
      )}
    </>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/views/dev-mode/LogTableRow.tsx
git commit -m "feat(phase-1b): LogTableRow with click-to-expand JSON detail"
```

---

### Task 21: LogTable with sorting

**Files:**
- Create: `src/renderer/src/views/dev-mode/LogTable.tsx`

- [ ] **Step 1: Implement**

`src/renderer/src/views/dev-mode/LogTable.tsx`:

```typescript
import { useMemo, useState } from 'react'
import type { LogRecord } from '@shared/observability'
import { LogTableRow } from './LogTableRow'

interface LogTableProps {
  records: readonly LogRecord[]
}

type SortKey = 'ts' | 'severity' | 'category' | 'event' | 'source'
type SortDir = 'asc' | 'desc'

const SEVERITY_RANK: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4
}

function compare(a: LogRecord, b: LogRecord, key: SortKey, dir: SortDir): number {
  let cmp = 0
  if (key === 'ts') cmp = a.ts - b.ts
  else if (key === 'severity') cmp = (SEVERITY_RANK[a.severity] ?? 0) - (SEVERITY_RANK[b.severity] ?? 0)
  else cmp = String(a[key]).localeCompare(String(b[key]))
  return dir === 'asc' ? cmp : -cmp
}

export function LogTable({ records }: LogTableProps): JSX.Element {
  const [sortKey, setSortKey] = useState<SortKey>('ts')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const sorted = useMemo(() => {
    return [...records].sort((a, b) => compare(a, b, sortKey, sortDir))
  }, [records, sortKey, sortDir])

  const handleHeader = (key: SortKey): void => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const arrow = (key: SortKey): string => {
    if (key !== sortKey) return ''
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  return (
    <div className="log-table-wrap">
      <table className="log-table">
        <thead>
          <tr>
            <th onClick={() => handleHeader('ts')}>TS{arrow('ts')}</th>
            <th onClick={() => handleHeader('severity')}>Severity{arrow('severity')}</th>
            <th onClick={() => handleHeader('category')}>Category{arrow('category')}</th>
            <th onClick={() => handleHeader('event')}>Event{arrow('event')}</th>
            <th onClick={() => handleHeader('source')}>Source{arrow('source')}</th>
            <th>Message</th>
            <th>Context</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <LogTableRow key={r.id} record={r} />
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <p className="log-table__empty">No records match the current filters.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/views/dev-mode/LogTable.tsx
git commit -m "feat(phase-1b): LogTable with sortable columns + click-header to sort"
```

---

### Task 22: Filters component (severity, category, source, search)

**Files:**
- Create: `src/renderer/src/views/dev-mode/Filters.tsx`

- [ ] **Step 1: Implement**

`src/renderer/src/views/dev-mode/Filters.tsx`:

```typescript
import type { Category, Severity, Source } from '@shared/observability'
import { CATEGORIES } from '@shared/observability'

const SEVERITIES: readonly Severity[] = ['debug', 'info', 'warn', 'error', 'fatal']
const SOURCES: readonly Source[] = ['main', 'renderer']

export interface FilterState {
  severities: Set<Severity>
  categories: Set<Category>
  sources: Set<Source>
  search: string
}

interface FiltersProps {
  state: FilterState
  onChange: (next: FilterState) => void
}

function toggleSetItem<T>(set: Set<T>, item: T): Set<T> {
  const next = new Set(set)
  if (next.has(item)) next.delete(item)
  else next.add(item)
  return next
}

export function Filters({ state, onChange }: FiltersProps): JSX.Element {
  return (
    <div className="filters">
      <div className="filters__group">
        <span className="filters__label">Severity:</span>
        {SEVERITIES.map((s) => (
          <button
            key={s}
            type="button"
            className={`filters__chip filters__chip--severity-${s} ${state.severities.has(s) ? 'is-active' : ''}`}
            onClick={() => onChange({ ...state, severities: toggleSetItem(state.severities, s) })}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="filters__group">
        <span className="filters__label">Category:</span>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`filters__chip ${state.categories.has(c) ? 'is-active' : ''}`}
            onClick={() => onChange({ ...state, categories: toggleSetItem(state.categories, c) })}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="filters__group">
        <span className="filters__label">Source:</span>
        {SOURCES.map((src) => (
          <button
            key={src}
            type="button"
            className={`filters__chip ${state.sources.has(src) ? 'is-active' : ''}`}
            onClick={() => onChange({ ...state, sources: toggleSetItem(state.sources, src) })}
          >
            {src}
          </button>
        ))}
      </div>
      <div className="filters__group filters__group--search">
        <input
          type="search"
          className="filters__search"
          placeholder="Search event or message…"
          value={state.search}
          onChange={(e) => onChange({ ...state, search: e.target.value })}
        />
      </div>
    </div>
  )
}

// Helper used by DevModePanel to compute the visible records after filtering.
export function applyFilters(records: readonly { severity: Severity; category: Category; source: Source; event: string; message: string }[], state: FilterState): typeof records {
  return records.filter((r) => {
    if (state.severities.size > 0 && !state.severities.has(r.severity)) return false
    if (state.categories.size > 0 && !state.categories.has(r.category)) return false
    if (state.sources.size > 0 && !state.sources.has(r.source)) return false
    if (state.search.length > 0) {
      const q = state.search.toLowerCase()
      if (!r.event.toLowerCase().includes(q) && !r.message.toLowerCase().includes(q)) return false
    }
    return true
  })
}

export function emptyFilterState(): FilterState {
  return {
    severities: new Set(),
    categories: new Set(),
    sources: new Set(),
    search: ''
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/views/dev-mode/Filters.tsx
git commit -m "feat(phase-1b): Filters component with severity/category/source chips + search"
```

---

### Task 23: DevModePanel container + styles

**Files:**
- Create: `src/renderer/src/views/dev-mode/DevModePanel.tsx`
- Create: `src/renderer/src/views/dev-mode/styles.css`

- [ ] **Step 1: Implement DevModePanel**

`src/renderer/src/views/dev-mode/DevModePanel.tsx`:

```typescript
import { useState } from 'react'
import type { LogRecord } from '@shared/observability'
import { Filters, applyFilters, emptyFilterState } from './Filters'
import { LogTable } from './LogTable'
import { useLogRecords } from './use-log-records'
import { MOCK_RECORDS } from './mock-records'
import './styles.css'

interface DevModePanelProps {
  // If true, seed the panel with MOCK_RECORDS instead of (or in addition to)
  // the live stream. Phase 1B uses this for visual development; E2E tests pass
  // mockOnly when they want to drive the panel purely with mocks.
  useMockRecords?: boolean
  mockOnly?: boolean
}

export function DevModePanel({ useMockRecords = false, mockOnly = false }: DevModePanelProps): JSX.Element {
  const records = useLogRecords({
    mockRecords: useMockRecords ? MOCK_RECORDS : [],
    mockOnly
  })
  const [filters, setFilters] = useState(emptyFilterState)
  const visible = applyFilters(records, filters) as readonly LogRecord[]

  return (
    <div className="dev-mode-panel">
      <div className="dev-mode-panel__header">
        <h2 className="dev-mode-panel__title">Developer Mode</h2>
        <span className="dev-mode-panel__count">
          {visible.length} / {records.length} records
        </span>
      </div>
      <Filters state={filters} onChange={setFilters} />
      <LogTable records={visible} />
    </div>
  )
}
```

- [ ] **Step 2: Implement panel styles**

`src/renderer/src/views/dev-mode/styles.css`:

```css
.dev-mode-panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 35vh;
  background: var(--tl-bg);
  border-top: 2px solid var(--tl-rule);
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.08);
  overflow: auto;
  font-family: var(--tl-font-mono);
  font-size: 12px;
  z-index: 100;
}

.dev-mode-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--tl-rule);
  background: var(--tl-bg);
  position: sticky;
  top: 0;
  z-index: 1;
}

.dev-mode-panel__title {
  font-family: var(--tl-font-serif);
  font-size: 16px;
  font-weight: 500;
  margin: 0;
  color: var(--tl-orange);
}

.dev-mode-panel__count {
  color: var(--tl-mute);
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--tl-rule);
  align-items: center;
}

.filters__group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.filters__label {
  color: var(--tl-mute);
  font-family: var(--tl-font-sans);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-right: 4px;
}

.filters__chip {
  background: transparent;
  border: 1px solid var(--tl-rule);
  border-radius: 4px;
  padding: 2px 8px;
  font-family: var(--tl-font-mono);
  font-size: 11px;
  cursor: pointer;
  color: var(--tl-fg);
}

.filters__chip:hover {
  background: rgba(217, 119, 87, 0.08);
}

.filters__chip.is-active {
  background: var(--tl-orange);
  color: white;
  border-color: var(--tl-orange);
}

.filters__chip--severity-error.is-active,
.filters__chip--severity-fatal.is-active {
  background: #c44;
  border-color: #c44;
}

.filters__chip--severity-warn.is-active {
  background: #d80;
  border-color: #d80;
}

.filters__search {
  padding: 4px 8px;
  border: 1px solid var(--tl-rule);
  border-radius: 4px;
  font-family: var(--tl-font-mono);
  font-size: 12px;
  background: white;
  width: 240px;
}

.log-table-wrap {
  overflow-x: auto;
  padding: 0 16px 16px;
}

.log-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.log-table thead th {
  position: sticky;
  top: 0;
  background: var(--tl-bg);
  text-align: left;
  padding: 6px 8px;
  border-bottom: 1px solid var(--tl-rule);
  cursor: pointer;
  user-select: none;
  color: var(--tl-mute);
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.05em;
}

.log-row td {
  padding: 4px 8px;
  border-bottom: 1px solid rgba(42, 38, 36, 0.04);
  cursor: pointer;
}

.log-row:hover td {
  background: rgba(217, 119, 87, 0.05);
}

.log-row--error,
.log-row--fatal {
  background: rgba(196, 68, 68, 0.06);
}

.log-row--warn {
  background: rgba(221, 136, 0, 0.05);
}

.log-row__severity {
  font-weight: 600;
}

.log-row__source {
  color: var(--tl-mute);
}

.log-row__message {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-row__context {
  color: var(--tl-mute);
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-row-detail td {
  background: rgba(74, 111, 165, 0.04);
  padding: 0;
}

.log-detail {
  padding: 8px 16px;
}

.log-detail__actions {
  margin-bottom: 4px;
}

.log-detail__copy {
  background: var(--tl-blue);
  color: white;
  border: none;
  border-radius: 4px;
  padding: 2px 8px;
  font-family: var(--tl-font-mono);
  font-size: 11px;
  cursor: pointer;
}

.log-detail__json {
  background: white;
  border: 1px solid var(--tl-rule);
  border-radius: 4px;
  padding: 8px;
  font-size: 11px;
  white-space: pre-wrap;
  overflow-x: auto;
  margin: 0;
}

.log-table__empty {
  padding: 16px;
  color: var(--tl-mute);
  font-style: italic;
}

.error-boundary {
  padding: 64px 32px;
  max-width: 720px;
  margin: 0 auto;
  font-family: var(--tl-font-serif);
}

.error-boundary__title {
  font-size: 32px;
  color: var(--tl-orange);
  margin: 0 0 16px;
}

.error-boundary__body {
  font-size: 16px;
  color: var(--tl-fg);
}

.error-boundary__detail {
  font-family: var(--tl-font-mono);
  font-size: 13px;
  color: var(--tl-mute);
  background: rgba(196, 68, 68, 0.08);
  padding: 8px 12px;
  border-radius: 4px;
}

.error-boundary__reload {
  background: var(--tl-orange);
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 16px;
  font-family: var(--tl-font-sans);
  font-size: 14px;
  cursor: pointer;
}
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/views/dev-mode/DevModePanel.tsx src/renderer/src/views/dev-mode/styles.css
git commit -m "feat(phase-1b): DevModePanel container + panel styles"
```

---

### Task 24: Mount ErrorBoundary + DevModePanel + toggle in App

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles.css`

- [ ] **Step 1: Replace `src/renderer/src/App.tsx`**

```typescript
import { useEffect, useState } from 'react'
import { AppErrorBoundary } from './observability/error-boundary'
import { DevModePanel } from './views/dev-mode/DevModePanel'
import { rendererLogger } from './observability/logger-bridge'

const LS_KEY = 'tokenless.devMode'

function readDevModeFromStorage(): boolean {
  try {
    return window.localStorage.getItem(LS_KEY) === '1'
  } catch {
    return false
  }
}

function writeDevModeToStorage(on: boolean): void {
  try {
    window.localStorage.setItem(LS_KEY, on ? '1' : '0')
  } catch {
    // localStorage unavailable; silently ignore
  }
}

function AppContent(): JSX.Element {
  const [devMode, setDevMode] = useState<boolean>(readDevModeFromStorage)

  useEffect(() => {
    rendererLogger.info('ui', 'mount', 'App mounted', { devMode })
    // Intentionally not re-firing on devMode change; this is a one-shot startup log
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleDevMode = (): void => {
    setDevMode((cur) => {
      const next = !cur
      writeDevModeToStorage(next)
      rendererLogger.info('ui', 'dev-mode-toggle', `Dev Mode ${next ? 'enabled' : 'disabled'}`, { devMode: next })
      return next
    })
  }

  return (
    <>
      <main className="app">
        <header className="app__header">
          <h1 className="app__title">TokenLess</h1>
          <p className="app__subtitle">Phase 1B — Logger + Dev Mode</p>
          <button
            type="button"
            className={`app__dev-toggle ${devMode ? 'is-active' : ''}`}
            onClick={toggleDevMode}
          >
            {devMode ? 'Hide Dev Mode' : 'Show Dev Mode'}
          </button>
        </header>
        <section className="app__body">
          <p>
            The Logger is online and the IPC bridge ships records from renderer to main.
            Toggle Dev Mode to inspect the live log stream.
          </p>
          <p className="app__version">
            preload.version = <code>{window.tokenless?.version ?? 'not loaded'}</code>
          </p>
        </section>
      </main>
      {devMode && <DevModePanel />}
    </>
  )
}

export default function App(): JSX.Element {
  return (
    <AppErrorBoundary>
      <AppContent />
    </AppErrorBoundary>
  )
}
```

- [ ] **Step 2: Add dev-toggle styles to `src/renderer/src/styles.css`**

Append at the end:

```css
.app__dev-toggle {
  position: absolute;
  top: 24px;
  right: 24px;
  background: transparent;
  border: 1px solid var(--tl-rule);
  border-radius: 4px;
  padding: 4px 12px;
  font-family: var(--tl-font-mono);
  font-size: 12px;
  color: var(--tl-fg);
  cursor: pointer;
}

.app__dev-toggle:hover {
  background: rgba(217, 119, 87, 0.06);
}

.app__dev-toggle.is-active {
  background: var(--tl-orange);
  color: white;
  border-color: var(--tl-orange);
}
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 4: Run build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Visual verification (manual)**

```bash
npm run preview
```

Open the app. Click "Show Dev Mode" in the top-right. Confirm:
- The bottom drawer appears.
- It shows at least 2-3 log records (`logger-online`, `app-ready`, `mount`).
- Clicking a row expands it to show JSON.
- Severity/category/source chip filters narrow the table.
- Search filters by event or message.
- Reloading the window remembers the Dev Mode state (via localStorage).

Close the window when done.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/styles.css
git commit -m "feat(phase-1b): mount AppErrorBoundary + DevModePanel + Dev Mode toggle in App"
```

---

### Task 25: E2E test for Dev Mode

**Files:**
- Create: `test/e2e/dev-mode.e2e.test.ts`

- [ ] **Step 1: Write the test**

`test/e2e/dev-mode.e2e.test.ts`:

```typescript
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { resolve } from 'node:path'

let app: ElectronApplication

test.beforeAll(async () => {
  app = await electron.launch({
    args: [resolve('out/main/index.js')],
    env: { ...process.env, NODE_ENV: 'test' }
  })
})

test.afterAll(async () => {
  await app.close()
})

test('Dev Mode toggle opens and closes the panel', async () => {
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  const toggle = window.locator('.app__dev-toggle')
  await expect(toggle).toBeVisible()
  await expect(toggle).toContainText('Show Dev Mode')

  // Panel starts hidden
  await expect(window.locator('.dev-mode-panel')).toHaveCount(0)

  // Click to show
  await toggle.click()
  await expect(window.locator('.dev-mode-panel')).toBeVisible()
  await expect(toggle).toContainText('Hide Dev Mode')

  // Click again to hide
  await toggle.click()
  await expect(window.locator('.dev-mode-panel')).toHaveCount(0)
})

test('Dev Mode panel shows live log records from main + renderer', async () => {
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  // Open dev mode (state may have persisted from prior test via localStorage)
  const toggle = window.locator('.app__dev-toggle')
  const toggleText = await toggle.textContent()
  if (toggleText?.includes('Show')) {
    await toggle.click()
  }

  // Wait for the panel to populate. The Logger emits 'logger-online', 'app-ready',
  // 'mount', and the toggle itself emits 'dev-mode-toggle'. We assert at least
  // the mount event from the renderer is visible.
  const mountRow = window.locator('.log-row__event', { hasText: 'mount' })
  await expect(mountRow.first()).toBeVisible({ timeout: 5_000 })
})

test('Dev Mode row expands to show JSON detail on click', async () => {
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  const toggle = window.locator('.app__dev-toggle')
  const toggleText = await toggle.textContent()
  if (toggleText?.includes('Show')) {
    await toggle.click()
  }

  // Find any row and click it
  const firstRow = window.locator('.log-row').first()
  await expect(firstRow).toBeVisible({ timeout: 5_000 })
  await firstRow.click()

  // The expanded detail row should appear
  await expect(window.locator('.log-row-detail')).toHaveCount(1)
  await expect(window.locator('.log-detail__json')).toBeVisible()
  await expect(window.locator('.log-detail__copy')).toContainText('Copy as JSONL')
})
```

- [ ] **Step 2: Build the app**

```bash
cd "C:/personal/tokenless"
npm run build
```

Must succeed.

- [ ] **Step 3: Run the new E2E test**

```bash
npm run test:e2e -- dev-mode
```

Expected: 3 passing tests for Dev Mode + the existing 3 smoke tests (from Phase 0). Total: 6 tests passing.

If any fail:
- Toggle button not found: check selector `.app__dev-toggle` matches the rendered DOM
- Panel selector mismatch: ensure `.dev-mode-panel` is the top-level class on `DevModePanel.tsx`
- No log records visible: confirm main process is actually emitting records (check the JSONL file at `~/.tokenless/logs/`)

- [ ] **Step 4: Commit**

```bash
git add test/e2e/dev-mode.e2e.test.ts
git commit -m "test(phase-1b): E2E for Dev Mode toggle + live record display + row expansion"
```

---

### Task 26: Update observability.md with usage examples

**Files:**
- Modify: `docs/observability.md`

- [ ] **Step 1: Append a "Usage" section to `docs/observability.md`**

Find the end of the file (after the "When to add a new category" section) and APPEND the following:

```markdown

---

## Usage

### Main-process logging

Every main-process module receives a `Logger` instance (Phase 1B: the singleton in `src/main/index.ts`; later phases pass it via constructor injection).

```typescript
import { logger } from '../observability'  // import from your module's perspective

logger.info('observability', 'startup', 'Module initialized', { config })
logger.warn('api', 'retry', '429 — retrying', { attempt: 2 })
logger.error('db', 'constraint-violation', 'UNIQUE conflict on projects.name', { name }, error.stack)
```

### Renderer-process logging

Renderer code uses `rendererLogger` which ships records to main over IPC:

```typescript
import { rendererLogger } from '@renderer/observability/logger-bridge'

rendererLogger.info('ui', 'mount', 'Component mounted')
rendererLogger.error('ui', 'click-handler-failed', err.message, { buttonId: id }, err.stack)
```

### Error boundaries

Wrap risky operations in `errorBoundary` (sync) or `asyncErrorBoundary` (async). Both catch throws, log, and return `undefined`:

```typescript
import { errorBoundary, asyncErrorBoundary } from '../observability'

const content = errorBoundary(logger, 'fs', 'read-file', () => fs.readFileSync(path, 'utf8'))
if (content === undefined) return // logged; caller decides what to do

const response = await asyncErrorBoundary(logger, 'api', 'fetch', () => anthropicClient.complete(...))
```

The React `<AppErrorBoundary>` at the App root catches any uncaught render error and logs to `ui/react-error-boundary`.

### Inspecting logs

- **Dev Mode panel:** click "Show Dev Mode" in the app. Live sortable JSON table with filters.
- **Log files:** `~/.tokenless/logs/tokenless-YYYY-MM-DD.jsonl`. Parseable with `jq`:
  ```bash
  jq 'select(.severity == "error")' ~/.tokenless/logs/tokenless-*.jsonl
  ```
- **Programmatic (main):** `logger.getRecent(n)` returns the last N records from the ring buffer.
- **Programmatic (renderer):** `await window.tokenless.log.getRecent(n)` returns the same via IPC.
```

- [ ] **Step 2: Commit**

```bash
cd "C:/personal/tokenless"
git add docs/observability.md
git commit -m "docs(phase-1b): add Usage section to observability.md"
```

---

### Task 27: Add Dev Mode test scenarios

**Files:**
- Modify: `docs/test-scenarios.md`

- [ ] **Step 1: Append two scenarios to `docs/test-scenarios.md`**

```markdown

## Scenario: Phase 1B — Logger writes to disk

**Preconditions:** App built and not currently running. `~/.tokenless/logs/` may or may not exist.

**Steps:**
1. Run `npm run preview` to launch the built app.
2. Wait for the window to open, then close it.
3. Inspect `~/.tokenless/logs/`.

**Expected:**
- A file `tokenless-YYYY-MM-DD.jsonl` exists (today's date).
- It contains at least 3 JSONL records: `logger-online`, `app-ready`, `shutdown` (from main) plus `mount` (from renderer via IPC).
- Each line parses as JSON with id, ts, severity, category, event, message, fingerprint, source fields.

## Scenario: Phase 1B — Dev Mode panel displays records

**Preconditions:** App built and running (`npm run preview`).

**Steps:**
1. Click "Show Dev Mode" in the top-right.
2. Observe the bottom drawer.
3. Click any severity chip (e.g., "warn") to filter.
4. Type into the search box (e.g., "mount").
5. Click any visible row to expand.
6. Reload the window (Ctrl+R).

**Expected:**
- Panel slides up from the bottom; shows a sortable table of log records.
- Severity filter narrows the visible rows.
- Search filter further narrows by event/message substring.
- Clicking a row reveals pretty-printed JSON below it; "Copy as JSONL" copies a single-line JSON string to clipboard.
- After reload, the Dev Mode panel is still open (localStorage persistence).
```

- [ ] **Step 2: Commit**

```bash
git add docs/test-scenarios.md
git commit -m "docs(phase-1b): add Dev Mode test scenarios"
```

---

### Task 28: Add an ADR documenting the Logger cornerstone implementation

**Files:**
- Modify: `docs/decisions.md`

- [ ] **Step 1: Append ADR-019 to `docs/decisions.md`**

```markdown

## ADR-019 (2026-05-14) — Logger cornerstone shape: ring buffer + JSONL file + IPC broadcast subscribers

**Context:** Spec §6 made observability a cornerstone but left implementation specifics open. Phase 1B implementation chose three fan-out sinks per record and a few specific shape decisions.

**Choices:**
- **Three sinks per record:** in-memory `RingBuffer<LogRecord>` (capacity 5000), `FileSink` (daily-rotating JSONL files under `~/.tokenless/logs/`, 30-day retention), and an IPC subscriber pool (the `LogBridge` subscribes once and broadcasts to all renderer windows). Each record fans out to all three.
- **`errorBoundary` returns `undefined` on throw, not rethrowing.** Forces every call site to handle absence-of-result explicitly. Catches the "I forgot the error path existed" bug class.
- **Renderer records are materialized in the renderer.** The renderer's `rendererLogger` builds the `LogRecord` (id, ts, source='renderer', fingerprint) and ships it via IPC. Main's `logger.ingestFromRenderer` does NOT re-materialize. This means renderer records preserve their `source: 'renderer'` field and don't get incorrectly tagged as main.
- **Fingerprint algorithm differs main vs renderer.** Main uses SHA-256 truncated to 16 hex chars (via `node:crypto`). Renderer uses a simple polynomial hash truncated to 8 hex chars (synchronous; `crypto.subtle.digest` is async-only). Both fingerprints satisfy the same purpose: deduplicate AI error analysis caching (per spec §6.5). They don't need cryptographic strength — they need stability per `(category, event, stack)` tuple.
- **Categories are a closed enum.** Adding a new category requires changes to `src/shared/observability.ts` AND `docs/observability.md`. This prevents drift and keeps Dev Mode filter chips finite.

**Reasoning:**

- Three sinks because: ring buffer is for fast Dev Mode display; file sink is for forensic debugging post-crash; subscribers are for live UI streaming. Each addresses a different access pattern; combining into one would compromise on at least one.
- 5000 record buffer: ~5MB at typical record size (~1KB JSON). Cheap, generous for active debugging.
- 30 days file retention: long enough for any "what happened last week" investigation; not so long that disk fills up. Trivial to adjust later.
- `errorBoundary` discipline: see "Choices" above. Caller-explicit handling matches the CLAUDE.md cornerstone directive that every error path has a user-facing recovery path.

**Discovered:** Phase 1B implementation. See `src/main/observability/` for the code, `docs/observability.md` for the usage manual.
```

- [ ] **Step 2: Commit**

```bash
git add docs/decisions.md
git commit -m "docs(phase-1b): add ADR-019 for Logger cornerstone implementation shape"
```

---

### Task 29: Phase 1B verification + tag

**Files:** none — verification only.

- [ ] **Step 1: Verify all build gates pass**

```bash
cd "C:/personal/tokenless"
npm run typecheck
npm run test:run
npm run build
npm run test:e2e
git status
```

All four commands must exit 0. `git status` must be clean.

- [ ] **Step 2: Verify Logger actually writes to disk**

```bash
ls "$HOME/.tokenless/logs/" 2>&1
```

Should list at least `tokenless-YYYY-MM-DD.jsonl` (today's date). If the dir doesn't exist, the Phase 1B main hasn't been launched yet. Run `npm run preview`, let it start, close it, then re-check.

```bash
head -3 "$HOME/.tokenless/logs/tokenless-$(date +%Y-%m-%d).jsonl"
```

Each line parses as JSON. Should show `logger-online`, `app-ready`, and either `mount` or `shutdown`.

- [ ] **Step 3: Push to origin**

```bash
git push origin main
```

- [ ] **Step 4: Watch CI on the push**

```bash
"/c/Program Files/GitHub CLI/gh.exe" run watch --exit-status -R Aiden-Molyneaux/tokenless
```

Must exit 0.

- [ ] **Step 5: Tag the Phase 1B completion**

```bash
git tag -a v0.3.0-phase-1b -m "Phase 1B complete — Logger + IPC bridge + Dev Mode panel"
git push origin v0.3.0-phase-1b
```

- [ ] **Step 6: Print summary**

```bash
git log --oneline v0.2.0-phase-1a..v0.3.0-phase-1b
git tag --list
```

Expected: 25-30 commits since `v0.2.0-phase-1a`; all three tags listed.

---

## Phase 1B — Exit criteria

Phase 1B is complete when:

1. `npm run typecheck` exits 0
2. `npm run test:run` passes all unit + integration tests (the 5 new test files: categories, ring-buffer, file-sink, logger, error-boundary, log-bridge)
3. `npm run build` produces `out/main/index.js`, `out/preload/index.cjs`, `out/renderer/index.html`
4. `npm run test:e2e` passes 6 tests (3 smoke + 3 Dev Mode)
5. Launching the app creates `~/.tokenless/logs/tokenless-YYYY-MM-DD.jsonl` with valid JSONL records
6. Toggling "Show Dev Mode" in the app reveals a populated panel with sortable rows, working filters, and expandable JSON detail
7. The preload's pre-Phase-1B `console.error` is gone — all errors route through the Logger
8. Tag `v0.3.0-phase-1b` exists locally and on origin
9. CI is green on GitHub for the Phase 1B push

Once exit criteria are met, return to write Phase 2 (UI prototype with mocks for the composer / sidebar / terminal pane). FINDINGS.md from Phase 1A informs Phase 4's CC subprocess design but is largely orthogonal to Phase 2's UI work.

---

## Self-review (writing-plans skill)

**1. Spec coverage:**

| Spec section | Plan task(s) |
|---|---|
| §6.1 The Logger service | Tasks 2, 3, 4, 5, 6, 9 |
| §6.2 Categories and severities | Tasks 2, 3 |
| §6.3 Where errors enter (six boundaries) | Tasks 7 (errorBoundary), 8 (uncaught handlers), 11 (IPC bridge), 14 (preload), 16 (React error boundary). The DB/CC/FS boundaries land in their respective phases (3, 4, 6). |
| §6.4 Developer Mode UI | Tasks 17 (mocks), 18 (hook), 19 (LogDetail), 20 (LogTableRow), 21 (LogTable), 22 (Filters), 23 (DevModePanel + styles), 24 (App mount) |
| §6.5 AI error analysis | DEFERRED to a future task (depends on Anthropic SDK + gearing — Phase 5). Phase 1B Dev Mode panel has the "Analyze" button slot in spec but Phase 1B does not implement it. Acceptable because the FINDINGS.md and ADR-019 don't promise this for Phase 1B — spec §9 Phase 1 plan also lists it under Phase 8 polish. |
| §6.6 Log file management | Task 5 (FileSink, daily JSONL rotation, 30-day retention by deletion). Gzip-rollover from spec deferred (YAGNI for v1). |
| §6.7 CLAUDE.md directive | Already in CLAUDE.md from Phase 0; Task 26 adds the usage manual that the directive references. |

**2. Placeholder scan:**

Searched my plan for TBD / TODO / "implement later" / "similar to Task N" patterns — none found. Every code block contains the actual content. The two intentional `TODO(phase-1)` references in Task 14 are in the description of what's being REMOVED, not as a forward-looking placeholder.

**3. Type consistency:**

- `LogRecord` shape consistent across `src/shared/observability.ts` (Task 2), `src/main/observability/types.ts` (Task 6), `src/preload/index.d.ts` (Task 14), `src/renderer/src/observability/logger-bridge.ts` (Task 15), and all consumers.
- `Category` is a single union type from `CATEGORIES`, imported everywhere from `@shared/observability`. No drift.
- `Severity` constant: `'debug' | 'info' | 'warn' | 'error' | 'fatal'` consistent across files.
- `Source` constant: `'main' | 'renderer'` consistent.
- IPC channel constants (`IPC_LOG_FROM_RENDERER`, `IPC_LOG_TO_RENDERER`, `IPC_LOG_GET_RECENT`) declared in `src/shared/ipc.ts` (Task 10), used by `LogBridge` (Task 11) and the preload (Task 14). Consistent.
- `Logger.subscribe(fn)` returns `() => void` (unsubscribe function) — same signature used by `LogBridge` (Task 11) and the renderer hook via the preload (Task 18).
- `errorBoundary` and `asyncErrorBoundary` signatures consistent between definition (Task 7) and Usage doc (Task 26).

**4. Scope check:**

29 tasks. Total estimated time: 3-4 days of focused work, in line with the Phase 1B target. Each task produces a self-contained commit that's independently testable.

---

## Notes for the executor

- **Native module:** node-pty was installed in Phase 1A but Phase 1B doesn't use it. The prebuild is on disk and idle. Phase 4 starts using it.
- **The preload `console.error` REMOVAL is intentional** (Task 14). The pre-Phase-1B console fallback was annotated as TODO(phase-1). Phase 1B replaces it with the IPC bridge path. After Task 14, NO `console.{log,error,warn}` calls remain anywhere in `src/`. Verify with `grep -rn "console\.\(log\|error\|warn\)" src/` after Task 14 — expected: 0 matches. If any appear, the CLAUDE.md cornerstone is violated; fix before continuing.
- **Renderer unit tests are intentionally skipped** for Phase 1B presentational components. The E2E test in Task 25 covers the rendered behavior end-to-end. If a component grows non-trivial logic later, add a `.unit.test.tsx` with the `// @vitest-environment happy-dom` pragma at the top.
- **Path aliases:** Task 11 introduces the `@main/*` alias. The plan adds it to `tsconfig.node.json`, `vitest.config.ts`, AND `electron.vite.config.ts`. If you forget one of these, type errors or build errors will appear in apparently-unrelated files. Verify all three are updated.

---

*End of Phase 1B plan.*
