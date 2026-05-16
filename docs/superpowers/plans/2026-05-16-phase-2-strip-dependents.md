# Phase 2: Strip Dependents — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every feature in the renderer + main process that exists only to serve the now-deleted PTY: response feedback UI, branching, send-confirmation modal, the SummaryRefresher background job, and the leftover `ClaudeNotFoundModal` file. Land the DB migration that drops every PTY-shaped column from `conversations` + `turns` and deletes all assistant-role rows. App still builds + launches with a thinner Composer (no Branch button, no feedback bar, no confirm prompt) and a cleaner sidebar (no branch indicator).

**Architecture:** Renderer-first deletion, then matching main-process IPC + DAO cleanup, then the schema migration last (so DAOs are already not reading the dropped columns when the migration runs). The migration relies on the existing `runMigrations()` infrastructure in `src/main/db/migrations/runner.ts` which automatically copies the whole DB to `backupsDir` before any pending migration applies — that whole-DB SQLite copy IS the v1 recovery artifact, no separate JSONL export is required.

**Tech Stack:** TypeScript 5 strict, Electron 32, electron-vite 2, React 18, Vitest 2, better-sqlite3 11 (SQLite 3.45 — supports `ALTER TABLE DROP COLUMN`), @anthropic-ai/sdk 0.30.

**Branch:** All work happens on `v2/headless`. Phase exit is annotated tag `v2.0.0-phase-2-strip-dependents`.

---

## Out of scope

- Adding clipboard capture / send IPC (Phase 3 + Phase 4).
- Layout reflow for half-screen (Phase 5).
- Updating `CLAUDE.md`, `docs/decisions.md`, `dev-runner.mjs`, GitHub Actions workflows (Phase 6).
- Removing the `cc` + `pty` Logger categories from `src/shared/observability.ts` (Phase 6 — historical log archives need them to parse).
- Renaming Composer's `actuallySend` identifier (Phase 4 replaces the whole handler).
- Deleting the `summary-prompt.md` file — bundled raw via `import 'summary-refresher'`, deleted as part of the Task 2 cleanup.

---

## Design decisions captured during planning

| Decision | Choice | Why |
|---|---|---|
| v1 transcript backup format | Existing whole-DB SQLite copy via `backupDb()` | More recoverable than a JSONL export, less code to write/test, already gated on migration runs. ADR in phase 6. |
| Schema migration mechanic | `ALTER TABLE ... DROP COLUMN` | SQLite 3.45 (bundled in better-sqlite3 11) supports it. No table-recreate dance needed. |
| Migration filename | `003_v2_headless.sql` | Continues the existing numeric prefix convention (001_init, 002_skills_path_unique). |
| `idx_turns_feedback` index | Dropped automatically by `ALTER TABLE DROP COLUMN feedback` | SQLite removes indexes that reference dropped columns. No explicit DROP INDEX needed, but verify in the migration test. |
| Assistant turn deletion ordering | `DELETE FROM turns WHERE role = 'assistant'` BEFORE the `ALTER ... DROP COLUMN role` | Once `role` is dropped we can't reference it. The migration sequences this within the same transaction. |
| `conversations.status` column | Kept as `'active' \| 'ended'` | Even without a PTY, ended-vs-active is still meaningful at the workspace level. Phase 2 doesn't touch it. |
| Phase-1 carry-over: dead CSS | Task 1 of this plan cleans the `.main-pane__terminal-area` rule | Small enough to bundle here rather than push to phase 6. |
| Phase-1 carry-over: AppShell `activeAccountId` guard | Cleaned in Task 5 (branching renderer cleanup) | The guard sits in `handleBranchConversation` which is fully removed there. |

---

## File structure (created / modified / deleted)

**Created:**
- `src/main/db/migrations/003_v2_headless.sql` — the schema migration
- `src/main/__tests__/db/migrations/003-v2-headless.integration.test.ts` — migration verification

**Modified:**
- `src/renderer/src/components/composer/Composer.tsx` — drop `<TurnFeedbackBar>`, `<ConfirmModal>` send-confirmation, `showFeedbackBar`/`lastTurn`/`confirmSendOpen`/`pendingSendRef` state, `handleConfirmSend`, `updateFeedback` import/usage
- `src/renderer/src/components/composer/ActionsRow.tsx` — drop the Branch button + `onBranch` prop
- `src/renderer/src/components/composer/styles.css` — drop the `.turn-feedback-bar` block
- `src/renderer/src/components/layout/AppShell.tsx` — drop `handleBranchConversation`, the `branch` destructure from `useConversations()`, the over-defensive `activeAccountId` guard
- `src/renderer/src/components/layout/MainPane.tsx` — drop the `onBranch` prop (no longer needs threading)
- `src/renderer/src/components/layout/ConversationListItem.tsx` — drop the `is-branch` class derivation
- `src/renderer/src/components/layout/styles.css` — drop the `.conversation-item.is-branch` styles AND the leftover `.main-pane__terminal-area` rule (phase-1 carry-over)
- `src/renderer/src/hooks/use-conversations.ts` — drop the `branch` action
- `src/preload/index.ts` + `src/preload/index.d.ts` — drop `conversations.branch`, `turns.updateFeedback`, `turns.getFeedbackSummary`
- `src/shared/ipc.ts` — drop `IPC_CONVERSATIONS_BRANCH`, `IPC_TURNS_UPDATE_FEEDBACK`, `IPC_TURNS_FEEDBACK_SUMMARY` re-exports + matching `IpcChannelName` union entries
- `src/shared/ipc/conversations.ts` — drop `IPC_CONVERSATIONS_BRANCH` + `BranchConversation*` types
- `src/shared/ipc/turns.ts` — drop `IPC_TURNS_UPDATE_FEEDBACK`, `IPC_TURNS_FEEDBACK_SUMMARY` + matching types
- `src/shared/types/conversations.ts` — drop `ccSessionId`, `summary`, `summaryUpdatedAt`, `parentConversationId`, `branchedAtTurnId` from `Conversation`; drop `BranchConversationInput`; drop `summary` from `UpdateConversationInput`; drop `ccSessionId` from `UpdateConversationInput`
- `src/shared/types/turns.ts` — drop `TurnRole`, `role` from `Turn`, `responseText`, `responseTokens`, `feedback`, `Feedback`, `FeedbackSummary` types
- `src/main/db/dao/conversations.ts` — drop `branchConversation` function; drop the cc_session_id / summary / summary_updated_at / parent_conversation_id / branched_at_turn_id mappings in `mapRow` and any INSERT/UPDATE handling those columns
- `src/main/db/dao/turns.ts` — drop `createAssistantTurn`, `updateFeedback`, `getFeedbackSummary`; drop `response_text`/`response_tokens`/`feedback`/`role` from `mapRow` and INSERT statements
- `src/main/ipc/conversations-handler.ts` — drop the `conversations:branch` IPC handler method + its install/uninstall hooks
- `src/main/ipc/turns-handler.ts` — drop the `turns:update-feedback` + `turns:feedback-summary` handlers
- `src/main/ipc/index.ts` — drop the `summaryRefresher` instantiation (was orphan-instantiated after Phase 1)
- `src/main/db/migrations/index.ts` — append migration 003 to the `MIGRATIONS` array
- `src/main/__tests__/db/dao-conversations.integration.test.ts` — drop the assertions about dropped columns + the branch-call cases
- `src/main/__tests__/db/dao-turns.integration.test.ts` — drop assistant-role assertions, feedback tests, response-related tests; reshape to user-rows-only
- `src/main/__tests__/ipc/conversations-handler.integration.test.ts` — drop the branch IPC test cases
- `src/main/__tests__/ipc/turns-handler.integration.test.ts` — drop the feedback IPC test cases
- `docs/superpowers/specs/2026-05-16-tokenless-v2-headless-design.md` — mark Phase 2 shipped in §9 phase table (last commit of the phase)

**Deleted:**
- `src/main/gearing/summary-refresher.ts`
- `src/main/gearing/summary-prompt.md`
- `src/main/__tests__/gearing/summary-refresher.unit.test.ts`
- `src/renderer/src/components/composer/TurnFeedbackBar.tsx`
- `src/renderer/src/components/composer/__tests__/turn-feedback-bar.unit.test.tsx`
- `src/renderer/src/components/notifications/ClaudeNotFoundModal.tsx` (+ associated CSS in `src/renderer/src/components/notifications/styles.css` if any)
- `src/main/__tests__/db/dao-conversations-branch.integration.test.ts`

---

## Tasks

### Task 1: Phase-1 carry-over cleanup

**Files:**
- Modify: `src/renderer/src/components/layout/styles.css`
- Modify: `src/renderer/src/components/layout/AppShell.tsx`

- [ ] **Step 1: Drop the dead `.main-pane__terminal-area` CSS rule**

Read `src/renderer/src/components/layout/styles.css`. Locate the `.main-pane__terminal-area { ... }` block (line ~244 per phase-1 reviewer). Delete the entire block. Leave neighboring rules intact.

- [ ] **Step 2: Verify**

Run: `git grep -n "main-pane__terminal-area" src/renderer`

Expected: zero hits.

- [ ] **Step 3: Tighten the `activeAccountId` guard in AppShell.handleBranchConversation**

This branch handler is removed entirely in Task 5. For now we leave it alone — the over-defensive guard isn't worth a separate commit when Task 5 will delete the whole function.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/layout/styles.css
git commit -m "chore(phase-2): drop dead .main-pane__terminal-area CSS rule

Carry-over flagged during phase 1 review.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Delete SummaryRefresher

**Files:**
- Delete: `src/main/gearing/summary-refresher.ts`
- Delete: `src/main/gearing/summary-prompt.md`
- Delete: `src/main/__tests__/gearing/summary-refresher.unit.test.ts`
- Modify: `src/main/ipc/index.ts`

- [ ] **Step 1: Confirm no surviving callers**

Run: `git grep -n "SummaryRefresher\|summary-refresher\|summary-prompt" src test`

Expected: matches only inside the 3 files about to be deleted, plus the instantiation site in `src/main/ipc/index.ts` (line ~74 — the orphan flagged in phase-1 review).

- [ ] **Step 2: Remove the instantiation from `src/main/ipc/index.ts`**

Open `src/main/ipc/index.ts`. Find:
```typescript
import { SummaryRefresher } from '@main/gearing/summary-refresher'
```
Delete that import line.

Find:
```typescript
  const summaryRefresher = new SummaryRefresher({
    db, registry: clientRegistry, logger
  })
```
Delete that block (3 lines).

Find in `uninstallAll`:
```typescript
      summaryRefresher.stop()
```
Delete that line.

Run: `git grep -n "summaryRefresher\|SummaryRefresher" src/main/ipc/index.ts` — should be empty.

- [ ] **Step 3: Delete the SummaryRefresher source + prompt + test**

```bash
git rm src/main/gearing/summary-refresher.ts
git rm src/main/gearing/summary-prompt.md
git rm src/main/__tests__/gearing/summary-refresher.unit.test.ts
```

- [ ] **Step 4: Run typecheck + tests**

```bash
npm run typecheck
npm run test:run
```

Expected: both PASS. Test count drops by however many tests the summary-refresher unit test held (~5-10).

- [ ] **Step 5: Commit**

```bash
git add -u src/main/gearing src/main/__tests__/gearing src/main/ipc/index.ts
git commit -m "refactor(phase-2): delete SummaryRefresher

No longer triggered after phase 1 deleted the response-complete event.
The whole-DB SQLite migration backup covers v1 summary preservation
for any user who wants to recover.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Strip feedback UI from renderer

**Files:**
- Modify: `src/renderer/src/components/composer/Composer.tsx`
- Delete: `src/renderer/src/components/composer/TurnFeedbackBar.tsx`
- Delete: `src/renderer/src/components/composer/__tests__/turn-feedback-bar.unit.test.tsx`
- Modify: `src/renderer/src/components/composer/styles.css`

- [ ] **Step 1: In `Composer.tsx`, delete the TurnFeedbackBar JSX block + supporting state**

Remove:
- `import { TurnFeedbackBar } from './TurnFeedbackBar'` (line ~23)
- The `<TurnFeedbackBar turnId={lastTurn.id} onSubmit={...} />` JSX block (lines ~354-359)
- The `showFeedbackBar` state, the `lastTurn` state, any `useEffect` that hydrates `lastTurn` from a turns:changed subscription, and any helper that calls `updateFeedback`
- The `const { updateFeedback } = useTurns(...)` destructuring (the hook itself is kept; only the destructured method goes — verify nothing else in Composer uses `updateFeedback`)

If `useTurns()` is not called elsewhere in Composer.tsx after these removals, remove the hook import entirely.

- [ ] **Step 2: Delete the TurnFeedbackBar component + test**

```bash
git rm src/renderer/src/components/composer/TurnFeedbackBar.tsx
git rm src/renderer/src/components/composer/__tests__/turn-feedback-bar.unit.test.tsx
```

- [ ] **Step 3: Drop the `.turn-feedback-bar` CSS block**

In `src/renderer/src/components/composer/styles.css`, delete the entire `/* ===== TurnFeedbackBar ===== */` comment and the rules that follow it until the next `/* ===== */` comment.

- [ ] **Step 4: Verify**

```bash
git grep -n "TurnFeedbackBar\|turn-feedback-bar\|showFeedbackBar\|lastTurn" src/renderer
```
Expected: zero hits (or only matches in surviving doc files).

```bash
npm run typecheck
```
Expected: PASS. There may be unused-import lints if `useTurns` or `Feedback` were left dangling; clean them up.

- [ ] **Step 5: Commit**

```bash
git add -u src/renderer/src/components/composer
git commit -m "refactor(phase-2): drop TurnFeedbackBar + feedback UI from Composer

v2 doesn't see assistant responses (they live in the user's external
terminal), so feedback buttons can't operate on anything. Phase 2
removes them; their main-process plumbing goes in the next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Strip feedback IPC + DAO methods from main

**Files:**
- Modify: `src/main/ipc/turns-handler.ts`
- Modify: `src/main/db/dao/turns.ts`
- Modify: `src/shared/ipc/turns.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/main/__tests__/ipc/turns-handler.integration.test.ts`

- [ ] **Step 1: Delete `updateFeedback` + `getFeedbackSummary` from the DAO**

In `src/main/db/dao/turns.ts`, delete the `updateFeedback(db, id, feedback)` function (line ~98) and the `getFeedbackSummary(db)` function (lines ~135-141). Leave `createUserTurn`, `getTurnById`, `listByConversation` intact.

Also delete `createAssistantTurn` (line ~85) — no caller remains after phase 1 + Task 2. Verify with: `git grep -n "createAssistantTurn" src test` (should be empty after deletion).

- [ ] **Step 2: Delete the matching handlers in `turns-handler.ts`**

Find the methods that wrap `updateFeedback` and `getFeedbackSummary` (named something like `handleUpdateFeedback`, `handleFeedbackSummary`). Delete those methods. Delete the `ipcMain.handle(IPC_TURNS_UPDATE_FEEDBACK, ...)` and `ipcMain.handle(IPC_TURNS_FEEDBACK_SUMMARY, ...)` calls in `install()`. Delete the `ipcMain.removeHandler(...)` calls in `uninstall()`.

Leave the `listByConversation` handler + `turns:changed` broadcast intact.

- [ ] **Step 3: Delete the IPC constants in `src/shared/ipc/turns.ts`**

Remove the `IPC_TURNS_UPDATE_FEEDBACK` and `IPC_TURNS_FEEDBACK_SUMMARY` constants + their request/response/result types. Also remove `FeedbackSummary` import if it came from `@shared/types/turns` (will be deleted in Task 9 — for now you may keep the import dangling temporarily, but cleaner to remove now).

- [ ] **Step 4: Delete the re-exports from `src/shared/ipc.ts`**

Remove from the existing `export { ... } from './ipc/turns'` block:
- `IPC_TURNS_UPDATE_FEEDBACK`
- `IPC_TURNS_FEEDBACK_SUMMARY`
- `type TurnsUpdateFeedbackRequest`
- `type TurnsUpdateFeedbackResponse`
- `type TurnsUpdateFeedbackResult`
- `type TurnsFeedbackSummaryResponse`
- `type TurnsFeedbackSummaryResult`

Remove the matching entries from the `IpcChannelName` union:
- `'turns:update-feedback'`
- `'turns:feedback-summary'`

- [ ] **Step 5: Drop the preload bindings**

In `src/preload/index.ts`, remove `updateFeedback` and `getFeedbackSummary` from the `turns: { ... }` namespace. Also remove the `IPC_TURNS_UPDATE_FEEDBACK`, `IPC_TURNS_FEEDBACK_SUMMARY` and `TurnsUpdateFeedback*` / `TurnsFeedbackSummary*` type imports at the top.

Mirror the deletions in `src/preload/index.d.ts` — the `turns:` interface block loses the same two methods.

- [ ] **Step 6: Update the turns-handler integration test**

In `src/main/__tests__/ipc/turns-handler.integration.test.ts`, remove the `describe`/`it` blocks for `update-feedback` and `feedback-summary`. Keep tests for `listByConversation` and `turns:changed` broadcasts.

- [ ] **Step 7: Verify**

```bash
git grep -n "updateFeedback\|getFeedbackSummary\|IPC_TURNS_UPDATE_FEEDBACK\|IPC_TURNS_FEEDBACK_SUMMARY\|createAssistantTurn" src test
```
Expected: zero hits.

```bash
npm run typecheck
npm run test:run
```
Expected: both PASS. Test count drops further.

- [ ] **Step 8: Commit**

```bash
git add -u src test
git commit -m "refactor(phase-2): drop feedback + assistant-turn DAOs + IPC

Removes updateFeedback / getFeedbackSummary / createAssistantTurn
from TurnsDao, the matching IPC handlers, preload bindings, shared
types, and integration tests. listByConversation + turns:changed
remain.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Strip branching from renderer

**Files:**
- Modify: `src/renderer/src/components/layout/AppShell.tsx`
- Modify: `src/renderer/src/components/layout/MainPane.tsx`
- Modify: `src/renderer/src/components/composer/Composer.tsx`
- Modify: `src/renderer/src/components/composer/ActionsRow.tsx`
- Modify: `src/renderer/src/components/layout/ConversationListItem.tsx`
- Modify: `src/renderer/src/components/layout/styles.css`
- Modify: `src/renderer/src/hooks/use-conversations.ts`

- [ ] **Step 1: Remove the Branch button from `ActionsRow.tsx`**

Open `src/renderer/src/components/composer/ActionsRow.tsx`. Identify the Branch `<button>` (likely has `aria-label="Branch from latest turn"` or similar). Delete the entire `<button>` block. Remove `onBranch` from the props interface + the destructure at the top of the component.

If `onBranch` ends up being the only optional prop, you may need to update the prop type declaration. Otherwise leave neighboring props intact.

- [ ] **Step 2: Stop passing `onBranch` from `Composer.tsx`**

Remove `onBranch={onBranch}` from the `<ActionsRow>` JSX. Remove `onBranch` from `ComposerProps`. Run `git grep -n "onBranch" src/renderer/src/components/composer/Composer.tsx` — should be zero.

- [ ] **Step 3: Stop passing `onBranch` from `MainPane.tsx`**

Remove `onBranch={onBranch}` from the `<Composer>` JSX. Remove `onBranch` from `MainPaneProps`.

- [ ] **Step 4: Delete `handleBranchConversation` + `branch` destructure in `AppShell.tsx`**

Remove:
- The `branch: branchConversation` member from the `useConversations(activeProjectId)` destructure
- The whole `handleBranchConversation` function (line ~149)
- The `onBranch={() => void handleBranchConversation()}` prop on `<MainPane>` (line ~286)
- Any imports that become unused (`pushToast`, `useToast` if Branch was the last caller)
- The `activeAccountId` over-defensive guard inside `handleBranchConversation` — this disappears with the function

- [ ] **Step 5: Drop the `is-branch` indicator from `ConversationListItem.tsx`**

Open `src/renderer/src/components/layout/ConversationListItem.tsx`. Remove:
- `const isBranch = conversation.parentConversationId !== null` (line ~24)
- The `${isBranch ? 'is-branch' : ''}` interpolation in the className (line ~26)

The className becomes `conversation-item ${isActive ? 'is-active' : ''}` — simpler.

- [ ] **Step 6: Drop the `.conversation-item.is-branch` CSS**

In `src/renderer/src/components/layout/styles.css`, locate the `.conversation-item.is-branch` selector (and any `.conversation-item.is-branch__indicator` / pseudo-element rules). Delete those blocks.

- [ ] **Step 7: Drop `branch` action from `use-conversations.ts`**

In `src/renderer/src/hooks/use-conversations.ts`, remove the `branch` method from the returned object + its definition. Also drop the `window.tokenless.conversations.branch(...)` call.

If the hook no longer needs to import `BranchConversationInput` or related types, remove those imports too.

- [ ] **Step 8: Verify**

```bash
git grep -n "handleBranchConversation\|onBranch\|is-branch\|conversations\\.branch\|parentConversationId\|BranchConversationInput" src/renderer
```
Expected: zero hits.

```bash
npm run typecheck
```
Expected: PASS. (DB schema still has parentConversationId — that's dropped in Task 9. The renderer no longer reads it, which is fine.)

- [ ] **Step 9: Commit**

```bash
git add -u src/renderer
git commit -m "refactor(phase-2): drop branching UI from renderer

Branch button gone from ActionsRow, prop chain unthread from AppShell -> MainPane -> Composer, is-branch indicator gone from sidebar, use-conversations.ts loses the branch action.

handleBranchConversation also cleans up the over-defensive
activeAccountId guard flagged during phase-1 review (the guard
disappears with the function).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Strip branching IPC + DAO from main

**Files:**
- Modify: `src/main/ipc/conversations-handler.ts`
- Modify: `src/main/db/dao/conversations.ts`
- Modify: `src/shared/ipc/conversations.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/main/__tests__/ipc/conversations-handler.integration.test.ts`
- Delete: `src/main/__tests__/db/dao-conversations-branch.integration.test.ts`

- [ ] **Step 1: Delete `branchConversation` from the DAO**

In `src/main/db/dao/conversations.ts`, locate the `branchConversation(db, input)` function (starts ~line 143). Delete it. Leave `createConversation`, `getConversationById`, `listByProject`, `updateConversation`, `deleteConversation` intact.

The `parent_conversation_id` and `branched_at_turn_id` field reads/writes elsewhere in `conversations.ts` are removed in Task 9 (DAO column ref cleanup). Don't touch them here.

- [ ] **Step 2: Delete the branch handler in `conversations-handler.ts`**

Find the method that wraps `branchConversation` (named something like `handleBranch`). Delete it. Delete the `ipcMain.handle(IPC_CONVERSATIONS_BRANCH, ...)` call in `install()` and the matching `ipcMain.removeHandler(...)` in `uninstall()`.

- [ ] **Step 3: Delete from `src/shared/ipc/conversations.ts`**

Remove the `IPC_CONVERSATIONS_BRANCH` constant + `BranchConversationRequest`, `BranchConversationResponse`, `BranchConversationResult` types (and `BranchConversationInput` if exported here — likely it lives in `shared/types/conversations.ts` and gets cleaned in Task 9).

- [ ] **Step 4: Delete from `src/shared/ipc.ts`**

Remove from the existing `export { ... } from './ipc/conversations'` block:
- `IPC_CONVERSATIONS_BRANCH`
- `type ConversationsBranchResult`
- `type ConversationsBranchRequest`
- `type ConversationsBranchResponse`

Remove `'conversations:branch'` from the `IpcChannelName` union.

- [ ] **Step 5: Drop the preload binding**

In `src/preload/index.ts`, remove `branch(req)` from the `conversations: { ... }` namespace. Remove the `IPC_CONVERSATIONS_BRANCH` + `ConversationsBranch*` imports.

Mirror in `src/preload/index.d.ts` — the `conversations:` interface block loses `branch(...)`.

- [ ] **Step 6: Update the conversations-handler test**

In `src/main/__tests__/ipc/conversations-handler.integration.test.ts`, remove the `describe`/`it` blocks for `branch`. Keep CRUD tests.

- [ ] **Step 7: Delete the dedicated branch DAO test**

```bash
git rm src/main/__tests__/db/dao-conversations-branch.integration.test.ts
```

- [ ] **Step 8: Verify**

```bash
git grep -n "branchConversation\|IPC_CONVERSATIONS_BRANCH\|conversations:branch" src test
```
Expected: zero hits.

```bash
npm run typecheck
npm run test:run
```
Expected: both PASS.

- [ ] **Step 9: Commit**

```bash
git add -u src test
git commit -m "refactor(phase-2): drop branching IPC + DAO + tests

ConversationsDao loses branchConversation. The handler, preload
binding, shared IPC types, channel union entry, and integration
test cases all go. dao-conversations-branch.integration.test.ts
deleted in full.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Remove the send-confirmation modal from Composer

**Files:**
- Modify: `src/renderer/src/components/composer/Composer.tsx`

The Phase-1 Composer no-op already short-circuits sends, but the `<ConfirmModal open={confirmSendOpen} ...>` + supporting state (`confirmSendOpen`, `pendingSendRef`, `handleConfirmSend`) is still present, doing nothing useful. Spec §6 lists "Send-confirmation modal" as removed. Strip it now.

- [ ] **Step 1: Identify the state + modal block**

Run: `git grep -n "confirmSendOpen\|pendingSendRef\|handleConfirmSend\|ConfirmModal" src/renderer/src/components/composer/Composer.tsx`

Note the line numbers.

- [ ] **Step 2: Delete**

Remove:
- `useState(false)` for `confirmSendOpen` + its setter
- `useRef<...>(null)` for `pendingSendRef`
- The `handleConfirmSend` function
- The `<ConfirmModal ...>` JSX mount (lines ~363-370)
- If `ConfirmModal` is no longer imported for any other reason in this file, drop the import line

Make sure the send handler path (Step 5 of Phase 1 made it a no-op) is unaffected — there should no longer be any reference to `setConfirmSendOpen(true)` either.

- [ ] **Step 3: Verify**

```bash
git grep -n "confirmSendOpen\|pendingSendRef\|handleConfirmSend" src/renderer/src/components/composer/Composer.tsx
```
Expected: zero hits.

```bash
npm run typecheck
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/composer/Composer.tsx
git commit -m "refactor(phase-2): remove send-confirmation modal from Composer

The new Copy-Geared flow (phase 4) doesn't fire an irreversible
action — user pastes themselves — so the confirm modal has no
purpose.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Delete ClaudeNotFoundModal

**Files:**
- Delete: `src/renderer/src/components/notifications/ClaudeNotFoundModal.tsx`

- [ ] **Step 1: Confirm no surviving callers**

Run: `git grep -n "ClaudeNotFoundModal" src test`

Expected: zero hits (phase 1 removed all mount points + imports).

- [ ] **Step 2: Check the notifications CSS**

Run: `git grep -n "claude-not-found" src/renderer`

If there are dedicated CSS rules (e.g., `.claude-not-found-modal`), they live in `src/renderer/src/components/notifications/styles.css` — note them for Step 3.

- [ ] **Step 3: Delete the file + CSS rules**

```bash
git rm src/renderer/src/components/notifications/ClaudeNotFoundModal.tsx
```

In `src/renderer/src/components/notifications/styles.css` (if it exists), delete any `.claude-not-found-modal` / `.claude-not-found-modal__*` selectors.

- [ ] **Step 4: Verify + commit**

```bash
git grep -n "ClaudeNotFoundModal\|claude-not-found-modal" src test
```
Expected: zero hits.

```bash
npm run typecheck
```
Expected: PASS.

```bash
git add -u src/renderer/src/components/notifications
git commit -m "refactor(phase-2): delete ClaudeNotFoundModal

No PTY means no CLAUDE_NOT_FOUND error code, no modal to mount.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: DB migration + DAO column refs + shared type field drops

**This is the biggest task in the phase. Read it through before starting.** It bundles together: the schema migration, the matching DAO mapRow/INSERT/UPDATE updates, the shared type field drops, and the migration verification test. All must land in one commit because intermediate states have inconsistent shape.

**Files:**
- Create: `src/main/db/migrations/003_v2_headless.sql`
- Create: `src/main/__tests__/db/migrations/003-v2-headless.integration.test.ts`
- Modify: `src/main/db/migrations/index.ts`
- Modify: `src/main/db/dao/conversations.ts`
- Modify: `src/main/db/dao/turns.ts`
- Modify: `src/shared/types/conversations.ts`
- Modify: `src/shared/types/turns.ts`
- Modify: `src/main/__tests__/db/dao-conversations.integration.test.ts`
- Modify: `src/main/__tests__/db/dao-turns.integration.test.ts`

- [ ] **Step 1: Write the migration SQL**

Create `src/main/db/migrations/003_v2_headless.sql`:

```sql
-- v2 headless refactor — drop every column on conversations + turns that
-- exists only to support the embedded Claude Code PTY, and delete every
-- assistant-role turn row. The whole-DB SQLite backup written by the
-- migration runner before this batch is the v1 recovery artifact.

-- Order matters: delete assistant rows BEFORE dropping the `role` column.
DELETE FROM turns WHERE role = 'assistant';

-- conversations: drop PTY session id, summary, and branching link fields.
ALTER TABLE conversations DROP COLUMN cc_session_id;
ALTER TABLE conversations DROP COLUMN summary;
ALTER TABLE conversations DROP COLUMN summary_updated_at;
ALTER TABLE conversations DROP COLUMN parent_conversation_id;
ALTER TABLE conversations DROP COLUMN branched_at_turn_id;

-- turns: drop assistant-side fields. SQLite auto-drops indexes that
-- reference dropped columns (idx_turns_feedback disappears with feedback).
ALTER TABLE turns DROP COLUMN role;
ALTER TABLE turns DROP COLUMN response_text;
ALTER TABLE turns DROP COLUMN response_tokens;
ALTER TABLE turns DROP COLUMN feedback;
```

- [ ] **Step 2: Append the migration to the `MIGRATIONS` array**

In `src/main/db/migrations/index.ts`:

```typescript
// eslint-disable-next-line import/no-unresolved
import v2Headless003 from './003_v2_headless.sql?raw'

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'init', sql: init001 },
  { version: 2, name: 'skills_path_unique', sql: skillsPathUnique002 },
  { version: 3, name: 'v2_headless', sql: v2Headless003 }
]
```

- [ ] **Step 3: Write the migration verification test**

Create `src/main/__tests__/db/migrations/003-v2-headless.integration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '@main/db/migrations/runner'
import { MIGRATIONS } from '@main/db/migrations'

describe('migration 003_v2_headless', () => {
  // Helper: build a v1-shaped DB (apply only migrations 1 + 2).
  function buildV1Db(): InstanceType<typeof Database> {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    const v1Only = MIGRATIONS.filter((m) => m.version <= 2)
    runMigrations(db, v1Only)
    return db
  }

  it('drops PTY-shaped columns from conversations', () => {
    const db = buildV1Db()
    // Seed a project + conversation with PTY fields set
    db.exec(`
      INSERT INTO accounts (id, label, config_dir, created_at) VALUES (1, 'A', '/cfg', 0);
      INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES (1, 'P', '/p', 0, 0);
      INSERT INTO conversations (project_id, cc_session_id, summary, parent_conversation_id, branched_at_turn_id, created_at, updated_at)
        VALUES (1, 'old-session', 'old summary', NULL, NULL, 0, 0);
    `)
    runMigrations(db, MIGRATIONS)
    const cols = db.prepare("PRAGMA table_info(conversations)").all() as Array<{ name: string }>
    const names = cols.map((c) => c.name)
    expect(names).not.toContain('cc_session_id')
    expect(names).not.toContain('summary')
    expect(names).not.toContain('summary_updated_at')
    expect(names).not.toContain('parent_conversation_id')
    expect(names).not.toContain('branched_at_turn_id')
    // The conversation row survives (data preservation):
    expect(db.prepare('SELECT COUNT(*) AS n FROM conversations').get() as { n: number }).toEqual({ n: 1 })
  })

  it('drops assistant-side columns + deletes assistant turn rows', () => {
    const db = buildV1Db()
    db.exec(`
      INSERT INTO accounts (id, label, config_dir, created_at) VALUES (1, 'A', '/cfg', 0);
      INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES (1, 'P', '/p', 0, 0);
      INSERT INTO conversations (id, project_id, created_at, updated_at) VALUES (1, 1, 0, 0);
      INSERT INTO turns (conversation_id, role, original_prompt, sent_at) VALUES (1, 'user', 'hi', 0);
      INSERT INTO turns (conversation_id, role, response_text, sent_at) VALUES (1, 'assistant', 'hello', 0);
    `)
    expect((db.prepare('SELECT COUNT(*) AS n FROM turns').get() as { n: number }).n).toBe(2)
    runMigrations(db, MIGRATIONS)
    const cols = db.prepare("PRAGMA table_info(turns)").all() as Array<{ name: string }>
    const names = cols.map((c) => c.name)
    expect(names).not.toContain('role')
    expect(names).not.toContain('response_text')
    expect(names).not.toContain('response_tokens')
    expect(names).not.toContain('feedback')
    // The user-side turn row survives, assistant row gone:
    expect((db.prepare('SELECT COUNT(*) AS n FROM turns').get() as { n: number }).n).toBe(1)
  })

  it('drops idx_turns_feedback as a side effect of dropping the feedback column', () => {
    const db = buildV1Db()
    runMigrations(db, MIGRATIONS)
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as Array<{ name: string }>
    const names = indexes.map((i) => i.name)
    expect(names).not.toContain('idx_turns_feedback')
  })

  it('preserves drafts + projects + accounts unchanged', () => {
    const db = buildV1Db()
    db.exec(`
      INSERT INTO accounts (id, label, config_dir, created_at) VALUES (1, 'A', '/cfg', 0);
      INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES (1, 'P', '/p', 0, 0);
      INSERT INTO conversations (id, project_id, created_at, updated_at) VALUES (1, 1, 0, 0);
      INSERT INTO drafts (conversation_id, body, updated_at) VALUES (1, 'unfinished prompt', 0);
    `)
    runMigrations(db, MIGRATIONS)
    expect((db.prepare('SELECT COUNT(*) AS n FROM drafts').get() as { n: number }).n).toBe(1)
    expect((db.prepare('SELECT body FROM drafts WHERE conversation_id = 1').get() as { body: string }).body).toBe('unfinished prompt')
    expect((db.prepare('SELECT COUNT(*) AS n FROM projects').get() as { n: number }).n).toBe(1)
    expect((db.prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number }).n).toBe(1)
  })
})
```

- [ ] **Step 4: Clean up DAO column references**

In `src/main/db/dao/conversations.ts`:
- Drop the `cc_session_id`, `summary`, `summary_updated_at`, `parent_conversation_id`, `branched_at_turn_id` fields from the `ConversationRow` interface (or whichever raw-row type is used)
- Drop the matching mappings from `mapRow` (the `ccSessionId`, `summary`, `summaryUpdatedAt`, `parentConversationId`, `branchedAtTurnId` keys)
- Drop those columns from any INSERT statement (`createConversation`)
- Drop any UPDATE-by-id paths that wrote `cc_session_id` or `summary`

In `src/main/db/dao/turns.ts`:
- Drop the `role`, `response_text`, `response_tokens`, `feedback` fields from the raw-row interface
- Drop the matching mappings from `mapRow`
- Drop those columns from any INSERT statement (`createUserTurn`)
- The `role` column was used as a discriminator — verify no surviving query needs `WHERE role = 'user'`. Since assistant rows are deleted by the migration, all surviving rows are user-side; the filter becomes redundant.

- [ ] **Step 5: Drop the corresponding shared type fields**

In `src/shared/types/conversations.ts`, update `Conversation`:
```typescript
export interface Conversation {
  readonly id: number
  readonly projectId: number
  readonly accountId: number | null
  readonly title: string | null
  readonly model: ModelHint | null
  readonly breadth: BreadthHint | null
  readonly format: FormatHint | null
  readonly status: ConversationStatus
  readonly createdAt: number
  readonly updatedAt: number
  readonly endedAt: number | null
  readonly archivedAt: number | null
}
```
Also delete `BranchConversationInput` (no longer used). Remove `summary?` and `ccSessionId?` from `UpdateConversationInput`.

In `src/shared/types/turns.ts`, update `Turn`:
```typescript
export interface Turn {
  readonly id: number
  readonly conversationId: number
  readonly originalPrompt: string | null
  readonly gearedPrompt: string | null
  readonly originalTokens: number | null
  readonly gearedTokens: number | null
  readonly haikuMetaTokens: number | null
  readonly modelUsed: string | null
  readonly critiqueFlagsJson: string | null
  readonly status: TurnStatus
  readonly sentAt: number
}
```
Delete `TurnRole`, `Feedback`, `FeedbackSummary` type aliases. `GearMeta` stays — it's used by the active gear flow.

- [ ] **Step 6: Update DAO tests**

In `src/main/__tests__/db/dao-conversations.integration.test.ts`:
- Drop assertions referencing `ccSessionId`, `summary`, `summaryUpdatedAt`, `parentConversationId`, `branchedAtTurnId`
- Drop any test that exercised the dropped INSERT/UPDATE paths

In `src/main/__tests__/db/dao-turns.integration.test.ts`:
- Drop assertions referencing `role`, `responseText`, `responseTokens`, `feedback`
- The "creates a user turn" test stays; the "creates an assistant turn" test was already removed in Task 4 via `createAssistantTurn` deletion — verify it's gone.
- If the test file has a "lists turns by conversation" test that expects both user + assistant rows, update it to expect user-only.

- [ ] **Step 7: Verify**

```bash
npm run typecheck
npm run test:run
```

Expected: both PASS. The new `003-v2-headless.integration.test.ts` (4 tests) should run + pass.

Expected: `git grep -n "ccSessionId\|cc_session_id\|summary_updated_at\|parent_conversation_id\|branched_at_turn_id\|TurnRole\|Feedback\|response_text\|response_tokens" src test 2>&1` returns zero hits (or only matches inside the migration SQL itself).

- [ ] **Step 8: Commit**

```bash
git add -u src test
git commit -m "refactor(phase-2): migration 003 + DAO column ref cleanup + shared type field drops

Migration 003_v2_headless.sql drops cc_session_id, summary,
summary_updated_at, parent_conversation_id, branched_at_turn_id
from conversations; role, response_text, response_tokens, feedback
from turns; deletes assistant-role turn rows. The whole-DB SQLite
copy written by the migration runner before this batch is the v1
recovery artifact.

DAO mapRow + INSERT/UPDATE statements stop referencing the dropped
columns. Conversation + Turn shared types lose the corresponding
fields. dao-conversations and dao-turns integration tests reshape
to the v2-only surface.

New test 003-v2-headless.integration.test.ts verifies column
removal, idx_turns_feedback auto-drop, assistant-row deletion, and
draft/project/account preservation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Verification gate + phase tag

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`

Expected: PASS, exit 0.

- [ ] **Step 2: Unit + integration suite**

Run: `npm run test:run`

Expected: PASS. Test count should drop by ~15-25 from Phase 1's 292 (delete summary-refresher unit test, turn-feedback-bar unit test, dao-conversations-branch integration test, feedback + branch cases inside other integration tests; add the new migration test). Final count likely lands around 275-280.

- [ ] **Step 3: Rebuild for Electron ABI**

Run: `npm run rebuild:electron`

Expected: PASS. Only better-sqlite3 rebuilds (phase 1 removed node-pty).

- [ ] **Step 4: Build the renderer + main bundles**

Run: `npm run build`

Expected: PASS. `out/main`, `out/preload`, `out/renderer` produced.

- [ ] **Step 5: Build unpacked Electron app**

Run: `npm run build:unpack`

Expected: PASS. `dist/win-unpacked/TokenLess.exe` produced (winCodeSign symlink errors from electron-builder cache are harmless noise — see phase 1 notes).

- [ ] **Step 6: Run E2E suite**

Run: `npm run test:e2e`

Expected: same as phase 1 — 11 passed, 2 skipped, 0 failures (the skipped tests are still skipped pending phase 3/4 rewrites). If the count drops or new failures appear, investigate before tagging.

Note that the migration runs at app startup against the user's `tokenless.db`. The E2E suite uses fresh `userDataDir`s per test, so each one applies migrations 1 → 2 → 3 cleanly. If a smoke test fails with a DB error, that's a migration bug — fix it before tagging.

- [ ] **Step 7: Update the spec phase table**

Open `docs/superpowers/specs/2026-05-16-tokenless-v2-headless-design.md`. Find the phase plan table (§9). Update row 2:

```markdown
| 2 | `v2.0.0-phase-2-strip-dependents` | Remove branching UI, summary refresher, response accumulator, feedback UI, hung/crash modals, ClaudeNotFoundModal. DB migration `0010_headless.sql`. v1 backup export. | shipped 2026-05-16 (8 tasks, ~280 tests green, migration 003 verified) |
```

(Adjust the "shipped" date + test count to match reality. The plan name in the table still says `0010_headless.sql` from the original spec — note in the commit message that we used `003_v2_headless.sql` to fit the existing numeric prefix convention and the spec should be amended in phase 6.)

Commit:
```bash
git add docs/superpowers/specs/2026-05-16-tokenless-v2-headless-design.md
git commit -m "docs(phase-2): mark phase 2 shipped in spec phase table

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 8: Tag the phase exit**

```bash
git tag -a v2.0.0-phase-2-strip-dependents -m "Phase 2: dependents of the embedded PTY removed.

App builds + launches, gear flow is fully functional (Composer + GearReviewPane), but with:
- No Branch button, no branch indicator in the sidebar
- No feedback bar on assistant turns (there are no assistant turns)
- No send-confirmation modal
- No SummaryRefresher running in the background
- ClaudeNotFoundModal file gone
- DB schema migrated: cc_session_id / summary / summary_updated_at / parent_conversation_id / branched_at_turn_id dropped from conversations; role / response_text / response_tokens / feedback dropped from turns; assistant rows deleted

9 commits between v2.0.0-phase-1-strip-pty and this tag.

Carry-overs deferred:
- 'cc'/'pty' Logger categories still registered (phase 6)
- Spec §4 still mentions 0010_headless.sql + JSONL export (phase 6 amendment)"
```

Do NOT push the tag yet — leave that for the user.

---

## Self-review

**Spec coverage (§9 phase plan row 2: "Remove branching UI, summary refresher, response accumulator, feedback UI, hung/crash modals, ClaudeNotFoundModal. DB migration `0010_headless.sql`. v1 backup export."):**

- Branching UI: Tasks 5 + 6 ✓
- SummaryRefresher: Task 2 ✓
- Response accumulator: deleted in phase 1 (was part of `src/main/cc/`) — no work needed here ✓
- Feedback UI: Tasks 3 + 4 ✓
- Hung/crash modals: HungBanner deleted in phase 1; ClaudeNotFoundModal deleted in Task 8; CrashReporterModal is kept (it's for app-level crashes, not PTY) ✓
- DB migration: Task 9 ships `003_v2_headless.sql` (rename vs. the spec's `0010_*` is noted as a spec-amendment carry-over) ✓
- v1 backup export: covered by the existing whole-DB SQLite backup in the migration runner — design decision documented in the "Design decisions" table above, the spec's JSONL proposal is superseded ✓

**Placeholder scan:** no "TBD" / "TODO" / "appropriate" / "etc." hedging. Every code block contains exact code or exact-grep diff instructions. ✓

**Type consistency:** the `Conversation` and `Turn` final shapes in Task 9 Step 5 match what's used by the renderer after Tasks 3 + 5 strip the consuming code. `GearMeta` is preserved (still used by the gear flow). `BranchConversationInput` is deleted symmetrically across types + IPC + DAO + renderer hook. `TurnRole` / `Feedback` / `FeedbackSummary` deleted with no remaining consumer. ✓

**Open notes resolved inline:** Task 1 explicitly defers the AppShell guard cleanup to Task 5 (where the whole function is deleted). Task 2 explicitly leaves the `summary-prompt.md` deletion to the file glob. Task 9 explicitly notes that `WHERE role = 'user'` filters become redundant once the column is gone (no surviving query needs them after the migration). ✓

---

## Exit state

- Branch `v2/headless` advanced by 9 commits + 1 tag (`v2.0.0-phase-2-strip-dependents`).
- App builds via `npm run build` and `npm run build:unpack`.
- App launches; user sees Sidebar + Composer + GearReviewPane. ActionsRow has only Send (no-op), Gear, Templates, Commit, Push — no Branch. No feedback bar. No send-confirmation.
- Migration 003 applied automatically on first launch against any v1 DB; pre-migration SQLite copy in the user's backups dir; user-side data preserved, assistant transcripts discarded.
- Unit + integration suite green at ~275-280 tests (down from 292).
- E2E suite green at 11 passed / 2 skipped / 0 failures.
- `package.json` and `rebuild:electron` unchanged from phase 1.
- DB schema in `src/main/db/migrations/003_v2_headless.sql`; `MIGRATIONS` array has 3 entries.
- CLAUDE.md unchanged (phase 6).
- Tag `v2.0.0-phase-2-strip-dependents` exists locally, awaiting user push.

Phase 3 plan (`2026-05-16-phase-3-capture.md`) — adds the `clipboard:read-prompt` IPC + Composer "Capture" button + validation + tests — is the next planning step, written after Phase 2 ships.

---
