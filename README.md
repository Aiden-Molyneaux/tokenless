# TokenLess

A Windows-first Electron desktop app that sits between you and Claude. Rewrites prompts via Haiku ("gearing") to reduce token waste, and hosts Claude Code in an embedded terminal.

See `docs/superpowers/specs/2026-05-13-tokenless-v1-design.md` for the full design spec.

## Running locally (development)

```
npm install
npm run dev
```

Hot reload + iteration loop. Native modules are built for the local Node ABI by `npm install`. `npm run dev` starts both Vite and Electron with full HMR.

## Running locally (stable build)

For day-to-day use without `npm run dev`:

```
npm run rebuild:electron
npm run build:unpack
```

The built app lives at `dist/win-unpacked/TokenLess.exe`. Create a desktop shortcut to that path. Rebuild with `npm run build:unpack` whenever you want a new "stable" snapshot.

This avoids the heavy installer + signing + auto-update infrastructure for the v1 phase; distribution to others happens via GitHub Releases (zipped unpacked dir uploaded by the release workflow on tag push).

## App icon

The `.ico` is build-time-generated and gitignored. Convert `resources/icon.svg` to `resources/icon.ico` once (see `resources/icon-design.md` for tool options):

```
magick convert resources/icon.svg -define icon:auto-resize=16,32,48,64,128,256 resources/icon.ico
```

If `resources/icon.ico` is absent, electron-builder falls back to the default Electron icon during `build:unpack` (a logged warning, not an error).

## Tests

```
npm run typecheck     # strict TS for main + preload + renderer
npm run test:run      # vitest unit + integration
npm run test:e2e      # Playwright + Electron e2e
```

## Releases

Tag pushes matching `v*` trigger `.github/workflows/release.yml`, which runs all CI gates (typecheck → tests → e2e → build → build:unpack) and uploads the zipped unpacked app as a GitHub Release asset.

```
git tag -s -a v1.0.0 -m "TokenLess v1.0"
git push origin v1.0.0
# Workflow runs; new Release appears at github.com/.../releases
```

The auto-generated release notes come from commit messages since the previous tag.

## Documentation

- `docs/superpowers/specs/` — design specs (one per major version)
- `docs/superpowers/plans/` — per-phase implementation plans
- `docs/decisions.md` — ADRs (architectural decision records)
- `docs/observability.md` — Logger categories + per-phase event lists
- `docs/test-scenarios.md` — manual verification scenarios (S-<phase>.<n>)

## Project layout

```
src/main/         Electron main process (DB, PTY, SDK calls, Logger)
src/preload/      Preload bridge (narrow typed surface to renderer)
src/renderer/src/ React UI (composer, terminal, sidebar, dev-mode, settings, onboarding)
src/shared/       Types + IPC channels shared across processes
test/e2e/         Playwright + Electron E2E tests
test/doubles/     Shared test fixtures (mock-pty, mock-anthropic-client, etc.)
resources/        Build resources (icon source)
```

## License

Private — personal use. Not currently licensed for redistribution.
