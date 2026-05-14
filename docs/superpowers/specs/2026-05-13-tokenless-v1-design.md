# TokenLess v1 — Design Spec

**Date:** 2026-05-13
**Status:** Approved through design review (pending final spec review before implementation plan)
**Author:** Aiden Molyneaux (aiden.molyneaux@versaterm.com)
**Reviewers:** —

---

## Executive summary

TokenLess is an Electron desktop application that sits between the user and Claude. It optimizes (or "gears") prompts before they reach Claude, primarily by adding response-shaping language that reduces output token waste, secondarily by tightening overly long input prompts. It hosts Claude Code directly in-app via an embedded PTY-backed terminal — the user types in a composer above, TokenLess pipes the optimized prompt into a `claude` subprocess below, and Claude's streamed response renders in real time.

v1 ships with: in-app Claude Code, the gearing engine (Haiku via the Anthropic API), multi-account support, projects with per-project context, persistent and resumable conversations, smart context- and outcome-aware tooltips, a Developer Mode with structured logging and AI-powered error analysis, prompt templates, response-feedback tagging, branch-from-turn recovery, draft auto-save, and commit/push canned prompts.

v1 deliberately defers: a Claude.ai-style General Chat tab (v1.1, via headless `claude -p`), session replay (v1.2), the savings dashboard (v1.3), layout toggle (v1.4), pre-warmed CC pool for gearing (v1.5), and import/export project configs (v1.6).

---

## Goals

1. **Cut token waste, primarily on the output side.** Every prompt is optionally rewritten by Haiku with response-shaping constraints ("respond in ≤200 words, no preamble") that reduce Claude's verbosity without sacrificing quality.
2. **Stay subscription-covered for the bulk of usage.** User-facing model calls go through the embedded `claude` subprocess and ride the user's Pro/Max plan. Only Haiku gearing/critique/summary/analysis calls hit the Anthropic API directly.
3. **Make prompt iteration feel like writing in a notebook.** Single-column composer feel, generous whitespace, cream-white background with warm orange and soft blue accents, serif headings.
4. **Make failure observable.** Every error routes through a unified Logger; Developer Mode exposes a sortable JSON log table with optional Haiku-powered analysis.
5. **Be trustworthy.** Drafts never lost. Past conversations never lost. Conversations resumable. Bad turns recoverable via branch-from-turn.

## Non-goals (for v1)

- Multi-model support (OpenAI, Groq, local). TokenLess is Claude-specific.
- General Chat tab (v1.1).
- Session replay UI (v1.2).
- Savings dashboard with visualizations (v1.3).
- Sharing/exporting project configs across machines or with teammates (v1.6).
- Mac/Linux builds — Windows-only for v1. Cross-platform follows when justified.
- RAG / embedding index of project files. CLAUDE.md + per-project always-include lists carry context for v1.

---

## Decisions captured during brainstorm

| Decision | Choice |
|---|---|
| Stack | Electron + React + TypeScript + xterm.js + node-pty + better-sqlite3 + Anthropic SDK |
| Build host platform | Windows-first (Mac/Linux later) |
| Main window layout | Notebook vertical — composer top, terminal bottom, conversation sidebar left |
| Gearing review flow | Inline 2-pane expand — composer becomes original-vs-geared side-by-side |
| Conversation lifecycle | Persistent and resumable via `claude --resume <session-id>` |
| Gearing engine architecture | Single universal Haiku system prompt, parameterized by user configs |
| Critique timing | Bundled into every Gear call |
| Token-cost focus | Output-side (response shaping) > input-side (prompt shrinking) |
| Multi-account | First-class in v1; account switcher in top bar; `CLAUDE_CONFIG_DIR` per account |
| Commit/Push buttons | Pre-fill the composer with the project's canned prompt; Claude does the git work |
| Send confirmation | On by default; toggle to disable in Settings |
| Tooltips | Context-aware + outcome-aware combined; deep-link side panels for dense settings; no AI-generated-on-demand |
| Conversation "backup" | "Branch from this turn" — new conversation seeded with a Haiku-summarized primer; not true point-in-time CC state restoration |
| Draft auto-save | Debounced 750ms; per-conversation row in `drafts` table; cleared on Send |
| Summary refresh frequency | After every completed assistant turn (background, non-blocking) |
| Build sequencing | UI-first prototype, with a Phase 1 integration spike to de-risk PTY/CC/xterm assumptions |
| Observability | Cornerstone — unified Logger, Developer Mode panel with sortable JSON table, AI error analysis |
| Testing | Cornerstone — unit (Vitest), integration (Vitest + test doubles), E2E (Playwright + Electron), recorded API fixtures, CLAUDE.md-enforced |

Each of the above is the conclusion of a tradeoff discussion. The full reasoning is recorded in `docs/decisions.md` (to be created in Phase 0).

---

## 1. Architecture

TokenLess is an Electron desktop app split along Electron's standard main/renderer process boundary.

### Main process (Node.js, no UI)

- Spawns and owns the lifecycle of every `claude` subprocess via **node-pty** (one PTY per session). Pipes stdin from the renderer into each PTY.
- Owns the **SQLite** database (better-sqlite3). Only main writes.
- Owns the singleton **Anthropic SDK client** used for all Haiku gearing, critique, summary refresh, and AI error analysis calls.
- Discovers Claude Code skills by scanning `~/.claude/skills/`, plugin skill directories, and project-local `.claude/skills/`. Watches `CLAUDE.md` files for context.
- Sets `CLAUDE_CONFIG_DIR` per-account when launching `claude`, enabling multi-account.
- Owns the **Logger** service (Section 6) — every error path in the codebase routes through it.
- Exposes a narrow, typed IPC surface to the renderer.

### Renderer process (Chromium, React UI)

- Hosts the React app: composer, conversation sidebar, configs panel, gearing review pane, terminal pane (xterm.js).
- Sends user actions to main via IPC: `gear:prompt`, `send:to-cc`, `cc:new`, `cc:resume`, `cc:stop`, `templates:*`, `projects:*`, etc.
- Subscribes to streamed events from main: `cc:output-chunk`, `cc:exit`, `telemetry:tick`, `critique:result`, `log:record`, etc.
- Holds no persistent state — every reload re-hydrates from SQLite via main.

### IPC contract

- All channels typed via shared TS interfaces in `shared/ipc.ts`.
- Renderer cannot touch filesystem, database, or spawn processes. All OS-side work goes through main.
- Context isolation **on**, nodeIntegration **off** (Electron security best practice).
- Every IPC handler wrapped in `logger.errorBoundary(category, fn)`. Handlers return either `{ok: true, data}` or `{ok: false, error: {message, code, logId}}`.

### Why this split

The PTY subprocess can crash, the API can fail, files can be missing — all of that lives in main where errors are isolated and don't take down the UI thread. The renderer stays a thin presentation layer that recovers cleanly from any backend hiccup.

### Directory layout (approximate)

```
tokenless/
├── package.json
├── electron-builder.yml
├── CLAUDE.md
├── docs/
│   ├── decisions.md
│   ├── observability.md
│   ├── test-scenarios.md
│   └── superpowers/specs/
├── shared/
│   └── ipc.ts
├── main/
│   ├── index.ts
│   ├── cc/                  (claude subprocess manager, parser, lifecycle)
│   ├── db/                  (SQLite + migrations + DAOs)
│   ├── api/                 (Anthropic SDK client)
│   ├── gearing/             (Haiku system prompt + engine)
│   ├── observability/       (Logger + categories + analyzer)
│   ├── skills/              (skill discovery + scanner + watcher)
│   ├── projects/            (project model)
│   └── ipc/                 (channel handlers)
├── renderer/
│   ├── index.tsx
│   ├── App.tsx
│   ├── components/
│   ├── views/
│   ├── theme/
│   ├── hooks/
│   └── mocks/               (Phase 2 only; removed/replaced in Phase 3+)
├── spikes/
│   └── cc-pty/              (Phase 1 throwaway)
└── test/
    ├── doubles/             (MockPTY, MockAnthropicClient, TestDB)
    ├── fixtures/api/        (recorded SDK responses)
    └── e2e/                 (Playwright + Electron)
```

---

## 2. Renderer component model

### Component tree

```
App
├── TopBar
│   ├── ProjectSwitcher
│   ├── AccountSwitcher        (sets CLAUDE_CONFIG_DIR)
│   └── SettingsButton
├── ConversationSidebar         (~240px, collapsible)
│   ├── NewConversationButton
│   ├── SearchInput
│   └── ConversationList
│       └── ConversationListItem   (project tag · model badge · timestamp · status dot)
└── MainPane
    ├── Composer                ← default
    │   ├── PromptTextarea
    │   ├── ConfigsRow          (Model · Breadth · Format · Skill dropdowns)
    │   ├── ActionsRow          (Gear · Send · Commit · Push)
    │   └── TelemetryStrip      (cost preview · token estimate)
    ├── GearReviewPane          ← replaces Composer after Gear is clicked
    │   ├── OriginalPane        (read-only, dimmed)
    │   ├── GearedPane          (editable, highlighted)
    │   ├── CritiqueFlags       (yellow banner if Haiku flagged ambiguity)
    │   └── ActionsRow          (Re-gear · Send original · Send geared)
    └── TerminalSection
        ├── TerminalToolbar     (Stop · ContextBudgetMeter)
        └── TerminalPane        (xterm.js)
```

### Cross-cutting components

- **InfoTooltip** — reusable smart tooltip. Takes static `helperText` plus optional `contextFn` (text varies by current configs) and `outcomeFn` (cites real telemetry). Optional "Learn more" deep-link to a settings side-sheet.
- **ConfirmSendModal** — gates send when "always confirm" is on (default).
- **InlineDiff** — token-level highlighting inside GearReviewPane.
- **DevModePanel** — bottom drawer, toggled in Settings. Sortable JSON table of log records (Section 6).

### Views

- `/` — main work surface
- `/settings` — accounts, gearing preferences, theme, send-confirm toggle, layout toggle (v1.4 stub), telemetry summary, Developer Mode toggle
- `/templates` — full template manager (list / create / edit / delete)
- `/onboarding` — first-run wizard: welcome → API key → first account login → first project → done

### State management

Plain React state + Context for cross-cutting state (current project, current conversation, current composer text, current account). No Redux. Persistent state always comes from main via IPC; the renderer never holds a copy that disagrees with SQLite. Zustand can be added later if prop-drilling gets painful, but starting minimal.

### Streaming subscriptions

PTY output chunks, telemetry ticks, gear results, and log records stream from main → renderer via IPC events. Components register/unregister listeners on mount/unmount.

---

## 3. Data model

All persistence in one SQLite file (`~/.tokenless/tokenless.db`) owned by the main process. Migrations are version-numbered SQL files in `main/db/migrations/`. No ORM; direct SQL via better-sqlite3.

### Schema

```sql
-- One row per Claude account
accounts(
  id INTEGER PK,
  label TEXT NOT NULL,            -- "Personal", "Work"
  config_dir TEXT NOT NULL,       -- value passed to CLAUDE_CONFIG_DIR
  created_at INTEGER
)

-- One row per project (= a working directory + defaults)
projects(
  id INTEGER PK,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  default_account_id INTEGER FK accounts.id,
  default_model TEXT,             -- "haiku" | "sonnet" | "opus"
  default_breadth TEXT,           -- "terse" | "normal" | "thorough"
  default_format TEXT,            -- "prose" | "bullets" | "code" | "json"
  default_commit_prompt TEXT,
  default_push_prompt TEXT,
  notes TEXT,                     -- free-form per-project context
  always_include_files_json TEXT, -- JSON array of paths
  relevant_skill_ids_json TEXT,   -- JSON array of skill IDs
  created_at INTEGER,
  updated_at INTEGER
)

-- Discovered Claude Code skills (rescanned at app start + on demand)
skills(
  id INTEGER PK,
  source TEXT NOT NULL,           -- "user" | "plugin" | "project"
  name TEXT NOT NULL,
  description TEXT,
  path TEXT NOT NULL,
  favorited INTEGER DEFAULT 0,
  hidden INTEGER DEFAULT 0,
  last_seen_at INTEGER
)

-- One row per resumable Claude Code session
conversations(
  id INTEGER PK,
  project_id INTEGER FK projects.id,
  account_id INTEGER FK accounts.id,
  cc_session_id TEXT,
  title TEXT,                     -- auto-generated from first turn, editable
  model TEXT,
  breadth TEXT,
  format TEXT,
  status TEXT,                    -- "active" | "ended"
  summary TEXT,                   -- rolling Haiku summary for gearing context
  summary_updated_at INTEGER,
  parent_conversation_id INTEGER NULL FK conversations.id,
  branched_at_turn_id INTEGER NULL FK turns.id,
  created_at INTEGER,
  updated_at INTEGER,
  ended_at INTEGER,
  archived_at INTEGER             -- soft archive
)

-- One row per prompt or response
turns(
  id INTEGER PK,
  conversation_id INTEGER FK conversations.id,
  role TEXT NOT NULL,             -- "user" | "assistant"
  original_prompt TEXT,
  geared_prompt TEXT,
  response_text TEXT,
  original_tokens INTEGER,
  geared_tokens INTEGER,
  response_tokens INTEGER,
  haiku_meta_tokens INTEGER,
  model_used TEXT,
  feedback TEXT,                  -- "up" | "down" | "shrug" | NULL
  critique_flags_json TEXT,
  status TEXT,                    -- "complete" | "stopped" | "error"
  sent_at INTEGER
)

-- Composer drafts; never lose typed text
drafts(
  id INTEGER PK,
  conversation_id INTEGER FK conversations.id NULL,  -- NULL = new-conv draft
  body TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(conversation_id)
)

-- Prompt templates (CRUD; some seeded as built-ins)
templates(
  id INTEGER PK,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  description TEXT,
  category TEXT,
  builtin INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER
)

-- Singleton key/value for app-wide settings
settings(
  key TEXT PK,
  value TEXT
)
```

### Indexes

- `conversations(project_id, updated_at DESC)` — sidebar list
- `turns(conversation_id, sent_at ASC)` — conversation replay
- `skills(favorited DESC, hidden ASC, name)` — dropdown ordering
- `turns(sent_at)` and `turns(feedback)` — telemetry queries
- `drafts(conversation_id)` — draft lookup

### Notes

- `always_include_files_json` and `relevant_skill_ids_json` stored as JSON, not relational tables — lists are small (5-10), no cross-querying needed.
- `cc_session_id` nullable for conversations whose CC session has been lost.
- `archived_at` soft-delete preserves telemetry.
- Telemetry queries (cost preview, savings) compute on demand over `turns` — no materialized views in v1.

---

## 4. Data flow

### Primary flow: compose → gear → review → send → stream

1. **User types in composer.** Debounced 750ms auto-save to `drafts`. No IPC for streaming text — only the save.
2. **User clicks Gear.** Renderer fires `gear:prompt` IPC → main with `{conversationId, projectId, configs, originalPrompt}`.
3. **Main process gears:**
   - Loads project context (`always_include_files_json`, `notes`, `conversations.summary`).
   - Builds the universal Haiku system prompt, parameterizing it with the configs.
   - Calls Anthropic API → Haiku → structured JSON response (geared prompt + critique flags + token breakdown).
   - Returns `{gearedPrompt, critiqueFlags, tokenBreakdown, costEstimate}` to renderer.
4. **Renderer enters GearReviewPane.** Original (read-only, dimmed) next to geared (editable). Critique flags surface as a yellow banner. User can: edit inline, re-gear, send original, or send geared.
5. **If "always confirm" is on**, ConfirmSendModal intercepts before send.
6. **User confirms.** Renderer fires `send:to-cc` → main with `{conversationId, finalPrompt, originalPrompt, gearedPrompt, configs}`.
7. **Main process:**
   - Writes a `turns` row (role=`user`, all prompt + token + config fields).
   - Writes the final prompt into the active PTY's stdin + Enter.
   - Deletes the corresponding `drafts` row.
8. **Streaming output:**
   - Main reads PTY in chunks, emits `cc:output-chunk` IPC events with raw bytes (ANSI preserved).
   - Renderer pipes chunks straight into xterm.js.
   - Parallel parser detects tool calls, end-of-response markers, token-count emissions, context-usage indicators. Emits `cc:event` IPC with structured data.
9. **Response complete:**
   - Main detects the prompt indicator returning. Writes a `turns` row (role=`assistant`).
   - Emits `cc:response-complete`. Feedback buttons surface in the response row.
10. **Summary refresh** (after every completed assistant turn, background):
    - Background Haiku call regenerates `conversations.summary`.
    - Non-blocking; failures logged as `warn`, don't surface to user.

### Alternate flows

**Resume conversation:** User clicks a sidebar row → `cc:resume` → main spawns `claude --resume <cc_session_id>` with the right env + cwd → PTY attaches → renderer re-hydrates the log from `turns`.

**Stop streaming:** User clicks Stop → `cc:stop` → main sends SIGINT to the PTY → stream terminates → main writes the partial assistant turn with `status=stopped`.

**Commit / Push button:** Reads the project's `default_commit_prompt` / `default_push_prompt` → pre-fills the composer → normal compose flow.

**Branch from turn:** User right-clicks any turn → "Branch from here." TokenLess creates a new conversation with: same project/account/configs, a synthetic `summary` built by Haiku from `turns[0..N]`, `parent_conversation_id` and `branched_at_turn_id` set. New conversation starts a fresh `claude` session. Claude is primed with the summary; the parent conversation is preserved.

**Telemetry tick:** Every ~5s while streaming, main emits `telemetry:tick` with current context-window estimate, current $ spent. Renderer updates ContextBudgetMeter and the live cost display.

---

## 5. External integrations

Three external boundaries, each wrapped in its own module under `main/` with a typed surface, internal retry/error handling, and Logger integration.

### 5.1 Claude Code subprocess — `main/cc/`

**Spawning** via `node-pty.spawn('claude', args, { cwd, env, name: 'xterm-256color', cols, rows })`:
- `cwd` = project's `root_path`
- `env` = process.env + `CLAUDE_CONFIG_DIR` (account-specific) + `TOKENLESS=1` (diagnostic flag)
- `args`: new session → `['--model', model]`; resume → `['--resume', cc_session_id, '--model', model]`
- PTY size negotiated with xterm.js on mount; resized live via `pty.resize(cols, rows)`.

**Writing prompts:** `pty.write(text + '\n')`. Each write tracked back to a `turn` ID.

**Reading output:** Two parallel consumers — raw stream (forwarded verbatim to xterm.js) and parsed stream (detects tool calls, end-of-response, token counts, errors).

**Exit handling:** `pty.onExit({exitCode, signal})` updates `conversations.status`, emits `cc:exit`, distinguishes expected vs unexpected (crash, quota hit).

**Session ID capture:** parsed from CC's startup output and persisted to `conversations.cc_session_id`.

### 5.2 Anthropic SDK — `main/api/`

Single client instance, holds the user's API key (loaded from `~/.tokenless/api-key` or env, set up during onboarding).

Used for exactly three call types in v1:
1. **Gearing + critique** — Haiku, structured JSON output (prompted; parsed and validated via Zod schemas), ~800 in / ~600 out typical.
2. **Conversation summary refresh** — Haiku, simpler system prompt.
3. **AI error analysis** (Dev Mode) — Haiku, on-demand only.

**Retry policy:** exponential backoff on 429/5xx, 3 attempts, max 4 seconds total. Failures route to Logger (`category: 'api'`) and surface as non-blocking warnings. Gearing falls back to "send original" mode if Haiku is unreachable.

**Cost tracking:** every call's `usage.input_tokens` and `usage.output_tokens` captured. For gearing calls, written to `turns.haiku_meta_tokens`. For others, aggregated in the dev-mode log only.

### 5.3 Filesystem — `main/skills/`, `main/projects/`

**Skill discovery** on app start scans `~/.claude/skills/`, `~/.claude/plugins/*/skills/`, `<project_root>/.claude/skills/`. Each = a directory with `SKILL.md`. Parses frontmatter + first paragraph as summary. Reconciles against `skills` table (insert new, update changed, mark missing as stale via `last_seen_at`; never deletes — preserves favorites/hidden state).

**CLAUDE.md** read into memory on project open; fed as part of gearing context; never written to. Reloadable via "Reload project context" button.

**File watching:** `chokidar` watches the skills directories and active project's `CLAUDE.md`. Debounced 1s. Emits `skills:changed` / `project-context:changed` events. UI surfaces a "context updated" indicator the user can click to reload.

**Multi-account config dirs:** account creation creates the config dir if absent and wraps `claude login` in a temporary PTY pane.

---

## 6. Observability & Developer Mode (cornerstone)

Built in Phase 1 alongside the integration spike. Every subsequent line of code respects the contract.

### 6.1 The Logger service

`main/observability/logger.ts` — single service, used by every module. No direct `console.error`, `console.log`, or raw stderr writing anywhere else.

```ts
type Severity = 'debug' | 'info' | 'warn' | 'error' | 'fatal'
type Category = 'cc' | 'pty' | 'api' | 'db' | 'ipc' | 'ui'
                | 'skill' | 'auth' | 'gearing' | 'fs' | 'observability'

type LogRecord = {
  id: string                       // uuid; unique record identifier
  ts: number                       // epoch ms
  severity: Severity
  category: Category
  event: string                    // short machine-readable label
  message: string
  context: Record<string, unknown>
  stack?: string
  fingerprint: string              // hash of event+category+stack; dedups
  source: 'main' | 'renderer'
}
```

**API:**
- `logger.{debug,info,warn,error,fatal}(category, event, message, context?)`
- `logger.errorBoundary(category, fn)` — wraps a function; catches throws, logs with full context, returns a typed failure result

**Sinks (every record fans out to all):**
1. In-memory ring buffer (last ~5000 records) — backs Dev Mode UI
2. Rotating JSONL file — `~/.tokenless/logs/tokenless-YYYY-MM-DD.jsonl`; daily roll; 30-day retention; older files gzipped
3. IPC stream to renderer — pushed live when Dev Mode is on

### 6.2 Categories and severities

Categories are an enum in `main/observability/categories.ts`. Adding a new one requires a deliberate code change + doc entry in `docs/observability.md`. Prevents drift.

Severities: `debug` (verbose flow, only when Dev Mode on), `info` (lifecycle), `warn` (recoverable), `error` (operation failed), `fatal` (process can't continue cleanly).

### 6.3 Error entry boundaries

Six defined boundaries, all wrapped in `logger.errorBoundary`:
1. **IPC handlers** — every channel handler. Renderer always gets `{ok: true, data}` or `{ok: false, error: {message, code, logId}}`.
2. **PTY consumers** — stream-parse failures, exit anomalies, write failures.
3. **Anthropic SDK calls** — network errors, 4xx/5xx, malformed responses.
4. **DB queries** — constraint violations, locked DB, migration failures (fatal).
5. **Filesystem operations** — missing dirs, permission errors, unreadable SKILL.md.
6. **Top-level uncaught handlers** — `process.on('uncaughtException')`, `process.on('unhandledRejection')`, React `<ErrorBoundary>` at App root.

Renderer-side errors ship to main via a thin `loggerBridge` so all records end up in the same stream.

### 6.4 Developer Mode UI

Bottom drawer toggleable from Settings. When on, takes ~35% of window height (resizable, detachable to its own window).

**Sortable JSON table:**

| TS | Severity | Category | Event | Source | Message | Context |
|---|---|---|---|---|---|---|

- Sortable columns (click header, shift-click for multi-column sort; default timestamp desc)
- Chip filters above the table: category (multi-select), severity (multi-select), source. Free-text search on `event` and `message`.
- Row click → expanded detail (pretty-printed JSON, stack, "Analyze with AI" button)
- Export: "Copy as JSONL" and "Export to file"

When Dev Mode is off: panel not rendered, IPC stream not subscribed. Critical errors still toast with a "Show in Dev Mode" link that enables Dev Mode and jumps to the record.

### 6.5 AI error analysis

On "Analyze with AI" → Haiku call with: system prompt ("You are an Electron app developer debugging TokenLess..."), user payload (the record + the previous 20 log entries for context). Response renders inline below the row as *What happened* / *Likely cause* / *Suggested fix*.

Cached per `fingerprint` in `~/.tokenless/cache/analysis/`. Toggleable in Settings → Developer Mode → "Enable AI analysis."

### 6.6 Log file management

Path: `~/.tokenless/logs/tokenless-YYYY-MM-DD.jsonl`. One JSON record per line. Daily rotation; 30-day retention; gzip rollover. Manual export from Settings → "Export logs (last 7 days)."

### 6.7 CLAUDE.md directive

The project's `CLAUDE.md` will contain:

```markdown
## Error handling protocol

Every new code path that can fail must:
1. Catch the failure as close to the source as possible
2. Route it through logger.{severity}(category, event, message, context)
3. Provide a user-facing recovery path where applicable
4. Add a test verifying the error path emits to the logger correctly

Adding a new category requires:
- An entry in main/observability/categories.ts
- A row in docs/observability.md documenting when to use it

Developer Mode is a cornerstone of the project. Do not introduce:
- Silent failures (catch-and-swallow without logging)
- Stray console.log/console.error outside the Logger
- Category-less try/catches
- Errors without context (every logger.error call must include enough info
  to reproduce the issue from the log alone)
```

---

## 7. Failure modes & specific error paths

Every error includes context with at minimum: relevant entity IDs (conversation_id, turn_id, project_id, account_id), the user action that triggered it, retry counters, and `recovery_attempted` flag.

### 7.1 Claude Code subprocess

| Failure | Detection | Severity | User-facing | Recovery |
|---|---|---|---|---|
| `claude` not found | `pty.spawn` ENOENT | fatal (session) | Modal: install from claude.com or set path in Settings | Settings → "Claude Code path" |
| CC crashes mid-session | `pty.onExit` non-zero, no graceful marker | error | Toast: "Claude Code crashed. View Dev Mode. Conversation saved." | "Restart conversation" → `--resume`; falls back to branch-from-summary if resume fails |
| CC hangs (90s no output) | Watchdog timer | warn → error at 90s | Inline: "No response — [Stop]" | User Stop; option to re-send |
| `--resume` fails | Output pattern match | error | Toast: "Session lost. Branch from a turn to recover." | "Branch from last turn" button |
| Quota hit | Output pattern match | error | Modal: "Plan limit reached. Wait / switch account / use API." | AccountSwitcher highlighted; "Switch to API" toggle |
| Auth expired | Output pattern match | error | Modal: "Re-authenticate?" | Spawns `claude login` in temp PTY pane |
| PTY write fails | `pty.write` throws | error | Toast: "Couldn't send prompt." | Detect dead PTY; restart-conversation prompt |

### 7.2 Anthropic API

| Failure | Detection | Severity | User-facing | Recovery |
|---|---|---|---|---|
| 401 (bad key) | Response code | error | Modal in gear flow + Settings prompt | Settings → API key → re-test |
| 429 | Response code | warn (retry) / error (exhausted) | Banner: "Rate-limited. Retrying… (2/3)" | Exp backoff; final fallback: "Send original" auto-suggested |
| 5xx | Response code | warn → error | Same banner | Same fallback |
| Timeout / network down | Fetch rejection | error | Banner: "Network unreachable. Gearing offline." | Gear disabled; send-original path works; auto-recover when network returns |
| Malformed JSON | parse throws | error | Inline: "Couldn't parse gearing response." | One retry; fallback to original. Log full body. |
| Summary refresh failure | Background | warn (not error) | None | Use stale summary; retry next turn |

### 7.3 Database

| Failure | Detection | Severity | User-facing | Recovery |
|---|---|---|---|---|
| DB locked | `SQLITE_BUSY` | warn | None — auto-retry in DAO | 3 attempts with jitter |
| Migration failure | Runner throws | fatal | Splash: "Migration failed. View log / Restore backup." | Auto-backup before each migration; "Restore" available |
| Unique / FK violation | Throws | error | Inline action-specific message | User retries |
| Disk full | ENOSPC | fatal | Modal: "Disk full. Free up space and restart." | Manual |
| Corruption | `PRAGMA integrity_check` fails on startup | fatal | Splash: "Corrupted. Restore from backup?" | Same restore flow |

### 7.4 Filesystem

| Failure | Detection | Severity | User-facing | Recovery |
|---|---|---|---|---|
| Skills dir missing | ENOENT | info (first-run expected) | None | Treated as empty |
| Permission denied | EACCES | error | Settings notification: "Couldn't read `<path>`" | User fixes; "Re-scan" |
| Project root missing | Spawn-time `cwd` fails | error | Toast: "Project root not found. Edit?" | "Edit project" settings |
| CLAUDE.md unreadable / >256 KB | Read throws / size check | warn | Settings notice | Gearing proceeds without; retry from settings |

### 7.5 UI / Renderer

| Failure | Detection | Severity | User-facing | Recovery |
|---|---|---|---|---|
| React error boundary trips | `<ErrorBoundary>` | error | Pane fallback + [Reload] [Open Dev Mode] | Reload reinitializes renderer; main + DB untouched |
| IPC channel timeout | Renderer 8s timeout | error | Inline: "Couldn't reach backend. Retrying…" | One retry; then "Restart app" option |
| xterm.js crash | Pane error boundary | error | "Terminal crashed. Output preserved — reload." | Re-mount xterm with same PTY; replay recent buffer |

### 7.6 Multi-account

| Failure | Detection | Severity | User-facing | Recovery |
|---|---|---|---|---|
| Config dir missing | Pre-spawn check | error | Modal: "Re-link account?" | `claude login` against fresh config dir |
| Account not logged in | Auth error from CC | error | Modal: "Sign in now?" | Wraps `claude login` in temp PTY |
| Switch mid-session | User action while active | info | Confirmation: "End current conversation?" | User confirms; clean close; new session with new account |

### 7.7 Conversation / branching

| Failure | Detection | Severity | User-facing | Recovery |
|---|---|---|---|---|
| Branch target turn deleted | FK constraint | error | Toast: "Source turn no longer exists." | User picks different turn |
| Stale `cc_session_id` on resume | CC reports session-not-found | error | See 7.1 row | Branch-from-summary fallback |
| Concurrent sends to same PTY | Renderer guard / main rejection | warn / error | Send button disabled during stream | State machine guarantees one send-in-flight per session |

---

## 8. Testing strategy (cornerstone)

Tests built alongside features from Phase 1. Enforced via CLAUDE.md.

### 8.1 Three layers

**Unit (Vitest):** pure logic — gearing prompt builders, token estimators, summary logic, parsers, Logger, diff helpers, response parsers. Watch mode. Full unit suite < 5s. ≥ 90% coverage on logic packages.

**Integration (Vitest + test doubles):** every IPC handler, every DB query, gearing engine end-to-end with mocked SDK, skill scanner against synthetic dirs. In-memory SQLite (`:memory:`). Real schema, real queries, faked external boundaries. Full integration suite < 30s.

**E2E (Playwright + Electron):** the seven critical UI flows (Section 8.5). Run on PR + main. Each scenario < 30s; full E2E suite < 5min.

### 8.2 Tooling

- **Vitest** for unit + integration (deliberately one runner)
- **Playwright + `@playwright/test`** for E2E, driving Electron via `electron.launch()`

### 8.3 Test doubles (`test/doubles/`)

- **MockPTY** — same surface as `IPty`; tests script responses to writes
- **MockAnthropicClient** — `inline` mode (exact response) and `replay` mode (fixtures)
- **TestDB** — in-memory SQLite with migrations applied; fresh DB per test; helpers (`seedProject`, `seedConversation`, `seedTurns(n)`)

### 8.4 Recorded fixtures

`test/fixtures/api/*.json` — committed to git. `MockAnthropicClient` in `replay` mode reads fixtures matching the input. Run `npm run fixtures:record` to regenerate when the gearing system prompt changes meaningfully; the script reports diffs so we can review.

### 8.5 Suite organization

Tests live in `<package>/__tests__/`. Suites mirror feature areas, not file structure. Naming: `.unit.test.ts`, `.integration.test.ts`, `.e2e.test.ts`.

### 8.6 Critical path E2E coverage

Seven scenarios that must always work:
1. New conversation
2. Compose → Gear → Send
3. Resume conversation
4. Stop streaming
5. Branch from turn
6. Multi-account switch
7. Dev Mode error flow

### 8.7 Manual test scenarios

`docs/test-scenarios.md` documents what a human should exercise before any release. Every feature PR adds or updates at least one scenario.

### 8.8 CI gates

- On every push: unit + integration must pass
- On PR + main: + full E2E suite
- On version tag: + release-readiness (builds on all platforms, fixture freshness, test-scenarios doc updated)

### 8.9 CLAUDE.md directive

```markdown
## Testing protocol

Every new feature must include:
1. Unit tests for any pure logic introduced
2. Integration tests for any new IPC channel, DB query, or module boundary
3. A scenario entry in docs/test-scenarios.md for human verification
4. E2E coverage for flows touching the seven critical paths

Tests organize by feature, not by file. Each suite has a top-level
describe with a purpose comment.

Mocks live in test/doubles/. Do not create one-off mocks when a
shared double already covers the boundary.

Fixtures (Anthropic SDK recorded responses) are committed to git.
Regenerate with `npm run fixtures:record` when the gearing system
prompt changes — explain the diff in your PR.

CI gates:
- Unit + integration must pass on every push
- E2E must pass on PR and main
- Don't disable failing tests to land a feature. Either fix the test
  (if the test is wrong) or fix the feature (if the test is right).
```

---

## 9. Build sequencing

Pace assumption: phases sized for **focused solo work** in working days. Map to your real schedule — roughly 3× the elapsed calendar time for evenings/weekends.

### Phase 0 — Setup (~1 day)

- Initialize repo at `C:\Users\aiden.molyneaux\projects\tokenless`
- Scaffold Electron + Vite + React + TypeScript (electron-vite template)
- Add: better-sqlite3, node-pty, xterm.js, @anthropic-ai/sdk, chokidar, electron-builder, Vitest, Playwright
- Create `CLAUDE.md` with the directives from §6.7 and §8.9
- Create `docs/decisions.md`, seed with the decisions from this spec
- CI skeleton (GitHub Actions)
- Initial commit

### Phase 1 — Integration spike + observability foundation (~3-5 days)

- **`spikes/cc-pty/`** — Node script spawning `claude` via node-pty on Windows; pipes prompt; captures output; tests `--resume`; tests `--model`; tests `CLAUDE_CONFIG_DIR`. Documents findings in `spikes/cc-pty/FINDINGS.md`.
- **Build the Logger** (`main/observability/`) — full implementation with categories, severities, ring buffer, JSONL file sink, IPC bridge. Full unit + integration coverage.
- **Dev Mode panel UI** rendered against mock log records — sortable JSON table, filters, expanded detail.

**Exit criteria:** spike findings in hand, Logger working end-to-end, Dev Mode panel renders.

### Phase 2 — UI prototype with mocks (~5-7 days)

- Theme tokens: cream `#FAF7F2`, orange `#D97757`, blue `#4A6FA5`, serif headings (Tiempos Text or Source Serif Pro)
- App shell: TopBar, ConversationSidebar, MainPane
- Composer + ConfigsRow + ActionsRow + TelemetryStrip
- GearReviewPane with mock geared-prompt data
- TerminalSection with xterm.js rendering canned ANSI streams
- InfoTooltip with context-aware + outcome-aware logic
- Mock data factories under `renderer/mocks/`

**Exit criteria:** entire UI looks and feels right, navigable end-to-end. No real persistence, no real Claude.

### Phase 3 — Real DB + persistence (~3-5 days)

- `main/db/` — setup, migration runner, all schema
- DAO layer per table
- IPC handlers for Project and Conversation CRUD
- Renderer hooks migrate from mock to IPC-backed
- Onboarding skeleton (polished in Phase 8)

**Exit criteria:** projects and conversations persist across restarts. Sidebar populated from SQLite.

### Phase 4 — Real Claude Code subprocess + terminal (~5-7 days)

- `main/cc/spawner.ts`, `main/cc/parser.ts`, `main/cc/lifecycle.ts`
- Wire xterm.js to real PTY output
- Wire Send to PTY stdin
- New / resume / stop lifecycle
- All §7.1 failure modes + recovery paths

**Exit criteria:** real conversation with Claude Code inside TokenLess. Send, stream, stop, resume all work.

### Phase 5 — Gearing engine + Anthropic SDK (~3-5 days)

- `main/api/client.ts` — SDK wrapper with retry/backoff
- `main/gearing/system-prompt.md` (initial)
- `main/gearing/engine.ts` — builds prompt, calls Haiku, parses JSON
- Gear button + GearReviewPane with real diffs
- Cost preview, critique flags, background summary refresh

**Exit criteria:** Gear works end-to-end. Token savings visible. §7.2 failure modes implemented.

### Phase 6 — Multi-account, skills, telemetry (~3-5 days)

- `main/projects/` full model
- AccountSwitcher with real `CLAUDE_CONFIG_DIR` swapping
- `claude login` wrapping
- `main/skills/scanner.ts` and watcher
- Skills dropdown with favorite/hide
- ContextBudgetMeter wired
- Basic telemetry queries

**Exit criteria:** multi-account works. Skills populated. Real telemetry in composer.

### Phase 7 — Drafts, branching, templates, feedback (~3-5 days)

- Composer auto-save via `drafts` table (debounced 750ms)
- "Branch from this turn" flow
- TemplatesView full CRUD, ~8 seeded built-ins
- Feedback buttons + `turns.feedback` persistence
- Commit/Push buttons wired to project defaults

**Exit criteria:** all v1 surface features land. Feature-complete.

### Phase 8 — Polish, onboarding, release (~3-5 days)

- Full onboarding wizard
- Full E2E test pass
- Bug fixing
- AI error analysis wiring (§6.5)
- electron-builder for Windows installer + electron-updater
- Code signing (optional for personal use)
- Release v1.0.0

---

## Definition of done for v1

TokenLess v1 is "shipped" when:

1. Install on a fresh Windows machine, complete onboarding without docs
2. Multi-turn coding conversation with Claude Code entirely inside TokenLess
3. Gear a prompt, see the diff, edit it, send the edited version
4. Switch between Personal and Work accounts; correct one is used
5. Resume a past conversation from any prior session
6. Branch a conversation from a past turn
7. Developer Mode panel shows live structured logs; AI analysis works on errors
8. All seven critical-path E2E scenarios pass
9. Close TokenLess mid-prompt, reopen, draft preserved

---

## Post-v1 backlog

- **v1.1** General Chat tab via headless `claude -p` (Claude.ai-style surface)
- **v1.2** Session replay UI (browse past conversation turn-by-turn with original/geared/response side-by-side)
- **v1.3** Savings dashboard with monthly/weekly visualizations
- **v1.4** Layout toggle (notebook vertical ↔ IDE side-by-side)
- **v1.5** Pre-warmed `claude -p` process pool for "route gearing through CC" config
- **v1.6** Importable/exportable project configs

---

## Appendix A — Decisions log seed

The following decisions, recorded above, will seed `docs/decisions.md` as ADRs in Phase 0:

1. Stack: Electron + React + TypeScript + xterm.js + node-pty + better-sqlite3 + Anthropic SDK
2. Build host platform: Windows-first
3. Main window layout: notebook vertical
4. Gearing review flow: inline 2-pane expand
5. Conversation lifecycle: persistent + resumable via `claude --resume`
6. Gearing engine architecture: single universal Haiku system prompt
7. Critique timing: bundled into every Gear call
8. Build sequencing: UI-first prototype with Phase 1 integration spike
9. Observability: cornerstone — unified Logger + Dev Mode panel + AI analysis
10. Testing: cornerstone — three layers + recorded fixtures + CLAUDE.md-enforced
11. Conversation "backup": branch-from-turn with summary primer (not true point-in-time restore)
12. Draft auto-save: debounced 750ms; per-conversation rows in `drafts`
13. Summary refresh: after every completed assistant turn (background)

---

*End of spec.*
