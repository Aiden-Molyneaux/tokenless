# CLAUDE.md — TokenLess

This file is the contract every Claude Code session in this repo respects.

## What TokenLess is

TokenLess is a Windows-first Electron desktop application that sits between the user and Claude. It rewrites prompts via Haiku (the "gearing" engine) to reduce token waste — primarily on the output side via response-shaping language — and hosts Claude Code in-app via a PTY-backed embedded terminal. See `docs/superpowers/specs/` for the full design spec.

## Stack

Electron 32 · electron-vite 2 · React 18 · TypeScript 5 · Vite 5 · Vitest 2 · Playwright 1.45 · xterm.js 5 · @anthropic-ai/sdk · chokidar · zod. Native modules (better-sqlite3 for SQLite, node-pty for PTY) are added in the phases that first need them.

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

The build is structured in phases. Current phase plans live in `docs/superpowers/plans/`. Read the plan for the phase you're working in. Do not skip ahead — the phase ordering exists to land integration risk early.
