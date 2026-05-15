# Phase 8A: Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the v1-critical UX polish that lives between "every feature works" and "this app feels finished." Phase 8B handles release packaging; Phase 8A handles everything that affects how the app behaves to a user. Scope: full Settings page, full Onboarding wizard, terminal copy + keystroke pass-through (so Y/N prompts no longer require ungeared sends), Dev Mode backfill, persistent CostPreview, pricing consolidation, popover outside-click, modal focus management, logs path normalization, AI error analysis (§6.5). All confirmed in the scope conversation with the user.

**Architecture:** No architectural changes — Phase 8A operates within the patterns established in Phases 1-7. A few cross-cutting plumbing pieces:
- Logs move from `~/.tokenless/logs/` to `app.getPath('userData')/logs/` (Electron convention; lives next to the DB at `%APPDATA%/tokenless/`).
- A new `cc:input` IPC writes raw bytes to the PTY without a turn-table write (separate from `cc:send` which creates a turn row). This unlocks terminal keystroke pass-through for confirmation prompts.
- A new `pricing:list` IPC exposes the main-process pricing table to the renderer, replacing the duplicate hardcoded table in `useLiveCostEstimate` and the `MOCK_MODELS` dropdown.
- Settings UI uses the existing `settings(key, value)` table (Phase 6B) for new keys: `gearing.defaultModel`, `gearing.defaultBreadth`, `gearing.defaultFormat`, `gearing.sendConfirm`, `ui.devMode`.

**Out of scope for Phase 8A (→ Phase 8B):**
- Crash reporter modal (Phase 8B per user request)
- electron-builder + installer + signing + auto-update (Phase 8B; deferred to v1.1)
- App icon, About dialog, DB backup-on-migration, GitHub Actions release workflow (Phase 8B)

**Out of scope for v1 entirely:**
- §7.1 output-pattern detection (resume-fails / quota / auth-expired) — v1.1
- Theme switching (light/dark) — v1.1 polish
- Layout toggle (notebook ↔ IDE) — v1.4 backlog per spec

---

## File Structure

**New files (main):**
- `src/main/ipc/pricing-handler.ts` + tests — exposes the main-process pricing table to the renderer
- `src/shared/ipc/pricing.ts` — channel + types
- `src/shared/types/settings-keys.ts` — typed constants for the new settings keys (`SETTING_GEARING_DEFAULT_MODEL`, etc.)

**New files (renderer):**
- `src/renderer/src/views/settings/SettingsView.tsx` — the `/settings` route container
- `src/renderer/src/views/settings/AccountsSection.tsx`
- `src/renderer/src/views/settings/GearingDefaultsSection.tsx`
- `src/renderer/src/views/settings/SendConfirmToggle.tsx`
- `src/renderer/src/views/settings/TelemetrySection.tsx` — embeds the existing popover content as a section
- `src/renderer/src/views/settings/DevModeToggle.tsx`
- `src/renderer/src/views/settings/PathsSection.tsx` — shows log + DB paths (read-only)
- `src/renderer/src/views/settings/styles.css`
- `src/renderer/src/views/onboarding/OnboardingWizard.tsx` — multi-step wizard container
- `src/renderer/src/views/onboarding/StepWelcome.tsx`
- `src/renderer/src/views/onboarding/StepApiKey.tsx`
- `src/renderer/src/views/onboarding/StepFirstProject.tsx`
- `src/renderer/src/views/onboarding/StepDone.tsx`
- `src/renderer/src/views/onboarding/styles.css`
- `src/renderer/src/hooks/use-pricing.ts` — fetches the pricing table on mount; replaces hardcoded MODEL/PRICE constants
- `src/renderer/src/hooks/use-outside-click.ts` — generic ref-based outside-click hook

**Modified files (main):**
- `src/main/index.ts` — log path: `homedir() + '.tokenless/logs'` → `app.getPath('userData') + 'logs'`; BrowserWindow gets `minWidth`/`minHeight`; remember window size to settings table
- `src/main/ipc/cc-handler.ts` — add `input` method (raw PTY write, no turn write); add `IPC_CC_INPUT` to install
- `src/main/cc/lifecycle.ts` — `write` method already exists; expose it via cc-handler.input
- `src/main/ipc/index.ts` — register PricingHandler
- `src/main/api/pricing.ts` — export the PRICING record + `Pricing` type for IPC

**Modified files (shared):**
- `src/shared/ipc/cc.ts` — add `IPC_CC_INPUT` + types
- `src/shared/ipc.ts` — re-export + extend `IpcChannelName`

**Modified files (renderer):**
- `src/preload/index.ts` + `index.d.ts` — expose `cc.input` + `pricing.list`
- `src/renderer/src/App.tsx` — route between AppShell + SettingsView; show OnboardingWizard on first-run when no projects exist (replaces the current empty-state-only path)
- `src/renderer/src/components/layout/SettingsButton.tsx` — actually opens Settings (currently stub)
- `src/renderer/src/components/terminal/TerminalPane.tsx` — wire `term.onData` → `cc.input`; wire `Ctrl+Shift+C` copy keybinding via `attachCustomKeyEventHandler`; enable right-click → Copy menu
- `src/renderer/src/components/composer/Composer.tsx` — persistent CostPreview state (`lastCostPreview` survives clearing `gearState`); fix stale-prompt closure in toast action
- `src/renderer/src/hooks/use-live-cost-estimate.ts` — consume `usePricing()` instead of hardcoded table
- `src/renderer/src/mocks/dropdown-options.ts` — delete `MOCK_MODELS`
- `src/renderer/src/components/composer/Composer.tsx` (or wherever models dropdown is built) — use `usePricing()` data
- `src/renderer/src/components/layout/TelemetryPill.tsx` + `TelemetrySummaryPopover.tsx` — use `useOutsideClick` to close on outside click
- `src/renderer/src/components/composer/Composer.tsx` (TemplatePicker section) — same
- `src/renderer/src/components/notifications/AuthMissingModal.tsx` + `ClaudeNotFoundModal.tsx` — focus management (autoFocus on Dismiss + Escape listener)
- `src/renderer/src/views/dev-mode/DevModePanel.tsx` — verify/fix backfill behavior; add "Analyze with AI" button on error rows
- `src/renderer/src/views/dev-mode/LogTableRow.tsx` (or LogDetail) — render Analyze button + handle result
- `docs/decisions.md` — ADR-041
- `docs/observability.md` — extend rows
- `docs/test-scenarios.md` — Phase 8A scenarios

---

## Task 1: Logs path normalization + window minimum size

**Files:**
- Modify: `src/main/index.ts`

Two small fixes in the same file. Logs go to `app.getPath('userData')/logs/`; BrowserWindow gets `minWidth: 900, minHeight: 600` so users can't shrink past usable size.

- [ ] **Step 1: Log path**

Edit `src/main/index.ts`. Replace the current log dir derivation:
```ts
// OLD: const logDir = join(homedir(), '.tokenless', 'logs')
// NEW (after app.whenReady so app.getPath is safe):
//   Move the logger init INTO app.whenReady() since app.getPath requires it.
```

Actually `app.getPath` isn't ready until after `app.whenReady()`. The current code creates the logger BEFORE `whenReady()` so it can capture early errors. Two options:

**A**: Keep the early init at `homedir() + '.tokenless/logs'` for the boot-time logger; then create a SECOND logger inside `whenReady()` rooted at userData and migrate. Ugly.

**B**: Use the synchronous `app.getPath('userData')` from electron's app module — actually `app.getPath` CAN be called pre-whenReady on Windows since `userData` resolves from `%APPDATA%` immediately. Let's verify by reading electron docs: `userData` is computed at app construction time, not at `whenReady` — so `app.getPath('userData')` works as soon as `import { app } from 'electron'` resolves.

**Go with B**. Replace:
```ts
import { homedir } from 'node:os'
const logDir = join(homedir(), '.tokenless', 'logs')
```
with:
```ts
const logDir = join(app.getPath('userData'), 'logs')
```

Remove the `homedir` import if it's no longer used. Update the comment:
```ts
// Initialize the Logger as early as possible so even early-startup errors
// can be captured. Log files live under `<userData>/logs/` (next to the DB).
```

- [ ] **Step 2: Window minimums**

Same file, edit the BrowserWindow construction:
```ts
const mainWindow = new BrowserWindow({
  width: 1280,
  height: 800,
  minWidth: 900,
  minHeight: 600,
  show: false,
  // ... existing options ...
})
```

- [ ] **Step 3: Verify**

```
npm run typecheck
npm run test:run
```

Existing observability tests use a vi.fn'd file sink — they don't touch the real path. No new test required for the path change. The window minimum is a runtime config — manual verification by dragging window edges.

- [ ] **Step 4: Commit**

```
git add src/main/index.ts
git commit -m "fix(phase-8a): logs move to userData/logs/; window enforces 900x600 minimum"
```

---

## Task 2: Terminal keystroke pass-through (cc:input IPC)

**Files:**
- Modify: `src/shared/ipc/cc.ts` — add `IPC_CC_INPUT` + request/response
- Modify: `src/shared/ipc.ts` — re-export + union
- Modify: `src/main/ipc/cc-handler.ts` — `input` method
- Modify: `src/main/__tests__/ipc/cc-handler.integration.test.ts` — tests
- Modify: `src/preload/index.ts` + `index.d.ts` — expose `cc.input`
- Modify: `src/renderer/src/components/terminal/TerminalPane.tsx` — wire `term.onData`

The renderer's xterm currently DOESN'T pipe keystrokes anywhere — keystrokes the user types into the terminal pane are swallowed (or only handled by xterm's local cursor logic). Phase 8A wires `term.onData(d => cc.input({conversationId, data: d}))` so claude's interactive prompts (Y/N etc.) work.

`cc:input` differs from `cc:send`:
- `cc:send` writes a `turns` row + bumps `conversations.updated_at` + clears drafts. Used for full prompts.
- `cc:input` just writes raw bytes to the PTY. No turn capture (raw keystrokes aren't turns). No draft clearing.

- [ ] **Step 1: Shared IPC types**

Edit `src/shared/ipc/cc.ts`. Add at the end:
```ts
export const IPC_CC_INPUT = 'cc:input'

export interface CcInputRequest {
  readonly conversationId: number
  // Raw bytes (typically a single keystroke from xterm.onData; for paste it
  // can be a longer string). No newline appended — xterm sends \r when the
  // user presses Enter.
  readonly data: string
}
export interface CcInputResponse {
  readonly ok: true
}
export type CcInputResult = IpcResult<CcInputResponse>
```

- [ ] **Step 2: Re-export from `src/shared/ipc.ts`**

Extend the existing `cc` re-export block + add `'cc:input'` to `IpcChannelName`.

- [ ] **Step 3: Handler test**

Append to `src/main/__tests__/ipc/cc-handler.integration.test.ts`:
```ts
it('input writes raw bytes to the PTY without a turn-table write', async () => {
  // Start a conversation + PTY (mirror existing send tests)
  // Call handler.input({ conversationId, data: 'y\r' })
  // Verify: pty mock received 'y\r' BUT no new row appeared in turns table
})

it('input returns NOT_FOUND when there is no active PTY for the conversation', async () => {
  const r = await handler.input({ conversationId: 99999, data: 'y' })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.error.code).toBe('NOT_FOUND')
})
```

Use the existing send-test setup helpers — start a conversation via `handler.start`, then assert.

- [ ] **Step 4: Implement handler**

Edit `src/main/ipc/cc-handler.ts`. Add:
```ts
input = async (req: CcInputRequest): Promise<CcInputResult> =>
  withIpcResult(this.logger, 'cc', 'cc-input', async () => {
    const handle = this.lifecycle.get(req.conversationId)
    if (!handle) {
      const e = new Error(`no active PTY for conversation ${req.conversationId}`) as Error & { code?: string }
      e.code = 'NOT_FOUND'
      throw e
    }
    this.lifecycle.write(req.conversationId, req.data)
    return { ok: true as const }
  })
```

Wire into `install(ipcMain)`:
```ts
ipcMain.handle(IPC_CC_INPUT, async (_e: IpcMainInvokeEvent, req: CcInputRequest) => this.input(req))
this.installedHandlers.push(IPC_CC_INPUT)
```

Add the imports (`IPC_CC_INPUT`, `CcInputRequest`, `CcInputResult`).

- [ ] **Step 5: Preload**

Edit `src/preload/index.ts`. Add to imports + extend the `cc:` namespace:
```ts
cc: {
  // ... existing methods ...
  input(req: CcInputRequest): Promise<CcInputResult> {
    return ipcRenderer.invoke(IPC_CC_INPUT, req) as Promise<CcInputResult>
  },
  // ... rest ...
}
```

Mirror in `src/preload/index.d.ts`.

- [ ] **Step 6: Wire xterm.onData**

Edit `src/renderer/src/components/terminal/TerminalPane.tsx`. Find where the `Terminal` instance is created. Add:
```ts
const dataDisposable = term.onData((data) => {
  if (conversationId === null) return
  void window.tokenless.cc.input({ conversationId, data })
})
// On cleanup:
return () => {
  dataDisposable.dispose()
  // ... other cleanup ...
}
```

The exact placement depends on the existing useEffect structure — read the file first and integrate carefully. The `onData` returns an `IDisposable` that MUST be disposed on cleanup to avoid leaking listeners across remounts.

- [ ] **Step 7: Verify + commit**

```
npm run test:run
npm run typecheck
git add src/shared/ipc/cc.ts src/shared/ipc.ts \
        src/main/ipc/cc-handler.ts src/main/__tests__/ipc/cc-handler.integration.test.ts \
        src/preload/index.ts src/preload/index.d.ts \
        src/renderer/src/components/terminal/TerminalPane.tsx
git commit -m "feat(phase-8a): cc:input IPC for raw keystroke pass-through; xterm.onData routes through it"
```

Expected: +2 tests (~358).

---

## Task 3: Terminal copy — Ctrl+Shift+C + right-click

**Files:**
- Modify: `src/renderer/src/components/terminal/TerminalPane.tsx`

Standard terminal convention: `Ctrl+Shift+C` copies the current selection (since `Ctrl+C` sends SIGINT to claude). Right-click → "Copy" menu via xterm.

- [ ] **Step 1: Attach custom key handler**

In `TerminalPane.tsx`'s xterm setup (after `term.open(...)`):
```ts
term.attachCustomKeyEventHandler((event) => {
  // Ctrl+Shift+C: copy selection to clipboard
  if (event.type === 'keydown' && event.ctrlKey && event.shiftKey && event.key === 'C') {
    const selection = term.getSelection()
    if (selection) {
      void navigator.clipboard.writeText(selection)
    }
    return false  // prevent xterm from processing this key
  }
  return true  // let xterm process everything else normally
})
```

- [ ] **Step 2: Right-click → copy**

xterm.js doesn't ship a context menu. Build a small one inline:
```tsx
const handleContextMenu = (e: React.MouseEvent): void => {
  const selection = term.getSelection()
  if (!selection) return
  e.preventDefault()
  void navigator.clipboard.writeText(selection)
  // Optional: flash a "Copied" toast via pushToast
}
```

Wrap the xterm host div with `onContextMenu={handleContextMenu}`. The `term` reference needs to be accessible from the handler — store it in a ref.

For UX: if no selection, the right-click should still pop the OS default menu (so users can right-click empty space without weirdness). The `if (!selection) return` early-out preserves that.

- [ ] **Step 3: Verify (manual)**

Launch dev, send a prompt, drag-select some response text, press Ctrl+Shift+C, paste into another app. Verify the text arrived. Repeat with right-click.

- [ ] **Step 4: Commit**

```
git add src/renderer/src/components/terminal/TerminalPane.tsx
git commit -m "feat(phase-8a): terminal copy — Ctrl+Shift+C + right-click → clipboard"
```

---

## Task 4: Dev Mode log backfill investigation + fix

**Files:**
- Modify: `src/renderer/src/views/dev-mode/use-log-records.ts` (likely)
- Modify: `src/renderer/src/views/dev-mode/LogTable.tsx` (sort)

The user reports Dev Mode shows logs only from "open onward." The hook ALREADY calls `getRecent(1000)` on mount — so backfill SHOULD work. Investigation:

- [ ] **Step 1: Reproduce + diagnose**

Run the app, log a few records (any user action), wait, open Dev Mode. Check if backfill arrives. Likely candidates for the gap:

a) **The backfilled records arrive AFTER live records visually because of array push order.** If the user opens Dev Mode after some live records have already been ingested (e.g., from the toggle's own log event), the live records appear first; the backfill `push`-es to the end of the array. If the LogTable sorts by timestamp DESC, the backfill (older records) appears AT THE BOTTOM and the user sees only "new" records at the top until they scroll.

b) **The records ARE arriving but the filter state hides them.** Less likely if filters default to all-on.

c) **The `getRecent` resolves AFTER the user has interacted with filters.** Race condition.

The most likely cause is (a). Fix: sort `records` by `ts ASC` (oldest first) at the hook OR the table level, so the chronological backfill appears in the right order.

Read `src/renderer/src/views/dev-mode/LogTable.tsx` to confirm current sort behavior. If it's "as-arrived" or "ts DESC", change to "ts DESC" (newest at top) AND ensure backfill is interleaved correctly.

- [ ] **Step 2: Fix sort + dedup**

The fix (regardless of which root cause): make the records list ALWAYS sort by `ts` (DESC for newest-on-top display) at render time. This way, whether backfill arrives first or last, the visual order is timestamp-ordered.

Edit `LogTable.tsx`. If it currently renders `records` directly, change to:
```ts
const sorted = useMemo(() => [...records].sort((a, b) => b.ts - a.ts), [records])
// then render `sorted` instead of `records`
```

- [ ] **Step 3: Also: bump backfill count from 1000 → 5000**

The ring buffer holds 5000 records. The current `getRecent(1000)` artificially caps at 1000. Edit `useLogRecords`:
```ts
void window.tokenless.log.getRecent(5000).then(...)
```

- [ ] **Step 4: Manual verify**

Restart the app. Click around for ~30s (generates ui logs). Open Dev Mode. Verify the list shows logs from app boot onward, sorted newest-first.

- [ ] **Step 5: Commit**

```
git add src/renderer/src/views/dev-mode/use-log-records.ts \
        src/renderer/src/views/dev-mode/LogTable.tsx
git commit -m "fix(phase-8a): Dev Mode log table sorts ts DESC; backfill raised to 5000 records"
```

---

## Task 5: Pricing IPC + consolidate hardcoded pricing in renderer

**Files:**
- Modify: `src/main/api/pricing.ts` — ensure `PRICING` record exported
- Create: `src/shared/ipc/pricing.ts`
- Modify: `src/shared/ipc.ts`
- Create: `src/main/ipc/pricing-handler.ts`
- Create: `src/main/__tests__/ipc/pricing-handler.integration.test.ts`
- Modify: `src/main/ipc/index.ts` — register
- Modify: `src/preload/index.ts` + `index.d.ts` — expose `pricing.list`
- Create: `src/renderer/src/hooks/use-pricing.ts`
- Modify: `src/renderer/src/hooks/use-live-cost-estimate.ts` — consume usePricing
- Modify: `src/renderer/src/mocks/dropdown-options.ts` — delete `MOCK_MODELS`
- Modify: `src/renderer/src/components/composer/Composer.tsx` (or ConfigsRow) — use usePricing-derived items

Eliminates the duplicate pricing table flagged in the backlog.

- [ ] **Step 1: Shared type + IPC**

Create `src/shared/ipc/pricing.ts`:
```ts
import type { IpcResult } from './envelope'

export interface PricingEntry {
  readonly key: string              // 'haiku' | 'sonnet' | 'opus'
  readonly apiModel: string         // e.g. 'claude-sonnet-4-6'
  readonly displayName: string      // 'Sonnet 4.6'
  readonly description?: string     // 'balanced', 'fastest · cheapest'
  readonly inputPerMillion: number
  readonly outputPerMillion: number
}

export const IPC_PRICING_LIST = 'pricing:list'
export interface PricingListResponse { readonly entries: readonly PricingEntry[] }
export type PricingListResult = IpcResult<PricingListResponse>
```

Re-export from `src/shared/ipc.ts` + add `'pricing:list'` to `IpcChannelName`.

- [ ] **Step 2: Pricing handler**

Create `src/main/ipc/pricing-handler.ts`. Construct with `(logger, pricingProvider: () => readonly PricingEntry[])` so tests inject a fake. The provider reads `PRICING` from `src/main/api/pricing.ts` and adapts each entry into `PricingEntry`. Implement the single `list` method wrapped in `withIpcResult` with category `'api'` (pricing data is API-adjacent).

Read `src/main/api/pricing.ts` to confirm the current `PRICING` export shape. If it's already keyed by 'haiku'/'sonnet'/'opus' with the right fields, the adapter is a single `Object.entries(PRICING).map(...)`. Add a `description` field to the PRICING record if it isn't there yet (e.g. `'fastest · cheapest'` for haiku, `'balanced'` for sonnet, `'most capable'` for opus) — those strings currently live in `MOCK_MODELS`.

Test (`src/main/__tests__/ipc/pricing-handler.integration.test.ts`) covers: list returns ok with the expected number of entries; entries include the documented fields.

- [ ] **Step 3: Register in `src/main/ipc/index.ts`**

Standard handler registration pattern. Add to `IpcRegistration` interface, instantiate after another handler, add to returned object + `uninstallAll`.

- [ ] **Step 4: Preload**

Expose `pricing.list(): Promise<PricingListResult>`. Mirror in `.d.ts`.

- [ ] **Step 5: usePricing hook**

Create `src/renderer/src/hooks/use-pricing.ts`:
```ts
import { useEffect, useState } from 'react'

import type { PricingEntry } from '@shared/ipc/pricing'

export function usePricing(): readonly PricingEntry[] {
  const [entries, setEntries] = useState<readonly PricingEntry[]>([])
  useEffect(() => {
    let cancelled = false
    void window.tokenless.pricing.list().then((r) => {
      if (!cancelled && r.ok) setEntries(r.data.entries)
    })
    return () => { cancelled = true }
  }, [])
  return entries
}
```

- [ ] **Step 6: Replace MOCK_MODELS consumers**

Find the Composer's models dropdown (`MOCK_MODELS` consumer). Replace with:
```ts
const pricing = usePricing()
const modelItems: readonly DropdownItem[] = pricing.map((p) => ({
  value: p.key,
  label: p.displayName,
  description: p.description ?? ''
}))
```

Delete `MOCK_MODELS` from `src/renderer/src/mocks/dropdown-options.ts`.

- [ ] **Step 7: Replace useLiveCostEstimate's hardcoded table**

Edit `src/renderer/src/hooks/use-live-cost-estimate.ts`. It has its own copy of model→pricing. Replace with `usePricing()` lookup. If the hook needs the data synchronously (it computes on every keystroke), the empty-array initial state would cause $0.00 estimates before pricing loads — which is acceptable (it's a brief moment + the user sees `—` for cost in the toast). Document this in a brief comment.

- [ ] **Step 8: Verify + commit**

```
npm run typecheck
npm run test:run
git add src/main/api/pricing.ts \
        src/shared/ipc/pricing.ts src/shared/ipc.ts \
        src/main/ipc/pricing-handler.ts \
        src/main/__tests__/ipc/pricing-handler.integration.test.ts \
        src/main/ipc/index.ts \
        src/preload/index.ts src/preload/index.d.ts \
        src/renderer/src/hooks/use-pricing.ts \
        src/renderer/src/hooks/use-live-cost-estimate.ts \
        src/renderer/src/mocks/dropdown-options.ts \
        src/renderer/src/components/composer/Composer.tsx
git commit -m "feat(phase-8a): pricing:list IPC + usePricing hook; renderer no longer hardcodes models or prices"
```

---

## Task 6: Outside-click closes popovers

**Files:**
- Create: `src/renderer/src/hooks/use-outside-click.ts`
- Modify: `src/renderer/src/components/layout/TelemetryPill.tsx`
- Modify: `src/renderer/src/components/composer/Composer.tsx` (TemplatePicker)

A generic hook + apply to the two existing popovers (TemplatePickerPopover, TelemetrySummaryPopover). Other popovers (Dropdown, ConfirmModal) already have appropriate dismiss behavior.

- [ ] **Step 1: Hook**

Create `src/renderer/src/hooks/use-outside-click.ts`:
```ts
import { useEffect, useRef, type RefObject } from 'react'

// Attaches a mousedown listener on document. When the user clicks outside
// the ref's element, calls `onOutside`. No-op when the ref isn't attached
// or when `enabled` is false (useful for toggling without re-running hooks).
export function useOutsideClick<T extends HTMLElement>(enabled: boolean, onOutside: () => void): RefObject<T> {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!enabled) return undefined
    const handler = (e: MouseEvent): void => {
      const el = ref.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) onOutside()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [enabled, onOutside])
  return ref
}
```

- [ ] **Step 2: Apply to TelemetryPill**

The host div `.telemetry-pill-host` contains both the button and the popover. Use the hook to detect clicks outside the host:
```tsx
const popoverRef = useOutsideClick<HTMLDivElement>(open, () => setOpen(false))

return (
  <div className="telemetry-pill-host" ref={popoverRef}>
    {/* ... existing content ... */}
  </div>
)
```

- [ ] **Step 3: Apply to TemplatePicker**

The wrapper in Composer is `<div className="actions-row-host">` containing the ActionsRow + the conditional `<TemplatePickerPopover>`. Same pattern:
```tsx
const templatesHostRef = useOutsideClick<HTMLDivElement>(templatesOpen, () => setTemplatesOpen(false))
// ...
<div className="actions-row-host" ref={templatesHostRef}>
  <ActionsRow ... />
  {templatesOpen && <TemplatePickerPopover ... />}
</div>
```

- [ ] **Step 4: Verify (manual)**

Open the TelemetryPill popover, click somewhere on the body — it closes. Same for templates. The Settings page (Task 11) probably has popovers too — apply consistently.

- [ ] **Step 5: Commit**

```
git add src/renderer/src/hooks/use-outside-click.ts \
        src/renderer/src/components/layout/TelemetryPill.tsx \
        src/renderer/src/components/composer/Composer.tsx
git commit -m "feat(phase-8a): outside-click closes TelemetryPill + TemplatePicker popovers"
```

---

## Task 7: Modal focus management — AuthMissing + ClaudeNotFound

**Files:**
- Modify: `src/renderer/src/components/notifications/AuthMissingModal.tsx`
- Modify: `src/renderer/src/components/notifications/ClaudeNotFoundModal.tsx`

Both modals currently render a Dismiss button but don't autoFocus it or trap focus. Phase 6B's `ConfirmModal` shows the right pattern — replicate the focus + Escape handling.

- [ ] **Step 1: AuthMissingModal**

Read the file. Add `useRef<HTMLButtonElement>` on the Dismiss button. Add a `useEffect` that focuses it when `open` flips true:
```ts
const dismissRef = useRef<HTMLButtonElement>(null)
useEffect(() => {
  if (open) setTimeout(() => dismissRef.current?.focus(), 0)
}, [open])
```

Add an Escape-key listener (mirror ConfirmModal's pattern). Attach the ref to the Dismiss button.

- [ ] **Step 2: ClaudeNotFoundModal**

Same pattern.

- [ ] **Step 3: Commit**

```
git add src/renderer/src/components/notifications/AuthMissingModal.tsx \
        src/renderer/src/components/notifications/ClaudeNotFoundModal.tsx
git commit -m "feat(phase-8a): AuthMissing + ClaudeNotFound modals autoFocus Dismiss + Escape closes"
```

---

## Task 8: Persistent CostPreview in TelemetryStrip

**Files:**
- Modify: `src/renderer/src/components/composer/Composer.tsx`
- Modify: `src/renderer/src/components/composer/TelemetryStrip.tsx` (or wherever the strip lives)

Currently TelemetryStrip shows the LIVE estimate while the user is typing, then clears after Send. The user should also see "last gearing's cost was $X" after Send so they have a memory of the last spend.

- [ ] **Step 1: Add `lastCostPreview` state to Composer**

Composer already tracks `gearState`. When `gearState` clears (post-Send), capture its `costPreview` to a `lastCostPreview` state:
```ts
const [lastCostPreview, setLastCostPreview] = useState<CostPreview | null>(null)

// When gearState was non-null and is now being cleared (Send / ReGear paths),
// snapshot the preview before clearing:
const handleGearSendGeared = (editedGeared: string): void => {
  if (gearState) setLastCostPreview(gearState.costPreview)
  // ... rest of existing logic ...
}
```

Similarly snapshot in `handleGearSendOriginal` (the user is sending the original, but the gearing's cost still happened — record `gearState.costPreview` if relevant).

Pass `lastCostPreview` to TelemetryStrip.

- [ ] **Step 2: TelemetryStrip renders last preview**

In TelemetryStrip's render: if there's no live `liveEstimate` (prompt is empty), show the `lastCostPreview` value with a "Last gear: " prefix. If there's a live estimate, show that.

- [ ] **Step 3: Commit**

```
git add src/renderer/src/components/composer/Composer.tsx \
        src/renderer/src/components/composer/TelemetryStrip.tsx
git commit -m "feat(phase-8a): TelemetryStrip shows last gearing cost after Send (was previously cleared)"
```

---

## Task 9: Stale-prompt closure fix in "Send original" toast

**Files:**
- Modify: `src/renderer/src/components/composer/Composer.tsx`

In `runGear`'s failure branch, the toast's `onActivate: () => void handleSend(prompt)` captures `prompt` at toast-creation time. If the user types more between the toast appearing and clicking "Send original", the OLD prompt is sent.

- [ ] **Step 1: Use a ref**

Add a `promptRef` that always points at the latest prompt:
```ts
const promptRef = useRef(prompt)
useEffect(() => { promptRef.current = prompt }, [prompt])
```

In the toast's `onActivate`, read from the ref:
```ts
pushToast({
  message,
  severity: 'error',
  action: {
    label: 'Send original',
    onActivate: () => void handleSend(promptRef.current)
  }
})
```

- [ ] **Step 2: Commit**

```
git add src/renderer/src/components/composer/Composer.tsx
git commit -m "fix(phase-8a): 'Send original' toast reads latest prompt via ref (no stale closure)"
```

---

## Task 10: AI error analysis — Dev Mode "Analyze with AI" button (§6.5)

**Files:**
- Modify: `src/main/api/client.ts` (or wherever) — add `analyzeError` method, or reuse existing client
- Modify: `src/main/ipc/gearing-handler.ts` — add or new handler for `ai:analyze-error`
- Modify: `src/shared/ipc/...` — new channel + types
- Modify: `src/renderer/src/views/dev-mode/LogDetail.tsx` — add the button + render result

The spec §6.5: each Dev Mode error row expands to show JSON detail with an "Analyze with AI" button. Clicking ships {message, stack, context, recent records} to Haiku via the active account's key; renders the response inline.

- [ ] **Step 1: Backend handler**

Add a new IPC channel `ai:analyze-error`. The handler:
1. Builds a system prompt: "You are debugging a TokenLess error. Given the log record + recent context, identify the most likely cause + the smallest fix. ≤200 words."
2. Builds a user prompt: the JSON of the error record + the last 20 records before it.
3. Calls Haiku via `AnthropicClientRegistry` (active account).
4. Returns the response text.

Create `src/shared/ipc/ai-error-analysis.ts` + handler `src/main/ipc/error-analysis-handler.ts`. Or fold into the existing gearing-handler — gearing-handler already owns the Haiku call path. Folding keeps related logic together. Pick whichever is cleaner; new handler is more separable.

Go with NEW handler `src/main/ipc/error-analysis-handler.ts`. Cleaner separation.

Test covers: request shape; response shape; error path when no active account.

- [ ] **Step 2: Preload + hook**

Expose `ai.analyzeError(request)`. Create `src/renderer/src/hooks/use-error-analysis.ts` — a small hook that takes an error record and provides an async `analyze()` function returning the analysis text.

- [ ] **Step 3: Dev Mode UI**

Edit `src/renderer/src/views/dev-mode/LogDetail.tsx` (or LogTableRow's expanded state). When the row's `severity === 'error'` or `'fatal'`, render an "Analyze with AI" button. Clicking:
- Sets a loading state
- Calls the IPC
- Displays the result inline below the JSON detail

Display nicely: a small framed section with header "AI analysis" + the response text rendered as prose.

- [ ] **Step 4: Commit**

```
git add src/shared/ipc/ai-error-analysis.ts src/shared/ipc.ts \
        src/main/ipc/error-analysis-handler.ts \
        src/main/__tests__/ipc/error-analysis-handler.integration.test.ts \
        src/main/ipc/index.ts \
        src/preload/index.ts src/preload/index.d.ts \
        src/renderer/src/hooks/use-error-analysis.ts \
        src/renderer/src/views/dev-mode/LogDetail.tsx
git commit -m "feat(phase-8a): §6.5 AI error analysis — Dev Mode 'Analyze with AI' button on error rows"
```

---

## Task 11: Settings page

**Files:**
- Create: `src/renderer/src/views/settings/SettingsView.tsx`
- Create: `src/renderer/src/views/settings/AccountsSection.tsx`
- Create: `src/renderer/src/views/settings/GearingDefaultsSection.tsx`
- Create: `src/renderer/src/views/settings/SendConfirmToggle.tsx`
- Create: `src/renderer/src/views/settings/TelemetrySection.tsx`
- Create: `src/renderer/src/views/settings/DevModeToggle.tsx`
- Create: `src/renderer/src/views/settings/PathsSection.tsx`
- Create: `src/renderer/src/views/settings/styles.css`
- Create: `src/shared/types/settings-keys.ts` — typed constants
- Modify: `src/renderer/src/App.tsx` — route between AppShell and SettingsView
- Modify: `src/renderer/src/components/layout/SettingsButton.tsx` — opens Settings
- Modify: `src/main/index.ts` — expose log + DB paths via a new IPC for the Paths section
- Modify: `src/shared/ipc/paths.ts` — add `paths:get-app-paths` for `userData/logs` + DB

Settings is the largest single task. Sub-sections:

### SettingsView container

Renders sections in order. Has a back-to-app button.

```tsx
export function SettingsView({ onBack }: { onBack: () => void }): JSX.Element {
  return (
    <div className="settings-view">
      <header className="settings-view__header">
        <button type="button" onClick={onBack}>← Back</button>
        <h1>Settings</h1>
      </header>
      <main className="settings-view__main">
        <AccountsSection />
        <GearingDefaultsSection />
        <SendConfirmToggle />
        <DevModeToggle />
        <TelemetrySection />
        <PathsSection />
      </main>
    </div>
  )
}
```

### App routing

A simple state machine in App.tsx — currently renders `<AppShell />`. Add a `view` state of `'shell' | 'settings'`. The SettingsButton fires `setView('settings')`. The SettingsView's back button fires `setView('shell')`.

### AccountsSection

Lists accounts via `useAccounts()`. Each row shows label + configDir + has-API-key indicator + Edit and Delete buttons that open the existing modals (EditAccountModal). Has a "+ Add account" button that opens CreateAccountModal.

### GearingDefaultsSection

Three dropdowns: default model, breadth, format. Reads/writes settings keys `gearing.defaultModel`, `gearing.defaultBreadth`, `gearing.defaultFormat`. Uses `usePricing()` for the model list.

These defaults are NOT yet consumed anywhere — Composer always starts with `opus` / `normal` / `prose`. Phase 8A wires the consumption: Composer reads the settings on mount and uses them as the initial state instead of hardcoded values.

### SendConfirmToggle

Checkbox tied to settings key `gearing.sendConfirm`. When on, Send shows a ConfirmModal first ("Send geared prompt to claude?"). Implementation:
- Composer's `handleSend` (and the two gear-send variants) check this setting + show ConfirmModal
- On Confirm: proceed; on Cancel: abort the send
- Phase 8B might add a "remember my choice" — for v1, the modal appears every time the toggle is on

### DevModeToggle

Mirrors the top-right floating button. Toggling here flips the same state. They share `tokenless.devMode` in localStorage. (Currently the localStorage key lives in App.tsx; Settings reuses it.)

### TelemetrySection

Embeds the TelemetrySummaryPopover content as a section. Just `<TelemetrySummary period="all" />` — pull the popover content into a reusable component.

### PathsSection

Read-only display of:
- Log directory: `userData/logs/` (resolved via a new `paths:get-app-paths` IPC)
- Database: `userData/tokenless.db`
- App data root: `userData/`

Each row has an "Open folder" button that calls `shell.openPath(dir)` (via a new `paths:open-folder` IPC).

### Settings keys type-safety

Create `src/shared/types/settings-keys.ts`:
```ts
export const SETTING_GEARING_DEFAULT_MODEL = 'gearing.defaultModel'
export const SETTING_GEARING_DEFAULT_BREADTH = 'gearing.defaultBreadth'
export const SETTING_GEARING_DEFAULT_FORMAT = 'gearing.defaultFormat'
export const SETTING_GEARING_SEND_CONFIRM = 'gearing.sendConfirm'
// Existing constants from Phase 6B's use-settings.ts:
//   SETTING_LAST_ACTIVE_ACCOUNT_ID
//   SETTING_LAST_ACTIVE_PROJECT_ID
// stay defined in use-settings.ts to avoid breaking Phase 6B imports.
```

### Implementation order within Task 11

- [ ] **Step 1**: Settings keys constants + SettingsView shell + routing
- [ ] **Step 2**: AccountsSection (reuses existing hooks/modals)
- [ ] **Step 3**: PathsSection (needs new `paths:get-app-paths` + `paths:open-folder` IPCs)
- [ ] **Step 4**: GearingDefaultsSection + plumb the defaults into Composer's initial state
- [ ] **Step 5**: SendConfirmToggle + plumb into Composer's send paths
- [ ] **Step 6**: DevModeToggle + share state with App.tsx's existing toggle
- [ ] **Step 7**: TelemetrySection (extract popover content into reusable component)
- [ ] **Step 8**: SettingsButton actually opens Settings

Each sub-step is a separate commit. ~8 commits inside Task 11.

```
# After each substep, a commit like:
git commit -m "feat(phase-8a/settings): AccountsSection + create/edit/delete via existing modals"
git commit -m "feat(phase-8a/settings): PathsSection + paths:get-app-paths IPC"
# etc.
```

After all substeps:
```
npm run test:run
npm run typecheck
```

Expected new tests: ~5 for new IPCs.

---

## Task 12: Onboarding wizard

**Files:**
- Create: `src/renderer/src/views/onboarding/OnboardingWizard.tsx`
- Create: `src/renderer/src/views/onboarding/StepWelcome.tsx`
- Create: `src/renderer/src/views/onboarding/StepApiKey.tsx`
- Create: `src/renderer/src/views/onboarding/StepFirstProject.tsx`
- Create: `src/renderer/src/views/onboarding/StepDone.tsx`
- Create: `src/renderer/src/views/onboarding/styles.css`
- Modify: `src/renderer/src/App.tsx` — show wizard on first-run

Triggered on first-run: when there are zero projects AND zero non-default-account accounts. Also accessible via the existing OnboardingBanner's CTA (so users who dismissed the empty state can re-enter).

### Flow

1. **StepWelcome**: "Welcome to TokenLess" + brief explanation (gearing → save tokens; embedded claude code; private/local). "Next" button.
2. **StepApiKey**: "Add your Anthropic API key" — single input field, placeholder `sk-ant-...`. Validate format (starts with `sk-ant-`). "Next" creates the seeded default account with this key (or updates the existing "Personal" account's apiKey if it's there + has null key).
3. **StepFirstProject**: "Create your first project" — name + rootPath fields, mirroring CreateProjectModal. rootPath validation via `paths.checkDir` (Phase 6B). "Next" creates the project.
4. **StepDone**: "You're all set" + a "Start your first conversation" button that closes the wizard and triggers the new-conversation flow.

State machine in OnboardingWizard:
```ts
type Step = 'welcome' | 'api-key' | 'first-project' | 'done'
```

Each step renders its own component + has Next/Back buttons. Linear progression (no skip-around).

### Wiring in App.tsx

```ts
const showOnboarding = projects.length === 0 && /* first-run detect */ ...
```

Existing OnboardingBanner is removed (subsumed by the wizard). The wizard runs over a full-screen overlay; "Skip" button in the corner closes it without state changes (user can re-enter via Settings → "Run onboarding again" link).

### Persisting "onboarding complete"

A settings key `onboarding.complete = '1'` written when StepDone is reached. App.tsx checks this on launch.

### Implementation order

- [ ] **Step 1**: OnboardingWizard skeleton + step state machine + Skip/Done close behavior
- [ ] **Step 2**: StepWelcome
- [ ] **Step 3**: StepApiKey + account creation logic
- [ ] **Step 4**: StepFirstProject + path validation + project creation
- [ ] **Step 5**: StepDone + onboarding.complete settings write + close
- [ ] **Step 6**: App.tsx integration — show wizard on first-run; OnboardingBanner replaced with "Run onboarding again" link in Settings

Each sub-step is a commit. ~6 commits inside Task 12.

After all substeps:
```
git commit -m "feat(phase-8a): OnboardingWizard — multi-step first-run flow (welcome → key → project → done)"
```

(Combine the substeps if it flows better as one larger commit; the implementer can decide.)

---

## Task 13: ADR-041 + docs sweep

**Files:**
- Modify: `docs/decisions.md`
- Modify: `docs/observability.md`
- Modify: `docs/test-scenarios.md`

### ADR-041 — Phase 8A polish architecture

Cover:
1. Logs moved to userData
2. cc:input vs cc:send: why separate channels (turn capture isolation)
3. pricing:list as single source of truth
4. Settings sections + storage keys
5. Onboarding wizard as a full-screen overlay (not a route)
6. Outside-click hook pattern

### Observability

Extend rows with the new events:
- `cc`: `cc-input` (info)
- `api`: `pricing-list`, `error-analysis` (info)
- `ui`: `template-inserted` already exists; add `settings-opened`, `onboarding-complete`, `outside-click-close`

### Test scenarios

S-8A.1 through S-8A.10 covering each user-visible feature. Each scenario describes manual repro steps.

Single commit:
```
git add docs/decisions.md docs/observability.md docs/test-scenarios.md
git commit -m "docs(phase-8a): ADR-041 + observability events + Phase 8A manual scenarios"
```

---

## Task 14: Verification + tag v0.20.0-phase-8a

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

Expected unit/integration baseline: ~356 (Phase 7C) + 2 cc-handler input + 3 pricing-handler + 3 error-analysis-handler + 5 settings + 3 paths = ~372 tests.

E2E: composer button count may change again if Settings/Onboarding adds top-level buttons. The composer.e2e.test.ts already has a 6-count assertion. If anything top-level changes (the SettingsButton's behavior changes from stub to real click), no test should break.

- [ ] **Step 2: Tag**

```
git tag -s -a v0.20.0-phase-8a -m "Phase 8A complete — polish (Settings + Onboarding + terminal + Dev Mode + pricing consolidation)"
git rev-parse v0.20.0-phase-8a^{commit}
```

---

## Self-Review Checklist

- [ ] **Plan exit-state vs spec:**
  - Settings page renders all 6 sections (accounts, gearing defaults, send-confirm, dev mode, telemetry, paths) ✓
  - Onboarding wizard runs on first-run + has welcome/key/project/done steps ✓
  - Terminal supports keystroke pass-through (Y/N prompts work directly) ✓
  - Terminal supports copy (Ctrl+Shift+C + right-click) ✓
  - Dev Mode backfills from ring buffer + sorts chronologically ✓
  - AI error analysis available on Dev Mode error rows ✓
  - Logs at userData/logs/ + DB at userData/tokenless.db ✓
  - Window has 900x600 minimum ✓
  - Outside-click closes popovers ✓
  - Persistent CostPreview ✓
  - Stale-prompt fix ✓
  - MOCK_MODELS gone ✓

- [ ] **CLAUDE.md cornerstones:**
  - All new error paths through Logger
  - No silent catches
  - All new categories pre-existing (`api`, `db`, `ui`, `cc`, `fs`)

- [ ] **TypeScript strict clean**
- [ ] **No console.*** outside tests

---

## Exit State

**Visible to user:**
- Settings button (top-right) opens a full Settings page with 6 sections
- First-run shows the multi-step Onboarding wizard
- Terminal pane: clicking it focuses for direct keystroke input (Y/N to claude prompts works); Ctrl+Shift+C copies selection; right-click copies if there's a selection
- Dev Mode opens with all logs from app boot, sorted newest-first; error rows have "Analyze with AI" button
- Logs live at `%APPDATA%/tokenless/logs/` next to the DB
- Main window has a sane minimum size
- Popovers close on outside click
- Last gearing's cost persists in the TelemetryStrip after Send
- Modals trap focus on Dismiss + close on Escape
- `MOCK_MODELS` gone — model dropdown reads real pricing data

**Phase 8B will deliver:**
- electron-builder --dir (build:unpack workflow)
- App icon
- About dialog
- DB backup-on-migration
- First-run privacy notice
- Crash reporter modal
- GitHub Actions release workflow
- Tag v1.0.0

**Tag:** `v0.20.0-phase-8a`
