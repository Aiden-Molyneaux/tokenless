# Observability Category Guide

The full Logger service lives at `src/main/observability/logger.ts` (added in Phase 1). This document defines what each category means and when to use it. Adding a new category requires both an entry here and an enum addition in `src/main/observability/categories.ts`.

## Categories

| Category | Use for |
|---|---|
| `cc` | Claude Code subprocess lifecycle, output stream parsing, session ID capture, resume mechanics |
| `pty` | node-pty layer specifically — PTY spawn, write, resize, exit. Lower-level than `cc`. |
| `api` | Anthropic SDK calls — request, response, retry, error handling, malformed JSON |
| `db` | SQLite operations — queries, migrations, lock contention, constraint violations |
| `ipc` | IPC channel handlers — boundary between main and renderer |
| `ui` | Renderer-originated events — React errors, component lifecycle issues |
| `skill` | Skill discovery and watching — `~/.claude/skills/`, plugin dirs, project-local |
| `auth` | Account authentication, `claude login` wrapping, account switching |
| `gearing` | Gearing engine specifically — prompt building, response parsing |
| `fs` | Filesystem operations not covered by `skill` — CLAUDE.md reading, log file rotation |
| `observability` | Self-referential — Logger startup, file sink errors, ring buffer overflow |

## Severities

- `debug` — verbose flow tracing. Only written when Developer Mode is on.
- `info` — significant lifecycle events: session spawned, gear completed, account switched.
- `warn` — recoverable issues: retry succeeded, fallback engaged.
- `error` — operation failed; user impact possible; needs visibility.
- `fatal` — process can't continue cleanly; heading for crash or forced shutdown.

## When to add a new category

Don't unless the new category meaningfully overlaps with no existing one. Categories are a fixed enum so the Dev Mode UI's filters stay clean. If a new dependency throws in a way that doesn't fit, ask: does this map to `fs`, `api`, `db`, etc.? Only add a new category as a last resort.

Adding one requires:

1. Append to the enum in `src/main/observability/categories.ts`.
2. Add a row to the table in this file.
3. Update any switch statements that depend on the enum's exhaustiveness.
