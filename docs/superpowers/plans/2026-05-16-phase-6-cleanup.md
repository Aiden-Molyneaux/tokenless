# Phase 6: Cleanup + Documentation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the accumulated v2 backlog. Remove dead Logger categories, dead settings + UI components, dead Project model fields (with DB migration 004), small renderer polish, dev-runner stale comment. Then refresh all docs to match v2 reality: CLAUDE.md rewrite, ADRs 043+ for v2 design decisions, spec amendments, scenarios doc refresh. After Phase 6, the codebase is ready for Phase 7 (release prep — version bump, README, merge to main, signed v2.0.0 tag).

**Architecture:** 9 tasks. Tasks 1-5 are code cleanups; Tasks 6-8 are docs refreshes; Task 9 is the verification gate. The code cleanups land first because the docs need to describe the post-cleanup state. Migration 004 (Task 3) follows the Phase-2 migration pattern (append-only, transaction-wrapped, automatic whole-DB backup before applying).

**Tech Stack:** TypeScript 5 strict, React 18, better-sqlite3 11 (SQLite 3.45 — `ALTER TABLE DROP COLUMN`), Vitest 2, Playwright 1.45.

**Branch:** All work on `v2/headless`. Phase exit: annotated tag `v2.0.0-phase-6-cleanup`.

---

## Out of scope

- Version bump to 2.0.0 → Phase 7 (release prep)
- README rewrite → Phase 7
- Merge `v2/headless` → `main` → Phase 7
- ConfigsRow narrow-width overflow fix (would touch responsive layout — keep Phase 6 focused on cleanup, not new UI)
- Drag-resize handle on the gear-review drawer — flagged but deferred to v2.1 polish
- Proper popovers for collapsed sidebar (currently just expands) — deferred to v2.1
- Skill dropdown in ConfigsRow — keep for now; v2.1 may revisit
- TokenSummary `responseOutputTokens` always-0 field — interface simplification deferred (the field is harmless; users may want a hook later if turn-row capture lands)
- Clipboard result-shape consistency refactor — Phases 3 + 4 use a custom union; Phase 6 documents the choice instead of refactoring
- Turn-row capture at copy time — design decision deferred to v2.1+
- Renderer test fixture-pattern extraction (the per-test `renderComposer` helpers could DRY into a shared file — out of scope here)

---

## Design decisions captured during planning

| Decision | Choice | Why |
|---|---|---|
| `cc` + `pty` Logger categories | Removed from `CATEGORIES` tuple | No surviving code emits under these. Spec §7 envisioned "struck through" but the simpler move is full removal — old log archives that contain them still parse because `isCategory` returns false; renderers + log viewers handle unknown categories gracefully. |
| `SendConfirmToggle` UI + `SETTING_GEARING_SEND_CONFIRM` | Removed | Phase 4 removed the confirm modal; the toggle wrote to a setting nobody reads. Dead UI + dead key. |
| `defaultCommitPrompt` / `defaultPushPrompt` Project fields | Removed via migration 004 + type + DAO + UI cleanup | Phase 5 removed the Commit + Push ActionsRow buttons. The Project fields are unreachable. Schema cleanup keeps the table tight. |
| Migration filename | `004_remove_commit_push_prompts.sql` | Continues the numeric prefix convention (001_init, 002_skills_path_unique, 003_v2_headless). |
| Clipboard result-shape pattern | Documented as intentional in `src/shared/ipc/clipboard.ts` (existing comment expanded into a paragraph) | Refactoring to `IpcError` would carry a `logId` field we don't generate for these business-logic outcomes. The custom-union pattern is correct for "expected business outcomes, not exceptions." Phase 6 documents the choice. |
| `actuallySend` Phase-1 stub name | Renamed to remove the misleading "send" framing — likely just deleted now that Composer no longer has a send path | Already mostly gone after Phase 4 Task 5 (bridge stub deleted). Phase 6 verifies. |
| AppShell double blank line (L36-37) | Cleaned | Cosmetic from Phase 2 Task 5; trivial fix. |
| Dev-runner `node-pty` comment reference | Updated to remove the stale mention | One-line comment fix. |
| CI workflow node-pty references | None found — workflow already clean | No work needed; documented for completeness. |
| CLAUDE.md | Full rewrite to reflect v2 architecture, with a "v1 → v2 transition" section at the top | The current CLAUDE.md was written for v1 (PTY-hosted Claude Code). It's actively misleading for any future Claude session that lands in this repo. |

---

## File structure (created / modified / deleted)

**Created:**
- `src/main/db/migrations/004_remove_commit_push_prompts.sql` — drops `default_commit_prompt` + `default_push_prompt` columns from `projects`
- `src/main/__tests__/db/migrations/004-remove-commit-push-prompts.integration.test.ts` — verifies column removal + data preservation for other project fields

**Modified:**
- `src/shared/observability.ts` — drop `'cc'` + `'pty'` from CATEGORIES tuple
- `src/main/observability/__tests__/categories.unit.test.ts` — bump expected list from 12 → 10
- `docs/observability.md` — drop the `cc` + `pty` rows from the category table
- `src/shared/types/settings-keys.ts` — drop `SETTING_GEARING_SEND_CONFIRM`
- `src/renderer/src/views/settings/SettingsView.tsx` — remove `<SendConfirmToggle/>` import + mount
- `src/renderer/src/views/settings/SendConfirmToggle.tsx` — DELETE this file (move to "Deleted" below; listed here for clarity)
- `src/shared/types/projects.ts` — drop `defaultCommitPrompt` + `defaultPushPrompt` from `Project` + `UpdateProjectInput`
- `src/main/db/dao/projects.ts` — drop `default_commit_prompt` / `default_push_prompt` from `ProjectRow`, `mapRow`, INSERT, UPDATE
- `src/main/db/migrations/index.ts` — append migration 004 to MIGRATIONS array
- `src/renderer/src/components/layout/CreateProjectModal.tsx` — drop Commit/Push prompt fields (if present)
- `src/renderer/src/components/layout/EditProjectModal.tsx` — drop Commit/Push prompt fields (if present)
- `src/renderer/src/hooks/__tests__/use-projects.unit.test.tsx` — drop the `defaultCommitPrompt` / `defaultPushPrompt` fields from the test fixture
- `src/main/__tests__/db/dao-projects.integration.test.ts` — drop any assertions touching the removed columns
- `src/renderer/src/components/layout/AppShell.tsx` — fix L36–37 double blank line
- `src/renderer/src/components/composer/Composer.tsx` — verify `actuallySend` is gone; rename any residual references
- `dev-runner.mjs` — fix the stale `node-pty` comment in BASELINE_ESTIMATES
- `docs/decisions.md` — append ADR 043+ entries for v2 design decisions
- `CLAUDE.md` — full rewrite for v2 reality
- `docs/superpowers/specs/2026-05-16-tokenless-v2-headless-design.md` — §4 amendment (migration filename + backup method) + §9 phase table update
- `docs/test-scenarios.md` — strike through v1 scenarios that don't apply; confirm S-v2.1 through S-v2.3 are current
- `src/shared/ipc/clipboard.ts` — expand the existing "Phase 3 deviation" comment into a proper paragraph documenting the design choice

**Deleted:**
- `src/renderer/src/views/settings/SendConfirmToggle.tsx`

---

## Tasks

### Task 1: Drop unused Logger categories

**Files:**
- Modify: `src/shared/observability.ts`
- Modify: `src/main/observability/__tests__/categories.unit.test.ts`
- Modify: `docs/observability.md`

- [ ] **Step 1: Remove `'cc'` and `'pty'` from CATEGORIES**

In `src/shared/observability.ts`, the current tuple is:

```typescript
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
  'clipboard',
  'fs',
  'observability'
] as const
```

Remove `'cc'` and `'pty'`. Resulting 10-item tuple:

```typescript
export const CATEGORIES = [
  'api',
  'db',
  'ipc',
  'ui',
  'skill',
  'auth',
  'gearing',
  'clipboard',
  'fs',
  'observability'
] as const
```

- [ ] **Step 2: Update the categories unit test**

In `src/main/observability/__tests__/categories.unit.test.ts`, find the line:

```typescript
it('exposes the canonical 12-category list', () => {
```

Update to "10-category list" and adjust the expected array to match the trimmed tuple above.

- [ ] **Step 3: Update observability.md**

In `docs/observability.md`, locate the `cc` and `pty` rows in the category table. Delete both rows. The table is the source-of-truth for what each category means; without surviving code emitting under them, they don't belong.

If you want to preserve historical context, add a note at the bottom of the categories section:

```markdown
*The `cc` and `pty` categories were registered for the v1 embedded Claude Code PTY. Removed in Phase 6 of the v2 refactor; old log archives that contain entries with these categories will display them as-is via `Logger`'s string-typed category field, but `isCategory()` returns false and they won't appear in autocompletes.*
```

- [ ] **Step 4: Verify**

```bash
npm run typecheck
npm run test:run
```
Expected: both PASS. The categories test passes against the new 10-item shape.

```bash
git grep -n "'cc'\|'pty'" src/main src/renderer src/shared
```
Expected: zero hits for those category strings in production code.

- [ ] **Step 5: Commit**

```bash
git add src/shared/observability.ts src/main/observability/__tests__/categories.unit.test.ts docs/observability.md
git commit -m "feat(phase-6): drop unused 'cc' + 'pty' Logger categories

No surviving code emits under these categories after the Phase 1-5
refactors. Tuple drops 12 → 10 entries. Categories test bumps to
match. observability.md drops the corresponding rows.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Remove SendConfirm setting + UI

**Files:**
- Delete: `src/renderer/src/views/settings/SendConfirmToggle.tsx`
- Modify: `src/renderer/src/views/settings/SettingsView.tsx`
- Modify: `src/shared/types/settings-keys.ts`

- [ ] **Step 1: Confirm no surviving readers of SETTING_GEARING_SEND_CONFIRM**

```bash
git grep -n "SETTING_GEARING_SEND_CONFIRM\|sendConfirm" src
```
Expected: hits only in:
- `src/shared/types/settings-keys.ts` (the constant definition)
- `src/renderer/src/views/settings/SendConfirmToggle.tsx` (the UI that reads/writes the setting)
- `src/renderer/src/views/settings/SettingsView.tsx` (the mount of the toggle)

If any other consumer reads the setting, STOP and report NEEDS_CONTEXT.

- [ ] **Step 2: Delete `SendConfirmToggle.tsx`**

```bash
git rm src/renderer/src/views/settings/SendConfirmToggle.tsx
```

- [ ] **Step 3: Remove the mount from SettingsView**

In `src/renderer/src/views/settings/SettingsView.tsx`, find the `<SendConfirmToggle ... />` JSX mount + the import. Delete both. If the surrounding `<section>` would be empty after removal, delete the section too. If neighboring CSS classes or section headers become orphan, clean them.

- [ ] **Step 4: Delete the settings-keys constant**

In `src/shared/types/settings-keys.ts`, remove:
```typescript
export const SETTING_GEARING_SEND_CONFIRM = 'gearing.sendConfirm'
```

(or whatever exact value it has).

- [ ] **Step 5: Verify**

```bash
git grep -n "SETTING_GEARING_SEND_CONFIRM\|SendConfirmToggle\|sendConfirm" src
```
Expected: zero hits.

```bash
npm run typecheck
npm run test:run
```
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add -u src/renderer/src/views/settings/ src/shared/types/settings-keys.ts
git commit -m "feat(phase-6): remove SendConfirm setting + UI

Phase 4 removed the send-confirmation modal but left the
SendConfirmToggle UI component + SETTING_GEARING_SEND_CONFIRM
constant in place. They've been writing to a setting nobody reads.
Both removed.

Existing user settings rows with the now-orphan 'gearing.sendConfirm'
key are harmless — the settings table is key-value and unused rows
are just ignored.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Remove Commit/Push project fields + DB migration 004

**Files:**
- Create: `src/main/db/migrations/004_remove_commit_push_prompts.sql`
- Create: `src/main/__tests__/db/migrations/004-remove-commit-push-prompts.integration.test.ts`
- Modify: `src/main/db/migrations/index.ts`
- Modify: `src/shared/types/projects.ts`
- Modify: `src/main/db/dao/projects.ts`
- Modify: `src/renderer/src/components/layout/CreateProjectModal.tsx`
- Modify: `src/renderer/src/components/layout/EditProjectModal.tsx`
- Modify: `src/renderer/src/hooks/__tests__/use-projects.unit.test.tsx`
- Modify: `src/main/__tests__/db/dao-projects.integration.test.ts`

This is the biggest task in Phase 6. Follows the Phase 2 Task 9 migration pattern.

- [ ] **Step 1: Write the migration SQL**

Create `src/main/db/migrations/004_remove_commit_push_prompts.sql`:

```sql
-- v2 cleanup — drop the per-project canned-prompt columns that fed the
-- Commit + Push ActionsRow buttons (removed in Phase 5 Task 6). The columns
-- are nullable and were unreachable from the UI after Phase 5, so dropping
-- them is a clean cleanup. No data needs preservation.

ALTER TABLE projects DROP COLUMN default_commit_prompt;
ALTER TABLE projects DROP COLUMN default_push_prompt;
```

- [ ] **Step 2: Register the migration**

In `src/main/db/migrations/index.ts`, append:

```typescript
// eslint-disable-next-line import/no-unresolved
import removeCommitPushPrompts004 from './004_remove_commit_push_prompts.sql?raw'

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'init', sql: init001 },
  { version: 2, name: 'skills_path_unique', sql: skillsPathUnique002 },
  { version: 3, name: 'v2_headless', sql: v2Headless003 },
  { version: 4, name: 'remove_commit_push_prompts', sql: removeCommitPushPrompts004 }
]
```

- [ ] **Step 3: Write the migration verification test**

Create `src/main/__tests__/db/migrations/004-remove-commit-push-prompts.integration.test.ts`. Match the Phase 2 Task 9 test pattern:

```typescript
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '@main/db/migrations/runner'
import { MIGRATIONS } from '@main/db/migrations'

describe('migration 004_remove_commit_push_prompts', () => {
  function buildV3Db(): InstanceType<typeof Database> {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    const v3Only = MIGRATIONS.filter((m) => m.version <= 3)
    runMigrations(db, v3Only)
    return db
  }

  it('drops default_commit_prompt and default_push_prompt from projects', () => {
    const db = buildV3Db()
    runMigrations(db, MIGRATIONS)
    const cols = db.prepare("PRAGMA table_info(projects)").all() as Array<{ name: string }>
    const names = cols.map((c) => c.name)
    expect(names).not.toContain('default_commit_prompt')
    expect(names).not.toContain('default_push_prompt')
  })

  it('preserves other project fields and existing rows', () => {
    const db = buildV3Db()
    db.exec(`
      INSERT INTO projects (id, name, root_path, default_commit_prompt, default_push_prompt, created_at, updated_at)
        VALUES (1, 'Test', '/p', 'My commit msg', 'My push msg', 0, 0);
    `)
    runMigrations(db, MIGRATIONS)
    const row = db.prepare('SELECT id, name, root_path FROM projects WHERE id = 1').get() as { id: number; name: string; root_path: string }
    expect(row).toEqual({ id: 1, name: 'Test', root_path: '/p' })
  })
})
```

- [ ] **Step 4: Update shared types**

In `src/shared/types/projects.ts`, find the `Project` interface and delete `defaultCommitPrompt: string | null` + `defaultPushPrompt: string | null`. Same for `UpdateProjectInput` — delete the optional fields.

- [ ] **Step 5: Update the DAO**

In `src/main/db/dao/projects.ts`:
- Drop `default_commit_prompt` + `default_push_prompt` from `ProjectRow` interface
- Drop the mappings from `rowToProject` / `mapRow`
- Drop the columns from INSERT statements
- Drop from UPDATE statements (the `SET default_commit_prompt = ?, default_push_prompt = ?` clauses)
- Drop the matching `?` parameters from `.run()` calls

- [ ] **Step 6: Update the renderer's project modals**

In `src/renderer/src/components/layout/CreateProjectModal.tsx` and `EditProjectModal.tsx`:
- If they have input fields for "Commit prompt" and "Push prompt", delete those input groups + their state hooks
- Remove the corresponding entries in the form submission payload
- Update prop interfaces if they include the fields

If the modals don't expose these fields (i.e., they were always nullable and the UI never surfaced them), no changes needed here — verify by reading.

- [ ] **Step 7: Update use-projects unit test**

In `src/renderer/src/hooks/__tests__/use-projects.unit.test.tsx`, find the test fixture(s) that include `defaultCommitPrompt: null, defaultPushPrompt: null`. Remove those fields.

- [ ] **Step 8: Update dao-projects integration test**

In `src/main/__tests__/db/dao-projects.integration.test.ts`, remove any assertions that test the dropped columns. If a test asserts the full row shape, update its expected object.

- [ ] **Step 9: Verify**

```bash
npm run typecheck
npm run test:run
```
Expected: both PASS. The new migration test runs + passes (2 cases).

```bash
git grep -n "default_commit_prompt\|default_push_prompt\|defaultCommitPrompt\|defaultPushPrompt" src test
```
Expected: hits only in `001_init.sql` (historical schema) and `004_remove_commit_push_prompts.sql` (the migration itself). Zero hits in DAOs / types / tests / UI.

- [ ] **Step 10: Commit**

```bash
git add -u src test
git commit -m "feat(phase-6): remove Commit/Push project fields + migration 004

Migration 004_remove_commit_push_prompts.sql drops the two
default_*_prompt columns. Shared types, DAO mapRow/INSERT/UPDATE,
and the renderer's project modals all lose the corresponding
fields. use-projects test fixture trimmed.

New 004-remove-commit-push-prompts.integration.test.ts (2 cases)
verifies column removal + data preservation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Dev-runner stale comment fix

**Files:**
- Modify: `dev-runner.mjs`

CI workflows already clean (verified: `.github/workflows/ci.yml` and `release.yml` have no `node-pty` references — `rebuild:electron` is correctly used for better-sqlite3 only). The only stale reference is a comment in `dev-runner.mjs`.

- [ ] **Step 1: Fix the BASELINE_ESTIMATES comment**

In `dev-runner.mjs`, find the line:

```javascript
  rebuildNode: 15,      // npm rebuild better-sqlite3 node-pty
```

Change to:

```javascript
  rebuildNode: 15,      // npm rebuild better-sqlite3
```

- [ ] **Step 2: Check the rest of dev-runner.mjs for other stale references**

```bash
git grep -n "node-pty\|pty\|@xterm\|cc-handler\|TOKENLESS_CLAUDE_BIN" dev-runner.mjs
```
Expected: zero hits after the comment fix (or only the one we just edited).

- [ ] **Step 3: Commit**

```bash
git add dev-runner.mjs
git commit -m "chore(phase-6): drop node-pty from dev-runner estimate comment

Stale reference from before Phase 1 removed node-pty.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Small renderer cleanups

**Files:**
- Modify: `src/renderer/src/components/layout/AppShell.tsx`
- Modify: `src/renderer/src/components/composer/Composer.tsx`
- Modify: `src/renderer/src/components/layout/styles.css` (only if dead rules exist)
- Modify: `src/shared/ipc/clipboard.ts` (expand the design-decision comment)

- [ ] **Step 1: Fix AppShell L36-37 double blank line**

Open `src/renderer/src/components/layout/AppShell.tsx`. Look at lines 36-37 (post Phase-2 Task 5 cleanup left orphan whitespace). Collapse to a single blank line where appropriate.

- [ ] **Step 2: Verify `actuallySend` is gone from Composer**

```bash
git grep -n "actuallySend" src/renderer
```
Expected: zero hits. Phase 4 Task 5 deleted the bridge stub.

If any hit remains, delete it.

- [ ] **Step 3: Audit Composer for stale references**

```bash
git grep -n "handleCommit\|handlePush\|onCommit\|onPush" src/renderer
```
Expected: zero hits after Phase 5 Task 6.

```bash
git grep -n "\\.actions-row__button--send\\|--button--commit\\|--button--push" src/renderer
```
Expected: zero hits (CSS classes removed).

If any orphan CSS rules remain in the composer or layout styles.css, delete them.

- [ ] **Step 4: Expand the clipboard design-decision comment**

In `src/shared/ipc/clipboard.ts`, the existing comment near `ClipboardReadPromptResult` mentions "Phase 3 deviation from IpcError shape." Expand it into a paragraph that documents the choice as intentional:

```typescript
// IPC channels for the v2 clipboard-based capture / send-back flow.
// Phase 3 ships the READ direction (capture). Phase 4 added WRITE (send).
//
// Design note: ClipboardReadPromptResult and ClipboardWriteGearedResult both
// use a custom union shape ({ ok: true, ... } | { ok: false, code: '...' })
// instead of the project's canonical IpcResult<T> = IpcOk<T> | IpcError
// pattern. The reason: failures here (EMPTY, TOO_LARGE, EMPTY_INPUT) are
// expected business outcomes (the user clicked Capture with nothing on the
// clipboard, etc.), not exceptions. The canonical IpcError shape carries
// { message, code, logId } meant for exception-style failures with full
// diagnostic context; that's overkill for "the clipboard happened to be
// empty." The custom-union pattern is intentional for the clipboard
// namespace and should be preserved if Phase 7+ adds more clipboard
// channels.
```

(Keep the existing constants + types intact; just expand the leading comment.)

- [ ] **Step 5: Verify**

```bash
npm run typecheck
npm run test:run
```
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add -u src/renderer/ src/shared/ipc/clipboard.ts
git commit -m "chore(phase-6): small renderer cleanups + clipboard design note

- AppShell L36-37 double blank line collapsed
- Verified actuallySend / handleCommit / handlePush all gone post phases 4-5
- Removed orphan CSS rules from earlier Send/Commit/Push removals
- Expanded clipboard.ts comment documenting the custom-union failure
  pattern as intentional (vs the canonical IpcError shape)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Add ADRs for v2 design decisions

**Files:**
- Modify: `docs/decisions.md`

The existing decisions log goes up to ADR-042 (per CLAUDE.md). Append ADR-043 through ~ADR-052 capturing the v2 design choices.

- [ ] **Step 1: Read the current ADR style**

```bash
tail -100 docs/decisions.md
```
Note the format: each ADR has Date, Context, Options Considered, Choice, Reasoning.

- [ ] **Step 2: Append the v2 ADRs**

Append the following ADRs (adapt the format to match the existing style). Date them all 2026-05-16 (the day Phase 0 was committed). The ADR numbers continue from the existing 042.

Required ADRs to add:

**ADR-043: Remove the embedded Claude Code PTY**
- Context: v1 hosted Claude Code in-app via node-pty + xterm.js. Trade-off: TokenLess can't easily keep up with first-party features (slash commands, file pickers, IDE bindings, hooks, status line, MCP UI).
- Options: (a) keep PTY + try to mirror upstream features, (b) drop PTY + interface via clipboard, (c) hybrid.
- Choice: (b). The gearing engine doesn't need the PTY to do its job.
- Reasoning: Users get all first-party Claude Code features for free; TokenLess shrinks to its core value.

**ADR-044: Long-lived v2/headless branch for the refactor**
- Context: v1 shipped at v1.0.0-phase-8b. The refactor is too large for the "commit straight to main + tag phases" pattern.
- Options: (a) straight-to-main + accept breakage windows, (b) feature branch, (c) feature flag.
- Choice: (b). `v2/headless` branched off `v1.0.0-final`. Main stays shippable at v1 throughout.
- Reasoning: Preserves v1 stability; clean merge --no-ff at v2.0.0.

**ADR-045: Clipboard as the v2 transport (vs. native APIs)**
- Context: v2 needs to receive prompts FROM and send them BACK TO the user's external terminal.
- Options: (a) Windows UI Automation reading terminal windows, (b) global hotkey + clipboard, (c) clipboard-only with explicit Capture/Copy buttons, (d) accessibility APIs.
- Choice: (c). Both directions via the OS clipboard. No native modules, no window enumeration.
- Reasoning: Universal — works with Claude Code CLI, Claude Code Desktop, any other tool. Zero new native deps. v2.1+ can add automation.

**ADR-046: Conversations remain as lightweight named workspaces**
- Context: With the PTY gone, TokenLess can't see assistant responses. The v1 "conversation = persistent Claude session" model no longer holds.
- Options: (a) drop conversations entirely (stateless app), (b) keep as named workspaces holding drafts + per-prompt telemetry, (c) keep with summary-tracking.
- Choice: (b). User organizes work into named conversations per project; each conversation holds drafts + user-side turn telemetry only.
- Reasoning: Preserves the per-project work organization users expect; drops the assistant-tracking complexity that no longer makes sense.

**ADR-047: Schema migration drops PTY-shaped columns**
- Context: Multiple v1 columns (cc_session_id, summary, parent_conversation_id, branched_at_turn_id, role, response_text, response_tokens, feedback) exist only to serve PTY-related features.
- Choice: Migration `003_v2_headless.sql` drops them. Migration `004_remove_commit_push_prompts.sql` drops the Commit/Push prompt columns.
- Reasoning: Clean schema; nothing dead. The migration runner's pre-batch SQLite backup is the v1 recovery artifact (superseding the spec's proposed JSONL export).

**ADR-048: SQLite backup supersedes JSONL export proposal**
- Context: Spec §4 proposed a JSONL export of assistant turns before the migration deletes them.
- Choice: Rely on the existing `runMigrations()` whole-DB SQLite backup that runs before any pending migration.
- Reasoning: More recoverable (any sqlite tool can open it), less code to write/test, consistent with the existing infrastructure.

**ADR-049: idx_turns_feedback requires explicit DROP**
- Context: SQLite 3.45 doesn't auto-drop indexes when an underlying column is dropped via ALTER TABLE.
- Choice: Migration 003 explicitly `DROP INDEX IF EXISTS idx_turns_feedback` before `ALTER TABLE turns DROP COLUMN feedback`.
- Reasoning: SQLite errors otherwise; verified in migration integration test case 3.

**ADR-050: Composer + GearReviewPane unified into a drawer layout**
- Context: Phase 1-4 left the ActionsRow "Copy Geared" button unreachable because Composer + GearReviewPane swapped conditionally — opening the gear pane hid ActionsRow.
- Options: (a) keep the conditional swap and add a redundant Copy button inside GearReviewPane only, (b) unify into one always-rendered shell with the drawer below.
- Choice: (b). Phase 5 Task 4.
- Reasoning: The single canonical action is always visible. Composer + drawer can coexist within one viewport.

**ADR-051: Clipboard IPC results use a custom union shape**
- Context: The project's canonical `IpcResult<T> = IpcOk<T> | IpcError` shape carries `{ message, code, logId }` on failures.
- Choice: `clipboard:read-prompt` and `clipboard:write-geared` use `{ ok: true, data: ... } | { ok: false, code: '...' }` instead.
- Reasoning: Clipboard failures (EMPTY, TOO_LARGE, WRITE_FAILED) are expected business outcomes, not exceptions. No `logId` needed.

**ADR-052: ActionsRow final 5-button shape**
- Context: v2 user flow is Capture → Gear → review → Copy. The v1 ActionsRow had Send + Commit + Push + Branch + Templates buttons.
- Choice: Final shape is Capture, Gear, Copy Geared, Discard, Templates. Commit + Push removed (users run git in their own terminal); Branch removed (no PTY to spawn); Send replaced by Copy Geared.
- Reasoning: One canonical action per phase of the flow + escape hatches (Discard, Templates).

- [ ] **Step 3: Verify**

```bash
grep -c "^## ADR-" docs/decisions.md
```
Expected: count = 52 (was 42; +10).

- [ ] **Step 4: Commit**

```bash
git add docs/decisions.md
git commit -m "docs(phase-6): add ADRs 043-052 for v2 design decisions

Captures the rationale for the 10 major v2 choices: remove PTY,
long-lived branch, clipboard transport, stateless conversations,
schema migrations 003 + 004, SQLite-vs-JSONL backup, explicit index
drop, drawer layout, custom-union clipboard results, final
ActionsRow shape.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: CLAUDE.md rewrite

**Files:**
- Modify: `CLAUDE.md`

The current CLAUDE.md describes v1 (PTY-hosted Claude Code). It's actively misleading. Phase 6 rewrites it to describe v2 reality.

- [ ] **Step 1: Read the current CLAUDE.md**

```bash
cat CLAUDE.md
```
Note the sections: What TokenLess is, Current status, Stack, Directory layout, Commands, Error handling, Testing, Code style, Decision log, Phase reference, Workflow pattern, Common gotchas, Deferred to v1.1+, Phase / tag index.

- [ ] **Step 2: Rewrite section by section**

Preserve the structure but update the content:

**"What TokenLess is"**: Rewrite to describe v2 — clipboard-based capture/send, no embedded Claude Code, gear engine, half-screen friendly. ~3-4 sentences.

**"Current status"**: Update to "v2.0 in development on `v2/headless` branch. Last shipped phase: v2.0.0-phase-6-cleanup." (When Phase 7 ships v2.0.0, that line bumps.)

**"Stack"**: Drop `xterm.js 5`, `node-pty 1.1`. Everything else stays.

**"Directory layout"**: Update — `src/main/cc/` is gone, `src/renderer/src/components/terminal/` is gone.

**"Commands"**: Largely unchanged. `npm run dev`, `build`, `test:run`, etc. all still work.

**"Error handling protocol"**: Largely preserved (still a cornerstone). Drop the references to `cc` / `pty` category enums.

**"Testing protocol"**: Preserved.

**"Code style"**: Preserved.

**"Decision log"**: Update the ADR count reference (now 52, not 42).

**"Phase reference"**: Update to point to the v2 phase plans (`docs/superpowers/plans/2026-05-16-phase-N-...`).

**"Workflow pattern"**: Preserve, but update the "commit straight to main + tag" line — v2 used a long-lived branch. Add a note about ADR-044.

**"Common gotchas"**: Rewrite extensively. Drop:
- "Native module ABI" — half preserved (better-sqlite3 still has ABI dance) but the node-pty part goes.
- "electron lives in devDependencies" — keep
- "Version strings" — keep
- "E2E env vars" — keep but drop the `TOKENLESS_CLAUDE_BIN` reference (Phase 1 stopped using it)
- "Action button count assertion" — UPDATE to "5 buttons in ActionsRow (Phase 5 final): Capture, Gear, Copy Geared, Discard, Templates"
- "Per-keystroke turns" — DELETE (no PTY, no per-keystroke flow)
- "Built-in templates are protected" — keep
- "Onboarding + privacy notice" — keep
- "Tag moves require force-push" — keep
- "Don't add new categories silently" — keep, update the category count

Add new gotchas:
- "Clipboard result shape" — explain the custom-union pattern + ADR-051 reference
- "Composer + GearReviewPane share one shell" — Phase 5 unified them; don't try to swap conditionally
- "Settings table is key-value text" — boolean settings serialize as 'true'/'false' strings

**"Deferred to v1.1+"**: RENAME to "Deferred to v2.1+" (or "Deferred to v2.0.1+"). Drop the v1-specific items that no longer apply (NSIS / MSIX installer, etc. — those may still apply, evaluate). Add v2-specific deferrals: drag-resize drawer, proper sidebar popovers, ConfigsRow narrow-width overflow, TokenSummary interface simplification, etc.

**"Phase / tag index"**: Append the v2 phase rows. Keep v1 phases intact for historical reference.

```markdown
| `v2.0.0-phase-0-spec` | v2 Phase 0 | Branch + safety tag + spec + initial plans on `v2/headless` |
| `v2.0.0-phase-1-strip-pty` | v2 Phase 1 | Embedded PTY + xterm + node-pty removed |
| `v2.0.0-phase-2-strip-dependents` | v2 Phase 2 | Branching, feedback, summary refresher, ClaudeNotFoundModal removed; migration 003 |
| `v2.0.0-phase-3-capture` | v2 Phase 3 | Clipboard capture IPC + Capture button + sanitize + tests |
| `v2.0.0-phase-4-send` | v2 Phase 4 | Clipboard send-back IPC + Copy Geared button + full round-trip E2E |
| `v2.0.0-phase-5-layout` | v2 Phase 5 | Sidebar collapse, unified Composer/GearReview drawer, final ActionsRow, half-screen E2E |
| `v2.0.0-phase-6-cleanup` | v2 Phase 6 | Logger categories + settings + project fields cleanup, CLAUDE.md rewrite, ADRs 043-052, migration 004 |
```

- [ ] **Step 3: Verify the file is well-formed**

```bash
wc -l CLAUDE.md
```
Expected: roughly similar size to before (~250-350 lines). If significantly larger or smaller, audit for missed sections.

```bash
git grep -n "node-pty\|xterm\|cc:start\|cc-session\|TerminalPane\|@xterm" CLAUDE.md
```
Expected: zero hits.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(phase-6): rewrite CLAUDE.md for v2 reality

Drops every reference to the embedded Claude Code PTY, xterm.js,
node-pty, cc/pty Logger categories, and v1-specific gotchas.
Adds: v2 clipboard flow description, drawer-layout gotcha, custom
clipboard-result shape note, settings table key-value note, v2
phase/tag index rows. Renames 'Deferred to v1.1+' → 'Deferred to
v2.1+' with v2-specific carry-overs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Spec amendments + scenarios doc refresh

**Files:**
- Modify: `docs/superpowers/specs/2026-05-16-tokenless-v2-headless-design.md`
- Modify: `docs/test-scenarios.md`

- [ ] **Step 1: Spec §4 amendment**

In `docs/superpowers/specs/2026-05-16-tokenless-v2-headless-design.md`, find §4 ("Database schema changes"). The current text describes the migration as `0010_headless.sql` with a JSONL backup. Update to reflect what shipped:

Replace the migration filename references with `003_v2_headless.sql` (Phase 2) and add a note about `004_remove_commit_push_prompts.sql` (Phase 6).

Replace the "JSONL pre-migration export" paragraph with:

> User-impact: existing v1 users opening the v2 build get a one-time migration (003 + 004). Drafts are preserved. Projects + accounts are preserved. Old assistant transcripts are discarded. **Backup**: the migration runner (`src/main/db/migrations/runner.ts`) writes a whole-DB SQLite copy to `<userData>/backups/` before any pending migration applies. The SQLite copy IS the v1 recovery artifact — superseding the spec's earlier JSONL proposal (see ADR-048). Users who want to inspect old data can open the backup file in any SQLite tool.

- [ ] **Step 2: Spec §9 phase table — mark Phase 6 shipped**

Update row 6:

```markdown
| 6 | `v2.0.0-phase-6-cleanup` | dev-runner simplification, CLAUDE.md rewrite, ADR-043+ for v2 decisions, GitHub Actions workflow updates (drop node-pty rebuild), e2e suite refresh, scenarios doc rewrite, removed categories struck through. | shipped 2026-05-16 (9 tasks, ~298 tests green, migration 004 verified, CLAUDE.md rewritten, ADRs 043-052 added) |
```

(Adjust dates / counts to match reality.)

- [ ] **Step 3: Test scenarios doc refresh**

In `docs/test-scenarios.md`:
- Confirm S-v2.1 (Capture), S-v2.2 (round-trip), S-v2.3 (half-screen layout) are current
- If there are pre-Phase-1 scenarios (S-1.x, S-2.x...) that reference the embedded terminal, strike them through (don't delete — they're historical) with a note like:

```markdown
~~## S-1.3: Terminal output streaming~~ *(removed v2 — embedded PTY gone)*
```

Quickly read the file and apply this pattern to anything that references PTY, terminal, cc-:*, branching, feedback bar, Commit/Push buttons.

- [ ] **Step 4: Verify**

```bash
git grep -n "0010_headless\|JSONL" docs/superpowers/specs
```
Expected: zero hits (the spec amendment removed both references).

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-05-16-tokenless-v2-headless-design.md docs/test-scenarios.md
git commit -m "docs(phase-6): spec amendments + scenarios doc refresh

Spec §4: migration filename corrected (003_v2_headless.sql),
JSONL-export paragraph replaced with the actual SQLite-backup
mechanism (per ADR-048). §9 phase table marks Phase 6 shipped.

test-scenarios.md: v1 PTY/terminal scenarios struck through with
historical notes; S-v2.1 through S-v2.3 confirmed current.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Verification gate + phase tag

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
Expected: ~298-300 tests passing (Phase 5 ended at 297; +2 from new migration 004 tests; possibly -N from removed Commit/Push test assertions).

- [ ] **Step 3: Build**

```bash
npm run rebuild:electron
npm run build
npm run build:unpack
```
Expected: PASS. `dist/win-unpacked/TokenLess.exe` produced.

- [ ] **Step 4: E2E**

```bash
npm run test:e2e
```
Expected: 19 passed, 1 skipped, 0 failures. (No new E2E tests in Phase 6.)

- [ ] **Step 5: Tag**

```bash
git tag -a v2.0.0-phase-6-cleanup -m "Phase 6: cleanup + documentation refresh.

Code cleanups:
- Dropped 'cc' + 'pty' Logger categories (12 → 10 entries)
- Removed SendConfirm setting + SendConfirmToggle UI component
- Removed Commit/Push project fields + UI + DB migration 004
- Verified all Phase-1-5 carry-overs (actuallySend, handleCommit/Push,
  dead CSS rules) are gone
- Dev-runner stale node-pty comment fixed
- AppShell L36-37 double blank line collapsed
- Expanded clipboard.ts comment documenting the custom-union design

Docs:
- CLAUDE.md fully rewritten for v2 reality
- ADRs 043-052 added to docs/decisions.md
- Spec §4 amended (migration filename + SQLite-backup mechanism)
- Spec §9 phase table updated
- test-scenarios.md: v1 PTY scenarios struck through

Verification gate:
- Typecheck: clean
- Unit + integration: ~298-300 tests green (was 297 in phase 5)
- Build + build:unpack: TokenLess.exe produced
- E2E: 19 passed, 1 skipped, 0 failures

9 phase-6 commits between v2.0.0-phase-5-layout and this tag.

The codebase is now ready for Phase 7 (release prep):
- Version bump to 2.0.0
- About dialog update
- README rewrite
- Merge v2/headless -> main with --no-ff
- Signed v2.0.0 tag

Carry-overs remaining (truly deferred to v2.1+):
- Drag-resize handle on the gear-review drawer
- Proper popovers for collapsed sidebar
- ConfigsRow narrow-width overflow
- Skill dropdown in ConfigsRow (re-evaluate)
- TokenSummary responseOutputTokens always-0 simplification
- Turn-row capture at copy time
- Renderer test fixture-pattern DRY-up"
```

Do NOT push the tag — user pushes.

---

## Self-review

**Backlog coverage:**
- AppShell.tsx L36–37 double blank line: Task 5 ✓
- Orphan SendConfirmToggle UI: Task 2 ✓
- responseOutputTokens always-0: explicitly deferred ✓ (documented as v2.1)
- Clipboard result shape consistency: Task 5 (documented as intentional) + Task 6 ADR-051 ✓
- `cc` / `pty` Logger categories still registered: Task 1 ✓
- Spec §4 says `0010_headless.sql` + JSONL: Task 8 ✓
- v2/headless commit subjects of `docs(phase-N)` for work in phase N+1 — cosmetic, leave alone ✓
- Drag-resize drawer handle: explicitly deferred ✓
- Sidebar proper popovers: explicitly deferred ✓
- ConfigsRow narrow-width: explicitly deferred ✓
- Skill dropdown in ConfigsRow: explicitly deferred ✓
- Turn-row capture at copy time: explicitly deferred ✓
- Commit/Push project fields + DB columns: Task 3 ✓

**Placeholder scan:** No "TBD" / "TODO". Task 7 (CLAUDE.md rewrite) describes the major sections to update but leaves the specific wording to the implementer — which is appropriate because the file is ~300 lines and copying every section into the plan is duplicative. ✓

**Type consistency:**
- Migration 004 drops 2 columns; corresponding shared type fields + DAO references + UI + tests all updated symmetrically in Task 3 ✓
- ADRs 043-052 are numbered sequentially from the existing 042 ✓

**Open notes resolved inline:**
- Task 6 has explicit ADR text — implementer adapts wording but not the substance ✓
- Task 7 calls out specific gotchas to add/remove rather than expecting the implementer to rebuild from scratch ✓
- Task 8 spec amendment text is provided verbatim ✓

---

## Exit state

- Branch `v2/headless` advanced by ~9 commits + 1 tag (`v2.0.0-phase-6-cleanup`).
- App builds + launches; full Capture → Gear → Copy round-trip works; v2 docs match v2 reality.
- Unit + integration suite green at ~298-300 tests.
- E2E suite green at 19 passed, 1 skipped, 0 failures.
- All Phase 1-5 carry-overs resolved (or explicitly deferred to v2.1+).
- CLAUDE.md describes v2 architecture; ADRs 043-052 in `docs/decisions.md` document the rationale.
- Tag `v2.0.0-phase-6-cleanup` exists locally, awaiting user push.

Phase 7 plan (`2026-05-16-phase-7-release.md`) — version bump, About dialog, README rewrite, merge to main with `--no-ff`, signed v2.0.0 tag — is the next planning step.

---
