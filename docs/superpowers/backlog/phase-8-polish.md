# Phase 8 Polish Backlog — Post-v1.0 cleanup

**Status update (2026-05-15):** Phase 8A (`v0.20.0-phase-8a`) and Phase 8B (`v1.0.0-phase-8b`) shipped. This file now tracks **only items NOT addressed in v1.0** — i.e., genuine v1.1+ candidates and known-but-deferred trade-offs.

For the canonical v1.1+ deferred list, see CLAUDE.md's **Deferred to v1.1+** section. The items below add nuance and file/line specifics that don't fit in CLAUDE.md.

---

## Resolved by v1.0

The items listed in earlier revisions of this file (project/account dropdown z-index, rootPath validation, Settings stub, Onboarding wizard, GearReviewPane Send no-op, stale Anthropic model IDs, persistent CostPreview, logs path, modal focus management, AnthropicClientRegistry cache invalidation, MOCK_MODELS, stale-prompt closure, accounts-handler update/delete tests, use-accounts update/remove tests, chokidar stale doc reference, NSIS installer config, app icon, About dialog, DB backup-on-migration, first-run privacy notice, crash reporter, electron-builder Windows config) all landed across Phases 6A through 8B. See the **Phase / tag index** in CLAUDE.md for which tag delivered each.

---

## Still open — v1.1+ candidates

### Test gaps

- [ ] **`use-cc-subscription` not stress-tested.** Phase 4A review flagged. Add: rapid conversation switching + concurrent chunk arrival should not cause listener leaks. Currently relies on the existing useEffect cleanup pattern.
- [ ] **No automated E2E for telemetry meter.** The Phase 5B plan listed `telemetry-meter.e2e.test.ts` but only the manual scenario landed. Add an automated E2E for context-budget meter update on `telemetry:tick` arrival.
- [ ] **`AnthropicClient.complete` retry-loop integration test exists** but doesn't cover the timeout path or post-exhaustion log emission verification.

### Spec §7 failure-mode rows still deferred

These require output-pattern matching on claude's stderr stream. Generic crash/auth toasts cover the obvious cases in v1.

- [ ] **§7.1 row 4** `--resume fails`: pattern detection + "Branch from last turn" recovery.
- [ ] **§7.1 row 5** Quota hit: pattern detection + modal pointing to AccountSwitcher / "Switch to API" toggle.
- [ ] **§7.1 row 6** Auth expired: pattern detection + `claude login` in a temp PTY pane.
- [ ] **§7.2 row 6** Summary refresh: already silent-log per spec. No further action needed unless we want a Dev Mode "last refresh status" indicator.

### Documentation tidies

- [ ] **ADR-018 (per-account API key)** mentions "OS keychain" as the storage. ADR-034 supersedes part of this with "plaintext for v1, keychain in Phase 8 polish." Verify ADR-018 has a forward-reference note pointing to ADR-034.
- [ ] **`scripts/record-fixtures.ts`** uses Phase 5A's pricing.ts apiModel. If model IDs evolve, the script auto-uses the new ones. Add a comment noting this.
- [ ] **`docs/observability.md`** row-per-category got increasingly dense. Consider restructuring by sub-table per category for readability.

### Micro-optimizations

These are low-priority — flagged but not blocking.

- [ ] **`upsertDraft` does two DB round-trips** (INSERT...ON CONFLICT then SELECT). SQLite's `RETURNING` clause can collapse to one.
- [ ] **`initialLoadDone` Map in useDraftAutosave grows unboundedly.** Boolean values; negligible memory in practice.
- [ ] **AI error analysis rate limit.** §6.5 has no per-minute cap on Haiku calls — a user spam-clicking "Analyze with AI" would burn tokens. Add a debounce or per-minute cap.

### Bigger items — major v1.1+ work

- **NSIS / MSIX installer + code signing + auto-update channel.** v1.0 ships unpacked. Documented in CLAUDE.md.
- **macOS / Linux builds.** ADR-002 picked Windows-first. Cross-platform Electron is straightforward to add.
- **Theme switching** (light/dark). Tokens exist; only light values populated.
- **Layout toggle** (notebook ↔ IDE side-by-side). Post-v1 backlog per spec.
- **Per-turn picker for branching.** Phase 7C branches from the latest turn only because the renderer has no turn-level interaction surface yet. Needs a transcript/replay view first.

---

## Date stamps

- Backlog created: 2026-05-15 (during live-demo + final-review sessions across phases 6-7).
- Major prune: 2026-05-15 (after v1.0 ship — resolved items moved to a summary line; remaining items are genuinely v1.1+).
