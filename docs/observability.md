# Observability Category Guide

The full Logger service lives at `src/main/observability/logger.ts` (added in Phase 1). This document defines what each category means and when to use it. Adding a new category requires both an entry here and an enum addition in `src/main/observability/categories.ts`.

## Categories

| Category | Use for |
|---|---|
| `cc` | Claude Code subprocess lifecycle, output stream parsing, session ID capture, resume mechanics. Phase 4A events: `cc-start`, `cc-send`, `cc-resize`, `cc-exit`. Phase 4B events: `cc-stop`, `cc-resume`. Phase 4C events: `cc-crashed`, `cc-hung`. **Parsed events (broadcast as `cc:event` IPC, not Logger entries):** `prompt-ready`, `tool-call`, `response-complete`, `tokens-used`. |
| `pty` | node-pty layer specifically — PTY spawn, write, resize, exit. Lower-level than `cc`. Phase 4C added hang detection at the `cc` level (`cc-hung`) rather than the `pty` level. Phase 4D will add output-pattern-detected events like `pty-quota`, `pty-auth-expired`. |
| `api` | Anthropic SDK calls — request, response, retry, error handling, malformed JSON. Phase 5B events: `api-retry-attempt` (warn, on each retry with attempt counter and backoff), `api-retry-exhausted` (error, when retries are exhausted). |
| `db` | SQLite operations — queries, migrations, lock contention, constraint violations. Phase 3 events: `db-online`, `db-init-failed`, `projects-list`, `projects-create`, `projects-update`, `projects-delete`, `conversations-list-by-project`, `conversations-create`, `conversations-update`, `conversations-delete`, `accounts-list`, `accounts-create`, `userData-override`. |
| `ipc` | IPC channel handlers — boundary between main and renderer |
| `ui` | Renderer-originated events — React errors, component lifecycle issues. Phase 4B events: `terminal-stop-ok`, `terminal-stop-failed`, `terminal-stop-no-conv`, `cc-resume-failed`. Phase 4C events: `cc-crash-toast`, `orphan-conversation-cleanup-failed`. Phase 5A events: `gear-clicked`, `gear-failed`. (`gear-no-conversation` was reserved but dropped — gearing no longer requires an active conversation.) |
| `telemetry` | Telemetry tick broadcasts (not Logger entries — IPC payloads consumed by useTelemetry). Phase 4C: `telemetry:tick` — periodic broadcast carrying conversation context budget (`contextUsed`, `contextTotal`, `contextPercent`). |
| `skill` | Skill discovery and watching — `~/.claude/skills/`, plugin dirs, project-local |
| `auth` | Account authentication, `claude login` wrapping, account switching |
| `gearing` | Gearing engine specifically — prompt building, response parsing. Phase 5A events: `gearing-gear` (warn-level on failures, info-level on success), `gearing-gear-ok`. Phase 5B events: `summary-refresh-ok` (info, after background Haiku summary refresh succeeds), `summary-refresh-failed` (warn, when background refresh fails — silent failure, stale summary is acceptable). |
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

---

## Usage

### Main-process logging

Every main-process module receives a `Logger` instance (Phase 1B: the singleton in `src/main/index.ts`; later phases pass it via constructor injection).

```typescript
import { logger } from '../observability'  // import from your module's perspective

logger.info('observability', 'startup', 'Module initialized', { config })
logger.warn('api', 'retry', '429 — retrying', { attempt: 2 })
logger.error('db', 'constraint-violation', 'UNIQUE conflict on projects.name', { name }, error.stack)
```

### Renderer-process logging

Renderer code uses `rendererLogger` which ships records to main over IPC:

```typescript
import { rendererLogger } from '@renderer/observability/logger-bridge'

rendererLogger.info('ui', 'mount', 'Component mounted')
rendererLogger.error('ui', 'click-handler-failed', err.message, { buttonId: id }, err.stack)
```

### Error boundaries

Wrap risky operations in `errorBoundary` (sync) or `asyncErrorBoundary` (async). Both catch throws, log, and return `undefined`:

```typescript
import { errorBoundary, asyncErrorBoundary } from '../observability'

const content = errorBoundary(logger, 'fs', 'read-file', () => fs.readFileSync(path, 'utf8'))
if (content === undefined) return // logged; caller decides what to do

const response = await asyncErrorBoundary(logger, 'api', 'fetch', () => anthropicClient.complete(...))
```

The React `<AppErrorBoundary>` at the App root catches any uncaught render error and logs to `ui/react-error-boundary`.

### Inspecting logs

- **Dev Mode panel:** click "Show Dev Mode" in the app. Live sortable JSON table with filters.
- **Log files:** `~/.tokenless/logs/tokenless-YYYY-MM-DD.jsonl`. Parseable with `jq`:
  ```bash
  jq 'select(.severity == "error")' ~/.tokenless/logs/tokenless-*.jsonl
  ```
- **Programmatic (main):** `logger.getRecent(n)` returns the last N records from the ring buffer.
- **Programmatic (renderer):** `await window.tokenless.log.getRecent(n)` returns the same via IPC.
