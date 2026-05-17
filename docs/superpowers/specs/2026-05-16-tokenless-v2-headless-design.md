# TokenLess v2 — Headless Refactor Design Spec

**Date:** 2026-05-16
**Status:** Draft for review (no implementation work yet)
**Author:** Aiden Molyneaux (aiden.molyneaux@versaterm.com)
**Predecessor:** [TokenLess v1 design](2026-05-13-tokenless-v1-design.md), shipped at `v1.0.0-phase-8b`

---

## Executive summary

TokenLess v2 removes the embedded Claude Code terminal entirely. The app stops being a Claude Code host and becomes a **prompt-side-channel**: the user runs Claude Code in their own terminal (or Claude Code Desktop), pulls their typed prompt into TokenLess via the clipboard, edits and/or runs it through Haiku gearing, then copies the geared result back to the terminal to send.

Why: hosting Claude Code in-app trades away the first-party features (slash commands, file pickers, IDE bindings, hooks, status line, MCP UI, etc.) that ship in Claude Code itself. The gearing engine — the part of TokenLess that justifies its existence — does not need the terminal to do its job. v2 keeps the gearing, drops everything else that exists only to serve the embedded terminal.

Secondary goal: make the app comfortable at **half-screen width** (≈720px), since the intended use is "TokenLess on the left half, terminal on the right."

---

## Goals

1. **Preserve the gearing flow.** Compose → Gear (Haiku) → Review original vs. geared → Edit → Re-gear → Copy. This is the only thing the user opens TokenLess for in v2.
2. **Be invisible most of the time.** Capture-from-clipboard, copy-to-clipboard, no manual file shuffling, no PTY spawning, no in-app terminal to babysit.
3. **Work at half-screen width.** Sidebar collapses to icons. Composer + Gear Review reflow vertically. No horizontal scrolling at 720px.
4. **Stay stateless about conversation content.** TokenLess does not track assistant responses, since it can't see them. Conversations remain as named, per-project workspaces for organizing drafts and per-prompt telemetry, but hold no transcript.
5. **Preserve everything that doesn't depend on the PTY.** Multi-account, projects, drafts, gearing engine, telemetry summary, templates, skills picker, Developer Mode + Logger, Settings, Onboarding, privacy notice, crash reporter, About dialog.

## Non-goals (for v2.0)

- **Automated paste-into-terminal.** v2.0 ships with manual clipboard flow only ("Copy Geared" → user Ctrl+V in terminal themselves). Automation via global hotkey + Windows SendInput is v2.1+ scope.
- **Reading text directly out of the terminal window** (UI Automation, accessibility APIs, scrollback scraping). v2 trusts the clipboard.
- **Multi-terminal disambiguation.** Not needed in v2 — whichever window the user copies from is the source. v2.1 may add a "captured from: <window title>" hint.
- **Branching, conversation summary refresh, response feedback buttons, assistant-turn capture.** All depend on the PTY response stream and are removed.
- **Backwards compatibility with v1 conversations.** v2 ships a migration that nulls/drops PTY-specific columns; existing user data is preserved where it remains meaningful (drafts, projects, accounts, user-side turns), discarded where it is not (cc_session_id, assistant turns, branching links).
- **macOS / Linux builds.** Windows-first remains the rule (ADR-002 unchanged).
- **Claude Code Desktop integration beyond clipboard.** Works "for free" through the clipboard like any other surface; no dedicated detection in v2.0.

---

## Decisions captured during brainstorm

| Decision | Choice |
|---|---|
| Terminal interface mechanism | Clipboard-based both directions, MVP. No native modules, no window enumeration in v2.0. |
| Conversations entity | Kept as lightweight named workspaces per project. Hold drafts + user-side turn telemetry only. |
| Source control strategy | Long-lived `v2/headless` branch off `v1.0.0-final` tag. Per-phase tags on the branch. Final merge `--no-ff` to main when v2.0.0 cuts. |
| Layout target | Half-screen comfortable (≈720px). Sidebar collapses to icon strip; MainPane vertical stack. |
| Action buttons (post-refactor) | Capture from clipboard · Gear · Copy Geared · Discard. Send-into-PTY removed. |
| Schema migration | Drop `conversations.cc_session_id`, branching columns, and assistant `turns.role='assistant'` rows. User-side turn telemetry kept. |
| node-pty + xterm.js + @xterm/addon-fit | Removed from `package.json`. `rebuild:electron` script keeps better-sqlite3 only. |
| dev-runner | Greatly simplified — no ABI probe needed since only better-sqlite3 remains native. |
| Test suite scope | ~16 terminal/PTY/branch/feedback test files deleted or rewritten. Gearing/drafts/telemetry/templates tests retained. New tests for clipboard capture + send-back. |

---

## 1. Architecture

TokenLess v2 keeps the Electron main/renderer split but loses the largest chunk of main-process surface.

### Main process (post-refactor)

- Owns the **SQLite** database (better-sqlite3). Only main writes. Migrations `003_v2_headless.sql` + `004_remove_commit_push_prompts.sql` drop PTY-specific columns, assistant turn rows, and Commit/Push project columns.
- Owns the singleton **Anthropic SDK client** used for Haiku gearing + AI error analysis. The rolling-summary refresher and response-side critique go away (no responses to summarize).
- Owns the **Logger** service unchanged. New observability events for clipboard capture + send (`capture.read`, `capture.empty`, `capture.too-large`, `send.copied`).
- Exposes a narrowed IPC surface (Section 3).
- **Deleted entirely:** the `src/main/cc/` module (lifecycle, spawner, parser, watchdog, response accumulator, telemetry emitter, ansi utils, types), `src/main/ipc/cc-handler.ts`, all `cc:*` IPC channels.
- Skills scanner + reconciler remain (they're filesystem-watching, not PTY-related). Project + account services remain.

### Renderer process (post-refactor)

- React UI: collapsible icon-strip Sidebar, narrow TopBar, MainPane = Composer (top) + GearReviewPane (collapsible drawer, bottom).
- **Deleted entirely:** `src/renderer/src/components/terminal/` (TerminalPane, TerminalToolbar, TerminalSection, HungBanner), `src/renderer/src/hooks/use-cc-subscription.ts`, `src/renderer/src/hooks/use-cc-events.ts`. ClaudeNotFoundModal removed.
- Composer ActionsRow reduced from 6 buttons to 4: **Capture · Gear · Copy Geared · Discard**. The E2E count assertion in `composer.e2e.test.ts` updates to 4.
- GearReviewPane is unchanged in function (still shows original vs. geared side-by-side, still supports edit + re-gear) but reflows vertically when window is narrow.

### Preload

- `window.tokenless.cc` namespace removed entirely.
- New `window.tokenless.clipboard` namespace with `readPrompt()` and `writeGeared(text)`. Both go via IPC so the main process can validate / log / enforce length caps.

### Data flow (v2)

```
User types in external terminal (Claude Code CLI or Desktop)
  └─ User selects text + Ctrl+C
       └─ User clicks "Capture" in TokenLess
            └─ Renderer → preload → IPC(clipboard:read-prompt)
                 └─ Main: clipboard.readText() → validate (non-empty, ≤32KB) → log capture.read
                      └─ Renderer: load text into Composer.body, mark draft dirty
User edits prompt in Composer
  └─ User clicks "Gear"
       └─ Existing gearing pipeline runs (unchanged) → GearReviewPane populated
            └─ User edits geared output if desired → clicks "Copy Geared"
                 └─ Renderer → preload → IPC(clipboard:write-geared)
                      └─ Main: clipboard.writeText(geared) → log send.copied
                           └─ Renderer: toast "Geared prompt copied — paste into your terminal"
User Ctrl+V in their terminal, presses Enter
```

No PTY. No assistant capture. No conversation continuation logic. Each Capture→Gear→Copy is a complete cycle.

---

## 2. Source control strategy

The v1 release at `v1.0.0-phase-8b` is the last revision of TokenLess that hosts Claude Code. v2 is a breaking architectural change — different shape, different value prop. The git history needs to preserve v1 clearly while not blocking v2 progress.

**Plan:**

1. Tag current HEAD as `v1.0.0-final` (annotated, signed) — points at the same commit as `v1.0.0-phase-8b`, lives forever as "the final v1 build."
2. Create branch `release/v1` from that tag. Frozen. No commits. Exists so anyone can `git checkout release/v1` and get a working v1 without browsing tags.
3. Create branch `v2/headless` from `main`. All v2 work happens here. Per-phase commits + tags (`v2.0.0-phase-1-strip-pty`, `v2.0.0-phase-2-...`, etc.) just like v1 did.
4. When v2.0.0 is ready: `git checkout main && git merge --no-ff v2/headless` and tag `v2.0.0`.
5. Main stays shippable at v1.0.0 the entire time. If a critical v1 fix lands, it goes on `release/v1` and is cherry-picked to `v2/headless` if relevant.

GitHub workflow split: the existing `ci.yml` and `release.yml` continue to run against pushes to both branches (with branch-aware version detection — the release workflow already triggers on `v*` tag pushes, which is branch-independent). No workflow file changes during the branch phase; CI workflow updates land in v2-phase-6 as part of cleanup.

---

## 3. IPC surface changes

**Removed channels** (11 in total):
`cc:start`, `cc:send`, `cc:resume`, `cc:stop`, `cc:input`, `cc:resize`, `cc:output-chunk`, `cc:exit`, `cc:event`, `cc:crashed`, `cc:hung`.

**Removed handlers:** `src/main/ipc/cc-handler.ts` deleted.

**New channels** (added in `src/shared/ipc/clipboard.ts`):

- `clipboard:read-prompt` — invoke, returns `{ ok: true, text: string } | { ok: false, code: 'EMPTY' | 'TOO_LARGE' | 'READ_FAILED' }`. Length cap: 32 KB (configurable in settings later). UTF-8 normalization. Log: `capture.read` on success, `capture.empty` / `capture.too-large` / `capture.read-failed` on each failure mode.
- `clipboard:write-geared` — invoke, takes `{ text: string }`, returns `{ ok: true } | { ok: false, code: 'WRITE_FAILED' }`. Log: `send.copied` on success, `send.write-failed` on failure.

**Modified channels:** `conversations:send-prompt` (previously routed to `cc:send`) — repurposed to record a user-side turn for telemetry only. Optional, no-op if telemetry is disabled.

**Unchanged:** `gearing:*`, `accounts:*`, `projects:*`, `drafts:*`, `templates:*`, `skills:*`, `settings:*`, `telemetry:*`, `logger:*`. Approximately 40 channels untouched.

---

## 4. Database schema changes

Two migrations apply on first launch of v2:

**`003_v2_headless.sql`** (Phase 2):

- `ALTER TABLE conversations DROP COLUMN cc_session_id;`
- `ALTER TABLE conversations DROP COLUMN parent_conversation_id;`
- `ALTER TABLE conversations DROP COLUMN branched_at_turn_id;`
- `ALTER TABLE conversations DROP COLUMN summary;` (no longer maintained)
- `ALTER TABLE conversations DROP COLUMN summary_updated_at;`
- `DELETE FROM turns WHERE role = 'assistant';` (assistant rows no longer captured; preserve user rows for telemetry continuity)
- `ALTER TABLE turns DROP COLUMN response_text;`
- `ALTER TABLE turns DROP COLUMN response_tokens;`
- `ALTER TABLE turns DROP COLUMN feedback;` (no UI surface remains)
- `ALTER TABLE turns DROP COLUMN role;` (always 'user' now)

**`004_remove_commit_push_prompts.sql`** (Phase 6):

- `ALTER TABLE projects DROP COLUMN commit_prompt;`
- `ALTER TABLE projects DROP COLUMN push_prompt;`

SQLite doesn't support `DROP COLUMN` natively before 3.35; better-sqlite3 11 bundles a recent enough SQLite. If issues arise, fall back to table-recreate pattern.

User-impact: existing v1 users opening the v2 build get a one-time migration (003 + 004). Drafts are preserved. Projects + accounts are preserved. Old assistant transcripts are discarded. **Backup**: the migration runner (`src/main/db/migrations/runner.ts`) writes a whole-DB SQLite copy to `<userData>/backups/` before any pending migration applies. The SQLite copy IS the v1 recovery artifact — superseding the spec's earlier JSONL proposal (see ADR-048). Users who want to inspect old data can open the backup file in any SQLite tool.

---

## 5. Half-screen layout

Target window width: **720px comfortable, 600px minimum.**

### Sidebar

- Default: 240px expanded. Collapses to 48px icon strip via a chevron toggle.
- Icon strip shows: Projects icon (active project initial), Conversations icon (count badge), Settings icon, Dev Mode icon.
- Project + Conversation pickers move to dropdown popovers anchored to the icon when collapsed; full list when expanded.
- Persisted in settings: `layout.sidebarCollapsed` (boolean). Default `true` if first launch detects window width <900px.

### TopBar

- Reduced to a single 36px row: account switcher (compact, initial+chevron), telemetry pill (compact), window controls. About link moves to Settings.

### MainPane (vertical stack)

- **Composer** (top, flex-grow): textarea + ActionsRow (4 buttons). Empty-state hint: *"Capture a prompt from your terminal (Ctrl+C in terminal → click Capture)."*
- **GearReviewPane** (bottom, collapsible drawer): hidden by default until a gear call returns. When open, takes 50% of MainPane height; resizable via a horizontal drag handle. Closes via a chevron when user clicks "Copy Geared" or "Discard."
- At 600px width: GearReviewPane stacks original-above-geared instead of side-by-side. Below 600px: a single-pane toggle (original/geared) replaces the diff view.

### ActionsRow

Four required buttons, left-to-right:

1. **Capture** — reads clipboard into composer. Disabled if clipboard read returned EMPTY in the last 3 seconds (debounce repeated misclicks).
2. **Gear** — runs Haiku gearing on current composer text. Opens GearReviewPane.
3. **Copy Geared** — writes current geared text (post-user-edits) to clipboard, fires success toast. Disabled until a gear has been run.
4. **Discard** — clears composer + closes GearReviewPane + clears draft for the active conversation.

A fifth (Templates picker) and sixth (Skills picker) may remain depending on the open-question outcome in §10 — the plan-writing step resolves the final count, and the E2E count assertion in §8 updates accordingly.

---

## 6. Removed features

This section is explicit so a future reader does not look for them:

- **Embedded terminal** (TerminalPane, xterm, node-pty).
- **PTY lifecycle, watchdog, hung banner, crash modal, ClaudeNotFoundModal.**
- **Conversation summary refresher** (no responses to summarize).
- **Response accumulator + assistant turn capture.**
- **Turn feedback buttons** (operate on assistant turns that no longer exist).
- **Branching** ("branch from latest turn") — depended on PTY spawning a new session.
- **Resume / Stop terminal actions.**
- **`cc:event` parser + ANSI handling.**
- **Per-keystroke `cc:input` path.**
- **Send-confirmation modal** (the new "Copy Geared" flow doesn't fire an irreversible action; user pastes themselves).

Settings entries that referenced any of the above are removed in v2-phase-6 cleanup.

---

## 7. Error handling

The v1 cornerstone (categories.ts + observability.md + logger.* with context) remains intact. New categories:

- `clipboard` — clipboard read/write paths. Events: `capture.read`, `capture.empty`, `capture.too-large`, `capture.read-failed`, `send.copied`, `send.write-failed`.

Removed categories: `cc-lifecycle`, `cc-parser`, `cc-watchdog`, `cc-spawner`. Their `categories.ts` entries are deleted and the corresponding rows in `docs/observability.md` are struck through with a "(removed in v2)" note rather than deleted, so the log archives of v1 users remain interpretable.

User-facing failure paths:

- Clipboard empty → inline hint under Capture button: *"Clipboard is empty. Copy text in your terminal first, then click Capture."*
- Clipboard too large → toast: *"Clipboard contains more than 32 KB. Trim your selection."*
- Clipboard read failed → toast: *"Couldn't read clipboard. Check Settings → Privacy → Clipboard permissions."* (Logger context includes the underlying error.)
- Clipboard write failed (Copy Geared) → toast: *"Couldn't write to clipboard. Geared text remains in TokenLess — try Copy Geared again."*
- Haiku gearing error → existing path unchanged.

---

## 8. Testing protocol

Following the v1 cornerstone: every new feature must have unit + integration + scenario + (where applicable) E2E coverage.

### Deleted tests (~16 files)

`src/main/__tests__/cc/*` (8 files), `src/main/__tests__/ipc/cc-handler.integration.test.ts`, `src/renderer/src/hooks/__tests__/use-cc-subscription.unit.test.tsx`, `src/renderer/src/hooks/__tests__/use-cc-events.unit.test.tsx`, terminal-pane component tests, branching tests, turn-feedback tests, summary-refresher tests.

### Reworked tests

- `src/main/__tests__/db/dao-conversations.integration.test.ts` — removes cc_session_id + branching field assertions.
- `src/main/__tests__/db/dao-turns.integration.test.ts` — user-side rows only.
- `test/e2e/composer.e2e.test.ts` — count assertion 6 → 4 buttons; new flow tests Capture → Gear → Copy Geared without PTY.
- `test/e2e/smoke.e2e.test.ts` — drops PTY startup expectations.

### New tests

- `src/main/__tests__/ipc/clipboard-handler.integration.test.ts` — read/write flows, length cap, empty, failure modes.
- `src/renderer/src/components/composer/__tests__/capture-button.unit.test.tsx` — disabled-state debounce, success path, error toasts.
- `src/renderer/src/components/composer/__tests__/copy-geared-button.unit.test.tsx` — disabled until gear ran, copies post-edit text.
- `test/e2e/capture-flow.e2e.test.ts` — full Capture→Gear→Copy E2E using Electron's clipboard module to seed/read.
- `test/e2e/layout.half-screen.e2e.test.ts` — viewport 720×900, asserts sidebar collapsed by default, GearReviewPane stacks vertically.

### Scenarios appended to `docs/test-scenarios.md`

- **S-v2.1** Capture from clipboard: empty / typical / 33KB.
- **S-v2.2** Gear + edit geared + Copy → paste in Notepad → verify exact bytes.
- **S-v2.3** Half-screen layout at 720×1000: all controls reachable, no horizontal scroll.
- **S-v2.4** v1 → v2 migration: open with existing v1 SQLite DB, verify SQLite backup exists in `<userData>/backups/`, verify drafts preserved.

---

## 9. Phase plan (high level)

Detailed per-phase plans go in `docs/superpowers/plans/2026-05-16-phase-N-...` (via the `writing-plans` skill, next step after this spec).

| Phase | Tag | Topic | Status |
|---|---|---|---|
| 0 | `v2.0.0-phase-0-spec` | Branch + safety tag (`v1.0.0-final`, `release/v1`). Spec + initial plans committed to `v2/headless`. | shipped |
| 1 | `v2.0.0-phase-1-strip-pty` | Delete `src/main/cc/`, `cc-handler.ts`, terminal renderer components + hooks, preload `cc` namespace, node-pty + @xterm/* deps, electron-builder unpacks. App still builds + runs with a placeholder MainPane. | shipped 2026-05-16 (12 commits, 292/292 unit/integration, build:unpack OK, E2E known failures as documented) |
| 2 | `v2.0.0-phase-2-strip-dependents` | Remove branching UI, summary refresher, response accumulator, feedback UI, hung/crash modals, ClaudeNotFoundModal. DB migration (spec originally called `0010_headless.sql`). v1 backup export. | shipped 2026-05-16 (10 commits, 272/272 unit/integration, migration 003 verified, build:unpack OK, E2E 11/0/2-skipped). Plan adjusted migration filename to `003_v2_headless.sql`; v1 backup via existing whole-DB SQLite copy instead of pre-migration export — spec amendment in phase 6. |
| 3 | `v2.0.0-phase-3-capture` | `clipboard:read-prompt` IPC, Capture button in Composer, validation + observability + tests. | shipped 2026-05-16 (9 commits, 285/285 unit/integration, E2E 13/0/2-skipped, capture-flow E2E added). Implementer chose a custom failure-shape union (`{ok:false, code:'EMPTY'\|'TOO_LARGE'\|'READ_FAILED'}`) instead of the project's `IpcError`-wrapped pattern — phase 6 consistency decision. |
| 4 | `v2.0.0-phase-4-send` | `clipboard:write-geared` IPC, Copy Geared button replacing old Send, success toast + tests. | shipped 2026-05-16 (9 commits, 293/293 unit/integration, E2E 15/0/1-skipped incl. full Capture→Gear→Copy round-trip). gearing.e2e.test.ts un-skipped — was previously gated on the now-deleted `.terminal-pane`. |
| 5 | `v2.0.0-phase-5-layout` | Sidebar collapse, MainPane vertical reflow, TopBar compaction, half-screen scenarios + E2E. | shipped 2026-05-16 (8 tasks, 297/297 unit/integration, E2E 19/0/1-skipped). Composer + GearReviewPane unified into drawer (ActionsRow Copy Geared now reachable). ActionsRow final 5-button shape (Capture/Gear/Copy/Discard/Templates) with Commit + Push removed. |
| 6 | `v2.0.0-phase-6-cleanup` | dev-runner simplification, CLAUDE.md rewrite, ADR-043+ for v2 decisions, GitHub Actions workflow updates (drop node-pty rebuild), e2e suite refresh, scenarios doc rewrite, removed categories struck through. | shipped 2026-05-16 (9 tasks, ~299 tests green, migration 004 verified, CLAUDE.md rewritten, ADRs 043-052 added) |
| 7 | `v2.0.0` | Version bump 2.0.0, About dialog update, README rewrite for headless flow, merge `v2/headless` → `main` with `--no-ff`, signed tag `v2.0.0`. | shipped 2026-05-16 (7 tasks; v2/headless merged into main; v2.0.0 tagged on the merge commit) |

Each phase exits with the standard v1-style verification gate: typecheck → test:run → build → test:e2e (e2e deferred to CI on dev boxes without VS Build Tools).

---

## 10. Risks & open questions

| Risk | Mitigation |
|---|---|
| Clipboard text in TokenLess differs from what the user actually wants (e.g., includes terminal prompt prefix, ANSI codes pasted as text) | Add a permissive sanitizer in the capture path: strip ANSI escape sequences, strip lone trailing prompt prefixes (`$`, `>`, `PS>`), preserve all newlines + content otherwise. Test with both Windows Terminal + Claude Code Desktop selections. |
| Geared text on clipboard gets clobbered by user copying something else before paste | Toast persists 8s; "Copy Geared" can be re-clicked freely from GearReviewPane. v2.1 could add a 60-second clipboard guard. |
| User confusion about workflow change | Onboarding wizard rewrites to show the new Capture→Gear→Copy flow. README front-loads it. About dialog notes "v2 — headless." |
| Long-lived v2 branch drifts from main | Cherry-pick from `release/v1` only on critical-fix basis. Main is frozen-shippable at v1 until v2.0.0 merge. |
| dev-runner regression during simplification | Keep dev-runner working at each phase commit — strip its ABI probe only after node-pty is removed (phase 1 → phase 6). |
| Tests deleted en masse hide regressions in untouched code | Verification gate per phase is unchanged. CI runs full suite. The deleted tests are tightly scoped to deleted code paths. |

**Open questions deferred to plan-writing or implementation:**

- Should the active "conversation" still gate drafts in v2, or do drafts become global per-project? Lean: keep per-conversation drafts for parity with v1 muscle memory, but rename "Conversations" → "Workspaces" in copy to reflect the lighter meaning. (Will refine in writing-plans.)
- Telemetry pill — does the savings figure still make sense without response tokens? The math becomes "input savings only." Lean: yes, but relabel the pill from "Savings" to "Input savings" to avoid implying output savings we can't measure.
- Skills picker — keep or drop? Skills appear in the user's terminal session, not in TokenLess. Lean: drop the picker UI from TokenLess composer (skills are surfaced by Claude Code itself in the user's terminal), but keep the scanner running so Developer Mode can still observe what's installed.

---

## 11. Success criteria

v2.0.0 ships when:

- All 7 phases tagged on `v2/headless`.
- Full Capture → Gear → Edit → Copy → paste round-trip verified manually in S-v2.2.
- Half-screen layout verified at 720×900 (S-v2.3).
- v1 → v2 migration verified (S-v2.4).
- Unit + integration test suite green (with deletions + new tests; expect ~340 tests total, down from 371).
- E2E suite green.
- `rebuild:electron` no longer references node-pty.
- `package.json` no longer depends on node-pty, @xterm/xterm, @xterm/addon-fit.
- CLAUDE.md updated to reflect v2 reality (terminal sections removed, clipboard sections added, gotchas updated).
- Tag `v2.0.0` cut and merged to `main`.

---
