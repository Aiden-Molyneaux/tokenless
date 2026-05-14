# TokenLess v1 — Phase 2A: Setup + Cleanup + App Shell Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `xterm` packages to their non-deprecated `@xterm/*` equivalents, address 6 deferred Phase 1B cleanup items, extend the theme tokens system, and land the app shell skeleton (TopBar, ConversationSidebar, MainPane placeholder) so Phase 2B can drop the composer + gear review + terminal into a real layout. End state: the app *looks* like TokenLess — proper top bar with project/account switchers, collapsible sidebar with mock conversations, themed main pane area awaiting Phase 2B content.

**Architecture:** Theme tokens move to a dedicated `src/renderer/src/theme/tokens.css` imported globally. New `src/renderer/src/components/layout/` directory holds the shell components, each with its own `.tsx` + co-located `.css`. Mock data factories under `src/renderer/src/mocks/` give the shell something to render. `AppShell` is the orchestrating container; `App.tsx` swaps the Phase 0 stub for `AppShell` while preserving the AppErrorBoundary wrap and Dev Mode toggle.

**Tech Stack:** Same as Phase 1B (Electron 32 + React 18 + TS + Vitest + Playwright). Migrating `xterm@^5` + `xterm-addon-fit@^0.8` → `@xterm/xterm@^5` + `@xterm/addon-fit@^0.8` (npm-deprecated names retired).

---

## Scope

Phase 2A only. Phase 2B (composer, gear review pane, terminal section with xterm.js wired against mock ANSI streams, InfoTooltip system) lands in a separate plan after 2A executes.

## Prerequisites

- Phase 1B complete (`v0.3.0-phase-1b` tag exists; CI green)
- Working directory: `C:\personal\tokenless\`
- All Phase 0-1B dependencies installed

## File structure

```
package.json                                                    [MODIFY] xterm package migration
package-lock.json                                               [MODIFY auto]

src/main/observability/ring-buffer.ts                           [MODIFY] circular buffer impl (O(1) push)
src/main/observability/file-sink.ts                             [MODIFY] local time date strings
src/main/observability/__tests__/file-sink.integration.test.ts  [MODIFY] local-time fixtures + top-level fs import

src/main/ipc/log-bridge.ts                                      [MODIFY] remove createDefaultBroadcast + eslint-disable
src/main/index.ts                                               [MODIFY] inline broadcast construction

src/renderer/src/views/dev-mode/use-log-records.ts              [MODIFY] document mockRecords ref-stability
src/renderer/src/views/dev-mode/LogTable.tsx                    [MODIFY] keyboard a11y on sortable headers

src/renderer/src/theme/
└── tokens.css                                                  [CREATE] extended theme tokens

src/renderer/src/mocks/
├── projects.ts                                                 [CREATE] MOCK_PROJECTS
├── accounts.ts                                                 [CREATE] MOCK_ACCOUNTS
└── conversations.ts                                            [CREATE] MOCK_CONVERSATIONS

src/renderer/src/components/layout/
├── SettingsButton.tsx                                          [CREATE] icon button
├── ProjectSwitcher.tsx                                         [CREATE] dropdown stub
├── AccountSwitcher.tsx                                         [CREATE] dropdown stub
├── TopBar.tsx                                                  [CREATE] composes the three above
├── ConversationListItem.tsx                                    [CREATE] one row
├── ConversationList.tsx                                        [CREATE] list container
├── ConversationSidebar.tsx                                     [CREATE] collapsible aside
├── MainPane.tsx                                                [CREATE] placeholder split container
├── AppShell.tsx                                                [CREATE] orchestrator
└── styles.css                                                  [CREATE] layout-specific styles

src/renderer/src/styles.css                                     [MODIFY] reduce to body + app-level only
src/renderer/src/App.tsx                                        [MODIFY] swap stub for AppShell

test/e2e/smoke.e2e.test.ts                                      [MODIFY] update selectors for new shell
docs/decisions.md                                               [MODIFY] add ADR-020 (local-time date strategy)
docs/test-scenarios.md                                          [MODIFY] add Phase 2A scenario
```

**Responsibilities at a glance:**

- `src/renderer/src/theme/tokens.css` — every CSS custom property the UI references. Imported once in `main.tsx`. Other CSS files reference `var(--tl-*)` but never redefine.
- `src/renderer/src/components/layout/` — shell pieces. Each `.tsx` co-located with the relevant section of `styles.css`. Components are pure-presentational: they take props (data + callbacks) and render — no IPC, no global state.
- `src/renderer/src/mocks/` — typed mock factories. Each export is a readonly array. Phase 2B+ can replace with real data from IPC/DB without changing component signatures.
- `src/renderer/src/components/layout/AppShell.tsx` — the only stateful piece in Phase 2A. Holds active project/account/conversation IDs + sidebar collapsed state. Wires mocks into all shell components.

---

## Tasks

---

### Task 1: Migrate xterm packages to @xterm/* (NPM-deprecated names)

**Files:**
- Modify: `package.json`, `package-lock.json`

**Step 1:** Uninstall the deprecated packages:

```bash
cd "C:/personal/tokenless"
npm uninstall xterm xterm-addon-fit
```

**Step 2:** Install the scoped replacements:

```bash
npm install @xterm/xterm@^5 @xterm/addon-fit@^0.8
```

**Step 3:** Verify the swap:

```bash
node -e "const p = require('./package.json'); console.log({xterm: p.dependencies['xterm'] ?? 'GONE', addon: p.dependencies['xterm-addon-fit'] ?? 'GONE', scopedX: p.dependencies['@xterm/xterm'], scopedF: p.dependencies['@xterm/addon-fit']})"
```

Expected output:
```
{ xterm: 'GONE', addon: 'GONE', scopedX: '^5.x.x', scopedF: '^0.8.x' }
```

**Step 4:** Search the codebase for any current imports — should be zero since Phase 1B didn't yet import xterm:

```bash
grep -rn "from 'xterm" src/ test/ 2>&1
grep -rn "require('xterm" src/ test/ 2>&1
```

Both should return no matches. If matches exist, change them in this task too (replace `'xterm'` → `'@xterm/xterm'` and `'xterm-addon-fit'` → `'@xterm/addon-fit'`).

**Step 5:** Run typecheck + tests to confirm nothing broke:

```bash
npm run typecheck
npm run test:run
```

Both must exit 0.

**Step 6:** Commit:

```bash
git add package.json package-lock.json
git commit -m "chore(phase-2a): migrate xterm + addon-fit to @xterm/ scoped packages"
```

---

### Task 2: Add ADR-020 — local time everywhere

**Files:**
- Modify: `docs/decisions.md`

**Step 1:** Append ADR-020 to the end of `docs/decisions.md`:

```markdown

## ADR-020 (2026-05-14) — Date strategy: local time for both log files and Dev Mode display

**Context:** Phase 1B's final review caught a mismatch — `FileSink.dateString()` used `getUTCFullYear`/`getUTCMonth`/`getUTCDate` to produce filenames like `tokenless-2026-05-14.jsonl`, while `LogTableRow.formatTs()` used local-time getters for the Dev Mode panel display. A user in UTC+10 logging at 23:00 UTC would see the row labeled `09:00` (next-day local) but find it in a UTC-dated file from the prior day — a mental-model mismatch.

**Options:**
- A) All UTC. Aligns with backend logging conventions; predictable across timezones. But every user has to do timezone math when correlating a Dev Mode row to a file.
- B) All local time. Aligns with user mental model. Filenames and row labels match. Cross-timezone correlation (e.g., sharing a log file with someone in another zone) requires noting the originating timezone, but that's a niche case.

**Choice:** B — local time everywhere.

**Reasoning:** TokenLess is a single-user developer tool. The user looks at Dev Mode rows and at their `~/.tokenless/logs/` directory through the same mental model: "what was happening on Tuesday afternoon?" Both should agree on what counts as Tuesday. Cross-zone log sharing is rare; when it happens, the JSON `ts` field (epoch ms) carries timezone-independent truth.

**Implications:**
- `FileSink.dateString()` switches from `getUTC*` to local-time getters.
- File-sink tests use local-time constructors (`new Date(2026, 4, 14, 23, 0, 0)`) so assertions hold in any test machine's timezone.
- `LogTableRow.formatTs()` remains unchanged (already local).

**Discovered:** Phase 1B final code review.
```

**Step 2:** Commit:

```bash
cd "C:/personal/tokenless"
git add docs/decisions.md
git commit -m "docs(phase-2a): add ADR-020 for local-time date strategy"
```

---

### Task 3: Switch FileSink to local-time dates + update tests

**Files:**
- Modify: `src/main/observability/file-sink.ts`
- Modify: `src/main/observability/__tests__/file-sink.integration.test.ts`

**Step 1:** Update `dateString` in `file-sink.ts`. Find the existing method:

```typescript
private dateString(d: Date): string {
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
```

Replace with local-time getters:

```typescript
// Local time per ADR-020 — matches Dev Mode display + user mental model.
private dateString(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
```

**Step 2:** Update the test file. Open `src/main/observability/__tests__/file-sink.integration.test.ts`.

First fix: replace the lazy `require('node:fs')` at line ~78 with a top-level import (Phase 1B final review minor #5). Find the top imports:

```typescript
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
```

Replace with (add `utimesSync`):

```typescript
import { mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
```

Then find the test body that has:

```typescript
const fs = require('node:fs') as typeof import('node:fs')
fs.utimesSync(oldFile, sixtyDaysAgo, sixtyDaysAgo)
```

Replace with:

```typescript
utimesSync(oldFile, sixtyDaysAgo, sixtyDaysAgo)
```

Second fix: the existing tests use UTC ISO strings for fixed dates (e.g., `new Date('2026-05-14T10:00:00Z')`), which produce different local dates depending on the test machine's timezone. Replace with local-time constructors.

Find the test "writes a JSONL line per record to the current-day file":

```typescript
it('writes a JSONL line per record to the current-day file', () => {
  const fixedDate = new Date('2026-05-14T10:00:00Z')
  const sink = new FileSink(tmpDir, 30, () => fixedDate)
  // ...
```

Replace `fixedDate` and the assertion:

```typescript
it('writes a JSONL line per record to the current-day file', () => {
  // Use local-time constructor so the test holds in any timezone.
  const fixedDate = new Date(2026, 4, 14, 10, 0, 0) // May 14, 10:00 local
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
```

Find the "rotates to a new file when the date changes" test:

```typescript
it('rotates to a new file when the date changes', () => {
  let now = new Date('2026-05-14T23:00:00Z')
  // ...
```

Replace `now` constructors:

```typescript
it('rotates to a new file when the date changes', () => {
  // Local-time date boundary: 23:00 May 14 → 01:00 May 15 crosses local midnight.
  let now = new Date(2026, 4, 14, 23, 0, 0)
  const sink = new FileSink(tmpDir, 30, () => now)
  sink.write(makeRecord({ event: 'late-on-14' }))

  now = new Date(2026, 4, 15, 1, 0, 0)
  sink.write(makeRecord({ event: 'early-on-15' }))

  const files = readdirSync(tmpDir).sort()
  expect(files).toEqual([
    'tokenless-2026-05-14.jsonl',
    'tokenless-2026-05-15.jsonl'
  ])
})
```

Find the "prunes files older than retentionDays at rotation time" test:

```typescript
it('prunes files older than retentionDays at rotation time', () => {
  // Seed with an old file
  const oldFile = join(tmpDir, 'tokenless-2026-04-01.jsonl')
  writeFileSync(oldFile, '{"event":"old"}\n')
  // Backdate its mtime to ~60 days ago
  const sixtyDaysAgo = new Date('2026-03-15T00:00:00Z')
  const fs = require('node:fs') as typeof import('node:fs')
  fs.utimesSync(oldFile, sixtyDaysAgo, sixtyDaysAgo)

  let now = new Date('2026-05-14T23:00:00Z')
  // ...
```

Replace with:

```typescript
it('prunes files older than retentionDays at rotation time', () => {
  // Seed with an old file
  const oldFile = join(tmpDir, 'tokenless-2026-04-01.jsonl')
  writeFileSync(oldFile, '{"event":"old"}\n')
  // Backdate its mtime to ~60 days ago (local time)
  const sixtyDaysAgo = new Date(2026, 2, 15, 0, 0, 0) // March 15 local
  utimesSync(oldFile, sixtyDaysAgo, sixtyDaysAgo)

  let now = new Date(2026, 4, 14, 23, 0, 0)
  const sink = new FileSink(tmpDir, 30, () => now)
  sink.write(makeRecord({ event: 'still-on-14' }))

  // Cross a date boundary to trigger pruning
  now = new Date(2026, 4, 15, 0, 30, 0)
  sink.write(makeRecord({ event: 'on-15' }))

  const files = readdirSync(tmpDir)
  expect(files).not.toContain('tokenless-2026-04-01.jsonl')
  expect(files).toContain('tokenless-2026-05-14.jsonl')
  expect(files).toContain('tokenless-2026-05-15.jsonl')
})
```

**Step 3:** Run tests:

```bash
cd "C:/personal/tokenless"
npm run test:run -- src/main/observability/__tests__/file-sink.integration.test.ts
```

Expected: all 4 tests pass.

**Step 4:** Run typecheck + full suite:

```bash
npm run typecheck
npm run test:run
```

Both exit 0.

**Step 5:** Commit:

```bash
git add src/main/observability/file-sink.ts src/main/observability/__tests__/file-sink.integration.test.ts
git commit -m "fix(phase-2a): FileSink uses local time (ADR-020); top-level fs import in test"
```

---

### Task 4: Refactor RingBuffer to O(1) circular buffer

**Files:**
- Modify: `src/main/observability/ring-buffer.ts`

**Step 1:** Replace the entire contents of `src/main/observability/ring-buffer.ts` with the circular-buffer implementation:

```typescript
// Fixed-capacity in-memory buffer with O(1) push. Used by the Logger to keep
// the most recent N records available for Dev Mode display without unbounded
// memory growth.
//
// Implementation: circular buffer with head pointer + count. When the buffer
// is full, push overwrites the oldest slot and advances head — no Array.shift,
// no re-indexing. getAll walks count slots from head to produce a snapshot
// in insertion order. The public API matches the previous Array-based impl
// exactly; all callers and tests work unchanged.

export class RingBuffer<T> {
  private readonly items: (T | undefined)[]
  private head: number = 0
  private count: number = 0

  constructor(private readonly capacity: number) {
    if (capacity <= 0) {
      throw new Error(`RingBuffer capacity must be positive, got ${capacity}`)
    }
    this.items = new Array(capacity)
  }

  push(item: T): void {
    const writeIndex = (this.head + this.count) % this.capacity
    this.items[writeIndex] = item
    if (this.count < this.capacity) {
      this.count++
    } else {
      this.head = (this.head + 1) % this.capacity
    }
  }

  getAll(): readonly T[] {
    const result: T[] = []
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % this.capacity
      result.push(this.items[idx] as T)
    }
    return result
  }

  size(): number {
    return this.count
  }

  clear(): void {
    this.head = 0
    this.count = 0
    // Items array stays allocated; slots will be overwritten on next push.
  }
}
```

**Step 2:** Run the existing tests — all 7 should pass without modification (public API is identical):

```bash
cd "C:/personal/tokenless"
npm run test:run -- src/main/observability/__tests__/ring-buffer.unit.test.ts
```

Expected: 7/7 passing.

**Step 3:** Run typecheck + full suite:

```bash
npm run typecheck
npm run test:run
```

Both exit 0.

**Step 4:** Commit:

```bash
git add src/main/observability/ring-buffer.ts
git commit -m "perf(phase-2a): refactor RingBuffer to O(1) circular buffer (same public API)"
```

---

### Task 5: Document mockRecords ref-stability in useLogRecords

**Files:**
- Modify: `src/renderer/src/views/dev-mode/use-log-records.ts`

**Step 1:** Open the file. Find the existing docstring above the `useLogRecords` export:

```typescript
// Hook that returns the current set of log records seen by the Dev Mode panel.
// Subscribes to the live IPC stream on mount and unsubscribes on unmount.
// Optionally seeds with mock records for dev/test workflows.

export function useLogRecords({ mockRecords = [], mockOnly = false }: UseLogRecordsOptions = {}): readonly LogRecord[] {
```

Replace the docstring with an expanded version that documents the mockRecords assumption:

```typescript
// Hook that returns the current set of log records seen by the Dev Mode panel.
// Subscribes to the live IPC stream on mount and unsubscribes on unmount.
// Optionally seeds with mock records for dev/test workflows.
//
// IMPORTANT: `mockRecords` is captured by the useState and useRef initializers
// only on mount. Passing a new array reference after mount does NOT update the
// internal seen-ids dedup set, so callers cannot dynamically swap mock sets at
// runtime. Phase 1B's only caller (DevModePanel) passes the module-level
// MOCK_RECORDS constant which has stable identity; Phase 2A keeps this pattern.
// If a future caller needs dynamic mocks, this hook needs to be reworked to
// track mockRecords as a useEffect dependency.

export function useLogRecords({ mockRecords = [], mockOnly = false }: UseLogRecordsOptions = {}): readonly LogRecord[] {
```

**Step 2:** Verify typecheck + commit:

```bash
cd "C:/personal/tokenless"
npm run typecheck
git add src/renderer/src/views/dev-mode/use-log-records.ts
git commit -m "docs(phase-2a): document mockRecords ref-stability assumption in useLogRecords"
```

---

### Task 6: Move createDefaultBroadcast inline to main/index.ts

**Files:**
- Modify: `src/main/ipc/log-bridge.ts`
- Modify: `src/main/index.ts`

**Step 1:** Remove the `createDefaultBroadcast` function and its lazy `require('electron')` from `src/main/ipc/log-bridge.ts`.

Find this block near the top:

```typescript
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
```

Delete it entirely. The `Broadcast` type export stays; only the function is removed.

**Step 2:** Update `src/main/index.ts`. Currently has:

```typescript
import { createDefaultBroadcast } from './ipc/log-bridge'
// ...
const ipcRegistration = registerIpcHandlers(ipcMain, logger, createDefaultBroadcast())
```

Replace with inline construction. Update the imports + the call site:

```typescript
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

// Initialize the Logger as early as possible so even early-startup errors
// can be captured. Log files live under ~/.tokenless/logs/.
const logDir = join(homedir(), '.tokenless', 'logs')
const fileSink = new FileSink(logDir)
const logger = new Logger(fileSink, 5000, 'main')

installUncaughtHandlers(logger)

logger.info('observability', 'logger-online', 'Logger initialized', { logDir })

// Broadcast records to every renderer window. Inlined here (instead of in
// log-bridge.ts) so the bridge module stays free of electron imports — tests
// for LogBridge can use a fake Broadcast spy without dragging electron in.
const broadcast: Broadcast = (channel: string, payload: unknown) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}

const ipcRegistration = registerIpcHandlers(ipcMain, logger, broadcast)

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

**Step 3:** Run typecheck + build + all tests:

```bash
cd "C:/personal/tokenless"
npm run typecheck
npm run build
npm run test:run
```

All three exit 0. (E2E doesn't need to run for this task — no UI changes.)

**Step 4:** Commit:

```bash
git add src/main/ipc/log-bridge.ts src/main/index.ts
git commit -m "refactor(phase-2a): inline broadcast construction in main; remove lazy require from log-bridge"
```

---

### Task 7: Keyboard a11y on LogTable sortable headers

**Files:**
- Modify: `src/renderer/src/views/dev-mode/LogTable.tsx`

**Step 1:** Find the `<thead>` block:

```typescript
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
```

Replace with the keyboard-accessible version. Each sortable header gets `tabIndex={0}`, an `onKeyDown` handler, and `role="button"`. The non-sortable Message and Context columns are left alone (they aren't interactive).

```typescript
<thead>
  <tr>
    <th
      role="button"
      tabIndex={0}
      onClick={() => handleHeader('ts')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleHeader('ts')
        }
      }}
    >
      TS{arrow('ts')}
    </th>
    <th
      role="button"
      tabIndex={0}
      onClick={() => handleHeader('severity')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleHeader('severity')
        }
      }}
    >
      Severity{arrow('severity')}
    </th>
    <th
      role="button"
      tabIndex={0}
      onClick={() => handleHeader('category')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleHeader('category')
        }
      }}
    >
      Category{arrow('category')}
    </th>
    <th
      role="button"
      tabIndex={0}
      onClick={() => handleHeader('event')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleHeader('event')
        }
      }}
    >
      Event{arrow('event')}
    </th>
    <th
      role="button"
      tabIndex={0}
      onClick={() => handleHeader('source')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleHeader('source')
        }
      }}
    >
      Source{arrow('source')}
    </th>
    <th>Message</th>
    <th>Context</th>
  </tr>
</thead>
```

**Step 2:** Run typecheck + E2E (the existing Dev Mode E2E should still pass — clicking still works):

```bash
cd "C:/personal/tokenless"
npm run typecheck
npm run build
npm run test:e2e -- dev-mode
```

All exit 0. 3/3 Dev Mode E2E pass.

**Step 3:** Commit:

```bash
git add src/renderer/src/views/dev-mode/LogTable.tsx
git commit -m "a11y(phase-2a): keyboard activation for LogTable sortable headers"
```

---

### Task 8: Create theme tokens file

**Files:**
- Create: `src/renderer/src/theme/tokens.css`

**Step 1:** Create the directory and file:

```bash
cd "C:/personal/tokenless"
mkdir -p src/renderer/src/theme
```

`src/renderer/src/theme/tokens.css` with EXACT content:

```css
/* TokenLess theme tokens — all CSS custom properties live here.
   Imported once in main.tsx. Other CSS files reference var(--tl-*) but
   never redefine these. Adding a new token? Put it here. */

:root {
  /* ===== Color base ===== */
  --tl-bg: #FAF7F2;
  --tl-bg-alt: #F4EFE7;
  --tl-fg: #2A2624;
  --tl-fg-dim: rgba(42, 38, 36, 0.72);

  /* ===== Orange (warm accent) ===== */
  --tl-orange-50: #FDF1EC;
  --tl-orange-100: #F8DCD0;
  --tl-orange-300: #E5A790;
  --tl-orange-500: #D97757;
  --tl-orange-700: #B85A3C;

  /* ===== Blue (cool accent) ===== */
  --tl-blue-50: #EEF2F7;
  --tl-blue-100: #D6DFEC;
  --tl-blue-300: #8AA2C2;
  --tl-blue-500: #4A6FA5;
  --tl-blue-700: #344F76;

  /* ===== Neutrals (alpha-tinted) ===== */
  --tl-rule: rgba(42, 38, 36, 0.12);
  --tl-rule-strong: rgba(42, 38, 36, 0.24);
  --tl-mute: rgba(42, 38, 36, 0.55);
  --tl-hover: rgba(217, 119, 87, 0.06);
  --tl-active: rgba(217, 119, 87, 0.12);

  /* ===== Semantic ===== */
  --tl-error: #C44444;
  --tl-error-bg: rgba(196, 68, 68, 0.06);
  --tl-warn: #DD8800;
  --tl-warn-bg: rgba(221, 136, 0, 0.05);
  --tl-success: #3F9F5F;
  --tl-success-bg: rgba(63, 159, 95, 0.06);

  /* ===== Aliases for common uses ===== */
  --tl-orange: var(--tl-orange-500);
  --tl-blue: var(--tl-blue-500);

  /* ===== Spacing scale (4px base) ===== */
  --tl-space-1: 4px;
  --tl-space-2: 8px;
  --tl-space-3: 12px;
  --tl-space-4: 16px;
  --tl-space-5: 20px;
  --tl-space-6: 24px;
  --tl-space-8: 32px;
  --tl-space-12: 48px;
  --tl-space-16: 64px;

  /* ===== Type scale ===== */
  --tl-text-xs: 11px;
  --tl-text-sm: 12px;
  --tl-text-md: 14px;
  --tl-text-base: 15px;
  --tl-text-lg: 17px;
  --tl-text-xl: 24px;
  --tl-text-2xl: 32px;
  --tl-text-3xl: 42px;

  /* ===== Line heights ===== */
  --tl-leading-tight: 1.25;
  --tl-leading-normal: 1.55;
  --tl-leading-relaxed: 1.7;

  /* ===== Font families ===== */
  --tl-font-serif: 'Source Serif Pro', 'Tiempos Text', Georgia, serif;
  --tl-font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --tl-font-mono: 'JetBrains Mono', Consolas, monospace;

  /* ===== Font weights ===== */
  --tl-weight-regular: 400;
  --tl-weight-medium: 500;
  --tl-weight-semibold: 600;

  /* ===== Radii ===== */
  --tl-radius-sm: 4px;
  --tl-radius-md: 6px;
  --tl-radius-lg: 12px;
  --tl-radius-full: 9999px;

  /* ===== Shadows ===== */
  --tl-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
  --tl-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
  --tl-shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);

  /* ===== Layout dimensions ===== */
  --tl-top-bar-height: 48px;
  --tl-sidebar-width: 240px;
  --tl-sidebar-width-collapsed: 36px;

  /* ===== z-index ===== */
  --tl-z-sidebar: 10;
  --tl-z-top-bar: 20;
  --tl-z-dropdown: 50;
  --tl-z-dev-mode: 100;
  --tl-z-modal: 200;
  --tl-z-toast: 300;

  /* ===== Transitions ===== */
  --tl-transition-fast: 120ms ease-out;
  --tl-transition-base: 180ms ease-out;
  --tl-transition-slow: 320ms ease-out;
}
```

**Step 2:** Commit:

```bash
git add src/renderer/src/theme/tokens.css
git commit -m "feat(phase-2a): extended theme tokens (color/spacing/type/radius/shadow/z-index scales)"
```

---

### Task 9: Refactor existing styles.css and import tokens.css

**Files:**
- Modify: `src/renderer/src/styles.css`
- Modify: `src/renderer/src/main.tsx`

**Step 1:** Replace `src/renderer/src/styles.css` entirely with body + app-level rules ONLY (existing tokens are now in `tokens.css`):

```css
/* Body + global resets only. Theme tokens live in src/renderer/src/theme/tokens.css.
   Component-specific styles co-locate with their .tsx files. */

* {
  box-sizing: border-box;
}

html,
body,
#root {
  height: 100%;
  margin: 0;
  padding: 0;
}

body {
  background: var(--tl-bg);
  color: var(--tl-fg);
  font-family: var(--tl-font-sans);
  font-size: var(--tl-text-base);
  line-height: var(--tl-leading-normal);
  -webkit-font-smoothing: antialiased;
}

/* The Phase 0 stub styles (.app, .app__title, .app__subtitle, .app__version)
   and the .app__dev-toggle button continue to be used by App.tsx until Task 20
   replaces the stub with AppShell. Keep them through Task 19 so the app
   remains functional at every commit. */

.app {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: var(--tl-space-16) var(--tl-space-8);
}

.app__header {
  border-bottom: 1px solid var(--tl-rule);
  padding-bottom: var(--tl-space-6);
  margin-bottom: var(--tl-space-8);
}

.app__title {
  font-family: var(--tl-font-serif);
  font-size: var(--tl-text-3xl);
  font-weight: var(--tl-weight-medium);
  letter-spacing: -0.02em;
  margin: 0 0 4px;
  color: var(--tl-orange);
}

.app__subtitle {
  margin: 0;
  color: var(--tl-mute);
  font-size: var(--tl-text-md);
}

.app__body {
  font-family: var(--tl-font-serif);
  font-size: var(--tl-text-lg);
}

.app__body p {
  margin: 0 0 var(--tl-space-4);
}

.app__version {
  font-family: var(--tl-font-sans);
  font-size: var(--tl-text-sm);
  color: var(--tl-mute);
}

.app__version code {
  font-family: var(--tl-font-mono);
  color: var(--tl-blue);
}

.app__dev-toggle {
  position: absolute;
  top: var(--tl-space-6);
  right: var(--tl-space-6);
  background: transparent;
  border: 1px solid var(--tl-rule);
  border-radius: var(--tl-radius-sm);
  padding: var(--tl-space-1) var(--tl-space-3);
  font-family: var(--tl-font-mono);
  font-size: var(--tl-text-sm);
  color: var(--tl-fg);
  cursor: pointer;
  z-index: var(--tl-z-top-bar);
}

.app__dev-toggle:hover {
  background: var(--tl-hover);
}

.app__dev-toggle.is-active {
  background: var(--tl-orange);
  color: white;
  border-color: var(--tl-orange);
}
```

Every literal value has been replaced with a `var(--tl-*)` reference. Behavior is unchanged.

**Step 2:** Update `src/renderer/src/main.tsx` to import tokens BEFORE the app's own styles. Find the imports:

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
```

Insert the tokens import above `./styles.css`:

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './theme/tokens.css'
import './styles.css'
```

Order matters: `tokens.css` defines the custom properties on `:root`; `styles.css` and component-co-located CSS files reference them. The tokens must be parsed first.

**Step 3:** Run typecheck + build + E2E to confirm nothing visual broke:

```bash
cd "C:/personal/tokenless"
npm run typecheck
npm run build
npm run test:e2e
```

All exit 0. All 6 E2E tests pass (3 smoke + 3 Dev Mode).

**Step 4:** Commit:

```bash
git add src/renderer/src/styles.css src/renderer/src/main.tsx
git commit -m "refactor(phase-2a): consume theme tokens via var() refs; import tokens.css globally"
```

---

### Task 10: Mock data — projects

**Files:**
- Create: `src/renderer/src/mocks/projects.ts`

**Step 1:** Create directory and file:

```bash
cd "C:/personal/tokenless"
mkdir -p src/renderer/src/mocks
```

`src/renderer/src/mocks/projects.ts`:

```typescript
// Mock projects for visual development of the app shell.
// Phase 2A renders these in the ProjectSwitcher dropdown.
// Phase 3 replaces with real projects from SQLite via IPC.

export interface MockProject {
  id: string
  name: string
  rootPath: string
}

export const MOCK_PROJECTS: readonly MockProject[] = [
  { id: 'proj-tokenless', name: 'TokenLess', rootPath: 'C:/personal/tokenless' },
  { id: 'proj-website', name: 'Personal Website', rootPath: 'C:/personal/website' },
  { id: 'proj-cad', name: 'CAD Mobile (work)', rootPath: 'C:/work/cad-mobile' }
]
```

**Step 2:** typecheck + commit:

```bash
npm run typecheck
git add src/renderer/src/mocks/projects.ts
git commit -m "feat(phase-2a): MOCK_PROJECTS for shell visual dev"
```

---

### Task 11: Mock data — accounts

**Files:**
- Create: `src/renderer/src/mocks/accounts.ts`

**Step 1:** Create `src/renderer/src/mocks/accounts.ts`:

```typescript
// Mock accounts for visual development of the AccountSwitcher dropdown.
// Phase 6 replaces with real accounts (per-account CLAUDE_CONFIG_DIR + ANTHROPIC_API_KEY).

export interface MockAccount {
  id: string
  label: string
  email: string
}

export const MOCK_ACCOUNTS: readonly MockAccount[] = [
  { id: 'acc-personal', label: 'Personal', email: 'aidenmolyneaux@hotmail.com' },
  { id: 'acc-work', label: 'Work', email: 'aiden.molyneaux@versaterm.com' }
]
```

**Step 2:** typecheck + commit:

```bash
cd "C:/personal/tokenless"
npm run typecheck
git add src/renderer/src/mocks/accounts.ts
git commit -m "feat(phase-2a): MOCK_ACCOUNTS for shell visual dev"
```

---

### Task 12: Mock data — conversations

**Files:**
- Create: `src/renderer/src/mocks/conversations.ts`

**Step 1:** Create `src/renderer/src/mocks/conversations.ts`:

```typescript
// Mock conversations for visual development of the ConversationSidebar.
// Phase 3 replaces with real conversations from SQLite via IPC.

export type MockConversationModel = 'opus' | 'sonnet' | 'haiku'

export interface MockConversation {
  id: string
  projectId: string
  title: string
  model: MockConversationModel
  updatedAt: number
}

const now = Date.now()
const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export const MOCK_CONVERSATIONS: readonly MockConversation[] = [
  { id: 'conv-1', projectId: 'proj-tokenless', title: 'Refactor auth middleware', model: 'opus', updatedAt: now - 30 * MIN },
  { id: 'conv-2', projectId: 'proj-tokenless', title: 'Add Dev Mode keyboard a11y', model: 'sonnet', updatedAt: now - 2 * HOUR },
  { id: 'conv-3', projectId: 'proj-tokenless', title: 'Scaffold E2E tests', model: 'haiku', updatedAt: now - 1 * DAY },
  { id: 'conv-4', projectId: 'proj-website', title: 'Hero copy variations', model: 'opus', updatedAt: now - 3 * DAY },
  { id: 'conv-5', projectId: 'proj-website', title: 'Footer redesign', model: 'sonnet', updatedAt: now - 5 * DAY },
  { id: 'conv-6', projectId: 'proj-cad', title: 'Investigate map rendering bug', model: 'opus', updatedAt: now - 10 * DAY }
]
```

**Step 2:** typecheck + commit:

```bash
cd "C:/personal/tokenless"
npm run typecheck
git add src/renderer/src/mocks/conversations.ts
git commit -m "feat(phase-2a): MOCK_CONVERSATIONS for shell visual dev"
```

---

### Task 13: SettingsButton component

**Files:**
- Create: `src/renderer/src/components/layout/SettingsButton.tsx`

**Step 1:** Create directory:

```bash
cd "C:/personal/tokenless"
mkdir -p src/renderer/src/components/layout
```

`src/renderer/src/components/layout/SettingsButton.tsx`:

```typescript
interface SettingsButtonProps {
  onClick?: () => void
}

// Settings icon button in the TopBar. Phase 2A: stub that just calls onClick;
// Phase 8 wires a real Settings view.

export function SettingsButton({ onClick }: SettingsButtonProps): JSX.Element {
  return (
    <button
      type="button"
      className="settings-button"
      onClick={onClick}
      aria-label="Open settings"
      title="Settings"
    >
      ⚙
    </button>
  )
}
```

**Step 2:** typecheck + commit:

```bash
npm run typecheck
git add src/renderer/src/components/layout/SettingsButton.tsx
git commit -m "feat(phase-2a): SettingsButton component (TopBar stub)"
```

---

### Task 14: ProjectSwitcher dropdown stub

**Files:**
- Create: `src/renderer/src/components/layout/ProjectSwitcher.tsx`

**Step 1:** Create `src/renderer/src/components/layout/ProjectSwitcher.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react'
import type { MockProject } from '../../mocks/projects'

interface ProjectSwitcherProps {
  projects: readonly MockProject[]
  activeProjectId: string
  onSelect: (id: string) => void
}

// Dropdown trigger + menu. Phase 2A is a visual stub — no real project
// switching yet (Phase 3 adds project CRUD + persistence). Click outside
// closes the menu. Escape closes.

export function ProjectSwitcher({ projects, activeProjectId, onSelect }: ProjectSwitcherProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const active = projects.find((p) => p.id === activeProjectId)

  useEffect(() => {
    if (!open) return undefined
    const handleClickOutside = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const handleSelect = (id: string): void => {
    onSelect(id)
    setOpen(false)
  }

  return (
    <div className="project-switcher" ref={rootRef}>
      <button
        type="button"
        className="project-switcher__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="project-switcher__label">Project:</span>
        <span className="project-switcher__name">{active?.name ?? 'No project'}</span>
        <span className="project-switcher__caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="project-switcher__menu" role="menu">
          {projects.map((p) => (
            <li key={p.id} role="none">
              <button
                type="button"
                role="menuitem"
                className={`project-switcher__item ${p.id === activeProjectId ? 'is-active' : ''}`}
                onClick={() => handleSelect(p.id)}
              >
                <span className="project-switcher__item-name">{p.name}</span>
                <span className="project-switcher__item-path">{p.rootPath}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

**Step 2:** typecheck + commit:

```bash
cd "C:/personal/tokenless"
npm run typecheck
git add src/renderer/src/components/layout/ProjectSwitcher.tsx
git commit -m "feat(phase-2a): ProjectSwitcher dropdown stub with outside-click + escape close"
```

---

### Task 15: AccountSwitcher dropdown stub

**Files:**
- Create: `src/renderer/src/components/layout/AccountSwitcher.tsx`

**Step 1:** Create `src/renderer/src/components/layout/AccountSwitcher.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react'
import type { MockAccount } from '../../mocks/accounts'

interface AccountSwitcherProps {
  accounts: readonly MockAccount[]
  activeAccountId: string
  onSelect: (id: string) => void
}

// Account switcher dropdown — same UX shape as ProjectSwitcher. Phase 2A
// is a visual stub; Phase 6 wires real account auth + CLAUDE_CONFIG_DIR
// + ANTHROPIC_API_KEY injection per ADR-018.

export function AccountSwitcher({ accounts, activeAccountId, onSelect }: AccountSwitcherProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const active = accounts.find((a) => a.id === activeAccountId)

  useEffect(() => {
    if (!open) return undefined
    const handleClickOutside = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const handleSelect = (id: string): void => {
    onSelect(id)
    setOpen(false)
  }

  return (
    <div className="account-switcher" ref={rootRef}>
      <button
        type="button"
        className="account-switcher__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="account-switcher__label">Account:</span>
        <span className="account-switcher__name">{active?.label ?? 'No account'}</span>
        <span className="account-switcher__caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="account-switcher__menu" role="menu">
          {accounts.map((a) => (
            <li key={a.id} role="none">
              <button
                type="button"
                role="menuitem"
                className={`account-switcher__item ${a.id === activeAccountId ? 'is-active' : ''}`}
                onClick={() => handleSelect(a.id)}
              >
                <span className="account-switcher__item-name">{a.label}</span>
                <span className="account-switcher__item-email">{a.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

**Step 2:** typecheck + commit:

```bash
cd "C:/personal/tokenless"
npm run typecheck
git add src/renderer/src/components/layout/AccountSwitcher.tsx
git commit -m "feat(phase-2a): AccountSwitcher dropdown stub"
```

---

### Task 16: TopBar component

**Files:**
- Create: `src/renderer/src/components/layout/TopBar.tsx`

**Step 1:** Create `src/renderer/src/components/layout/TopBar.tsx`:

```typescript
import type { MockAccount } from '../../mocks/accounts'
import type { MockProject } from '../../mocks/projects'
import { AccountSwitcher } from './AccountSwitcher'
import { ProjectSwitcher } from './ProjectSwitcher'
import { SettingsButton } from './SettingsButton'

interface TopBarProps {
  projects: readonly MockProject[]
  activeProjectId: string
  onSelectProject: (id: string) => void
  accounts: readonly MockAccount[]
  activeAccountId: string
  onSelectAccount: (id: string) => void
  onOpenSettings: () => void
}

// Top bar: brand + project/account switchers + settings button.

export function TopBar(props: TopBarProps): JSX.Element {
  return (
    <header className="top-bar">
      <div className="top-bar__brand">TokenLess</div>
      <nav className="top-bar__nav">
        <ProjectSwitcher
          projects={props.projects}
          activeProjectId={props.activeProjectId}
          onSelect={props.onSelectProject}
        />
        <AccountSwitcher
          accounts={props.accounts}
          activeAccountId={props.activeAccountId}
          onSelect={props.onSelectAccount}
        />
        <SettingsButton onClick={props.onOpenSettings} />
      </nav>
    </header>
  )
}
```

**Step 2:** typecheck + commit:

```bash
cd "C:/personal/tokenless"
npm run typecheck
git add src/renderer/src/components/layout/TopBar.tsx
git commit -m "feat(phase-2a): TopBar composes brand + switchers + settings"
```

---

### Task 17: ConversationListItem + ConversationList

**Files:**
- Create: `src/renderer/src/components/layout/ConversationListItem.tsx`
- Create: `src/renderer/src/components/layout/ConversationList.tsx`

**Step 1:** Create `src/renderer/src/components/layout/ConversationListItem.tsx`:

```typescript
import type { MockConversation } from '../../mocks/conversations'

interface ConversationListItemProps {
  conversation: MockConversation
  isActive: boolean
  onSelect: (id: string) => void
}

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < MIN) return 'just now'
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`
  return `${Math.floor(diff / DAY)}d ago`
}

export function ConversationListItem({ conversation, isActive, onSelect }: ConversationListItemProps): JSX.Element {
  return (
    <li className={`conversation-item ${isActive ? 'is-active' : ''}`}>
      <button
        type="button"
        className="conversation-item__button"
        onClick={() => onSelect(conversation.id)}
      >
        <span className="conversation-item__title">{conversation.title}</span>
        <span className="conversation-item__meta">
          <span className={`conversation-item__model conversation-item__model--${conversation.model}`}>
            {conversation.model}
          </span>
          <span className="conversation-item__time">{relativeTime(conversation.updatedAt)}</span>
        </span>
      </button>
    </li>
  )
}
```

**Step 2:** Create `src/renderer/src/components/layout/ConversationList.tsx`:

```typescript
import type { MockConversation } from '../../mocks/conversations'
import { ConversationListItem } from './ConversationListItem'

interface ConversationListProps {
  conversations: readonly MockConversation[]
  activeId: string | null
  onSelect: (id: string) => void
}

export function ConversationList({ conversations, activeId, onSelect }: ConversationListProps): JSX.Element {
  if (conversations.length === 0) {
    return (
      <p className="conversation-list__empty">
        No conversations yet. Click "+ New Conversation" to start one.
      </p>
    )
  }
  return (
    <ul className="conversation-list">
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

**Step 3:** typecheck + commit:

```bash
cd "C:/personal/tokenless"
npm run typecheck
git add src/renderer/src/components/layout/ConversationListItem.tsx src/renderer/src/components/layout/ConversationList.tsx
git commit -m "feat(phase-2a): ConversationListItem + ConversationList components"
```

---

### Task 18: ConversationSidebar (collapsible)

**Files:**
- Create: `src/renderer/src/components/layout/ConversationSidebar.tsx`

**Step 1:** Create `src/renderer/src/components/layout/ConversationSidebar.tsx`:

```typescript
import type { MockConversation } from '../../mocks/conversations'
import { ConversationList } from './ConversationList'

interface ConversationSidebarProps {
  conversations: readonly MockConversation[]
  activeId: string | null
  onSelect: (id: string) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  onNewConversation: () => void
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  collapsed,
  onToggleCollapsed,
  onNewConversation
}: ConversationSidebarProps): JSX.Element {
  return (
    <aside className={`conversation-sidebar ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="conversation-sidebar__header">
        {!collapsed && <span className="conversation-sidebar__title">Conversations</span>}
        <button
          type="button"
          className="conversation-sidebar__collapse"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '▶' : '◀'}
        </button>
      </div>
      {!collapsed && (
        <>
          <button
            type="button"
            className="conversation-sidebar__new"
            onClick={onNewConversation}
          >
            + New Conversation
          </button>
          <ConversationList
            conversations={conversations}
            activeId={activeId}
            onSelect={onSelect}
          />
        </>
      )}
    </aside>
  )
}
```

**Step 2:** typecheck + commit:

```bash
cd "C:/personal/tokenless"
npm run typecheck
git add src/renderer/src/components/layout/ConversationSidebar.tsx
git commit -m "feat(phase-2a): ConversationSidebar collapsible aside"
```

---

### Task 19: MainPane placeholder + layout styles

**Files:**
- Create: `src/renderer/src/components/layout/MainPane.tsx`
- Create: `src/renderer/src/components/layout/styles.css`

**Step 1:** Create `src/renderer/src/components/layout/MainPane.tsx`:

```typescript
// MainPane is the split container holding the composer (top) and the
// embedded terminal (bottom) per ADR-003 / spec §2. Phase 2A renders
// placeholders; Phase 2B drops the Composer + GearReviewPane + TerminalSection
// into the two halves.

export function MainPane(): JSX.Element {
  return (
    <main className="main-pane">
      <section className="main-pane__composer-area">
        <p className="main-pane__placeholder">
          Composer + GearReviewPane land here in Phase 2B.
        </p>
      </section>
      <section className="main-pane__terminal-area">
        <p className="main-pane__placeholder">
          Terminal pane (xterm.js with canned ANSI for Phase 2B; real PTY in Phase 4) lands here.
        </p>
      </section>
    </main>
  )
}
```

**Step 2:** Create `src/renderer/src/components/layout/styles.css` with EXACT content (all the layout CSS at once — TopBar + switchers + sidebar + main pane):

```css
/* Layout-specific styles for the app shell components. Tokens come from
   src/renderer/src/theme/tokens.css (imported globally via main.tsx). */

/* ===== App shell grid ===== */

.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--tl-bg);
}

.app-shell__body {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* ===== Top bar ===== */

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--tl-top-bar-height);
  padding: 0 var(--tl-space-4);
  background: var(--tl-bg);
  border-bottom: 1px solid var(--tl-rule);
  position: relative;
  z-index: var(--tl-z-top-bar);
}

.top-bar__brand {
  font-family: var(--tl-font-serif);
  font-size: var(--tl-text-lg);
  font-weight: var(--tl-weight-medium);
  color: var(--tl-orange);
  letter-spacing: -0.01em;
}

.top-bar__nav {
  display: flex;
  align-items: center;
  gap: var(--tl-space-3);
}

/* ===== Switcher (shared between Project + Account) ===== */

.project-switcher,
.account-switcher {
  position: relative;
}

.project-switcher__trigger,
.account-switcher__trigger {
  display: flex;
  align-items: center;
  gap: var(--tl-space-2);
  background: transparent;
  border: 1px solid var(--tl-rule);
  border-radius: var(--tl-radius-sm);
  padding: var(--tl-space-1) var(--tl-space-3);
  font-family: var(--tl-font-sans);
  font-size: var(--tl-text-sm);
  color: var(--tl-fg);
  cursor: pointer;
  transition: background var(--tl-transition-fast);
}

.project-switcher__trigger:hover,
.account-switcher__trigger:hover {
  background: var(--tl-hover);
}

.project-switcher__label,
.account-switcher__label {
  color: var(--tl-mute);
  font-size: var(--tl-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.project-switcher__name,
.account-switcher__name {
  font-weight: var(--tl-weight-medium);
}

.project-switcher__caret,
.account-switcher__caret {
  color: var(--tl-mute);
  font-size: var(--tl-text-xs);
}

.project-switcher__menu,
.account-switcher__menu {
  position: absolute;
  top: calc(100% + var(--tl-space-1));
  left: 0;
  min-width: 240px;
  margin: 0;
  padding: var(--tl-space-1) 0;
  list-style: none;
  background: white;
  border: 1px solid var(--tl-rule);
  border-radius: var(--tl-radius-md);
  box-shadow: var(--tl-shadow-md);
  z-index: var(--tl-z-dropdown);
}

.project-switcher__item,
.account-switcher__item {
  display: flex;
  flex-direction: column;
  width: 100%;
  background: transparent;
  border: none;
  padding: var(--tl-space-2) var(--tl-space-3);
  text-align: left;
  cursor: pointer;
  font-family: var(--tl-font-sans);
  font-size: var(--tl-text-sm);
}

.project-switcher__item:hover,
.account-switcher__item:hover {
  background: var(--tl-hover);
}

.project-switcher__item.is-active,
.account-switcher__item.is-active {
  background: var(--tl-orange-50);
  color: var(--tl-orange-700);
}

.project-switcher__item-name,
.account-switcher__item-name {
  font-weight: var(--tl-weight-medium);
}

.project-switcher__item-path,
.account-switcher__item-email {
  color: var(--tl-mute);
  font-size: var(--tl-text-xs);
  font-family: var(--tl-font-mono);
}

/* ===== Settings button ===== */

.settings-button {
  background: transparent;
  border: 1px solid var(--tl-rule);
  border-radius: var(--tl-radius-sm);
  padding: var(--tl-space-1) var(--tl-space-3);
  font-size: var(--tl-text-base);
  color: var(--tl-fg);
  cursor: pointer;
  transition: background var(--tl-transition-fast);
}

.settings-button:hover {
  background: var(--tl-hover);
}

/* ===== Conversation sidebar ===== */

.conversation-sidebar {
  width: var(--tl-sidebar-width);
  background: var(--tl-bg-alt);
  border-right: 1px solid var(--tl-rule);
  overflow-y: auto;
  flex-shrink: 0;
  transition: width var(--tl-transition-base);
  z-index: var(--tl-z-sidebar);
  display: flex;
  flex-direction: column;
}

.conversation-sidebar.is-collapsed {
  width: var(--tl-sidebar-width-collapsed);
}

.conversation-sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--tl-space-3) var(--tl-space-3);
  border-bottom: 1px solid var(--tl-rule);
}

.conversation-sidebar__title {
  font-family: var(--tl-font-sans);
  font-size: var(--tl-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--tl-mute);
  font-weight: var(--tl-weight-medium);
}

.conversation-sidebar__collapse {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--tl-mute);
  font-size: var(--tl-text-xs);
  padding: 2px var(--tl-space-1);
  border-radius: var(--tl-radius-sm);
}

.conversation-sidebar__collapse:hover {
  background: var(--tl-hover);
  color: var(--tl-fg);
}

.conversation-sidebar__new {
  margin: var(--tl-space-2);
  padding: var(--tl-space-2) var(--tl-space-3);
  background: transparent;
  border: 1px dashed var(--tl-rule-strong);
  border-radius: var(--tl-radius-sm);
  font-family: var(--tl-font-sans);
  font-size: var(--tl-text-sm);
  color: var(--tl-mute);
  cursor: pointer;
  text-align: left;
  transition: all var(--tl-transition-fast);
}

.conversation-sidebar__new:hover {
  border-color: var(--tl-orange);
  color: var(--tl-orange);
  background: var(--tl-orange-50);
}

/* ===== Conversation list ===== */

.conversation-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.conversation-list__empty {
  padding: var(--tl-space-4);
  color: var(--tl-mute);
  font-size: var(--tl-text-sm);
  font-style: italic;
}

.conversation-item {
  border-bottom: 1px solid rgba(42, 38, 36, 0.04);
}

.conversation-item__button {
  display: flex;
  flex-direction: column;
  width: 100%;
  background: transparent;
  border: none;
  padding: var(--tl-space-2) var(--tl-space-3);
  text-align: left;
  cursor: pointer;
  font-family: var(--tl-font-sans);
  transition: background var(--tl-transition-fast);
}

.conversation-item__button:hover {
  background: var(--tl-hover);
}

.conversation-item.is-active .conversation-item__button {
  background: var(--tl-orange-50);
  border-left: 3px solid var(--tl-orange);
  padding-left: calc(var(--tl-space-3) - 3px);
}

.conversation-item__title {
  font-size: var(--tl-text-sm);
  font-weight: var(--tl-weight-medium);
  color: var(--tl-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conversation-item__meta {
  display: flex;
  align-items: center;
  gap: var(--tl-space-2);
  margin-top: 2px;
  font-size: var(--tl-text-xs);
}

.conversation-item__model {
  font-family: var(--tl-font-mono);
  text-transform: uppercase;
  padding: 0 var(--tl-space-1);
  border-radius: var(--tl-radius-sm);
  font-size: 10px;
}

.conversation-item__model--opus {
  background: var(--tl-orange-100);
  color: var(--tl-orange-700);
}

.conversation-item__model--sonnet {
  background: var(--tl-blue-100);
  color: var(--tl-blue-700);
}

.conversation-item__model--haiku {
  background: rgba(42, 38, 36, 0.06);
  color: var(--tl-mute);
}

.conversation-item__time {
  color: var(--tl-mute);
}

/* ===== Main pane ===== */

.main-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--tl-bg);
}

.main-pane__composer-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid var(--tl-rule);
  padding: var(--tl-space-6);
}

.main-pane__terminal-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--tl-space-6);
  background: var(--tl-bg-alt);
}

.main-pane__placeholder {
  color: var(--tl-mute);
  font-style: italic;
  font-family: var(--tl-font-serif);
  font-size: var(--tl-text-lg);
  text-align: center;
  margin: 0;
}
```

**Step 3:** typecheck + commit (the styles aren't referenced yet but they exist; the actual import happens in Task 20 when AppShell is created):

```bash
cd "C:/personal/tokenless"
npm run typecheck
git add src/renderer/src/components/layout/MainPane.tsx src/renderer/src/components/layout/styles.css
git commit -m "feat(phase-2a): MainPane placeholder + layout styles for shell components"
```

---

### Task 20: AppShell orchestrator

**Files:**
- Create: `src/renderer/src/components/layout/AppShell.tsx`

**Step 1:** Create `src/renderer/src/components/layout/AppShell.tsx`:

```typescript
import { useState } from 'react'
import { rendererLogger } from '../../observability/logger-bridge'
import { MOCK_ACCOUNTS } from '../../mocks/accounts'
import { MOCK_CONVERSATIONS } from '../../mocks/conversations'
import { MOCK_PROJECTS } from '../../mocks/projects'
import { ConversationSidebar } from './ConversationSidebar'
import { MainPane } from './MainPane'
import { TopBar } from './TopBar'
import './styles.css'

// AppShell orchestrates the visual layout. Phase 2A holds active project /
// account / conversation IDs locally + sidebar collapsed state. Phase 3
// replaces the mock data with IPC-backed hooks; Phase 6 wires real
// account switching; Phase 8 wires the Settings button to a real view.

export function AppShell(): JSX.Element {
  const [activeProjectId, setActiveProjectId] = useState<string>(MOCK_PROJECTS[0].id)
  const [activeAccountId, setActiveAccountId] = useState<string>(MOCK_ACCOUNTS[0].id)
  const conversationsForActiveProject = MOCK_CONVERSATIONS.filter(
    (c) => c.projectId === activeProjectId
  )
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    conversationsForActiveProject[0]?.id ?? null
  )
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const handleSelectProject = (id: string): void => {
    setActiveProjectId(id)
    // Reset active conversation to the first one in the new project
    const firstInProject = MOCK_CONVERSATIONS.find((c) => c.projectId === id)
    setActiveConversationId(firstInProject?.id ?? null)
    rendererLogger.info('ui', 'project-switch', `Switched project (stub)`, { projectId: id })
  }

  const handleSelectAccount = (id: string): void => {
    setActiveAccountId(id)
    rendererLogger.info('ui', 'account-switch', `Switched account (stub)`, { accountId: id })
  }

  const handleSelectConversation = (id: string): void => {
    setActiveConversationId(id)
    rendererLogger.info('ui', 'conversation-select', `Selected conversation (stub)`, { conversationId: id })
  }

  const handleNewConversation = (): void => {
    rendererLogger.info('ui', 'new-conversation-clicked', 'New Conversation button clicked (stub)')
  }

  const handleOpenSettings = (): void => {
    rendererLogger.info('ui', 'settings-clicked', 'Settings button clicked (stub)')
  }

  const handleToggleSidebar = (): void => {
    setSidebarCollapsed((c) => !c)
  }

  return (
    <div className="app-shell">
      <TopBar
        projects={MOCK_PROJECTS}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        accounts={MOCK_ACCOUNTS}
        activeAccountId={activeAccountId}
        onSelectAccount={handleSelectAccount}
        onOpenSettings={handleOpenSettings}
      />
      <div className="app-shell__body">
        <ConversationSidebar
          conversations={conversationsForActiveProject}
          activeId={activeConversationId}
          onSelect={handleSelectConversation}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={handleToggleSidebar}
          onNewConversation={handleNewConversation}
        />
        <MainPane />
      </div>
    </div>
  )
}
```

**Step 2:** typecheck + commit:

```bash
cd "C:/personal/tokenless"
npm run typecheck
git add src/renderer/src/components/layout/AppShell.tsx
git commit -m "feat(phase-2a): AppShell orchestrator wiring mocks into all shell components"
```

---

### Task 21: Swap App.tsx stub for AppShell

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles.css`

**Step 1:** Replace `src/renderer/src/App.tsx` with EXACT content:

```typescript
import { useEffect, useState } from 'react'
import { AppErrorBoundary } from './observability/error-boundary'
import { AppShell } from './components/layout/AppShell'
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
      <AppShell />
      <button
        type="button"
        className={`app__dev-toggle ${devMode ? 'is-active' : ''}`}
        onClick={toggleDevMode}
      >
        {devMode ? 'Hide Dev Mode' : 'Show Dev Mode'}
      </button>
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

The Dev Mode toggle is now an absolute-positioned button overlaying the shell. Phase 8 moves this into Settings properly.

**Step 2:** Update `src/renderer/src/styles.css` — the Phase 0 stub-specific styles (`.app`, `.app__title`, `.app__subtitle`, `.app__body`, `.app__version`, etc.) are no longer referenced. Replace `src/renderer/src/styles.css` with:

```css
/* Body + global resets only. Theme tokens live in src/renderer/src/theme/tokens.css.
   Component-specific styles co-locate with their .tsx files. */

* {
  box-sizing: border-box;
}

html,
body,
#root {
  height: 100%;
  margin: 0;
  padding: 0;
}

body {
  background: var(--tl-bg);
  color: var(--tl-fg);
  font-family: var(--tl-font-sans);
  font-size: var(--tl-text-base);
  line-height: var(--tl-leading-normal);
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}

/* Dev Mode toggle button — absolute-positioned overlay above the shell.
   Phase 8 moves this into Settings; Phase 2A keeps it visible globally for dev. */

.app__dev-toggle {
  position: fixed;
  top: var(--tl-space-2);
  right: var(--tl-space-2);
  background: var(--tl-bg);
  border: 1px solid var(--tl-rule);
  border-radius: var(--tl-radius-sm);
  padding: var(--tl-space-1) var(--tl-space-3);
  font-family: var(--tl-font-mono);
  font-size: var(--tl-text-xs);
  color: var(--tl-mute);
  cursor: pointer;
  z-index: var(--tl-z-modal);
  box-shadow: var(--tl-shadow-sm);
}

.app__dev-toggle:hover {
  background: var(--tl-hover);
  color: var(--tl-fg);
}

.app__dev-toggle.is-active {
  background: var(--tl-orange);
  color: white;
  border-color: var(--tl-orange);
}
```

Note: `body` gains `overflow: hidden` because the AppShell manages its own scrollable regions; the page itself doesn't scroll.

**Step 3:** typecheck + build + run dev mode E2E (it should still pass — the toggle button is still there, just visually shifted):

```bash
cd "C:/personal/tokenless"
npm run typecheck
npm run build
npm run test:e2e -- dev-mode
```

All exit 0. 3/3 Dev Mode E2E pass.

**Step 4:** Commit:

```bash
git add src/renderer/src/App.tsx src/renderer/src/styles.css
git commit -m "feat(phase-2a): swap Phase 0 stub for AppShell; reposition Dev Mode toggle as fixed overlay"
```

---

### Task 22: Update smoke E2E for new shell + Phase 2A verification + tag

**Files:**
- Modify: `test/e2e/smoke.e2e.test.ts`

**Step 1:** The existing smoke test asserts on `.app__title` and `.app__subtitle`, which no longer exist (Task 21 removed those). Replace `test/e2e/smoke.e2e.test.ts` with EXACT content:

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

test('window opens with the TokenLess title', async () => {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await expect(page).toHaveTitle('TokenLess')
})

test('app shell renders TopBar brand + ConversationSidebar + MainPane', async () => {
  const page = await app.firstWindow()
  const brand = page.locator('.top-bar__brand')
  await expect(brand).toHaveText('TokenLess')

  const sidebar = page.locator('.conversation-sidebar')
  await expect(sidebar).toBeVisible()

  const mainPane = page.locator('.main-pane')
  await expect(mainPane).toBeVisible()
})

test('preload exposes window.tokenless.version', async () => {
  const page = await app.firstWindow()
  const version = await page.evaluate(() => window.tokenless?.version)
  expect(version).toBe('0.0.1')
})
```

**Step 2:** Run all build gates:

```bash
cd "C:/personal/tokenless"
npm run typecheck && echo "TYPECHECK_OK"
npm run test:run && echo "UNIT_OK"
npm run build && echo "BUILD_OK"
npm run test:e2e && echo "E2E_OK"
git status
```

All four exit 0; `git status` clean. E2E should show 6 passing (3 updated smoke + 3 Dev Mode).

**Step 3:** Commit the smoke update:

```bash
git add test/e2e/smoke.e2e.test.ts
git commit -m "test(phase-2a): update smoke E2E selectors for new app shell"
```

**Step 4:** Update `docs/test-scenarios.md` — append a Phase 2A scenario:

```markdown

## Scenario: Phase 2A — App shell renders with theme

**Preconditions:** App built and running (`npm run preview`).

**Steps:**
1. Observe the top bar.
2. Click the "Project:" dropdown, observe project list, pick a different project.
3. Click the "Account:" dropdown, observe accounts.
4. Click the sidebar collapse arrow.
5. Click a conversation in the sidebar.
6. Click "+ New Conversation".
7. Click the ⚙ Settings button.
8. Toggle Dev Mode on (top-right button) and confirm `ui/project-switch`, `ui/account-switch`, etc. records appear.

**Expected:**
- Top bar shows "TokenLess" brand in orange, with Project, Account, and Settings controls.
- Project dropdown opens; selecting a different project changes the sidebar's conversation list.
- Account dropdown opens; selecting changes the active account label.
- Sidebar collapses to a thin strip and re-expands.
- Clicking a conversation marks it active (orange left border + tinted background).
- "+ New Conversation" and ⚙ Settings emit `info` records visible in Dev Mode.
- All interactions log to Dev Mode under `ui/*` events with relevant context.
```

Commit:

```bash
git add docs/test-scenarios.md
git commit -m "docs(phase-2a): add Phase 2A app shell test scenario"
```

**Step 5:** Tag the Phase 2A completion locally:

```bash
git tag -a v0.4.0-phase-2a -m "Phase 2A complete — xterm migration, Phase 1B cleanup, theme tokens, app shell skeleton"
git log --oneline v0.3.0-phase-1b..v0.4.0-phase-2a
```

Expected: 22+ commits since `v0.3.0-phase-1b`. Do NOT push to origin yet — that's the next workflow step (finishing-a-development-branch).

---

## Phase 2A — Exit criteria

Phase 2A is complete when:

1. `npm run typecheck` exits 0
2. `npm run test:run` passes all unit + integration tests
3. `npm run build` produces all 3 bundles
4. `npm run test:e2e` passes 6 tests (3 updated smoke + 3 Dev Mode)
5. xterm/xterm-addon-fit packages are gone from `package.json`; `@xterm/xterm`/`@xterm/addon-fit` are present
6. Running `npm run preview` opens a window that LOOKS like TokenLess — top bar with project/account switchers, collapsible sidebar with 3-6 mock conversations, themed empty main pane
7. Dropdown opens close on outside click and Escape key
8. Switching project changes the sidebar's conversation list
9. All Phase 1B cleanup items resolved (verify by re-reading the 6 items in this plan's intro — each has a corresponding task)
10. Tag `v0.4.0-phase-2a` exists locally
11. `git status` clean

Once exit criteria are met, return to push + verify CI green (finishing-a-development-branch workflow).

---

## Self-review (writing-plans skill)

**1. Spec coverage:** Phase 2A maps to spec §2 (Component model — TopBar with ProjectSwitcher/AccountSwitcher/SettingsButton; ConversationSidebar with NewConversationButton + ConversationList → ConversationListItem) and §9 Phase 2's first half. Composer + GearReviewPane + TerminalSection from §2 are intentionally Phase 2B. The InfoTooltip cross-cutting component is also Phase 2B.

**2. Placeholder scan:** Searched for TBD / TODO / "implement later" / "similar to Task N" — none in this plan. All code blocks contain literal complete code.

**3. Type consistency:**
- `MockProject` shape (id, name, rootPath) consistent across `projects.ts` (Task 10), `ProjectSwitcher.tsx` (Task 14), `TopBar.tsx` (Task 16), `AppShell.tsx` (Task 20).
- `MockAccount` shape (id, label, email) consistent across `accounts.ts` (Task 11), `AccountSwitcher.tsx` (Task 15), `TopBar.tsx`, `AppShell.tsx`.
- `MockConversation` shape (id, projectId, title, model, updatedAt) consistent across `conversations.ts` (Task 12), `ConversationListItem.tsx` (Task 17), `ConversationList.tsx` (Task 17), `ConversationSidebar.tsx` (Task 18), `AppShell.tsx` (Task 20).
- `MockConversationModel` union ('opus' | 'sonnet' | 'haiku') is the source of truth for the model badge class names (`conversation-item__model--opus` etc.) in `styles.css` (Task 19).
- CSS class names referenced from `.tsx` files all exist in `styles.css` — `.top-bar`, `.top-bar__brand`, `.top-bar__nav`, `.project-switcher*`, `.account-switcher*`, `.settings-button*`, `.conversation-sidebar*`, `.conversation-list*`, `.conversation-item*`, `.main-pane*`, `.app-shell*`.
- Callback signatures consistent: `onSelect(id: string) => void`, `onToggleCollapsed() => void`, etc.

**4. Scope check:** 22 tasks. Total estimated time: 1-2 days of focused work; many tasks are mechanical (replace + commit). The 6 Phase 1B cleanup items are 1 task each; shell components are 1 task each. Appropriately scoped for a single plan.

**Notes for the executor:**

- **Tasks 2-8 are cleanup**, not new features. They produce no behavior changes for the user — they make the foundation tighter. Skip enthusiasm; just land the small fixes precisely.
- **Tasks 13-19 produce zero behavior change in the running app** until Task 20 creates AppShell and Task 21 wires it into App.tsx. The intermediate commits build up to a working shell at Task 21; before that, the new files are dead code (not imported by App.tsx).
- **The Dev Mode toggle button's position changes in Task 21** (absolute-positioned in the body, no longer inside `.app__header`). This is intentional — it now floats above the shell. If the visual placement is awkward, Phase 2B's polish task can move it.
- **No new ADRs** for Phase 2A beyond ADR-020 (Task 2). The theme tokens, mock data structure, and component decomposition are implementation details, not capital-D Decisions.

---

*End of Phase 2A plan.*
