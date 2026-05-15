# Phase 8 Polish Backlog

Open issues + nits captured during live-demo sessions and final reviews. Each item is intended to be fixed by end of Phase 8 (the release-prep phase). Items here are NOT blockers for any prior phase tag — they're known rough edges that need attention before v1.0 ships.

Format: one section per area, items are checkboxes. Cite file paths + line refs when possible.

---

## Critical user-facing bugs

- [ ] **Project / Account dropdowns hidden behind MainPane content** (live demo 2026-05-15)
  - Repro: open the app with one project, click the "Project:" dropdown. The expanded list renders BEHIND the composer/terminal/gearReviewPane.
  - Cause: stacking context — the dropdown's `position: absolute` doesn't escape a transformed/positioned ancestor, or its z-index loses to a sibling. Likely the gear-review-pane's `--tl-z-gear-review: 210` (ADR-022) or some other element is shadowing it.
  - Files to inspect: `src/renderer/src/components/common/styles.css` (Dropdown's `.dropdown-menu`), `src/renderer/src/theme/tokens.css` (z-index tokens), `src/renderer/src/components/gear-review/styles.css`, `src/renderer/src/components/layout/styles.css`.
  - Likely fix: bump `--tl-z-dropdown` above `--tl-z-gear-review` AND make sure the Dropdown menu uses that token (currently `50`, way below modal/gear-review). Also verify the Dropdown's parent doesn't create a stacking context that traps the absolutely-positioned menu.
  - Severity: HIGH — makes creating additional projects impossible from the UI right now.

- [ ] **Project rootPath not validated against disk before spawn** (live demo 2026-05-15)
  - Repro: create a project with a placeholder/typo path → New Conversation fails with cryptic `Cannot create process, error code: 267` (Windows ERROR_DIRECTORY).
  - Files: `src/main/cc/spawner.ts` does NOT check `cwd` exists before `pty.spawn`. `src/renderer/src/components/layout/CreateProjectModal.tsx` does not validate either.
  - Fix: in CreateProjectModal, validate `fs.existsSync(rootPath)` via a small `paths:check-dir` IPC. Show inline error "Directory doesn't exist." before submit. Belt-and-braces: spawner could also pre-check + throw a tagged `PROJECT_ROOT_MISSING` error code that the renderer maps to a clearer toast.

- [ ] **Settings button stub** — currently logs `settings-clicked` and nothing else. Spec §2 names it; the button has been a stub since Phase 2A.
  - File: `src/renderer/src/components/layout/SettingsButton.tsx`.
  - Fix: build the Settings view (Spec §2 → `/settings` route covers: accounts, gearing preferences, theme, send-confirm toggle, layout toggle stub, telemetry summary, Dev Mode toggle).

- [ ] **Onboarding wizard not implemented** — first run currently shows an empty-state banner + Create Project button. Spec §2 names a `/onboarding` route (welcome → API key → first account login → first project → done).
  - Fix: build the wizard. Reuse Phase 3's `OnboardingBanner` as the trigger for users who dismissed the empty state.

---

## Important UX gaps (from live demos / reviews)

- [ ] **GearReviewPane Send buttons silently no-op without conversation** — partially fixed in live demo: added `sendDisabled` prop + yellow hint banner. Patch lives in `src/renderer/src/components/gear-review/GearReviewPane.tsx` + `src/renderer/src/components/composer/Composer.tsx`. Need to commit this fix proper. Phase 8 should consider: auto-create a conversation on Send-from-GearReviewPane if none exists.

- [ ] **Stale Anthropic model IDs in pricing table** — live demo found `claude-3-5-haiku-latest` 404s. Fixed locally to `claude-haiku-4-5-20251001` / `claude-sonnet-4-6` / `claude-opus-4-7` (commit pending). Phase 8 / ongoing maintenance: add a startup self-test that pings the gearing model with a 1-token probe so stale IDs fail fast at boot.
  - File: `src/main/api/pricing.ts`, `src/renderer/src/hooks/use-live-cost-estimate.ts` (duplicate pricing table flagged in ADR for Phase 6 consolidation — Phase 8 should consolidate via a pricing IPC query).

- [ ] **Persistent CostPreview survival across compose cycles** — TelemetryStrip currently only shows live estimate as user types. After a successful gearing + Send, the strip clears and the user can no longer see "last gearing cost was $X." Phase 5B nit deferred.
  - File: `src/renderer/src/components/composer/Composer.tsx`. Add a `lastCostPreview` state that survives clearing `gearState`.

- [ ] **CLAUDE.md / docs reference to `~/.tokenless/logs/`** but DB lives at `app.getPath('userData')/tokenless.db` (= `%APPDATA%/tokenless/` on Windows). Logs are under `~/.tokenless/logs/` (= `%USERPROFILE%/.tokenless/`). Two different roots is confusing — Phase 8 should normalize both under `app.getPath('userData')`.
  - Files: `src/main/index.ts` (the FileSink path). Move logs to `app.getPath('userData')/logs/`.

- [ ] **AuthMissingModal + ClaudeNotFoundModal lack focus management** — no autoFocus on the Dismiss button, no focus trap. Both flagged in their respective phase reviews.
  - Files: `src/renderer/src/components/notifications/AuthMissingModal.tsx`, `ClaudeNotFoundModal.tsx`.

- [ ] **`AnthropicClientRegistry` cache grows unboundedly across key rotations** — Phase 6A review flagged. `invalidate(accountId)` exists but is never called. Phase 6B should wire it on account-update (when that lands). If Phase 8 ships before 6B, add a TTL or LRU.
  - File: `src/main/api/client-registry.ts`.

- [ ] **`upsertDraft` does two DB round-trips** (INSERT...ON CONFLICT then SELECT). SQLite's `RETURNING` clause can collapse to one. Micro-optimization, low-priority.
  - File: `src/main/db/dao/drafts.ts`.

- [ ] **`initialLoadDone` Map in useDraftAutosave grows unboundedly** — boolean values, negligible memory in practice but flagged in Phase 7A review.
  - File: `src/renderer/src/hooks/use-draft-autosave.ts`.

- [ ] **`MOCK_MODELS` dropdown in `mocks/dropdown-options.ts`** is still a mock. Phase 6B (or 8) should replace with a real source — either query pricing.ts via IPC, or hardcode in a shared registry, but stop calling it a "mock".

- [ ] **Stale-prompt closure in "Send original" toast action** — toast captures `prompt` at toast-creation time; if the user types more before clicking, the older prompt is sent. Phase 5B review flagged. Phase 8 should use a callback ref pattern.
  - File: `src/renderer/src/components/composer/Composer.tsx` `runGear` failure branch.

---

## Test gaps

- [ ] **`accounts-handler` integration test lacks `update`/`delete` coverage** — those methods don't exist yet (Phase 6B). When 6B lands, add tests.

- [ ] **`use-accounts` doesn't have an `update` or `remove` test** — same as above; awaits Phase 6B.

- [ ] **`use-cc-subscription` not stress-tested** — Phase 4A review flagged. Phase 8 can add: rapid conversation switching + concurrent chunk arrival should not cause listener leaks.

- [ ] **No automated E2E for telemetry meter** — the plan's file structure listed `telemetry-meter.e2e.test.ts` but it wasn't created. Phase 5B Task 10 covered the manual scenario instead. Add an automated E2E for context-budget meter update on `telemetry:tick` arrival.

- [ ] **`AnthropicClient.complete` retry-loop integration test exists** but doesn't cover timeout path or post-exhaustion log emission verification. Phase 8 hardening.

---

## Spec §7 failure-mode rows still deferred to Phase 4D

- [ ] **§7.1 row 4** `--resume fails`: needs output-pattern detection + "Branch from last turn" recovery (depends on Phase 7B branching backend).
- [ ] **§7.1 row 5** Quota hit: needs output-pattern detection + modal pointing to AccountSwitcher / "Switch to API" toggle.
- [ ] **§7.1 row 6** Auth expired: needs output-pattern detection + `claude login` in temp PTY pane.
- [ ] **§7.2 row 6** Summary refresh: already silent-log per spec; no further action needed unless we want a Dev Mode "last refresh status" indicator.

---

## Documentation tidies

- [ ] **ADR-018 (per-account API key)** mentions "OS keychain" as the storage. ADR-034 supersedes part of this with "plaintext for v1, keychain in Phase 8 polish." Verify ADR-018 has a forward-reference note pointing to ADR-034.

- [ ] **`scripts/record-fixtures.ts`** uses Phase 5A's pricing.ts apiModel. If model IDs evolve, the script auto-uses the new ones. Add a comment noting this.

- [ ] **CLAUDE.md "Stack" section** lists `xterm.js 5 · @anthropic-ai/sdk · chokidar · zod` — chokidar is unused until Phase 6B (skills). Either move chokidar to a "Phase 6B" note or remove until then.

- [ ] **`docs/observability.md` Phase 6A row** lists `account-switch`, `new-conversation-blocked` added during the final-review patch. The ui row got increasingly long — Phase 8 should restructure observability.md by sub-table per category for readability.

---

## Release prep (Phase 8 proper)

- [ ] electron-builder Windows installer config: NSIS or MSIX, code signing (cert TBD)
- [ ] GitHub Actions release workflow: tag-triggered build + artifact upload
- [ ] App icon (Win .ico in multiple sizes)
- [ ] About dialog with version + ADR-002 attribution
- [ ] DB backup-on-migration safety net (spec §7.3 row 2 already in scope)
- [ ] Auto-update channel (deferred — manual download from Releases for v1)
- [ ] Crash reporter (deferred — Logger already captures everything to file)
- [ ] First-run privacy notice: "TokenLess sends prompts to Anthropic. Your API key is stored locally. See ADR-034."

---

## Date stamp

Backlog created: 2026-05-15. Items added across this date and prior live-demo / final-review sessions.
