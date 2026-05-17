# Phase 1: Strip the embedded PTY — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every line of code that exists only to host the embedded Claude Code subprocess in TokenLess, leaving the app buildable, launchable, and with a passing test suite. The Composer + GearReviewPane still render; they just can't send to a terminal yet (the "Send" wiring becomes a no-op, replaced in Phase 4).

**Architecture:** Pure-deletion phase plus minimal stubbing at the two call sites that consume `tokenless.cc.*` (`AppShell.tsx`, `Composer.tsx`). All terminal-only files in `src/main/cc/`, `src/main/ipc/cc-handler.ts`, `src/shared/ipc/cc.ts`, `src/shared/types/cc-events.ts`, `src/renderer/src/components/terminal/`, and the two `use-cc-*` hooks are deleted outright. `node-pty`, `@xterm/xterm`, and `@xterm/addon-fit` are removed from `package.json`. The DB schema is unchanged — Phase 2 handles the migration. The Logger categories used by the deleted modules remain registered until Phase 6 cleanup so existing log archives still parse.

**Tech Stack:** TypeScript 5 strict, Electron 32, electron-vite 2, React 18, Vitest 2, better-sqlite3 11 (retained), @anthropic-ai/sdk 0.30.

**Branch:** All work happens on `v2/headless`. Phase exit is signed/annotated tag `v2.0.0-phase-1-strip-pty`.

---

## Out of scope

- DB schema migration (Phase 2 handles `0010_headless.sql`).
- Removing branching UI, summary refresher, response accumulator, feedback UI, hung/crash modals' downstream code paths — they are referenced by the renderer but become dead code after this phase. Phase 2 deletes them.
- Adding the clipboard capture/send IPC (Phase 3 + Phase 4).
- Layout reflow for half-screen (Phase 5).
- Updating `CLAUDE.md`, `docs/decisions.md`, `dev-runner.mjs`, GitHub Actions workflows (Phase 6 cleanup).
- E2E suite rewrite — Phase 1 only needs the unit + integration suite + a `build` pass. `composer.e2e.test.ts` is expected to fail after this phase and is fixed in Phase 4 along with the action-row count assertion.

---

## File structure (created / modified / deleted)

**Deleted (29 files):**
- `src/main/cc/` (9 files: `index.ts`, `lifecycle.ts`, `spawner.ts`, `parser.ts`, `response-accumulator.ts`, `watchdog.ts`, `ansi.ts`, `telemetry-emitter.ts`, `types.ts`)
- `src/main/ipc/cc-handler.ts`
- `src/main/__tests__/cc/` (8 files)
- `src/main/__tests__/ipc/cc-handler.integration.test.ts`
- `src/shared/ipc/cc.ts`
- `src/shared/types/cc-events.ts`
- `src/renderer/src/components/terminal/` (5 files: `TerminalPane.tsx`, `TerminalToolbar.tsx`, `TerminalSection.tsx`, `HungBanner.tsx`, `styles.css`)
- `src/renderer/src/hooks/use-cc-subscription.ts`
- `src/renderer/src/hooks/use-cc-events.ts`
- `src/renderer/src/hooks/__tests__/use-cc-subscription.unit.test.tsx`
- `src/renderer/src/hooks/__tests__/use-cc-events.unit.test.tsx`

**Modified:**
- `src/renderer/src/components/layout/MainPane.tsx` — remove `<TerminalSection/>` import + render
- `src/renderer/src/components/layout/AppShell.tsx` — strip `cc.start/resume/stop/onCrashed/onHung` calls; remove `<ClaudeNotFoundModal/>` mount
- `src/renderer/src/components/composer/Composer.tsx` — strip `cc.send` call from the Send button handler (handler becomes a no-op + dev-mode toast "Send disabled in v2-phase-1")
- `src/renderer/src/components/notifications/ClaudeNotFoundModal.tsx` — file kept but unmounted; deleted in Phase 2
- `src/preload/index.ts` — remove `cc:` import block (lines 23–33 + 67–83) and the `cc:` API namespace (lines 294–338)
- `src/shared/ipc.ts` — remove the `cc:*` re-export block (lines 87–120) and the corresponding entries in `IpcChannelName` union (lines 286–296)
- `src/main/ipc/index.ts` — unregister `registerCcHandler` (or equivalent) wiring
- `package.json` — remove `node-pty`, `@xterm/xterm`, `@xterm/addon-fit` dependencies; simplify `rebuild:electron` and `rebuild:node` scripts; remove the dead `build.files`/`build.asarUnpack` node-pty entries (electron-builder.yml is the active config)

**Created:** none.

---

## Tasks

### Task 1: Delete renderer terminal components

**Files:**
- Delete: `src/renderer/src/components/terminal/TerminalPane.tsx`
- Delete: `src/renderer/src/components/terminal/TerminalToolbar.tsx`
- Delete: `src/renderer/src/components/terminal/TerminalSection.tsx`
- Delete: `src/renderer/src/components/terminal/HungBanner.tsx`
- Delete: `src/renderer/src/components/terminal/styles.css`

- [ ] **Step 1: Confirm no other renderer file imports from `components/terminal/`**

Run: `git grep -n "components/terminal/" src/renderer`

Expected: only matches inside the `src/renderer/src/components/terminal/` folder itself or from `AppShell.tsx`/`MainPane.tsx` (which we update in Tasks 3 + 4).

- [ ] **Step 2: Delete the directory**

```bash
git rm -r src/renderer/src/components/terminal
```

- [ ] **Step 3: Verify**

Run: `git status --short -- src/renderer/src/components/terminal`

Expected: five `D` lines (one per deleted file).

- [ ] **Step 4: Commit**

```bash
git add -u src/renderer/src/components/terminal
git commit -m "refactor(phase-1): delete renderer terminal components

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Delete renderer cc-* hooks + their tests

**Files:**
- Delete: `src/renderer/src/hooks/use-cc-subscription.ts`
- Delete: `src/renderer/src/hooks/use-cc-events.ts`
- Delete: `src/renderer/src/hooks/__tests__/use-cc-subscription.unit.test.tsx`
- Delete: `src/renderer/src/hooks/__tests__/use-cc-events.unit.test.tsx`

- [ ] **Step 1: Confirm no renderer file outside the terminal folder (already deleted) imports either hook**

Run: `git grep -n "use-cc-subscription\|use-cc-events" src/renderer`

Expected: only the four files we're about to delete + their own contents. No outside imports.

- [ ] **Step 2: Delete the files**

```bash
git rm src/renderer/src/hooks/use-cc-subscription.ts
git rm src/renderer/src/hooks/use-cc-events.ts
git rm src/renderer/src/hooks/__tests__/use-cc-subscription.unit.test.tsx
git rm src/renderer/src/hooks/__tests__/use-cc-events.unit.test.tsx
```

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor(phase-1): delete use-cc-* renderer hooks + tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Strip `<TerminalSection/>` from MainPane

**Files:**
- Modify: `src/renderer/src/components/layout/MainPane.tsx`

- [ ] **Step 1: Read the current file to know exactly what to remove**

```bash
cat src/renderer/src/components/layout/MainPane.tsx
```

- [ ] **Step 2: Remove the `import { TerminalSection } from '../terminal/TerminalSection'` line and the `<TerminalSection ... />` JSX element from MainPane's render output**

The file should retain its existing layout-component shell — keep Composer + GearReviewPane + any other surviving children. Replace the `<TerminalSection ... />` element with nothing (an empty React fragment is unnecessary).

- [ ] **Step 3: If any props were only used by `<TerminalSection/>`, remove them from the MainPane prop types**

Specifically, check for `conversationId`, `cwd`, `cols`, `rows`, `accountId` props that may have been threaded through MainPane only to reach TerminalSection. Composer needs `conversationId`; the rest can go if nothing else consumes them.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`

Expected: still fails because of the `cc:*` references elsewhere — that's fine for now. Look for any error specifically inside `MainPane.tsx`. If MainPane has no errors, this task is good.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/layout/MainPane.tsx
git commit -m "refactor(phase-1): drop TerminalSection from MainPane

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Strip `tokenless.cc.*` calls from AppShell

**Files:**
- Modify: `src/renderer/src/components/layout/AppShell.tsx`

- [ ] **Step 1: Identify the call sites**

Run: `git grep -n "tokenless\.cc\.\|ClaudeNotFoundModal\|HungBanner" src/renderer/src/components/layout/AppShell.tsx`

Expected: hits for `cc.start(...)`, `cc.resume(...)`, `cc.stop(...)`, `cc.onCrashed(...)`, `cc.onHung(...)`, and a `<ClaudeNotFoundModal ... />` mount. Note line numbers.

- [ ] **Step 2: Remove each call + its surrounding hook**

For each `useEffect` block that wires a `cc.*` subscription or invokes `cc.start/resume/stop`, delete the entire effect. The conversation-creation handler keeps everything except the `cc.start({...})` call — replace that call with a comment `// v2-phase-4 will route the geared prompt to the clipboard; no PTY to start.`. Same for the conversation-switch handler (drop the `cc.resume` call). The conversation-delete handler drops `cc.stop`.

Remove all `useState` that exists only to hold a crash/hung message; remove the `<ClaudeNotFoundModal ... />` JSX. Remove the corresponding state setters from `useEffect` cleanups.

Keep the `ToastHost`, account/project state, conversation list state — those are independent.

- [ ] **Step 3: Remove the import**

Delete the `import { ClaudeNotFoundModal } from '../notifications/ClaudeNotFoundModal'` line.

- [ ] **Step 4: Run typecheck for this file**

Run: `npm run typecheck`

Expected: AppShell.tsx-specific errors should be gone (errors from the still-existing `cc:*` exports elsewhere are fine — they get cleaned up in Tasks 6–10).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/layout/AppShell.tsx
git commit -m "refactor(phase-1): drop cc.* lifecycle wiring from AppShell

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: No-op the Send button handler in Composer

**Files:**
- Modify: `src/renderer/src/components/composer/Composer.tsx`

- [ ] **Step 1: Locate the `cc.send` call site**

Run: `git grep -n "tokenless\.cc\.send\|cc\.send(" src/renderer/src/components/composer/Composer.tsx`

Expected: one call site inside a click handler for the Send button (typically `handleSend` or `onSend`).

- [ ] **Step 2: Replace the body of the send handler**

Replace the `await window.tokenless.cc.send({...})` call (and any surrounding turn-id handling) with:

```typescript
// Phase 1: PTY is gone. Phase 4 will route the geared prompt to the clipboard.
// For now the Send button does nothing visible; in dev-mode we surface a hint.
if (import.meta.env.DEV) {
  // Logger via window.tokenless.log
  window.tokenless.log.send({
    id: `composer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    ts: Date.now(),
    severity: 'info',
    category: 'lifecycle',
    event: 'send-button-noop',
    message: 'Send button is a no-op in v2-phase-1; clipboard send arrives in phase 4.',
    fingerprint: 'composer-send-noop',
    source: 'renderer'
  })
}
```

Keep the surrounding draft-clear logic intact (the gear-review-pane teardown, the prompt textarea reset). Keep the button enabled — disabling it is a layout concern handled in Phase 5.

- [ ] **Step 3: Remove any imports that are no longer used (`CcSendRequest`, `CcSendResult`, `GearMeta` if only used here)**

Run: `npm run typecheck` and address only the Composer-local "imported but never used" warnings.

- [ ] **Step 4: Update / delete `turn-feedback-bar.unit.test.tsx` only if its setup imports `cc.send` directly**

Run: `git grep -n "cc\.send\|tokenless\.cc" src/renderer/src/components/composer/__tests__`

Expected: no matches. If matches exist, mock them out (return a static turnId) so the test stays meaningful. If the test was wholly about post-send behavior, leave it; it'll be reworked in Phase 2.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/composer/Composer.tsx
git commit -m "refactor(phase-1): make Composer send a no-op (clipboard wiring arrives phase 4)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Remove the `cc` namespace from preload

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Delete the `cc:*` channel imports**

Inside the import block at the top of the file, remove every line that starts with `IPC_CC_` or any `Cc*` type import. The block currently spans lines 23–33 and 67–83 of the file — remove those imports entirely.

- [ ] **Step 2: Delete the `cc:` API namespace from the `api` object**

The `cc: { ... }` block spans roughly lines 294–338 in the current preload. Remove the whole block, including the trailing comma. The block immediately above (`turns: {...}`) keeps its trailing comma; the block immediately below (`telemetry: {...}`) is unaffected.

- [ ] **Step 3: Update the preload's `window.tokenless` shape declaration**

If there is a TypeScript `declare global` or `.d.ts` describing `window.tokenless`, drop the `cc:` member from it. Likely path: `src/renderer/src/env.d.ts` or `src/preload/index.d.ts`. Run `git grep -n "cc:" src/preload src/renderer/src/env.d.ts` to find it.

- [ ] **Step 4: Verify the build at least typechecks the preload**

Run: `npm run typecheck` — preload-side errors related to `IPC_CC_*` or `Cc*` should be gone. Renderer-side errors will still exist (Tasks 7, 9 fix them).

- [ ] **Step 5: Commit**

```bash
git add src/preload/index.ts src/renderer/src/env.d.ts src/preload/index.d.ts 2>/dev/null || true
git commit -m "refactor(phase-1): drop cc namespace from preload api

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Remove cc re-exports from shared/ipc.ts

**Files:**
- Modify: `src/shared/ipc.ts`

- [ ] **Step 1: Delete the cc re-export block**

Currently lines 87–120 — the block beginning `export { IPC_CC_START, ...` and ending `} from './ipc/cc'`. Remove the entire block.

- [ ] **Step 2: Delete the corresponding entries in the `IpcChannelName` union**

Currently lines 286–296 of `src/shared/ipc.ts`:

```typescript
  | 'cc:start'
  | 'cc:send'
  | 'cc:resize'
  | 'cc:output-chunk'
  | 'cc:exit'
  | 'cc:event'
  | 'cc:stop'
  | 'cc:resume'
  | 'cc:crashed'
  | 'cc:hung'
  | 'cc:input'
```

Delete all 11 lines.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: errors now point only at `src/shared/ipc/cc.ts` itself (still on disk), `src/main/ipc/cc-handler.ts`, `src/main/cc/*`, and `src/main/__tests__/cc/*`. Tasks 8–11 clean those up.

- [ ] **Step 4: Commit**

```bash
git add src/shared/ipc.ts
git commit -m "refactor(phase-1): remove cc re-exports from shared/ipc

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Delete shared IPC + types for cc

**Files:**
- Delete: `src/shared/ipc/cc.ts`
- Delete: `src/shared/types/cc-events.ts`

- [ ] **Step 1: Confirm no other shared file imports cc-events**

Run: `git grep -n "cc-events\|CcEvent" src/shared`

Expected: only the file `src/shared/types/cc-events.ts` itself and `src/shared/ipc/cc.ts` (both deleted in this task).

- [ ] **Step 2: Confirm no main-side file outside `src/main/cc/` or `src/main/ipc/cc-handler.ts` imports them**

Run: `git grep -n "cc-events\|CcEvent\|from.*shared/ipc/cc'" src/main`

Expected: matches only inside `src/main/cc/` and `src/main/ipc/cc-handler.ts`. Those get deleted in Tasks 9–10.

- [ ] **Step 3: Delete the files**

```bash
git rm src/shared/ipc/cc.ts src/shared/types/cc-events.ts
```

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(phase-1): delete shared cc.ts + cc-events.ts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Delete cc-handler + unregister from main IPC index

**Files:**
- Delete: `src/main/ipc/cc-handler.ts`
- Modify: `src/main/ipc/index.ts`

- [ ] **Step 1: Inspect the registration in `src/main/ipc/index.ts`**

```bash
cat src/main/ipc/index.ts
```

Identify the line importing `./cc-handler` (likely `import { registerCcHandler } from './cc-handler'` or `import { CcHandler } from './cc-handler'`) and the call site that wires it into the dispatch table.

- [ ] **Step 2: Remove the import line and the registration call**

The pattern across other handlers in this file is `registerXHandler(deps)`. Find the `registerCcHandler` call (or the `new CcHandler(deps).register()` pattern) and delete those lines. Other handlers in the same function continue to be registered.

- [ ] **Step 3: Delete the handler file**

```bash
git rm src/main/ipc/cc-handler.ts
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`

Expected: errors now point only at `src/main/cc/*` (deleted in Task 10) and `src/main/__tests__/cc/*` + `src/main/__tests__/ipc/cc-handler.integration.test.ts` (deleted in Task 11).

- [ ] **Step 5: Commit**

```bash
git add -u src/main/ipc
git commit -m "refactor(phase-1): delete cc-handler.ts and unregister it

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Delete the `src/main/cc/` directory

**Files:**
- Delete: `src/main/cc/index.ts`, `lifecycle.ts`, `spawner.ts`, `parser.ts`, `response-accumulator.ts`, `watchdog.ts`, `ansi.ts`, `telemetry-emitter.ts`, `types.ts` (9 files)

- [ ] **Step 1: Confirm nothing outside the folder still imports from it**

Run: `git grep -n "from.*main/cc\|from '\\.\\.\\/cc\\|from '\\.\\/cc" src/main src/preload src/renderer`

Expected: no matches outside `src/main/cc/` itself.

- [ ] **Step 2: Delete the directory**

```bash
git rm -r src/main/cc
```

- [ ] **Step 3: Verify**

Run: `ls src/main/cc 2>&1`

Expected: directory does not exist.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`

Expected: errors now only inside `src/main/__tests__/cc/` and `src/main/__tests__/ipc/cc-handler.integration.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add -u src/main/cc
git commit -m "refactor(phase-1): delete src/main/cc module

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Delete cc-related tests

**Files:**
- Delete: `src/main/__tests__/cc/ansi.unit.test.ts`
- Delete: `src/main/__tests__/cc/lifecycle.integration.test.ts`
- Delete: `src/main/__tests__/cc/lifecycle.unit.test.ts`
- Delete: `src/main/__tests__/cc/parser.unit.test.ts`
- Delete: `src/main/__tests__/cc/response-accumulator.unit.test.ts`
- Delete: `src/main/__tests__/cc/spawner.unit.test.ts`
- Delete: `src/main/__tests__/cc/telemetry-emitter.unit.test.ts`
- Delete: `src/main/__tests__/cc/watchdog.unit.test.ts`
- Delete: `src/main/__tests__/ipc/cc-handler.integration.test.ts`

- [ ] **Step 1: Delete the cc test folder**

```bash
git rm -r src/main/__tests__/cc
git rm src/main/__tests__/ipc/cc-handler.integration.test.ts
```

- [ ] **Step 2: Check the doubles directory for any cc-* mocks left behind**

Run: `git grep -ln "pty\|node-pty\|TerminalPane\|cc:start" test/doubles`

If any doubles are entirely terminal-only, delete them too. Likely candidates: `test/doubles/pty.ts`, `test/doubles/cc-lifecycle.ts`. Surviving doubles that mock just `tokenless.cc.send` in a shared way should be deleted as well — Tasks 4 + 5 removed the only callers.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: PASS (no `cc:*` references remain).

- [ ] **Step 4: Run unit + integration suite**

Run: `npm run test:run`

Expected: PASS, with the test count dropped by roughly 30–40 (8 cc test files + 1 cc-handler test + 2 hook tests). Total should land around 330 tests, down from 371.

If a test file outside the deleted set fails because it referenced a deleted symbol, fix it inline: typically that means removing an assertion that referenced `cc:` state. Conversation/turn integration tests that survive should still pass — they don't actually spawn PTY in the test suite.

- [ ] **Step 5: Commit**

```bash
git add -u src/main/__tests__ test/doubles
git commit -m "refactor(phase-1): delete cc unit + integration tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Remove node-pty + xterm deps + simplify rebuild scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Drop the three dependencies**

In the `dependencies` block of `package.json`, remove these three lines:
```json
    "@xterm/addon-fit": "^0.11.0",
    "@xterm/xterm": "^5.5.0",
    "node-pty": "^1.1.0",
```

- [ ] **Step 2: Update the rebuild scripts**

Replace these two lines in the `scripts` block:
```json
    "rebuild:electron": "electron-rebuild --force --module-dir node_modules/better-sqlite3 && electron-rebuild --force --module-dir node_modules/node-pty",
    "rebuild:node": "npm rebuild better-sqlite3 node-pty",
```
with:
```json
    "rebuild:electron": "electron-rebuild --force --module-dir node_modules/better-sqlite3",
    "rebuild:node": "npm rebuild better-sqlite3",
```

- [ ] **Step 3: Reinstall**

Run: `npm install`

Expected: lockfile updates, `node-pty`, `@xterm/xterm`, `@xterm/addon-fit` are no longer in `node_modules`. No build errors during install (node-pty's compile step often fails on Windows boxes without VS Build Tools — removing it is a quality-of-life win).

- [ ] **Step 4: Run rebuild + typecheck + tests**

Run sequentially:
```bash
npm run rebuild:electron
npm run typecheck
npm run test:run
```

Expected: all three pass. `rebuild:electron` now only rebuilds `better-sqlite3`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "refactor(phase-1): drop node-pty + @xterm/* deps; simplify rebuild scripts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Clean up the dead electron-builder block in package.json

**Files:**
- Modify: `package.json`

`electron-builder.yml` is the active configuration; the `build` block in `package.json` is dead code from earlier scaffolding. It still mentions `node-pty` paths that no longer exist, which would mislead future readers.

- [ ] **Step 1: Remove the `node-pty` file globs from the `build.files` and `build.asarUnpack` arrays**

Specifically, delete these three lines from `build.files`:
```json
      "node_modules/node-pty/prebuilds/**/*",
      "node_modules/node-pty/lib/**/*",
      "node_modules/node-pty/package.json"
```

And these two lines from `build.asarUnpack`:
```json
      "node_modules/node-pty/prebuilds/**/*",
      "node_modules/node-pty/lib/**/*"
```

- [ ] **Step 2: Run typecheck + tests to confirm nothing depends on these strings**

```bash
npm run typecheck
npm run test:run
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(phase-1): clean dead node-pty refs from package.json build block

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Verification gate

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`

Expected: PASS, no errors. The project's two `tsc --noEmit` runs (node + web) both clean.

- [ ] **Step 2: Unit + integration test suite**

Run: `npm run test:run`

Expected: PASS. Total test count ~330 (give or take depending on doubles).

- [ ] **Step 3: Build the renderer + main bundles**

Run: `npm run build`

Expected: PASS. `out/main/index.js`, `out/preload/index.js`, `out/renderer/index.html` produced.

- [ ] **Step 4: Build unpacked Electron app**

Run: `npm run build:unpack`

Expected: PASS. `dist/win-unpacked/TokenLess.exe` produced. Launching it manually should show the app with sidebar + TopBar + Composer + GearReviewPane (no terminal pane).

- [ ] **Step 5: Run E2E suite (best-effort)**

Run: `npm run test:e2e`

Expected: `composer.e2e.test.ts` fails its action-row count assertion (currently expects 6) and any test that spawns a conversation + waits for PTY output fails. This is the *expected* state at phase exit — the suite is fixed in Phase 4. If a non-terminal-related test fails (e.g., a smoke test of the sidebar), investigate and fix before tagging.

- [ ] **Step 6: Tag the phase exit**

```bash
git tag -a v2.0.0-phase-1-strip-pty -m "Phase 1: embedded PTY + xterm + node-pty removed.

App still builds + launches. Composer Send button is a no-op until phase 4
wires clipboard send-back. E2E composer + smoke suites have known failures
that will be fixed in phase 4 along with the action-row count update.

Test suite: $(git log -1 --format=%h)
Tests passing: ~330 (down from 371)."
```

Do NOT push the tag yet — leave that to the user.

- [ ] **Step 7: Append a one-line summary to `docs/superpowers/specs/2026-05-16-tokenless-v2-headless-design.md` under §9 (phase plan table) status column**

Optional but good practice — mark Phase 1 as "shipped at v2.0.0-phase-1-strip-pty (commit hash)" so the spec stays a living index.

---

## Self-review

**Spec coverage:** Phase 1 in the spec (§9) is "Delete `src/main/cc/`, `cc-handler.ts`, terminal renderer components + hooks, preload `cc` namespace, node-pty + @xterm/* deps, electron-builder unpacks. App still builds + runs with a placeholder MainPane." → covered by Tasks 1–13. Verification gate covered by Task 14. ✓

**Placeholder scan:** no "TBD" / "TODO" / "fill in" / "appropriate" hedging. Every code block contains exact code or exact diff instructions. ✓

**Type consistency:** the deletions don't introduce new types. The Composer no-op handler references `window.tokenless.log.send(record)` — that surface exists already in the preload (see lines 161–164 of `src/preload/index.ts`); the record shape matches `LogRecord` from `@shared/observability`. ✓

**Open notes resolved inline:** Task 5 marks the Send button no-op + dev log. Task 6 tells the engineer to grep for the preload typings file rather than guessing the path. Task 11 covers the doubles directory pragmatically. ✓

---

## Exit state

- Branch `v2/headless` advanced by 13 commits + 1 tag.
- App builds via `npm run build` and `npm run build:unpack`.
- App launches; user sees sidebar + Composer + GearReviewPane; Send button is visible but does nothing.
- Unit + integration suite green at ~330 tests.
- E2E has documented expected failures (`composer.e2e.test.ts`, conversation flow smoke). Phase 4 fixes them.
- `package.json` no longer references `node-pty`, `@xterm/xterm`, or `@xterm/addon-fit`. `rebuild:electron` only handles `better-sqlite3`.
- Logger categories used by deleted modules remain registered (cleanup in Phase 6).
- DB schema is unchanged (migration in Phase 2).
- CLAUDE.md is unchanged (rewrite in Phase 6).
- Tag `v2.0.0-phase-1-strip-pty` exists locally, awaiting user push.

Phase 2 plan (`2026-05-16-phase-2-strip-dependents.md`) is the next planning step — written after Phase 1 ships, not now, because the precise file diffs depend on Phase 1's final state.

---
