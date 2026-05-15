# CLAUDE.md — TokenLess

This file is the contract every Claude Code session in this repo respects.

## What TokenLess is

TokenLess is a Windows-first Electron desktop application that sits between the user and Claude. It rewrites prompts via Haiku (the "gearing" engine) to reduce token waste — primarily on the output side via response-shaping language — and hosts Claude Code in-app via a PTY-backed embedded terminal. See `docs/superpowers/specs/` for the full design spec.

## Current status

**TokenLess v1.0 shipped at tag `v1.0.0-phase-8b`.** All 9 phase clusters (Phase 0 → Phase 8B) are complete. The app has: full gearing flow, embedded PTY terminal, multi-account auth, project + conversation CRUD, drafts, turn capture + feedback, branching, templates, telemetry summary, skills discovery, Settings page, Onboarding wizard, AI error analysis, crash reporter, build:unpack flow, tag-triggered release workflow. 371 unit/integration tests + 18 e2e green. See the **Phase / tag index** at the bottom of this file for what shipped where.

New work continues on `main` as v1.1+. The `## Deferred to v1.1+` section at the bottom of this file lists scope explicitly punted from v1.

## Stack

Electron 32 · electron-vite 2 · React 18 · TypeScript 5 strict · Vite 5 · Vitest 2 · Playwright 1.45 · xterm.js 5 · better-sqlite3 11 · node-pty 1.1 · @anthropic-ai/sdk 0.30 · chokidar 3 · zod 3. All native modules (better-sqlite3, node-pty) are wired and tested across both Node and Electron ABIs.

## Directory layout

```
src/main/         Electron main process — owns DB, PTY subprocesses, Anthropic SDK, Logger
src/preload/      Preload scripts — narrow typed surface to renderer via contextBridge
src/renderer/src/ React UI — composer, terminal pane, sidebar, Dev Mode panel
src/shared/       Types shared between main, preload, and renderer (notably ipc.ts)
test/e2e/         Playwright + Electron end-to-end tests
docs/             specs/, plans/, decisions.md, observability.md, test-scenarios.md
spikes/           Throwaway integration probes (added Phase 1)
```

## Commands

- `npm run dev` — start the app in development with HMR
- `npm run build` — produce a built app in `out/`
- `npm run test:run` — run all unit + integration tests once
- `npm test` — run unit + integration tests in watch mode
- `npm run test:e2e` — run Playwright E2E tests against the built app
- `npm run typecheck` — strict type-check both main+preload and renderer

## Error handling protocol (cornerstone — DO NOT VIOLATE)

Every new code path that can fail must:

1. Catch the failure as close to the source as possible.
2. Route it through `logger.{severity}(category, event, message, context)` using a meaningful pre-existing category.
3. Provide a user-facing recovery path where applicable (retry, fallback, "open Settings to fix").
4. Add a test verifying the error path emits to the logger correctly.

Adding a new category requires:

- An entry in `src/main/observability/categories.ts` (this file lands in Phase 1).
- A row in `docs/observability.md` documenting when to use it.

Developer Mode is a cornerstone of the project. Do not introduce:

- Silent failures (catch-and-swallow without logging)
- Stray `console.log`, `console.error`, `console.warn` outside the Logger
- Category-less try/catches
- Errors without context — every `logger.error` call must include enough info to reproduce the issue from the log alone (relevant IDs, current state, recent IPC payload, retry counters)

## Testing protocol (cornerstone — DO NOT VIOLATE)

Every new feature must include:

1. **Unit tests** for any pure logic introduced (parsers, builders, estimators, summary logic)
2. **Integration tests** for any new IPC channel, DB query, or module boundary
3. **A scenario entry** in `docs/test-scenarios.md` describing how a human verifies the feature manually
4. **E2E coverage** for any flow that touches the seven critical paths listed in the design spec § 8.6

Tests organize by feature, not by file. Each suite has a top-level `describe` with a one-sentence purpose comment.

Mocks live in `test/doubles/`. Do not create one-off mocks in individual test files when a shared double already covers the boundary.

Recorded Anthropic SDK fixtures live in `test/fixtures/api/` and are committed to git. Regenerate with `npm run fixtures:record` when the gearing system prompt changes — explain the diff in your PR.

CI gates:

- Unit + integration tests must pass on every push.
- E2E must pass on PR and main.
- Don't disable failing tests to land a feature. Either fix the test (if the test is wrong) or fix the feature (if the test is right).

## Code style

- TypeScript strict mode. No `any` without a justifying comment.
- ESM modules throughout (`type: module` in package.json). Use `node:` prefix for built-in imports.
- React function components, no class components.
- Hooks named `useThing()`. Components named `Thing` (PascalCase).
- File names: components `PascalCase.tsx`, everything else `kebab-case.ts`.
- Single responsibility per file. Files over ~300 lines are a signal to split.

## Decision log

When you make a non-trivial design choice (architectural, library, pattern), add an ADR entry to `docs/decisions.md`. Format: date, options considered, choice, reasoning.

## Phase reference

The build is structured in phases. Per-phase plans live in `docs/superpowers/plans/`. Read the plan for the phase you're working in. Do not skip ahead — the phase ordering exists to land integration risk early. Each phase has a signed git tag (see **Phase / tag index** below) marking its exit state.

## Workflow pattern

Every phase shipped via the same pattern. New sessions should follow it.

**Order:**
1. **Brainstorm scope.** Invoke `superpowers:brainstorming` for any non-trivial feature. Ask clarifying questions, propose 2-3 approaches, get approval. Spec lives in `docs/superpowers/specs/` (the v1 design spec is at `2026-05-13-tokenless-v1-design.md`; new feature specs go there too).
2. **Write the plan.** Invoke `superpowers:writing-plans` to produce `docs/superpowers/plans/YYYY-MM-DD-phase-<N><letter>-<topic>.md`. Plan has: Goal, Architecture, Out of Scope, File Structure, numbered Tasks (each with Files/test code/impl code/verify/commit), Self-Review, Exit State. Commit the plan to `main` before executing.
3. **Execute.** Invoke `superpowers:subagent-driven-development`. Dispatch one implementer subagent per task (or batch related tasks). Each subagent runs typecheck + tests; the parent commits per task. Use haiku for mechanical scaffolding, sonnet for non-trivial integration / state / multi-file refactors. Re-review with a separate subagent when scope is risky.
4. **Per-phase artifacts (always):**
   - One **ADR** in `docs/decisions.md` documenting non-obvious choices.
   - **Observability** events row update in `docs/observability.md`.
   - **Manual scenarios** appended to `docs/test-scenarios.md` (S-<phase>.<n>).
   - **Verification gate**: typecheck → test:run → build → test:e2e (the last is deferred to CI on dev machines without VS Build Tools).
   - **Signed tag**: `git tag -s -a v<X.Y.0>-phase-<N><letter> -m "..."`.
5. **Push + watch CI.** Two workflows: `ci.yml` (every push) and `release.yml` (on `v*` tag push, builds the unpacked zip + uploads as Release asset).
6. **Fixups + tag moves.** If CI catches a regression, fix on `main`, then ask the user whether to move the tag (force-push) or leave it. The user has consistently chosen "move the tag" since the tag points at a broken state otherwise.

**Skills:** the four `superpowers:*` skills above are mandatory at the right entry points. `superpowers:finishing-a-development-branch` was used early but the pattern here is "commit straight to main + tag" — branches aren't part of the workflow.

**Commit hygiene:**
- One logical change per commit. Plan task = ~1 commit; review fixup = 1 commit.
- Commit messages: `feat(phase-<N><letter>): <subject>` / `fix(phase-<N><letter>): <subject>` / `docs(phase-<N><letter>): <subject>` / `test(phase-<N><letter>): <subject>`.
- The signed tag at phase end is the milestone marker; intra-phase commits don't need to be release-ready (they need to typecheck + pass tests though).

## Common gotchas

Real footguns hit during the v1 build. Avoid re-discovering them.

**Native module ABI.** `npm install` + `npm run rebuild:node` build better-sqlite3 + node-pty for the host **Node** ABI (what vitest runs against). `npm run rebuild:electron` builds for the **Electron** ABI (what `npm run dev`, `npm run build:unpack`, and `test:e2e` need). The two are incompatible — switching contexts requires running the other rebuild script. CI does it automatically (Node for `test:run`, Electron for `test:e2e` + `build:unpack`). On a dev box without Visual Studio Build Tools, `rebuild:electron` may fail compiling from source — workaround: `cd node_modules/better-sqlite3 && npx prebuild-install --runtime=electron --target=<version>`.

**electron lives in `devDependencies`.** Not `dependencies`. electron-builder rejects it otherwise. Electron is bundled into the build output by electron-vite, so it's strictly a build-time dep.

**Version strings:** read `package.json` dynamically. The smoke E2E previously hardcoded `'0.0.1'` and broke when we bumped to `1.0.0`. Phase 8B's Vite `define` bakes `__APP_VERSION__` from package.json into the preload at build time; tests read package.json at test time.

**E2E env vars:** all E2E test files set `TOKENLESS_SKIP_ONBOARDING: '1'` because the Onboarding wizard's full-screen overlay would otherwise intercept all clicks. Main process honors this by pre-seeding `onboarding.complete=1` AND `privacy.acknowledged=1` in the settings table. Real users never set this env var. New E2E tests must include it.

**Action button count assertion.** `test/e2e/composer.e2e.test.ts` has a tight count: `expect(page.locator('.actions-row__button')).toHaveCount(6)`. Adding a new ActionsRow button = bump the count + add a comment line. Intentional — catches accidental button additions/removals.

**Per-keystroke turns.** `cc:send` writes a turn-table row (full prompt). `cc:input` writes raw bytes to the PTY WITHOUT a turn row (single keystroke / paste). xterm.onData uses `cc:input`. Don't accidentally route per-keystroke writes through `cc:send` — it'll bloat the turns table + corrupt telemetry savings math.

**Built-in templates are protected.** TemplatesHandler returns `BUILTIN_PROTECTED` business code on update/delete attempts targeting `builtin=1` rows. The UI doesn't currently render edit/delete affordances on built-ins; if a future phase adds them, the handler will still reject.

**Onboarding + privacy notice are paired.** Both gate on `settings` keys (`onboarding.complete` + `privacy.acknowledged`). The privacy notice shows first; onboarding shows after. The E2E opt-out skips both.

**Tag moves require force-push and user approval.** When CI catches a regression after a tag push, the auto-classifier blocks `git push --force` on tags. Recreate the tag locally pointing at the fix commit; the user runs the force-push.

**Don't add new categories silently.** Logger categories are enum'd in `src/main/observability/categories.ts` AND documented in `docs/observability.md`. Adding a category requires both edits (CLAUDE.md cornerstone).

## Deferred to v1.1+

Documented here so new sessions don't accidentally try to implement deferred work:

- **NSIS / MSIX installer.** `build:win` script exists but unused in v1 (v1.0 ships unpacked via `build:unpack`).
- **Code signing.** Cert TBD. Users get a SmartScreen warning on first launch of v1.0 — documented in README.
- **Auto-update channel** (`electron-updater`). Manual download from Releases is the v1 path.
- **§7 output-pattern detection** (resume-fails / quota-hit / auth-expired). Spec §7.1 rows 4-6 need claude stderr pattern matching to surface specific failure flows. Generic crash/auth toasts cover the obvious cases in v1.
- **macOS / Linux builds.** ADR-002: Windows-first. Cross-platform Electron is straightforward to add later.
- **Theme switching** (light/dark). Theme tokens exist but only light values are populated.
- **Layout toggle** (notebook ↔ IDE side-by-side). Post-v1 backlog item per spec.
- **Per-turn picker for branching.** Phase 7C branches from the LATEST turn only — the renderer has no turn-level interaction surface yet. Requires building a transcript/replay view first.
- **AI error analysis rate limit.** §6.5 ships in Phase 8A without a per-minute cap on Haiku calls. Phase 8 polish can add one.

## Phase / tag index

One line per tag. Use to locate where a feature shipped.

| Tag | Phase | Highlights |
|---|---|---|
| `v0.1.0-phase-0` | Scaffold | Electron-vite + React + TS + Vitest + Playwright skeleton |
| `v0.2.0-phase-1a` | Logger | Logger service + ring buffer + FileSink (JSONL) |
| `v0.3.0-phase-1b` | Dev Mode UI | Sortable LogTable + Filters + LogDetail |
| `v0.4.0-phase-2a` | UI scaffold | TopBar + Sidebar + MainPane + Composer skeleton + AccountSwitcher + ProjectSwitcher |
| `v0.5.0-phase-2b` | UI mockups | Composer + GearReviewPane + TerminalSection (mock data); InfoTooltip; Dropdown extraction |
| `v0.6.0-phase-3` | DB + IPC | SQLite (better-sqlite3) + migrations + DAOs (accounts/projects/conversations) + IPC handlers |
| `v0.7.0-phase-4a` | PTY | node-pty + CcLifecycle + spawner + parser; xterm.js wired |
| `v0.8.0-phase-4b` | PTY UX | Resume, Stop, conversation persistence; CLAUDE_NOT_FOUND modal |
| `v0.9.0-phase-4c` | PTY safety | Watchdog (hung detect) + crash toast + cc:event broadcast |
| `v0.10.0-phase-5a` | Gearing | Anthropic SDK + gearing engine (Haiku) + GearReviewPane real data |
| `v0.11.0-phase-5b` | Gearing polish | Rolling summary refresher (per-conversation, debounced) + api-retry events |
| `v0.12.0-phase-7a` | Drafts | drafts table + auto-save (debounced 750ms) + restore on conversation switch |
| `v0.13.0-phase-6a` | Multi-account | AnthropicClientRegistry per-account; CreateAccountModal; AuthMissingModal |
| `v0.14.0-phase-6b` | CRUD parity | Account + project edit/delete (with registry invalidation); last-active persistence; rootPath validation; dropdown z-index fix |
| `v0.15.0-phase-6c` | Skills | Skills scanner (chokidar-watched) + reconciler + dropdown wiring; ConfirmModal upgrade |
| `v0.16.0-phase-7b` | Turn capture | TurnsDao + ResponseAccumulator + assistant-turn write on response-complete; feedback buttons |
| `v0.17.0-phase-6d` | Telemetry summary | TopBar pill + popover with per-period / per-model spend + savings |
| `v0.18.0-phase-7d` | Templates | 8 built-in templates + TemplatePickerPopover in ActionsRow |
| `v0.19.0-phase-7c` | Branching | "Branch from latest turn" + sidebar indicator + inherited summary |
| `v0.20.0-phase-8a` | Polish | Settings page + Onboarding wizard + terminal copy/pass-through + pricing IPC + AI error analysis + outside-click + Dev Mode backfill |
| `v1.0.0-phase-8b` | Release prep | electron-builder config + SVG icon + DB backup + privacy notice + About dialog + crash reporter + GitHub Actions release workflow |

The corresponding plans live in `docs/superpowers/plans/`. ADRs in `docs/decisions.md` go from ADR-001 to ADR-042.
