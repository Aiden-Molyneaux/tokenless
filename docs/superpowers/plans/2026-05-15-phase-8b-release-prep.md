# Phase 8B: Release Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TokenLess shippable. Per ADR-002 (Windows-first) + the user's "iterate fast" workflow constraint, v1.0 ships as an UNPACKED build (`npm run build:unpack` → `dist/win-unpacked/TokenLess.exe`) — no NSIS installer, no code signing, no auto-update. The user creates a desktop shortcut to the exe and rebuilds when they want a new "stable" version. Distribution to others happens via GitHub Releases (zipped unpacked dir). NSIS / signing / auto-update + crash-reporter polish defer to v1.1+.

**Architecture:** Five additions to the main process or repo root:
- **electron-builder config** in package.json's `build` key, targeting `--dir` only. Sets app icon (resources/icon.ico), product name, copyright. NSIS / signing config left commented out as v1.1 placeholders.
- **App icon**: simple SVG monogram ("TL" orange on cream) committed at `resources/icon.svg` + a manual conversion step documented in README. The user converts to `resources/icon.ico` locally with whatever tool they prefer (RealFaviconGenerator, ImageMagick, etc.). The build config references the .ico; if absent, electron-builder falls back to Electron defaults (logs a warning).
- **DB backup-on-migration**: before applying any new migrations, copy the current DB to `userData/backups/tokenless-pre-v{from}-to-v{to}-{timestamp}.db`. Keeps the last 5 backups; prunes older.
- **Crash reporter**: main process catches `uncaughtException` / `unhandledRejection`; renderer's existing `AppErrorBoundary` extends to ship the error to main; both render a `<CrashReporterModal>` with the error + "Copy report" (bundles last 100 log records + system info) + Restart/Continue buttons.
- **First-run privacy notice**: a one-time modal stating "TokenLess sends prompts to Anthropic. Your API key is stored locally (ADR-034). Logs and DB stay on this machine." Persisted via `settings.privacy.acknowledged='1'`. Shows BEFORE the onboarding wizard on first launch.

The **About dialog** is a small modal reachable from Settings → footer. Shows app name, version (from package.json), brief description, ADR-002 attribution ("Windows-first; ADR-002"), and a link to GitHub.

The **GitHub Actions release workflow** is a new `.github/workflows/release.yml` that triggers on `v*` tag pushes. Runs the existing CI gates (typecheck, test:run, build, e2e) then runs `npm run build:unpack`, zips `dist/win-unpacked/`, and uploads it as a Release asset.

**Out of scope for Phase 8B (→ v1.1+):**
- NSIS installer (`build:win` is wired but not used by the release workflow)
- Code signing
- Auto-update channel (electron-updater)
- macOS / Linux builds (ADR-002)
- §7 output-pattern detection (resume/quota/auth-expired)

---

## File Structure

**New files:**
- `resources/icon.svg` — TL monogram source
- `resources/icon-design.md` — design notes + conversion instructions
- `src/main/db/migrations/backup.ts` — `backupBeforeMigration(db, dbPath, fromVersion, toVersion)`
- `src/main/__tests__/db/migration-backup.integration.test.ts`
- `src/main/ipc/crash-handler.ts` — main-side uncaught handlers + IPC for renderer crashes
- `src/main/__tests__/ipc/crash-handler.integration.test.ts`
- `src/shared/ipc/crash.ts`
- `src/shared/types/crash-report.ts`
- `src/renderer/src/components/notifications/CrashReporterModal.tsx`
- `src/renderer/src/components/notifications/PrivacyNoticeModal.tsx`
- `src/renderer/src/components/notifications/AboutDialog.tsx`
- `.github/workflows/release.yml` — tag-triggered release workflow

**Modified files:**
- `package.json` — add `build` config for electron-builder
- `src/main/db/migrations/runner.ts` — call `backupBeforeMigration` before applying
- `src/main/index.ts` — wire `crash-handler.installUncaughtMainHandlers(...)`
- `src/main/observability/error-boundary.ts` — verify exists; extend to ship to main process if it doesn't already
- `src/renderer/src/App.tsx` — mount PrivacyNoticeModal before OnboardingWizard; mount CrashReporterModal globally
- `src/renderer/src/views/settings/SettingsView.tsx` — add "About TokenLess" footer link → opens AboutDialog
- `src/renderer/src/observability/error-boundary.tsx` — render CrashReporterModal on caught errors
- `docs/decisions.md` — ADR-042
- `docs/observability.md` — extend with crash + db-backup events
- `docs/test-scenarios.md` — Phase 8B scenarios
- `README.md` — distribution + icon conversion instructions (create if missing)

---

## Task 1: electron-builder config + build:unpack flow

**Files:**
- Modify: `package.json` — add `build` key

`build:unpack` already exists as a script. The missing piece: an electron-builder `build` config object that tells it which files to include, app metadata, output directory, etc.

- [ ] **Step 1: Add `build` config to package.json**

Add the `build` key at the package.json top level. Match the existing project conventions (productName uses "TokenLess", appId reverse-DNS):

```json
{
  // ... existing fields ...
  "build": {
    "appId": "com.tokenless.app",
    "productName": "TokenLess",
    "copyright": "Copyright © 2026 Aiden Molyneaux",
    "directories": {
      "buildResources": "resources",
      "output": "dist"
    },
    "files": [
      "out/**/*",
      "package.json",
      "node_modules/better-sqlite3/build/Release/**/*",
      "node_modules/node-pty/prebuilds/**/*",
      "node_modules/node-pty/lib/**/*",
      "node_modules/node-pty/package.json"
    ],
    "asarUnpack": [
      "node_modules/better-sqlite3/build/Release/**/*",
      "node_modules/node-pty/prebuilds/**/*",
      "node_modules/node-pty/lib/**/*"
    ],
    "win": {
      "target": [
        { "target": "dir", "arch": ["x64"] }
      ],
      "icon": "resources/icon.ico"
    },
    "nsis": {
      "_comment": "v1.1 placeholder — NSIS installer disabled in v1.0. Re-enable build:win when ready.",
      "oneClick": false,
      "perMachine": false,
      "allowToChangeInstallationDirectory": true
    }
  }
}
```

The asarUnpack section is critical: native modules (better-sqlite3, node-pty) must live OUTSIDE the asar archive because Node.js can't dlopen .node binaries from inside asar.

- [ ] **Step 2: Verify build:unpack works**

```
npm run build:unpack
```

Expected: `dist/win-unpacked/TokenLess.exe` exists. The folder contains the unpacked Electron app. Open it: `dist/win-unpacked/TokenLess.exe` — TokenLess launches with all features (DB persists at `%APPDATA%/tokenless/`, logs at `%APPDATA%/tokenless/logs/`).

Note: this verification step CANNOT be automated in the test suite (it produces a build artifact, not test output). The check is "does the .exe exist + does it launch."

- [ ] **Step 3: Commit**

```
git add package.json
git commit -m "feat(phase-8b): electron-builder config — productName, asar layout, win:dir target"
```

---

## Task 2: App icon — SVG monogram + manual .ico conversion path

**Files:**
- Create: `resources/icon.svg`
- Create: `resources/icon-design.md`
- Modify: `src/main/index.ts` — set BrowserWindow `icon` if .ico exists

- [ ] **Step 1: Source SVG**

Create `resources/icon.svg`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <!-- Cream background matching --tl-bg #FAF7F2 -->
  <rect width="256" height="256" rx="48" fill="#FAF7F2"/>
  <!-- Orange TL monogram matching --tl-orange-500 #D97757 -->
  <text x="128" y="170"
        font-family="'Source Serif Pro', Georgia, serif"
        font-size="160"
        font-weight="700"
        text-anchor="middle"
        fill="#D97757">TL</text>
</svg>
```

- [ ] **Step 2: Conversion docs**

Create `resources/icon-design.md`:
```markdown
# TokenLess app icon

Source: `icon.svg` — orange TL monogram on cream background, matching the
app's `--tl-orange-500` and `--tl-bg` theme tokens.

## Convert to .ico for the Windows build

electron-builder reads `icon.ico` (Windows). The .ico must contain multiple
sizes (16, 32, 48, 64, 128, 256) for proper rendering across Explorer / Alt-Tab
/ taskbar / start menu.

### Option A: RealFaviconGenerator (web, no install)
1. Upload `icon.svg` to https://realfavicongenerator.net/
2. Settings: pick "Custom theme color #FAF7F2"; download the bundle
3. Extract; rename `favicon.ico` → `icon.ico`; place at `resources/icon.ico`

### Option B: ImageMagick (CLI, requires install)
```
magick convert icon.svg -define icon:auto-resize=16,32,48,64,128,256 resources/icon.ico
```

### Option C: png2ico
```
# First rasterize the SVG to PNGs at each size (Inkscape, rsvg-convert, etc.)
# Then combine into a multi-size .ico:
png2ico resources/icon.ico icon-16.png icon-32.png icon-48.png icon-64.png icon-128.png icon-256.png
```

## Why we don't commit the .ico

The .ico is build-time-generated. Committing it would couple the repo to one
generation tool's output. The SVG is the source of truth; the .ico is a build
artifact (gitignored, generated by `npm run build:unpack` post-conversion).

When `resources/icon.ico` is missing, electron-builder falls back to its
default Electron icon (a logged warning during build). v1.0 may ship without
the icon if the user hasn't run the conversion; v1.1 should make conversion
part of the build pipeline (e.g., a postinstall script using a node-side
SVG-to-ICO library that handles multi-size generation automatically).
```

- [ ] **Step 3: Gitignore the generated .ico**

If a `.gitignore` exists in repo root, add `resources/icon.ico` (uncommitted, build-generated). If not, skip — but document in icon-design.md.

- [ ] **Step 4: BrowserWindow uses icon**

Edit `src/main/index.ts`. The current BrowserWindow construction has no `icon` field. Add it conditionally:
```ts
import { existsSync } from 'node:fs'

const iconPath = join(app.getAppPath(), 'resources', 'icon.ico')
const mainWindow = new BrowserWindow({
  width: 1280,
  height: 800,
  minWidth: 900,
  minHeight: 600,
  ...(existsSync(iconPath) ? { icon: iconPath } : {}),
  show: false,
  // ... rest ...
})
```

If the icon doesn't exist (user hasn't run the conversion), the field is omitted — Electron uses defaults. No error.

- [ ] **Step 5: Commit**

```
git add resources/icon.svg resources/icon-design.md src/main/index.ts .gitignore
git commit -m "feat(phase-8b): app icon — SVG monogram source + manual .ico conversion docs; window uses .ico when present"
```

---

## Task 3: DB backup-on-migration

**Files:**
- Create: `src/main/db/migrations/backup.ts`
- Create: `src/main/__tests__/db/migration-backup.integration.test.ts`
- Modify: `src/main/db/migrations/runner.ts`

When a new migration version applies, copy the current DB file to `userData/backups/tokenless-pre-v{from}-to-v{to}-{timestamp}.db` BEFORE running the migration. Keep last 5 backups, prune older.

- [ ] **Step 1: Failing test**

Create `src/main/__tests__/db/migration-backup.integration.test.ts`. Cover:
- A backup file appears in the backup dir after a migration applies
- Existing backups are pruned when count exceeds 5
- No backup is created when no migration would apply (already at target version)

Use a real temp directory for the test (mkdtempSync). Construct the migration runner with the test directory.

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readdirSync, mkdtempSync, rmSync, copyFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { backupDb, pruneOldBackups } from '../../db/migrations/backup'

describe('db/migrations/backup', () => {
  let tmpDir: string
  let dbPath: string
  let backupsDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tl-backup-test-'))
    dbPath = join(tmpDir, 'tokenless.db')
    backupsDir = join(tmpDir, 'backups')
    writeFileSync(dbPath, 'fake-db-content')  // we're just testing the copy logic
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('backupDb copies the DB file with a versioned name', () => {
    backupDb(dbPath, backupsDir, 1, 2)
    const files = readdirSync(backupsDir)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^tokenless-pre-v1-to-v2-\d+\.db$/)
  })

  it('backupDb is a no-op when the source DB does not exist (first run)', () => {
    rmSync(dbPath)
    backupDb(dbPath, backupsDir, 1, 2)
    expect(existsSync(backupsDir)).toBe(false)  // no dir created
  })

  it('pruneOldBackups keeps the 5 most recent backups', async () => {
    for (let i = 1; i <= 7; i++) {
      backupDb(dbPath, backupsDir, i, i + 1)
      await new Promise((r) => setTimeout(r, 5))  // ensure distinct timestamps
    }
    pruneOldBackups(backupsDir, 5)
    const files = readdirSync(backupsDir)
    expect(files).toHaveLength(5)
  })

  it('pruneOldBackups is a no-op when there are fewer than the keep count', () => {
    backupDb(dbPath, backupsDir, 1, 2)
    backupDb(dbPath, backupsDir, 2, 3)
    pruneOldBackups(backupsDir, 5)
    expect(readdirSync(backupsDir)).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Implement**

Create `src/main/db/migrations/backup.ts`:
```ts
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

// Copy the DB file to a versioned backup path before applying migrations.
// No-op if the DB doesn't exist yet (first run — there's nothing to back up).
export function backupDb(dbPath: string, backupsDir: string, fromVersion: number, toVersion: number): void {
  if (!existsSync(dbPath)) return
  if (!existsSync(backupsDir)) mkdirSync(backupsDir, { recursive: true })
  const filename = `tokenless-pre-v${fromVersion}-to-v${toVersion}-${Date.now()}.db`
  copyFileSync(dbPath, join(backupsDir, filename))
}

// Keep the N most recent backups; delete older ones. Sorted by mtime descending.
export function pruneOldBackups(backupsDir: string, keepCount: number): void {
  if (!existsSync(backupsDir)) return
  const entries = readdirSync(backupsDir)
    .filter((f) => f.startsWith('tokenless-pre-') && f.endsWith('.db'))
    .map((f) => ({ name: f, mtime: statSync(join(backupsDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  for (const entry of entries.slice(keepCount)) {
    unlinkSync(join(backupsDir, entry.name))
  }
}
```

- [ ] **Step 3: Wire into runner**

Read `src/main/db/migrations/runner.ts`. The function loops through migrations and applies the unapplied ones. Wrap with a backup call BEFORE the first migration in the loop fires:

```ts
import { backupDb, pruneOldBackups } from './backup'

export function runMigrations(db: Database, migrations: readonly Migration[], opts?: { dbPath?: string; backupsDir?: string }): void {
  const applied = /* existing logic to read applied versions from migrations table */
  const pending = migrations.filter((m) => !applied.has(m.version))
  if (pending.length === 0) return

  // Backup BEFORE the first migration fires. Only when caller provides
  // dbPath + backupsDir (test setups may omit; production wires both).
  if (opts?.dbPath && opts?.backupsDir) {
    const fromVersion = /* highest applied version, or 0 */ applied.size > 0 ? Math.max(...applied) : 0
    const toVersion = pending[pending.length - 1].version
    backupDb(opts.dbPath, opts.backupsDir, fromVersion, toVersion)
    pruneOldBackups(opts.backupsDir, 5)
  }

  for (const m of pending) {
    // ... existing migration apply logic ...
  }
}
```

Edit `src/main/index.ts`. The current `runMigrations(db, MIGRATIONS)` call needs the new opts:
```ts
const userDataDir = app.getPath('userData')
const dbPath = join(userDataDir, 'tokenless.db')
const backupsDir = join(userDataDir, 'backups')
// ...
db = openDatabase(dbPath)
runMigrations(db, MIGRATIONS, { dbPath, backupsDir })
```

- [ ] **Step 4: Verify + commit**

```
npm run test:run -- src/main/__tests__/db/migration-backup.integration.test.ts
npm run typecheck
git add src/main/db/migrations/backup.ts src/main/db/migrations/runner.ts \
        src/main/__tests__/db/migration-backup.integration.test.ts \
        src/main/index.ts
git commit -m "feat(phase-8b): backup DB before migrations apply; keep last 5 backups under userData/backups/"
```

Expected: 4 new tests; full suite 365 + 4 = 369.

---

## Task 4: First-run privacy notice modal

**Files:**
- Create: `src/renderer/src/components/notifications/PrivacyNoticeModal.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/shared/types/settings-keys.ts` — add SETTING_PRIVACY_ACKNOWLEDGED

One-time modal that appears on first launch before the Onboarding wizard. Persists `privacy.acknowledged='1'` once dismissed; never appears again.

- [ ] **Step 1: Add settings key**

Edit `src/shared/types/settings-keys.ts`. Append:
```ts
export const SETTING_PRIVACY_ACKNOWLEDGED = 'privacy.acknowledged'
```

- [ ] **Step 2: Modal component**

Create `src/renderer/src/components/notifications/PrivacyNoticeModal.tsx`:
```tsx
import { useEffect, useRef } from 'react'

interface PrivacyNoticeModalProps {
  open: boolean
  onAcknowledge: () => void
}

export function PrivacyNoticeModal({ open, onAcknowledge }: PrivacyNoticeModalProps): JSX.Element | null {
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => buttonRef.current?.focus(), 0)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') onAcknowledge()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onAcknowledge])

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal privacy-notice"
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-notice-title"
      >
        <h2 id="privacy-notice-title" className="modal__title">Welcome to TokenLess</h2>
        <p className="privacy-notice__body">
          A heads-up about how TokenLess handles your data:
        </p>
        <ul className="privacy-notice__list">
          <li>
            <strong>Prompts:</strong> when you click <em>Gear</em>, your prompt is sent to
            Anthropic's API to be rewritten by Haiku. When you click <em>Send</em>, the prompt
            goes to claude code (which calls Anthropic). Nothing leaves your machine outside
            those calls.
          </li>
          <li>
            <strong>API key:</strong> stored in plaintext in the local database at
            <code> %APPDATA%/tokenless/tokenless.db</code> (see ADR-034). It never leaves
            your machine except in headers to Anthropic.
          </li>
          <li>
            <strong>Logs:</strong> all events stay local at <code>%APPDATA%/tokenless/logs/</code>.
            TokenLess does not send telemetry to any third party.
          </li>
        </ul>
        <p className="privacy-notice__body">
          You can review more details in the project's <code>docs/decisions.md</code>.
        </p>
        <div className="modal__actions">
          <button
            ref={buttonRef}
            type="button"
            className="btn btn--primary"
            onClick={onAcknowledge}
          >
            I understand
          </button>
        </div>
      </div>
    </div>
  )
}
```

Add styles to wherever `.modal-backdrop` lives (`src/renderer/src/components/layout/styles.css`):
```css
.privacy-notice { max-width: 540px; }
.privacy-notice__body { margin: 0 0 var(--tl-space-3) 0; line-height: var(--tl-leading-normal); }
.privacy-notice__list { margin: 0 0 var(--tl-space-3) var(--tl-space-4); padding: 0; }
.privacy-notice__list li { margin-bottom: var(--tl-space-2); line-height: var(--tl-leading-normal); }
.privacy-notice__list code { background: var(--tl-bg-mute); padding: 1px 4px; border-radius: 2px; font-size: var(--tl-text-sm); }
```

- [ ] **Step 3: Wire into App.tsx**

Read App.tsx. Add `privacy.acknowledged` check alongside the existing `onboarding.complete` check:
```ts
const [privacyOk, setPrivacyOk] = useState<boolean | null>(null)

useEffect(() => {
  void Promise.all([
    readSetting(SETTING_PRIVACY_ACKNOWLEDGED),
    readSetting(SETTING_ONBOARDING_COMPLETE)
  ]).then(([p, o]) => {
    setPrivacyOk(p === '1')
    setOnboardingDone(o === '1')
  })
}, [])

const handlePrivacyAck = async (): Promise<void> => {
  await writeSetting(SETTING_PRIVACY_ACKNOWLEDGED, '1')
  setPrivacyOk(true)
}

const showPrivacy = privacyOk === false
const showOnboarding = privacyOk === true && onboardingDone === false && view === 'shell'
```

In JSX:
```tsx
{showPrivacy && (
  <PrivacyNoticeModal
    open
    onAcknowledge={() => void handlePrivacyAck()}
  />
)}
{showOnboarding && (
  <OnboardingWizard onClose={() => setOnboardingDone(true)} />
)}
```

The privacy modal blocks the onboarding wizard from rendering until acknowledged.

- [ ] **Step 4: Verify + commit**

```
npm run typecheck
npm run test:run
git add src/renderer/src/components/notifications/PrivacyNoticeModal.tsx \
        src/renderer/src/components/layout/styles.css \
        src/renderer/src/App.tsx \
        src/shared/types/settings-keys.ts
git commit -m "feat(phase-8b): first-run privacy notice — shown once before Onboarding; persists privacy.acknowledged"
```

---

## Task 5: About dialog

**Files:**
- Create: `src/renderer/src/components/notifications/AboutDialog.tsx`
- Modify: `src/renderer/src/views/settings/SettingsView.tsx`

A small modal reachable from Settings' footer. Shows version (from package.json via preload), app name, attribution, link to GitHub.

- [ ] **Step 1: Expose version via preload**

The preload already has `version: '0.0.1'` hardcoded in the `api` object. That's stale. Phase 8B: read from `package.json` via `__APP_VERSION__` baked at build time.

Edit `electron.vite.config.ts` (or wherever Vite config lives). Add a `define` that bakes the version:
```ts
import packageJson from './package.json'

// in defineConfig:
define: {
  __APP_VERSION__: JSON.stringify(packageJson.version)
}
```

Add a global TypeScript declaration in `src/preload/index.d.ts` or a new `src/preload/globals.d.ts`:
```ts
declare const __APP_VERSION__: string
```

Edit `src/preload/index.ts`. Replace the hardcoded `version: '0.0.1'` with `version: __APP_VERSION__`.

- [ ] **Step 2: AboutDialog component**

Create `src/renderer/src/components/notifications/AboutDialog.tsx`:
```tsx
import { useEffect, useRef } from 'react'

interface AboutDialogProps {
  open: boolean
  onClose: () => void
}

export function AboutDialog({ open, onClose }: AboutDialogProps): JSX.Element | null {
  const closeRef = useRef<HTMLButtonElement>(null)
  const version = window.tokenless.version  // exposed in preload

  useEffect(() => {
    if (open) setTimeout(() => closeRef.current?.focus(), 0)
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

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal about-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="about-dialog-title" className="modal__title">About TokenLess</h2>
        <dl className="about-dialog__dl">
          <dt>Version</dt>
          <dd>{version}</dd>
          <dt>Platform</dt>
          <dd>Windows (ADR-002 — Windows-first; macOS/Linux deferred)</dd>
          <dt>License</dt>
          <dd>Private — personal use</dd>
        </dl>
        <p className="about-dialog__tagline">
          A token-optimizing wrapper around Claude Code. Built with Electron + React.
        </p>
        <div className="modal__actions">
          <button
            ref={closeRef}
            type="button"
            className="btn btn--primary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
```

Styles in `layout/styles.css`:
```css
.about-dialog { max-width: 420px; }
.about-dialog__dl { display: grid; grid-template-columns: 100px 1fr; gap: var(--tl-space-2); margin: var(--tl-space-3) 0; }
.about-dialog__dl dt { font-size: var(--tl-text-sm); color: var(--tl-mute); }
.about-dialog__dl dd { margin: 0; font-size: var(--tl-text-sm); }
.about-dialog__tagline { margin: var(--tl-space-3) 0; font-style: italic; color: var(--tl-mute); line-height: var(--tl-leading-normal); }
```

- [ ] **Step 3: Settings footer link**

Edit `src/renderer/src/views/settings/SettingsView.tsx`. Add an "About TokenLess" link button alongside (or near) the "Run onboarding again" button:
```ts
const [aboutOpen, setAboutOpen] = useState(false)

// in JSX, near the rerun-onboarding button:
<button type="button" className="settings-view__about-link" onClick={() => setAboutOpen(true)}>
  About TokenLess
</button>

<AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
```

Add styles for `.settings-view__about-link` (mirror `.settings-view__rerun-onboarding`).

- [ ] **Step 4: Verify + commit**

```
npm run typecheck
npm run test:run
git add electron.vite.config.ts \
        src/preload/index.ts src/preload/index.d.ts \
        src/renderer/src/components/notifications/AboutDialog.tsx \
        src/renderer/src/components/layout/styles.css \
        src/renderer/src/views/settings/SettingsView.tsx \
        src/renderer/src/views/settings/styles.css
git commit -m "feat(phase-8b): About dialog reachable from Settings footer; preload exposes baked __APP_VERSION__"
```

---

## Task 6: Crash reporter

**Files:**
- Create: `src/shared/ipc/crash.ts`
- Create: `src/shared/types/crash-report.ts`
- Create: `src/main/ipc/crash-handler.ts`
- Create: `src/main/__tests__/ipc/crash-handler.integration.test.ts`
- Create: `src/renderer/src/components/notifications/CrashReporterModal.tsx`
- Modify: `src/main/index.ts` — install uncaught handlers
- Modify: `src/main/ipc/index.ts` — register CrashHandler
- Modify: `src/renderer/src/observability/error-boundary.tsx` — ship crash to main + render modal
- Modify: `src/renderer/src/App.tsx` — mount CrashReporterModal globally

The flow:
1. Main process's `process.on('uncaughtException')` + `process.on('unhandledRejection')` catch errors. Logger logs as `fatal`. Then a `crash:show` broadcast is sent to all renderer windows with the error payload.
2. Renderer subscribes to `crash:show` and renders the CrashReporterModal.
3. Renderer's `AppErrorBoundary` catches React errors; instead of just logging, it ALSO triggers a local CrashReporterModal render (no IPC roundtrip — the error is in the renderer already).
4. The modal shows: error message + stack + 3 buttons:
   - **Copy report**: bundles `{ error, stack, last 100 log records, system info }` → clipboard via `navigator.clipboard.writeText(JSON.stringify(report))`
   - **Restart**: fires `crash:restart` IPC → main calls `app.relaunch(); app.exit(0)`
   - **Continue**: dismiss the modal (only safe for renderer-side errors caught by the boundary; main-side crashes can't be "continued")

- [ ] **Step 1: Shared types**

Create `src/shared/types/crash-report.ts`:
```ts
import type { LogRecord } from '../observability'

export interface CrashReport {
  readonly source: 'main' | 'renderer'
  readonly message: string
  readonly stack: string | null
  readonly timestamp: number
  // Snapshot of the most recent log records before the crash.
  readonly recentLogs: readonly LogRecord[]
  // Lightweight system info (no PII).
  readonly system: {
    readonly platform: string
    readonly electronVersion: string
    readonly nodeVersion: string
    readonly appVersion: string
  }
}
```

Create `src/shared/ipc/crash.ts`:
```ts
import type { CrashReport } from '../types/crash-report'
import type { IpcResult } from './envelope'

export const IPC_CRASH_SHOW = 'crash:show'      // main → renderer broadcast
export const IPC_CRASH_RESTART = 'crash:restart' // renderer → main invoke
export const IPC_CRASH_GET_REPORT = 'crash:get-report'  // renderer → main; main builds full report (with recent logs)

export interface CrashShowPayload { readonly report: CrashReport }

export interface CrashGetReportRequest {
  readonly source: 'main' | 'renderer'
  readonly message: string
  readonly stack: string | null
}
export interface CrashGetReportResponse { readonly report: CrashReport }

export interface CrashRestartResponse { readonly ok: true }

export type CrashGetReportResult = IpcResult<CrashGetReportResponse>
export type CrashRestartResult = IpcResult<CrashRestartResponse>
```

Re-export from `src/shared/ipc.ts` + add channels to `IpcChannelName`.

- [ ] **Step 2: Main process handler**

Create `src/main/ipc/crash-handler.ts`:
```ts
import { app } from 'electron'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'

import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'
import type { Broadcast } from './log-bridge'

import {
  IPC_CRASH_SHOW,
  IPC_CRASH_RESTART,
  IPC_CRASH_GET_REPORT,
  type CrashShowPayload,
  type CrashGetReportRequest,
  type CrashGetReportResult,
  type CrashRestartResult
} from '@shared/ipc/crash'
import type { CrashReport } from '@shared/types/crash-report'

declare const __APP_VERSION__: string

export class CrashHandler {
  private installedHandlers: string[] = []
  private uninstallUncaught: (() => void) | null = null

  constructor(
    private readonly logger: Logger,
    private readonly broadcast: Broadcast
  ) {}

  buildReport(input: CrashGetReportRequest): CrashReport {
    return {
      source: input.source,
      message: input.message,
      stack: input.stack,
      timestamp: Date.now(),
      recentLogs: this.logger.getRecent(100),
      system: {
        platform: process.platform,
        electronVersion: process.versions.electron ?? 'unknown',
        nodeVersion: process.versions.node ?? 'unknown',
        appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown'
      }
    }
  }

  getReport = async (req: CrashGetReportRequest): Promise<CrashGetReportResult> =>
    withIpcResult(this.logger, 'observability', 'crash-get-report', async () => ({
      report: this.buildReport(req)
    }))

  restart = async (): Promise<CrashRestartResult> =>
    withIpcResult(this.logger, 'observability', 'crash-restart', async () => {
      app.relaunch()
      app.exit(0)
      return { ok: true as const }
    })

  installUncaughtHandlers(): void {
    const onException = (err: Error): void => {
      this.logger.fatal('observability', 'uncaught-exception', err.message, {}, err.stack)
      const payload: CrashShowPayload = {
        report: this.buildReport({
          source: 'main',
          message: err.message,
          stack: err.stack ?? null
        })
      }
      this.broadcast(IPC_CRASH_SHOW, payload)
    }
    const onRejection = (reason: unknown): void => {
      const err = reason instanceof Error ? reason : new Error(String(reason))
      this.logger.fatal('observability', 'unhandled-rejection', err.message, {}, err.stack)
      const payload: CrashShowPayload = {
        report: this.buildReport({
          source: 'main',
          message: err.message,
          stack: err.stack ?? null
        })
      }
      this.broadcast(IPC_CRASH_SHOW, payload)
    }
    process.on('uncaughtException', onException)
    process.on('unhandledRejection', onRejection)
    this.uninstallUncaught = () => {
      process.off('uncaughtException', onException)
      process.off('unhandledRejection', onRejection)
    }
  }

  install(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_CRASH_GET_REPORT, async (_e: IpcMainInvokeEvent, req: CrashGetReportRequest) =>
      this.getReport(req)
    )
    this.installedHandlers.push(IPC_CRASH_GET_REPORT)
    ipcMain.handle(IPC_CRASH_RESTART, () => this.restart())
    this.installedHandlers.push(IPC_CRASH_RESTART)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
    if (this.uninstallUncaught) {
      this.uninstallUncaught()
      this.uninstallUncaught = null
    }
  }
}
```

Test (`src/main/__tests__/ipc/crash-handler.integration.test.ts`): verify `getReport` returns a report with the expected fields populated; verify `restart` returns ok. Skip testing the uncaught handlers (would require process state manipulation).

- [ ] **Step 3: Wire into main**

Edit `src/main/index.ts`. Already has `installUncaughtHandlers(logger)` — Phase 1's. Phase 8B replaces / supplements that with CrashHandler.installUncaughtHandlers (which not only logs but ALSO broadcasts to the renderer). Check what `installUncaughtHandlers(logger)` currently does — if it just logs, augment it; if it's redundant, replace it with the CrashHandler's version.

Edit `src/main/ipc/index.ts` to instantiate + install CrashHandler (similar to other handlers). The `installUncaughtHandlers()` method runs AFTER the IPC install so the broadcast can fire.

- [ ] **Step 4: Renderer modal**

Create `src/renderer/src/components/notifications/CrashReporterModal.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react'

import type { CrashReport } from '@shared/types/crash-report'

interface CrashReporterModalProps {
  open: boolean
  report: CrashReport | null
  // Only meaningful when the crash was caught in the renderer (boundary path).
  // Hidden for main-process crashes.
  allowContinue: boolean
  onContinue: () => void
}

export function CrashReporterModal({
  open, report, allowContinue, onContinue
}: CrashReporterModalProps): JSX.Element | null {
  const [copied, setCopied] = useState(false)
  const restartRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => restartRef.current?.focus(), 0)
  }, [open])

  if (!open || !report) return null

  const handleCopy = async (): Promise<void> => {
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRestart = (): void => {
    void window.tokenless.crash.restart()
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal crash-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crash-modal-title"
      >
        <h2 id="crash-modal-title" className="modal__title">Something went wrong</h2>
        <p className="crash-modal__source">{report.source === 'main' ? 'Main process crash' : 'Renderer error'}</p>
        <pre className="crash-modal__message">{report.message}</pre>
        {report.stack && <pre className="crash-modal__stack">{report.stack.slice(0, 800)}</pre>}
        <p className="crash-modal__hint">
          Click <strong>Copy report</strong> to bundle the error + the last 100 log records into your
          clipboard. Paste it into a GitHub issue or save it for later. No data is sent automatically.
        </p>
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={() => void handleCopy()}>
            {copied ? 'Copied ✓' : 'Copy report'}
          </button>
          {allowContinue && (
            <button type="button" className="btn btn--ghost" onClick={onContinue}>Continue</button>
          )}
          <button ref={restartRef} type="button" className="btn btn--primary" onClick={handleRestart}>
            Restart
          </button>
        </div>
      </div>
    </div>
  )
}
```

Add styles to `layout/styles.css`:
```css
.crash-modal { max-width: 600px; }
.crash-modal__source { font-size: var(--tl-text-sm); color: var(--tl-mute); margin: 0 0 var(--tl-space-2) 0; }
.crash-modal__message {
  background: var(--tl-error-bg);
  color: var(--tl-error);
  border: 1px solid var(--tl-error);
  border-radius: var(--tl-radius-sm);
  padding: var(--tl-space-2);
  margin: 0 0 var(--tl-space-2) 0;
  font-family: var(--tl-font-mono);
  font-size: var(--tl-text-sm);
  overflow-x: auto;
  white-space: pre-wrap;
}
.crash-modal__stack {
  background: var(--tl-bg-mute);
  border-radius: var(--tl-radius-sm);
  padding: var(--tl-space-2);
  margin: 0 0 var(--tl-space-3) 0;
  font-family: var(--tl-font-mono);
  font-size: var(--tl-text-xs);
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
}
.crash-modal__hint { font-size: var(--tl-text-sm); color: var(--tl-mute); margin: 0 0 var(--tl-space-3) 0; line-height: var(--tl-leading-normal); }
```

- [ ] **Step 5: Preload exposure for crash IPC**

Edit `src/preload/index.ts`. Add `crash` namespace:
```ts
crash: {
  getReport(req: CrashGetReportRequest): Promise<CrashGetReportResult> {
    return ipcRenderer.invoke(IPC_CRASH_GET_REPORT, req) as Promise<CrashGetReportResult>
  },
  restart(): Promise<CrashRestartResult> {
    return ipcRenderer.invoke(IPC_CRASH_RESTART) as Promise<CrashRestartResult>
  },
  onCrash(fn: (payload: CrashShowPayload) => void): () => void {
    const listener = (_e: unknown, payload: CrashShowPayload): void => fn(payload)
    ipcRenderer.on(IPC_CRASH_SHOW, listener as never)
    return () => ipcRenderer.removeListener(IPC_CRASH_SHOW, listener as never)
  }
}
```

Mirror in `.d.ts`.

- [ ] **Step 6: App.tsx mounts the modal globally**

```tsx
// in App.tsx AppContent or AppErrorBoundary:
const [crashReport, setCrashReport] = useState<CrashReport | null>(null)
const [crashAllowContinue, setCrashAllowContinue] = useState(false)

useEffect(() => {
  const unsub = window.tokenless.crash.onCrash(({ report }) => {
    setCrashReport(report)
    setCrashAllowContinue(false)  // main-process crash; no continuing
  })
  return unsub
}, [])

// ... in JSX, sibling of everything else:
<CrashReporterModal
  open={crashReport !== null}
  report={crashReport}
  allowContinue={crashAllowContinue}
  onContinue={() => { setCrashReport(null) }}
/>
```

For renderer-side errors (caught by AppErrorBoundary), the boundary's fallback UI should ALSO trigger the modal. Extend `error-boundary.tsx`:
```tsx
// In AppErrorBoundary's componentDidCatch:
componentDidCatch(error: Error, errorInfo: { componentStack: string }): void {
  void window.tokenless.crash.getReport({
    source: 'renderer',
    message: error.message,
    stack: error.stack ?? null
  }).then((r) => {
    if (r.ok) {
      // The boundary controls a separate report state; the modal is rendered
      // from App.tsx but populated via this path. Easier: render the modal
      // INSIDE the boundary's fallback UI directly. Pick whichever flows
      // best with the existing AppErrorBoundary code — read it first.
    }
  })
}
```

Read `src/renderer/src/observability/error-boundary.tsx` to see the current fallback. Integrate the CrashReporterModal as the fallback content (so a render error replaces the whole app with the modal):

```tsx
// Likely something like:
render() {
  if (this.state.error) {
    return <CrashReporterModal
      open
      report={this.state.report}
      allowContinue
      onContinue={() => this.setState({ error: null, report: null })}
    />
  }
  return this.props.children
}
```

The boundary's `componentDidCatch` fetches the full report from main + stores in state.

- [ ] **Step 7: Verify + commit**

```
npm run typecheck
npm run test:run
git add src/shared/ipc/crash.ts src/shared/types/crash-report.ts src/shared/ipc.ts \
        src/main/ipc/crash-handler.ts \
        src/main/__tests__/ipc/crash-handler.integration.test.ts \
        src/main/ipc/index.ts src/main/index.ts \
        src/preload/index.ts src/preload/index.d.ts \
        src/renderer/src/components/notifications/CrashReporterModal.tsx \
        src/renderer/src/components/layout/styles.css \
        src/renderer/src/observability/error-boundary.tsx \
        src/renderer/src/App.tsx
git commit -m "feat(phase-8b): crash reporter — uncaught/rejection in main + AppErrorBoundary in renderer surface a modal with copyable report"
```

Expected: 2-3 new handler tests; full suite +3.

---

## Task 7: GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

Triggers on tag pushes matching `v*`. Builds the unpacked app, zips it, attaches as a Release asset.

- [ ] **Step 1: Create workflow**

Create `.github/workflows/release.yml`:
```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: windows-latest
    permissions:
      contents: write  # to create the Release
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Rebuild native modules for Electron
        run: npm run rebuild:electron

      - name: Typecheck
        run: npm run typecheck

      - name: Unit + integration tests
        run: npm run test:run

      - name: Build renderer + main
        run: npm run build

      - name: E2E tests
        run: npm run test:e2e

      - name: Build unpacked app
        run: npm run build:unpack

      - name: Zip unpacked artifact
        run: |
          cd dist
          Compress-Archive -Path win-unpacked\* -DestinationPath TokenLess-${{ github.ref_name }}-win-x64.zip
        shell: pwsh

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: dist/TokenLess-${{ github.ref_name }}-win-x64.zip
          generate_release_notes: true
          draft: false
          prerelease: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Note the gates run BEFORE the artifact build — a tag with broken e2e WILL NOT create a Release. That's intentional.

- [ ] **Step 2: Verify the workflow syntax**

```
# Use the GitHub Actions VS Code extension to validate, or push to a feature
# branch first to test. Verify the workflow file parses.
```

The workflow can't be fully tested locally — it runs on GitHub. For Phase 8B verification: visual inspection + after `v1.0.0-phase-8b` is pushed, watch the workflow run.

- [ ] **Step 3: Commit**

```
git add .github/workflows/release.yml
git commit -m "feat(phase-8b): tag-triggered GitHub Actions release workflow — zips dist/win-unpacked to Release asset"
```

---

## Task 8: ADR-042 + README + docs sweep

**Files:**
- Modify: `docs/decisions.md` — ADR-042
- Modify: `docs/observability.md`
- Modify: `docs/test-scenarios.md`
- Create or modify: `README.md` — distribution + icon conversion instructions

### ADR-042 — Phase 8B release strategy

Cover:
1. Unpacked-only for v1.0 (no installer, no signing, no auto-update)
2. Icon as SVG-with-manual-conversion (commit binary later)
3. DB backup-on-migration: last 5 kept, pruned by mtime
4. Crash reporter: copy-to-clipboard only (no telemetry server)
5. Privacy notice: one-time, before onboarding
6. GitHub Actions release workflow: tag-triggered, gated on all CI checks

### README.md

```markdown
# TokenLess

A Windows-first Electron desktop app that sits between you and Claude.
Rewrites prompts via Haiku ("gearing") to reduce token waste, and hosts
Claude Code in an embedded terminal.

## Running locally (development)

```
npm install
npm run dev
```

Hot reload + iteration. Native modules built for the local Node ABI.

## Running locally (stable build)

For day-to-day use without `npm run dev`:

```
npm run rebuild:electron
npm run build:unpack
```

The built app lives at `dist/win-unpacked/TokenLess.exe`. Create a desktop
shortcut to that path. Rebuild with `npm run build:unpack` whenever you want
a new stable.

## App icon

The `.ico` is build-time-generated and gitignored. Convert `resources/icon.svg`
to `resources/icon.ico` once:

```
# Pick one tool — see resources/icon-design.md for options
magick convert resources/icon.svg -define icon:auto-resize=16,32,48,64,128,256 resources/icon.ico
```

If `resources/icon.ico` is absent, electron-builder falls back to the default
Electron icon during `build:unpack`.

## Tests

```
npm run typecheck
npm run test:run     # unit + integration (vitest)
npm run test:e2e     # Playwright + Electron
```

## Releases

Tag pushes (`v*`) trigger a GitHub Actions workflow that builds the unpacked
app, zips it, and uploads to GitHub Releases. See `.github/workflows/release.yml`.

## Docs

- `docs/superpowers/specs/2026-05-13-tokenless-v1-design.md` — full design spec
- `docs/decisions.md` — ADRs
- `docs/observability.md` — Logger categories + events
- `docs/test-scenarios.md` — manual verification scenarios
```

### Observability extension

Add to `db`: `migration-backup-created`, `migration-backup-pruned`.
Add to `observability`: `uncaught-exception` (fatal), `unhandled-rejection` (fatal), `crash-get-report`, `crash-restart`.

### Test scenarios

Append S-8B.1 through S-8B.10:
- S-8B.1 build:unpack produces a runnable .exe
- S-8B.2 .ico fallback when file is absent (Electron default appears in taskbar)
- S-8B.3 .ico applies when file is present (custom icon in taskbar)
- S-8B.4 Privacy notice appears on first launch, blocks Onboarding until ack'd
- S-8B.5 Privacy notice doesn't reappear after ack
- S-8B.6 About dialog from Settings shows version
- S-8B.7 DB backup created when a new migration applies
- S-8B.8 Old DB backups pruned after 5+ exist
- S-8B.9 Crash reporter modal appears when main-process throws
- S-8B.10 Crash report Copy button writes JSON to clipboard
- S-8B.11 Release workflow runs all gates + uploads zip on tag push (CI verification)

Commit:
```
git add docs/decisions.md docs/observability.md docs/test-scenarios.md README.md
git commit -m "docs(phase-8b): ADR-042 + README + Phase 8B scenarios"
```

---

## Task 9: Verification + tag v1.0.0-phase-8b

- [ ] **Step 1: Verification**

```
npm run rebuild:node
npm run typecheck
npm run test:run

npm run rebuild:electron
npm run build
npm run test:e2e
npm run build:unpack    # verify .exe produced

npm run rebuild:node
```

Expected: 365 (Phase 8A) + 4 migration-backup + 2 crash-handler = ~371 tests.

- [ ] **Step 2: Tag**

```
git tag -s -a v1.0.0-phase-8b -m "Phase 8B / v1.0 — release prep complete (build:unpack + icon + About + DB backup + privacy + crash reporter + Release workflow)"
git rev-parse v1.0.0-phase-8b^{commit}
```

This is the **v1.0** tag. The phase suffix preserves the project's per-phase tagging convention; the `v1.0.0` major bump marks the milestone.

---

## Self-Review Checklist

- [ ] **Plan exit-state vs spec:**
  - `npm run build:unpack` produces a runnable TokenLess.exe ✓
  - App icon SVG present + .ico path wired ✓
  - DB backup-on-migration with prune ✓
  - First-run privacy notice before onboarding ✓
  - About dialog accessible from Settings ✓
  - Crash reporter modal for main + renderer errors with Copy/Restart ✓
  - GitHub Actions release workflow triggers on `v*` tags ✓
  - README explains development + stable build + icon conversion ✓

- [ ] **CLAUDE.md cornerstones:**
  - All new error paths through Logger
  - No silent catches (the crash handlers log fatal first, then surface)

- [ ] **TypeScript strict clean**
- [ ] **No console.*** outside tests

---

## Exit State

**Visible to user:**
- First launch on a fresh `%APPDATA%/tokenless/` shows the privacy notice modal first, then the onboarding wizard
- Settings → "About TokenLess" footer link → small dialog with version + attribution
- Crash reporter modal appears if either the main process or React rendering errors out — with Copy report (clipboard) + Restart options
- Building stable: `npm run build:unpack` → `dist/win-unpacked/TokenLess.exe` → desktop shortcut
- App icon shows in taskbar / Alt-Tab if user converted `resources/icon.svg` → `resources/icon.ico`

**Under the hood:**
- electron-builder config in package.json (productName, appId, asar layout, win:dir target)
- DB backup written to `userData/backups/` before any migration applies; pruned to last 5 by mtime
- CrashHandler installs `uncaughtException` + `unhandledRejection` in main; broadcasts `crash:show` to renderer; renderer's AppErrorBoundary uses the same modal for React errors
- Preload exposes `crash.{getReport, restart, onCrash}` + `version` (baked from package.json via Vite define)
- GitHub Actions release workflow at `.github/workflows/release.yml` runs all CI gates + builds unpacked + zips + attaches to Release on `v*` tag push

**Deferred to v1.1+:**
- NSIS / MSIX installer (`build:win` script + nsis config remain, just unused)
- Code signing (cert TBD)
- Auto-update via electron-updater
- macOS / Linux targets (ADR-002)
- §7 output-pattern detection (resume/quota/auth-expired)

**Tag:** `v1.0.0-phase-8b` — **TokenLess v1.0.**
