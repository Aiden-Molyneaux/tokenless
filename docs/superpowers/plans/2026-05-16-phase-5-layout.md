# Phase 5: Half-Screen Layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TokenLess comfortable to use at half-screen width (target 720px, minimum 600px). Three architectural moves: (1) sidebar collapse with persistence and width-aware default, (2) unify Composer + GearReviewPane into one always-rendered view with the drawer as a togglable section (so the ActionsRow Copy Geared button becomes reachable post-Gear), and (3) finalize the ActionsRow as Capture · Gear · Copy Geared · Discard (+ Templates) with the Commit/Push canned-prompt buttons removed.

**Architecture:** Replace the conditional `gearState ? <GearReviewPane/> : <Composer/>` swap in Composer.tsx with an always-rendered `<div className="composer-shell">` that holds the textarea + ConfigsRow + ActionsRow at the top, and optionally renders the GearReviewPane as a bottom drawer when `gearState !== null`. Drawer has a chevron close (clears `gearState`, equivalent to Discard) and a horizontal drag-resize handle (ephemeral height percentage in component state). At <600px viewport width, the GearReviewPane's original/geared panes stack vertically instead of side-by-side. Sidebar collapse persists via a new `layout.sidebarCollapsed` setting with a width-aware default (collapsed if first launch detects width <900px). TopBar shrinks to a single 36px row; About link moves to Settings.

**Tech Stack:** TypeScript 5 strict, React 18 (function components + hooks for layout state), Electron 32, Vitest 2, Playwright 1.45 (with viewport sizing).

**Branch:** All work on `v2/headless`. Phase exit: annotated tag `v2.0.0-phase-5-layout`.

---

## Out of scope

- Theme switching (light/dark) — spec § "Deferred to v1.1+"
- Layout toggle (notebook ↔ IDE side-by-side) — spec deferred
- ConfigsRow simplification (drop Skill dropdown / reflow at narrow widths) → Phase 6
- Removing `Commit` / `Push` settings keys + UI elsewhere → Phase 6 cleanup (the ActionsRow buttons go in this phase, but the underlying canned-prompt strings + settings stay registered)
- Removing `actions-row__button--send` CSS / old SendConfirmToggle UI → Phase 6
- CLAUDE.md / docs polish → Phase 6
- New crash-modal styling at narrow widths → Phase 6 (existing modals will overflow; assume the user re-widens before crashing)
- Turn-row capture at copy time (carry-over flagged at Phase 4 exit) → Phase 6 or v2.1

---

## Design decisions captured during planning

| Decision | Choice | Why |
|---|---|---|
| Composer + GearReviewPane unification | Replace the conditional swap with an always-rendered shell; GearReviewPane is a child drawer | Spec §5 layout target. ActionsRow's Copy Geared button currently unreachable because GearReviewPane swaps it out — this fixes that. |
| Drawer chevron semantics | Closing the drawer clears `gearState` (same as Discard) | Simpler model than "minimize"; no need to track "is the drawer hidden but data preserved." Matches the v2 "discrete cycle" thesis. |
| Drawer resize state persistence | Ephemeral (component state, not a setting) | Avoids scope creep. Phase 6 can persist if users want it. |
| ActionsRow final shape | 5 buttons: Capture, Gear, Copy Geared, Discard, Templates | Spec §5 lists 4 required + Templates/Skills as optional. Templates still useful. Skills picker not in ActionsRow (was in ConfigsRow). |
| Commit + Push buttons | Removed from ActionsRow | They were canned-prompt buttons that pre-filled the composer for git workflows. In v2 the user runs git through their terminal directly; the canned text is more reachable via Templates if needed. Phase 6 removes the SETTING_PROJECT_COMMIT_PROMPT / SETTING_PROJECT_PUSH_PROMPT plumbing. |
| Sidebar collapse default | Width-aware: collapsed if `window.innerWidth < 900` on first launch (no persisted setting); user toggle persists thereafter | Spec §5 — narrow window means user likely wants the sidebar out of the way. |
| Sidebar collapsed-mode content | 48px icon strip with: Projects (initial), Conversations (count badge), Settings, Dev Mode icons. Project + Conversation pickers as popovers anchored to icons. | Spec §5 verbatim. |
| TopBar compaction | 36px single row: account switcher (compact: initial+chevron), telemetry pill (compact), window controls. About link moves to Settings. | Spec §5 verbatim. |
| Responsive GearReviewPane | At <600px width: stack original-above-geared. At <500px: single-pane toggle (not implemented in Phase 5 — only the 600px breakpoint). | Spec §5 mentions both breakpoints; Phase 5 ships the 600px one; the <500px single-toggle is a Phase 6+ refinement. |
| ConfigsRow at narrow widths | Untouched in Phase 5 — Phase 6 cleanup | Out-of-scope per the spec section above. May overflow at 600px; documented as a known limitation in S-v2.3. |

---

## File structure (created / modified / deleted)

**Created:**
- (None — Phase 5 modifies existing files; no new components)

**Modified:**
- `src/shared/types/settings-keys.ts` — add `SETTING_LAYOUT_SIDEBAR_COLLAPSED = 'layout.sidebarCollapsed'`
- `src/renderer/src/components/layout/AppShell.tsx` — load the sidebar-collapsed setting on mount, hydrate state with width-aware default, persist on toggle. Pass to ConversationSidebar. May also reach into TopBar / MainPane wiring if needed.
- `src/renderer/src/components/layout/ConversationSidebar.tsx` — expand the collapsed-mode markup: show Projects icon (with current project initial), Conversations icon (with count badge), Settings icon, Dev Mode icon. Add popover behavior for Project / Conversation pickers.
- `src/renderer/src/components/layout/styles.css` — collapsed sidebar at 48px width, icon styling, popover positioning. Use existing CSS variables for color tokens.
- `src/renderer/src/components/layout/TopBar.tsx` — single 36px row, compact widgets. Move the About-trigger out (Settings absorbs it).
- `src/renderer/src/components/layout/TelemetryPill.tsx` — compact variant (drop full-text label, keep icon + dollar amount)
- `src/renderer/src/components/layout/AccountSwitcher.tsx` — compact variant (show initial + chevron, full label in dropdown)
- `src/renderer/src/components/layout/SettingsButton.tsx` — surfaces the About link inside the Settings page (or directly in the button menu)
- `src/renderer/src/components/composer/Composer.tsx` — replace the `gearState ? <GearReviewPane/> : <Composer-content/>` swap with always-rendered Composer content + optional drawer GearReviewPane below. Add `handleDiscard` for the Discard button. Add empty-state hint.
- `src/renderer/src/components/composer/ActionsRow.tsx` — final 5-button shape. Drop `onCommit`, `onPush` props. Add `onDiscard: () => void`. Update `disableGear` to handle the new combined state if relevant.
- `src/renderer/src/components/composer/styles.css` — `.composer-shell` flex container, `.gear-review-drawer` wrapper, drag-resize handle, responsive breakpoints
- `src/renderer/src/components/gear-review/GearReviewPane.tsx` — drawer chevron in header (calls `onDiscard` / `onCancel`); responsive layout at <600px
- `src/renderer/src/components/gear-review/styles.css` — stacked-pane media query at <600px, drag-resize handle
- `test/e2e/composer.e2e.test.ts` — bump count assertion 6 → 5; update Commit/Push reference removals
- `test/e2e/capture-flow.e2e.test.ts` — adjust any assertions that may break with the unified layout (e.g., the round-trip test asserts `.gear-review-pane` becomes count 0 after Copy — still works, but the drawer-close mechanism differs from a conditional unmount)
- `test/e2e/gearing.e2e.test.ts` — same as above
- `docs/test-scenarios.md` — append S-v2.3 (half-screen layout)
- `docs/superpowers/specs/2026-05-16-tokenless-v2-headless-design.md` — mark Phase 5 shipped (last commit of phase)

**Created (tests):**
- `test/e2e/layout.half-screen.e2e.test.ts` — viewport 720×900 + 600×900 + manual sidebar-toggle test
- `src/renderer/src/components/composer/__tests__/discard-button.unit.test.tsx` — Discard clears prompt + gearState + draft

**Deleted:**
- (None — Phase 5 adds + transforms; deletions of `Commit`/`Push` UI happen by REPLACING the props in ActionsRow, not removing a separate file)

---

## Tasks

### Task 1: Layout settings key + width-aware sidebar default

**Files:**
- Modify: `src/shared/types/settings-keys.ts`
- Modify: `src/renderer/src/components/layout/AppShell.tsx`

- [ ] **Step 1: Add the settings key**

In `src/shared/types/settings-keys.ts`, after the existing layout-style settings (or near other `gearing.*` / `onboarding.*` constants), add:

```typescript
export const SETTING_LAYOUT_SIDEBAR_COLLAPSED = 'layout.sidebarCollapsed'
```

The value is a stringified boolean ('true' / 'false') — the existing settings store is text-based.

- [ ] **Step 2: Load the setting at app boot in AppShell**

In `src/renderer/src/components/layout/AppShell.tsx`, add state + a `useEffect` that:
1. Calls `window.tokenless.settings.get({ key: SETTING_LAYOUT_SIDEBAR_COLLAPSED })`
2. If the response has a value, parse `value === 'true'`
3. If absent, default to `window.innerWidth < 900`
4. Set the local `sidebarCollapsed` state

```typescript
const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => false)
// On mount, hydrate from settings
useEffect(() => {
  let cancelled = false
  void (async () => {
    const result = await window.tokenless.settings.get({ key: SETTING_LAYOUT_SIDEBAR_COLLAPSED })
    if (cancelled) return
    if (result.ok && result.data !== null) {
      setSidebarCollapsed(result.data === 'true')
    } else {
      // Width-aware default
      setSidebarCollapsed(window.innerWidth < 900)
    }
  })()
  return () => { cancelled = true }
}, [])
```

- [ ] **Step 3: Persist on user toggle**

The existing ConversationSidebar already has `onToggleCollapsed`. Update the AppShell handler to:

```typescript
const handleToggleSidebar = (): void => {
  setSidebarCollapsed((prev) => {
    const next = !prev
    void window.tokenless.settings.set({
      key: SETTING_LAYOUT_SIDEBAR_COLLAPSED,
      value: next ? 'true' : 'false'
    })
    return next
  })
}
```

Wire to ConversationSidebar's `onToggleCollapsed` prop.

- [ ] **Step 4: Verify**

```bash
npm run typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/settings-keys.ts src/renderer/src/components/layout/AppShell.tsx
git commit -m "feat(phase-5): persist sidebar-collapsed state with width-aware default

Adds SETTING_LAYOUT_SIDEBAR_COLLAPSED. AppShell loads the setting at
boot; if absent, defaults to collapsed when window width <900px.
User toggle persists.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Sidebar collapsed-mode icon strip + popovers

**Files:**
- Modify: `src/renderer/src/components/layout/ConversationSidebar.tsx`
- Modify: `src/renderer/src/components/layout/styles.css`

The existing `ConversationSidebar` already supports `collapsed`/`onToggleCollapsed`. When collapsed, it currently just hides the title + content. Phase 5 expands this to a 48px icon strip with affordances.

- [ ] **Step 1: Define the icon strip layout**

When `collapsed === true`, render (in addition to the chevron toggle):

```tsx
<div className="conversation-sidebar__icons">
  <button
    type="button"
    className="conversation-sidebar__icon-button"
    onClick={() => setProjectsPopoverOpen(true)}
    aria-label="Open project picker"
    title={activeProjectName ?? 'No project'}
  >
    <span className="conversation-sidebar__icon-letter">
      {activeProjectName ? activeProjectName[0].toUpperCase() : '·'}
    </span>
  </button>
  <button
    type="button"
    className="conversation-sidebar__icon-button"
    onClick={() => setConversationsPopoverOpen(true)}
    aria-label="Open conversation list"
    title={`${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`}
  >
    💬
    {conversations.length > 0 && (
      <span className="conversation-sidebar__icon-badge">{conversations.length}</span>
    )}
  </button>
  <button
    type="button"
    className="conversation-sidebar__icon-button"
    onClick={onOpenSettings}
    aria-label="Open settings"
  >
    ⚙
  </button>
  <button
    type="button"
    className="conversation-sidebar__icon-button"
    onClick={onOpenDevMode}
    aria-label="Open Dev Mode"
  >
    {/* Use a recognizable icon — bug emoji or wrench */}
    🐛
  </button>
</div>
```

The component will need new props for `activeProjectName: string | null`, `onOpenSettings: () => void`, `onOpenDevMode: () => void`. Add them. AppShell threads these through (already has the data).

- [ ] **Step 2: Implement the popovers**

Use the existing `Dropdown` component / `useDropdown` hook pattern (already in `src/renderer/src/components/common/`). Anchor the popover to the icon button. The Projects popover wraps the existing `ProjectSwitcher` content; the Conversations popover wraps the existing `ConversationList` content.

For Phase 5, "popover" can be implemented as a temporary dropdown panel anchored to the icon — match whatever pattern the existing `useDropdown` hook supports. If a clean popover isn't feasible without significant new infrastructure, implement as a click-toggle: clicking the icon button temporarily expands the sidebar fully (sets `collapsed === false` while the popover would be open), and clicking away or selecting an item collapses again.

If you go with the "temporarily expand" pattern, document it in the component header comment as a v2.0 simplification.

- [ ] **Step 3: CSS for the icon strip**

In `src/renderer/src/components/layout/styles.css`, the existing `.conversation-sidebar.is-collapsed` rule may set `width: 48px`. Confirm + adjust:

```css
.conversation-sidebar {
  display: flex;
  flex-direction: column;
  width: 240px;
  transition: width 0.2s ease;
}

.conversation-sidebar.is-collapsed {
  width: 48px;
}

.conversation-sidebar__icons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 4px;
}

.conversation-sidebar__icon-button {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--text-primary);
}

.conversation-sidebar__icon-button:hover {
  background: var(--bg-hover);
}

.conversation-sidebar__icon-letter {
  font-weight: 600;
  font-size: 16px;
}

.conversation-sidebar__icon-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  font-size: 10px;
  background: var(--accent);
  color: white;
  border-radius: 8px;
  padding: 0 4px;
  line-height: 14px;
  min-width: 14px;
  text-align: center;
}
```

(Match the existing var name conventions in the file — `--text-primary`, `--bg-hover`, `--accent` are placeholders; use what the codebase has.)

- [ ] **Step 4: Wire the new props from AppShell**

Update `src/renderer/src/components/layout/AppShell.tsx` to pass `activeProjectName`, `onOpenSettings`, `onOpenDevMode` to `<ConversationSidebar>`. The settings/devmode openers are wired via existing state (SettingsButton, DevMode trigger).

- [ ] **Step 5: Verify**

```bash
npm run typecheck
npm run test:run
```
Expected: PASS.

Manual smoke: `npm run build:unpack`, launch the app, click the collapse chevron, confirm the icon strip appears.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/layout/ConversationSidebar.tsx src/renderer/src/components/layout/styles.css src/renderer/src/components/layout/AppShell.tsx
git commit -m "feat(phase-5): expand sidebar collapsed-mode with icon strip + popovers

When collapsed (48px), the sidebar now shows project initial,
conversation count badge, Settings, and Dev Mode icons. Clicking
project / conversation icons opens a popover (or temporarily expands
the sidebar to surface the picker, depending on implementation).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: TopBar compaction

**Files:**
- Modify: `src/renderer/src/components/layout/TopBar.tsx`
- Modify: `src/renderer/src/components/layout/AccountSwitcher.tsx`
- Modify: `src/renderer/src/components/layout/TelemetryPill.tsx`
- Modify: `src/renderer/src/components/layout/SettingsButton.tsx` (or wherever About is anchored)
- Modify: `src/renderer/src/components/layout/styles.css`

- [ ] **Step 1: Reduce TopBar height to 36px**

In `src/renderer/src/components/layout/styles.css`, find the `.top-bar` rule and set `height: 36px`. Adjust padding (~6px vertical, 12px horizontal). Confirm child widgets fit.

- [ ] **Step 2: Compact AccountSwitcher**

The full label `"Personal · 3 accounts"` (or whatever it currently shows) is too wide. Make it show `[initial] ▾` in the trigger:

```tsx
<button className="account-switcher__trigger account-switcher__trigger--compact">
  <span className="account-switcher__initial">{currentAccount?.label[0] ?? '·'}</span>
  <span className="account-switcher__chevron">▾</span>
</button>
```

The dropdown panel (when open) still shows full account names + actions. Match the existing dropdown pattern.

- [ ] **Step 3: Compact TelemetryPill**

The existing pill probably shows `"$0.0123 this hour"` or similar. Compact it: show `"$0.0123"` only, full breakdown in the popover when clicked.

- [ ] **Step 4: Move About link to Settings**

The current About trigger lives somewhere in the TopBar or SettingsButton menu. Find it (`git grep -n "AboutDialog\|aboutOpen\|setAboutOpen" src/renderer`). Remove the TopBar/SettingsButton trigger. Add an "About TokenLess" row to the Settings page (likely `src/renderer/src/components/settings/SettingsPage.tsx` or similar — find it by grep).

If there's no clean Settings row pattern, the About link can move to a small footer in Settings or stay as a SettingsButton menu item. Keep it discoverable.

- [ ] **Step 5: CSS adjustments**

```css
.top-bar {
  height: 36px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
}

.account-switcher__trigger--compact {
  width: 32px;
  height: 24px;
  padding: 0 4px;
}

.telemetry-pill--compact {
  font-size: 12px;
  padding: 2px 8px;
}
```

- [ ] **Step 6: Verify**

```bash
npm run typecheck
npm run test:run
```
Expected: PASS.

Manual smoke at narrow width: launch, confirm TopBar fits at 720px without overflow.

- [ ] **Step 7: Commit**

```bash
git add -u src/renderer/src/components/layout/
git commit -m "feat(phase-5): compact TopBar to 36px single row

AccountSwitcher trigger → [initial] ▾ compact form.
TelemetryPill compact form (price only, full breakdown in popover).
About link moves into Settings page.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Unify Composer + GearReviewPane (architectural rework)

**Files:**
- Modify: `src/renderer/src/components/composer/Composer.tsx`
- Modify: `src/renderer/src/components/composer/styles.css`
- Modify: `src/renderer/src/components/gear-review/GearReviewPane.tsx`

This is the load-bearing task of Phase 5. The current shape:

```tsx
return gearState ? <GearReviewPane.../> : <ComposerView.../>
```

becomes:

```tsx
return (
  <div className="composer-shell">
    <ComposerContent ... />     {/* always rendered */}
    {gearState && (
      <div className="gear-review-drawer">
        <GearReviewPane ... />
      </div>
    )}
  </div>
)
```

- [ ] **Step 1: Refactor Composer.tsx**

Lift the existing "Composer-view JSX" (textarea + ConfigsRow + ActionsRow + TelemetryStrip + capture-hint + ToastHost-adjacent stuff) into the always-rendered branch. The conditional inside the JSX collapses to just the GearReviewPane drawer below.

```tsx
return (
  <>
    <div className="composer-shell">
      <div className="composer-shell__main">
        <PromptTextarea value={prompt} onChange={setPrompt} />
        <ConfigsRow ... />
        <div className="actions-row-host" ref={templatesHostRef}>
          <ActionsRow ... />  {/* updated in Task 6 */}
          {templatesOpen && <TemplatePickerPopover ... />}
        </div>
        <TelemetryStrip ... />
        {captureHint && (
          <p className="capture-hint" role="status">{captureHint}</p>
        )}
      </div>
      {gearState && (
        <div className="gear-review-drawer">
          <GearReviewPane
            key={gearState.gearedPrompt}
            original={gearState.originalPrompt}
            geared={gearState.gearedPrompt}
            critiqueFlags={gearState.critiqueFlags}
            costPreview={gearState.costPreview}
            onCopyOriginal={handleGearCopyOriginal}
            onCopyGeared={handleGearCopyGeared}
            onReGear={handleGearReGear}
            onClose={handleGearCancel}  // drawer chevron — clears gearState
          />
        </div>
      )}
    </div>
    <AuthMissingModal ... />
  </>
)
```

(The exact JSX structure depends on what's there — adapt to the current shape. The key insight: the ternary `gearState ? <GearReviewPane/> : <Composer/>` becomes "always render Composer; conditionally render GearReviewPane below.")

- [ ] **Step 2: Update GearReviewPane to fit a drawer**

Rename the `onCancel` prop to `onClose` (drawer-chevron semantics). Add a small chevron-close button in the GearReviewPane header (it already has a ✕ — rename / re-style if needed). When clicked, it fires `onClose` which clears `gearState`.

- [ ] **Step 3: CSS for the new shell**

In `src/renderer/src/components/composer/styles.css`:

```css
.composer-shell {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.composer-shell__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
  padding: 16px;
}

.gear-review-drawer {
  flex: 0 0 50%;  /* default 50% height when open */
  min-height: 200px;
  max-height: 80%;
  border-top: 1px solid var(--border, #ccc);
  overflow: hidden;
}
```

For the drag-resize handle: add an explicit `<div className="gear-review-drawer__handle"></div>` between `composer-shell__main` and the drawer:

```tsx
{gearState && (
  <>
    <div
      className="gear-review-drawer__handle"
      onMouseDown={(e) => startResize(e)}
      role="separator"
      aria-label="Resize gear review drawer"
    />
    <div className="gear-review-drawer">
      <GearReviewPane ... />
    </div>
  </>
)}
```

```css
.gear-review-drawer__handle {
  height: 4px;
  background: var(--border);
  cursor: ns-resize;
}

.gear-review-drawer__handle:hover {
  background: var(--accent);
}
```

The resize implementation can use a simple useState + useEffect for mouse-move listeners:

```typescript
const [drawerHeight, setDrawerHeight] = useState<number>(50)  // percentage

const startResize = (e: React.MouseEvent): void => {
  e.preventDefault()
  const shell = e.currentTarget.parentElement
  if (!shell) return
  const shellRect = shell.getBoundingClientRect()
  const onMove = (moveEvent: MouseEvent): void => {
    const offsetFromTop = moveEvent.clientY - shellRect.top
    const percent = 100 - (offsetFromTop / shellRect.height) * 100
    setDrawerHeight(Math.max(20, Math.min(80, percent)))
  }
  const onUp = (): void => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
```

Apply `style={{ flexBasis: `${drawerHeight}%` }}` to the drawer.

If implementing drag-resize is too thorny within this task, ship a fixed 50% drawer and defer drag-resize to a follow-up. Flag in the commit message.

- [ ] **Step 4: Verify**

```bash
npm run typecheck
npm run test:run
```
Expected: PASS.

Manual smoke: build + launch, capture a prompt, click Gear, confirm the drawer appears below the composer (not replacing it). Confirm Copy Geared in the ActionsRow IS reachable + enabled when the drawer is open.

- [ ] **Step 5: Commit**

```bash
git add -u src/renderer/src/components/composer/ src/renderer/src/components/gear-review/
git commit -m "feat(phase-5): unify Composer + GearReviewPane via drawer

Replaces the conditional swap (gearState ? <GearReviewPane/> :
<Composer/>) with an always-rendered .composer-shell that hosts
the Composer content + an optional .gear-review-drawer below.
GearReviewPane's onCancel renamed to onClose with drawer-chevron
semantics. ActionsRow's Copy Geared button is now reachable + enabled
once gear has run.

[If drag-resize was implemented]: drag-resize handle between
composer + drawer, persistent at 50% by default, ephemeral state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: GearReviewPane responsive stacking + drawer polish

**Files:**
- Modify: `src/renderer/src/components/gear-review/GearReviewPane.tsx`
- Modify: `src/renderer/src/components/gear-review/styles.css`

- [ ] **Step 1: Add the stacked-pane breakpoint**

The current GearReviewPane renders `<OriginalPane/>` next to `<GearedPane/>` in a flex row. At <600px viewport, they should stack vertically.

In `src/renderer/src/components/gear-review/styles.css`:

```css
.gear-review-pane__panes {
  display: flex;
  flex-direction: row;
  gap: 12px;
}

@media (max-width: 600px) {
  .gear-review-pane__panes {
    flex-direction: column;
  }
}
```

(Adjust to match the existing class names in the file.)

- [ ] **Step 2: Ensure the drawer chevron is positioned well**

Update the GearReviewPane header so the chevron-close is visually obvious as a drawer affordance (not a modal-close). Use `▾` (chevron down) instead of `✕` (close) to suggest "minimize" semantics, even though the v2 model clears state.

```tsx
<div className="gear-review-pane__header">
  <h2 className="gear-review-pane__title">Review geared prompt</h2>
  <button
    type="button"
    className="gear-review-pane__close"
    onClick={onClose}
    aria-label="Close gear review and discard"
    title="Close and discard the geared prompt"
  >
    ▾
  </button>
</div>
```

Add a hover state in CSS so the user understands clicking discards:

```css
.gear-review-pane__close:hover {
  color: var(--accent);
}
```

- [ ] **Step 3: Verify**

```bash
npm run typecheck
npm run test:run
```
Expected: PASS.

Manual smoke at 600×900 viewport: confirm the panes stack vertically.

- [ ] **Step 4: Commit**

```bash
git add -u src/renderer/src/components/gear-review/
git commit -m "feat(phase-5): GearReviewPane responsive stacking + drawer chevron polish

At <600px viewport, original/geared panes stack vertically instead
of side-by-side. The drawer-close affordance becomes a downward
chevron (▾) with tooltip clarifying that close = discard.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: ActionsRow final shape — drop Commit/Push, add Discard, empty-state hint

**Files:**
- Modify: `src/renderer/src/components/composer/ActionsRow.tsx`
- Modify: `src/renderer/src/components/composer/Composer.tsx`
- Modify: `src/renderer/src/components/composer/styles.css`
- Create: `src/renderer/src/components/composer/__tests__/discard-button.unit.test.tsx`

- [ ] **Step 1: Update ActionsRow props + remove Commit/Push buttons**

Drop `onCommit` + `onPush` props from `ActionsRowProps`. Add `onDiscard: () => void`. Drop `disableGear` if no longer needed (it was for "gear in flight" — keep if the spinner state needs it; otherwise simplify).

The new ActionsRow JSX (5 buttons):

```tsx
<div className="actions-row">
  <div className="actions-row__primary">
    {/* Capture — unchanged */}
    {/* Gear — unchanged */}
    {/* Copy Geared — unchanged */}
    <InfoTooltip helperText="Clear the composer + close the gear review.">
      <button
        type="button"
        className="actions-row__button actions-row__button--discard"
        onClick={onDiscard}
        aria-label="Discard composer + gear review"
      >
        Discard
      </button>
    </InfoTooltip>
  </div>
  <div className="actions-row__secondary">
    <InfoTooltip helperText="Insert a saved template into the composer.">
      <button
        type="button"
        className="actions-row__button actions-row__button--secondary"
        onClick={onTemplates}
      >
        Templates ▾
      </button>
    </InfoTooltip>
  </div>
</div>
```

- [ ] **Step 2: Implement `handleDiscard` in Composer.tsx**

```typescript
const handleDiscard = (): void => {
  rendererLogger.info('ui', 'discard', 'User discarded composer + gear state')
  setPrompt('')
  setGearState(null)
  void clearDraft()
  setCaptureHint(null)
}
```

Remove `handleCommit` and `handlePush` from Composer.tsx (if they're only referenced by ActionsRow). Verify by grepping for callers.

Update the `<ActionsRow>` JSX usage:

```tsx
<ActionsRow
  promptEmpty={prompt.length === 0}
  disableGear={gearing}
  copyDisabled={gearState === null}
  onCapture={() => void handleCapture()}
  captureDisabled={captureDisabled}
  onGear={handleGear}
  onCopyGeared={handleCopyGearedFromState}
  onDiscard={handleDiscard}
  onTemplates={() => setTemplatesOpen((v) => !v)}
/>
```

- [ ] **Step 3: Composer empty-state hint**

When `prompt.length === 0` AND `gearState === null` AND the textarea has never been touched (or just: whenever empty), show a small hint near the textarea:

```tsx
{prompt.length === 0 && gearState === null && (
  <p className="composer__empty-hint">
    Capture a prompt from your terminal (Ctrl+C in terminal → click Capture).
  </p>
)}
```

Position it just above or below the textarea, depending on layout. Use a muted text style.

- [ ] **Step 4: CSS for Discard button + empty-hint**

```css
.actions-row__button--discard {
  color: var(--text-muted);
  border-color: var(--border);
}

.actions-row__button--discard:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.composer__empty-hint {
  margin: 8px 0;
  font-size: 13px;
  color: var(--text-muted);
  font-style: italic;
}
```

- [ ] **Step 5: Write the Discard unit test**

Create `src/renderer/src/components/composer/__tests__/discard-button.unit.test.tsx`. Match the harness pattern from `capture-button.unit.test.tsx`.

```typescript
describe('Composer / Discard button', () => {
  it('clears the prompt textarea, gearState, and draft', async () => {
    // Render Composer with a populated prompt + an existing gearState
    // (mock gearing.gear → click Gear → wait for drawer to appear → click Discard)
    // Assert: textarea is empty, drawer is gone, clearDraft was called.
  })

  it('keeps the Discard button always enabled', async () => {
    // Render Composer with no prompt + no gearState.
    // The Discard button should still be enabled (it's a no-op then, but reachable).
  })
})
```

- [ ] **Step 6: Verify**

```bash
npm run typecheck
npm run test:run
```
Expected: PASS. Tests up by ~2.

```bash
git grep -n "onCommit\|onPush\|handleCommit\|handlePush" src/renderer/src/components/composer
```
Expected: zero hits.

- [ ] **Step 7: Commit**

```bash
git add -u src/renderer/src/components/composer/
git commit -m "feat(phase-5): ActionsRow final shape + Discard button + empty-state hint

Drops Commit + Push buttons from ActionsRow (v2 users run git in
their terminal). Adds Discard, which clears prompt + gearState +
draft. Composer empty-state hint guides new users to Capture.

Final ActionsRow shape: 5 buttons (Capture, Gear, Copy Geared,
Discard, Templates).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Half-screen E2E + scenarios doc

**Files:**
- Create: `test/e2e/layout.half-screen.e2e.test.ts`
- Modify: `test/e2e/composer.e2e.test.ts` (bump count assertion 6 → 5; update Commit/Push references if any)
- Modify: `docs/test-scenarios.md` (append S-v2.3)

- [ ] **Step 1: Update `composer.e2e.test.ts`**

Find the count assertion. Update from `toHaveCount(6)` to `toHaveCount(5)` with comment:

```typescript
  // Phase 5 (v2 headless final): Capture + Gear + Copy Geared + Discard + Templates = 5 buttons.
  // Commit + Push removed (users run git in their own terminal); Send replaced
  // by Copy Geared in phase 4; Branch removed in phase 2.
  await expect(page.locator('.actions-row__button')).toHaveCount(5)
```

If any test references the Commit / Push buttons by name, update or remove those assertions.

- [ ] **Step 2: Create `test/e2e/layout.half-screen.e2e.test.ts`**

```typescript
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test.describe('Phase 5 half-screen layout', () => {
  let userDataDir: string
  let app: ElectronApplication

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'tokenless-e2e-'))
  })

  test.afterEach(async () => {
    if (app) {
      try { await app.close() } catch { /* best-effort */ }
    }
    if (existsSync(userDataDir)) {
      rmSync(userDataDir, { recursive: true, force: true })
    }
  })

  test('at 720x900 viewport, sidebar starts collapsed by default', async () => {
    app = await electron.launch({
      args: ['out/main/index.js'],
      env: { ...process.env, TOKENLESS_USER_DATA_DIR: userDataDir, TOKENLESS_SKIP_ONBOARDING: '1' }
    })
    const win = await app.firstWindow()
    await win.setViewportSize({ width: 720, height: 900 })
    await win.waitForLoadState('domcontentloaded')
    // Wait for the AppShell to hydrate the sidebar-collapsed setting
    await win.waitForSelector('.conversation-sidebar.is-collapsed', { timeout: 5000 })
    await expect(win.locator('.conversation-sidebar')).toHaveClass(/is-collapsed/)
  })

  test('at 1280x900 viewport, sidebar starts expanded by default', async () => {
    app = await electron.launch({
      args: ['out/main/index.js'],
      env: { ...process.env, TOKENLESS_USER_DATA_DIR: userDataDir, TOKENLESS_SKIP_ONBOARDING: '1' }
    })
    const win = await app.firstWindow()
    await win.setViewportSize({ width: 1280, height: 900 })
    await win.waitForLoadState('domcontentloaded')
    await win.waitForSelector('.conversation-sidebar', { timeout: 5000 })
    await expect(win.locator('.conversation-sidebar')).not.toHaveClass(/is-collapsed/)
  })

  test('Composer + GearReviewPane render together once gear runs (drawer is reachable)', async () => {
    app = await electron.launch({
      args: ['out/main/index.js'],
      env: { ...process.env, TOKENLESS_USER_DATA_DIR: userDataDir, TOKENLESS_SKIP_ONBOARDING: '1' }
    })
    const win = await app.firstWindow()
    await win.setViewportSize({ width: 720, height: 900 })
    await win.waitForLoadState('domcontentloaded')

    // Project setup
    await win.getByRole('button', { name: /create your first project/i }).click()
    await win.getByPlaceholder('My Project').fill('Layout Test')
    await win.getByPlaceholder('C:/path/to/project').fill('C:/tmp/e2e-layout')
    await win.getByRole('button', { name: /^create$/i }).click()
    await win.waitForSelector('.composer-shell', { timeout: 5000 })

    // Stub gearing
    await app.evaluate(({ ipcMain }) => {
      const IPC_GEARING_GEAR = 'gearing:gear'
      ipcMain.removeHandler(IPC_GEARING_GEAR)
      ipcMain.handle(IPC_GEARING_GEAR, async () => ({
        ok: true,
        data: {
          result: {
            originalPrompt: 'Refactor',
            gearedPrompt: 'Refactor: diff only.',
            critiqueFlags: [],
            tokenBreakdown: { haikuInputTokens: 100, haikuOutputTokens: 50, gearedInputEstimate: 20, originalInputEstimate: 80 },
            costPreview: { expectedDollars: 0.001, expectedInputTokens: 20, expectedOutputTokens: 800, modelLabel: 'Sonnet', haikuMetaDollars: 0.0001 }
          }
        }
      }))
    })

    // Type + click Gear
    await win.locator('.prompt-textarea').fill('Refactor')
    await win.getByRole('button', { name: /^gear$/i }).click()
    await expect(win.locator('.gear-review-pane')).toBeVisible({ timeout: 5000 })

    // Both composer-shell main + drawer are visible at the same time
    await expect(win.locator('.composer-shell__main')).toBeVisible()
    await expect(win.locator('.gear-review-drawer')).toBeVisible()

    // ActionsRow Copy Geared is REACHABLE + enabled (this is the load-bearing assertion for Phase 5)
    const copyButton = win.locator('.actions-row__button--copy-geared')
    await expect(copyButton).toBeVisible()
    await expect(copyButton).toBeEnabled()
  })

  test('Discard button clears composer + drawer', async () => {
    app = await electron.launch({
      args: ['out/main/index.js'],
      env: { ...process.env, TOKENLESS_USER_DATA_DIR: userDataDir, TOKENLESS_SKIP_ONBOARDING: '1' }
    })
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')

    // Project setup
    await win.getByRole('button', { name: /create your first project/i }).click()
    await win.getByPlaceholder('My Project').fill('Discard Test')
    await win.getByPlaceholder('C:/path/to/project').fill('C:/tmp/e2e-discard')
    await win.getByRole('button', { name: /^create$/i }).click()
    await win.waitForSelector('.composer-shell', { timeout: 5000 })

    // Type something
    await win.locator('.prompt-textarea').fill('Some prompt to discard')

    // Click Discard
    await win.getByRole('button', { name: /^discard$/i }).click()

    // Textarea is empty
    await expect(win.locator('.prompt-textarea')).toHaveValue('')
  })
})
```

- [ ] **Step 3: Append S-v2.3 to `docs/test-scenarios.md`**

```markdown
## S-v2.3: Half-screen layout (Phase 5)

**Setup:** Resize the TokenLess window to 720px wide × 900px tall (roughly half of a 1440p monitor). For comparison, also test at 600×900 (very narrow) and 1280×900 (wide).

**At 720×900:**
- Sidebar should be collapsed to the icon strip by default (first launch with this width).
- TopBar should fit on a single 36px row without overflow: account initial, telemetry pill, window controls.
- Composer textarea + ConfigsRow + 5-button ActionsRow visible.
- Empty-state hint: "Capture a prompt from your terminal (Ctrl+C in terminal → click Capture)." visible when no prompt typed.
- Click Capture (after copying something elsewhere) → text loads.
- Click Gear → GearReviewPane drawer slides in from below, side-by-side original + geared.
- Click Copy Geared in ActionsRow → text on clipboard, composer + drawer clear.

**At 600×900:**
- Same flow, but the GearReviewPane drawer's original/geared panes stack vertically.
- ConfigsRow may overflow horizontally (known Phase 6 cleanup target — not a regression).

**At 1280×900:**
- Sidebar expanded by default.
- Same flow, all widgets fit comfortably.

**Manual sidebar toggle:** Click the chevron at the top of the sidebar. At any width, the sidebar collapses/expands. Setting persists across app restarts.

**Drawer chevron:** Click the ▾ in the GearReviewPane header. The drawer closes, geared text is discarded (same effect as the Discard button).

**Discard button:** From any state (with or without geared text), clicking Discard clears the composer + draft + closes the drawer.
```

- [ ] **Step 4: Verify**

```bash
npm run build
npm run test:e2e
```

Expected: ~19 passed, 1 skipped, 0 failures (15 from prior phases + 4 new layout tests).

If layout tests fail due to selector drift, fix the locators. If the "sidebar collapsed at 720px" test fails because the AppShell hydration isn't done by the time the assertion runs, increase the timeout or wait for a specific state marker.

- [ ] **Step 5: Commit**

```bash
git add test/e2e/layout.half-screen.e2e.test.ts test/e2e/composer.e2e.test.ts docs/test-scenarios.md
git commit -m "test(phase-5): half-screen layout E2E + scenarios + count bump 6 -> 5

New layout.half-screen.e2e.test.ts covers: collapsed sidebar at
720px, expanded sidebar at 1280px, Composer+drawer rendered
together post-gear (load-bearing assertion that the ActionsRow
Copy Geared button is reachable), Discard clears composer.

composer.e2e.test.ts count assertion 6 -> 5 (Commit + Push gone,
Discard added).

Scenarios doc adds S-v2.3 covering the three viewport widths +
manual toggle + drawer-chevron behavior.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Verification gate + phase tag

- [ ] **Step 1: Typecheck**

```bash
npm run typecheck
```
Expected: exit 0.

- [ ] **Step 2: Unit + integration tests**

```bash
npm run rebuild:node
npm run test:run
```
Expected: ~295-298 tests passing (Phase 4 ended at 293; this phase adds ~2 unit tests).

- [ ] **Step 3: Build**

```bash
npm run rebuild:electron
npm run build
npm run build:unpack
```
Expected: `dist/win-unpacked/TokenLess.exe` produced. winCodeSign symlink errors are harmless.

- [ ] **Step 4: E2E**

```bash
npm run test:e2e
```
Expected: 19 passed, 1 skipped, 0 failures.

- [ ] **Step 5: Update spec phase table**

In `docs/superpowers/specs/2026-05-16-tokenless-v2-headless-design.md` §9, update row 5:

```markdown
| 5 | `v2.0.0-phase-5-layout` | Sidebar collapse, MainPane vertical reflow, TopBar compaction, half-screen scenarios + E2E. | shipped 2026-05-16 (8 tasks, ~297 tests green, half-screen E2E at 720+600+1280px verified, Discard button + unified Composer/GearReviewPane drawer) |
```

Commit:
```bash
git add docs/superpowers/specs/2026-05-16-tokenless-v2-headless-design.md
git commit -m "docs(phase-5): mark phase 5 shipped in spec phase table

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Tag**

```bash
git tag -a v2.0.0-phase-5-layout -m "Phase 5: half-screen layout shipped.

Three architectural moves:
1. Sidebar collapse: 48px icon strip when collapsed, project initial /
   conversation count badge / Settings / Dev Mode icons. Width-aware
   default (collapsed if window <900px on first launch). Persisted via
   SETTING_LAYOUT_SIDEBAR_COLLAPSED.
2. Composer + GearReviewPane unified into one always-rendered shell.
   The drawer slides in below the composer when gear runs. ActionsRow's
   Copy Geared button is now reachable post-gear (was the load-bearing
   gap from Phase 4).
3. ActionsRow final shape: Capture, Gear, Copy Geared, Discard, Templates.
   Commit + Push canned-prompt buttons removed (v2 users run git in
   their own terminal). New Discard clears prompt + gearState + draft.

Plus: TopBar compacted to 36px single row (compact account switcher,
compact telemetry pill, About moved to Settings). GearReviewPane
responsive — stacks vertically at <600px. New empty-state hint guides
users to Capture.

Verification gate:
- Typecheck: clean
- Unit + integration: ~297 tests green
- Build + build:unpack: TokenLess.exe produced
- E2E: 19 passed (incl. 4 new layout cases), 1 skipped, 0 failures

8 tasks (~10 commits) between v2.0.0-phase-4-send and this tag.

Carry-overs to phase 6:
- ConfigsRow at narrow widths may overflow horizontally — Phase 6
  cleanup
- Commit/Push canned-prompt settings (SETTING_PROJECT_COMMIT_PROMPT,
  SETTING_PROJECT_PUSH_PROMPT) still in the codebase — Phase 6 removes
- Drag-resize handle on the drawer may be deferred if Task 4 shipped
  fixed-height — Phase 6 follow-up
- Skill dropdown still in ConfigsRow — Phase 6 evaluates whether to
  drop it
- Single-pane toggle (<500px) deferred per spec — Phase 6 or v2.1+"
```

Do NOT push the tag — user pushes.

---

## Self-review

**Spec coverage (§9 phase plan row 5: "Sidebar collapse, MainPane vertical reflow, TopBar compaction, half-screen scenarios + E2E."):**
- Sidebar collapse: Task 1 (setting) + Task 2 (icon strip + popovers) ✓
- MainPane vertical reflow: Task 4 (unify Composer + drawer) ✓
- TopBar compaction: Task 3 ✓
- Half-screen scenarios + E2E: Task 7 ✓

Additional spec §5 items covered:
- Discard button: Task 6 ✓
- Empty-state hint: Task 6 ✓
- ActionsRow final 5-button shape: Task 6 ✓
- GearReviewPane responsive at <600px: Task 5 ✓
- Drawer chevron close: Task 5 ✓

**Placeholder scan:** No "TBD" / "TODO". The drag-resize handle in Task 4 is implementer-discretion (ship if feasible; defer if not). Documented. ✓

**Type consistency:**
- `SETTING_LAYOUT_SIDEBAR_COLLAPSED` defined once in `src/shared/types/settings-keys.ts`, consumed in AppShell. ✓
- `onDiscard: () => void` added to ActionsRow props (Task 6), threaded from Composer's `handleDiscard`. ✓
- `onClose` (renamed from `onCancel`) added to GearReviewPane props (Task 4), threaded from Composer's `handleGearCancel`. ✓

**Open notes resolved inline:**
- Task 2 explicitly offers a fallback "temporarily expand sidebar" pattern if a proper popover is too thorny. ✓
- Task 4 explicitly allows deferring drag-resize to a follow-up. ✓
- ConfigsRow narrow-width overflow is documented as known in S-v2.3, deferred to Phase 6. ✓

---

## Exit state

- Branch `v2/headless` advanced by ~10 commits + 1 tag (`v2.0.0-phase-5-layout`).
- App builds + launches; comfortable at 720×900. Sidebar collapses, GearReview drawer slides in below composer, ActionsRow has 5 final buttons.
- Unit + integration suite green at ~297 tests.
- E2E suite green at 19 passed (incl. 4 new layout cases), 1 skipped, 0 failures.
- v2 user flow fully functional: Capture → edit → Gear → review drawer → Copy Geared OR Discard.
- `package.json`, DB schema, CLAUDE.md unchanged (Phase 6).
- Tag `v2.0.0-phase-5-layout` exists locally, awaiting user push.

Phase 6 plan (`2026-05-16-phase-6-cleanup.md`) — the consolidated polish pass: dev-runner simplification, CLAUDE.md rewrite, ADR-043+ for v2 decisions, GitHub Actions workflow updates, e2e suite refresh, scenarios doc rewrite, deferred Logger categories, deferred CSS rules, deferred settings, spec amendments, ConfigsRow narrow-width fixes — is the next planning step.

---
