# Design Decisions

Architectural Decision Records (ADRs). Append-only — new decisions get new entries; superseded entries get a "Superseded by ADR-N" note rather than being edited.

Format per entry: date · context · options considered · choice · reasoning. Keep entries scannable — a paragraph or two, not a thesis.

---

## ADR-001 (2026-05-13) — Stack: Electron + React + TypeScript

**Context:** Need a desktop app with: filesystem access, ability to spawn `claude` as a subprocess, host an embedded terminal, integrate with the Anthropic API. Solo developer, React experience.

**Options:**
- Tauri + React (smaller binary, Rust shell)
- Electron + React (larger binary, Node shell)
- Native (Win32 / WPF / .NET)
- Web app (no local subprocess capability)

**Choice:** Electron + React + TypeScript.

**Reasoning:** PTY + xterm.js + spawned subprocess is a paved path on Electron (VS Code does exactly this). Tons of examples; minimal Rust learning curve. Bundle size and RAM are acceptable trade-offs for a tool used daily on a developer machine.

## ADR-002 (2026-05-13) — Windows-first

**Context:** Author's primary platform.

**Choice:** Ship Windows installer first. Mac and Linux builds deferred until justified by demand.

**Reasoning:** Single-platform reduces test surface, CI complexity, and code-signing setup. Cross-platform Electron is straightforward to add later.

## ADR-003 (2026-05-13) — Notebook-vertical layout

**Context:** Where does the composer go relative to the embedded terminal?

**Options considered:** A) Composer top + terminal bottom (notebook vertical), B) Composer left + terminal right (IDE side-by-side), C) Three-column workspace.

**Choice:** A — composer on top, terminal below, narrow conversation sidebar on the left.

**Reasoning:** Workflow is "write, gear, send, watch" — naturally vertical. Matches the "notebook" aesthetic intent. B preserved as a future layout toggle (v1.4 backlog).

## ADR-004 (2026-05-13) — Inline 2-pane gearing review

**Context:** When the user clicks "Gear," how should the review surface?

**Options considered:** A) Inline expand within the composer area, B) Modal overlay, C) Right-side panel.

**Choice:** A — composer becomes a 2-pane (original read-only · geared editable) inline.

**Reasoning:** No screen takeover, terminal stays visible, fits notebook flow.

## ADR-005 (2026-05-13) — Conversations: persistent + resumable

**Superseded in part by ADR-016** (the session-id capture mechanism described below is replaced with pre-specifying via `--session-id <uuid>`). The persistence + resumability decision still stands; only the implementation strategy for capturing the session ID changes.

**Context:** What's the lifecycle of a Conversation?

**Options considered:** A) Ephemeral (lives only while `claude` process is alive), B) Persistent + resumable via `claude --resume`, C) Persistent archive only (no resume).

**Choice:** B.

**Reasoning:** Claude Code CLI supports `--resume <session-id>` natively; user-facing value of "jump back into last week's thread" is significant; engineering cost moderate (capture session ID, store in DB, spawn with --resume).

## ADR-006 (2026-05-13) — Gearing engine: single universal system prompt

**Context:** How does Haiku know how to rewrite a prompt?

**Options considered:** A) Single universal Haiku system prompt parameterized by user configs, B) Per-config template library (N templates for each config combination), C) Hybrid — universal prompt + intent classifier.

**Choice:** A for v1; revisit C in a later cycle when usage data tells us which intents matter.

**Reasoning:** YAGNI on templates — we don't yet know what patterns matter. One prompt to iterate on is easier than 12+ templates to keep aligned.

## ADR-007 (2026-05-13) — Critique bundled with every Gear call

**Context:** Should pre-flight critique be auto-run or manual?

**Choice:** Bundled into every Gear call.

**Reasoning:** ~50-100 extra Haiku tokens per gear; negligible cost; uniform predictable behavior across models; user can ignore the flags.

## ADR-008 (2026-05-13) — Token-cost focus: output > input

**Context:** Which side of the token bill should gearing primarily attack?

**Choice:** Output-side (response shaping) first; input-side (prompt shrinking) second.

**Reasoning:** Output tokens are ~5× more expensive than input across Anthropic's pricing, and Claude tends to ramble more than the user does. Adding "respond in ≤200 words, no preamble" costs ~12 tokens and saves hundreds.

## ADR-009 (2026-05-13) — Build sequencing: UI-first prototype with Phase 1 integration spike

**Context:** Three sequencing approaches were considered for the build: A) Vertical slice first, B) Foundation-up / layered, C) UI-first prototype.

**Choice:** C with a Phase 1 integration spike to de-risk PTY/CC/xterm assumptions before the UI locks in patterns dependent on them.

**Reasoning:** Author has React experience and cares about UX feel. UI-first allows iterating on aesthetics without backend complexity. The Phase 1 spike mitigates the back-loaded integration risk.

## ADR-010 (2026-05-13) — Observability cornerstone: unified Logger + Developer Mode

**Context:** How should errors and operational events be surfaced?

**Choice:** Unified `Logger` service in `main/observability/` is the spine; every error path routes through it. Developer Mode (toggleable) renders a sortable JSON table of log records; supports AI-powered error analysis via Haiku.

**Reasoning:** Adding observability later is always a months-long retrofit. Cornerstone status (enforced via CLAUDE.md) prevents drift. JSON+sortable+filterable beats `console.log` scattered across the codebase.

## ADR-011 (2026-05-13) — Testing cornerstone: Vitest + Playwright + recorded fixtures

**Context:** What does the test pyramid look like?

**Choice:** Three layers — unit (Vitest), integration (Vitest + test doubles + in-memory SQLite), E2E (Playwright + Electron). Anthropic SDK calls replaced with recorded JSON fixtures, committed to git, regeneratable.

**Reasoning:** Test pyramid covers the right failure surface at the right cost. Recorded fixtures make gearing logic deterministic without burning tokens or requiring API keys in CI.

## ADR-012 (2026-05-13) — Conversation backup: branch-from-turn, not point-in-time restore

**Context:** When a prompt goes sideways, how does the user recover?

**Choice:** "Branch from this turn" — create a new conversation seeded with a Haiku-summarized primer of turns up to the chosen point.

**Reasoning:** Claude Code's `--resume` only restores to the *latest* state of a session; arbitrary-turn restoration isn't possible. Branch-from-turn gives ~90% of the value (new thread with the back-story) without pretending to do something the CLI doesn't support.

## ADR-013 (2026-05-13) — Draft auto-save: debounced 750ms per-conversation row

**Context:** Don't lose typed prompts on close/crash.

**Choice:** Composer text auto-saves to a `drafts` table every 750ms of inactivity, keyed by conversation. Cleared on Send.

**Reasoning:** Standard autosave UX latency; minimal DB churn; survives crashes and accidental closes.

## ADR-014 (2026-05-13) — Summary refresh: after every completed assistant turn (background)

**Context:** How fresh does the rolling Haiku summary need to be?

**Choice:** Refresh after every completed assistant turn, in the background, non-blocking.

**Reasoning:** Cost is trivial; quality benefit is real (next Gear call sees an up-to-date summary instead of N-1-turns-stale).

## ADR-015 (2026-05-13) — Preload emits CJS in an ESM package

**Context:** TokenLess uses `"type": "module"` in `package.json` (ESM throughout). Electron's preload script loader is CommonJS-based — it `require()`s the preload, which fails on an ES module (`require() of ES Module`). The first E2E test in Phase 0 surfaced this by silently swallowing the preload and leaving `window.tokenless` undefined.

**Choice:** Configure electron-vite's preload build to emit CommonJS with `.cjs` extension (`output: { format: 'cjs', entryFileNames: '[name].cjs' }`). Update `webPreferences.preload` in `src/main/index.ts` to reference `index.cjs`.

**Reasoning:** Canonical fix in the Electron ecosystem. Electron's preload loader does not support full ESM as of Electron 32+, and forcing it would require workarounds that don't carry their weight. CJS preload with an explicit `.cjs` extension bypasses Node's package-type resolution and works reliably across platforms.

**Discovered:** Phase 0, Task 16 (E2E smoke test). Documenting here so Phase 1+ workers don't re-derive the lesson.

## ADR-016 (2026-05-14) — Claude Code session IDs: pre-specify via `--session-id <uuid>`

**Context:** Phase 1A's `spike-resume.ts` discovered that Claude Code session IDs (standard UUID v4s like `155203a8-438f-48e1-939a-7bac97748108`) do not appear anywhere in the interactive TUI startup banner. The original design assumption — capture session ID by parsing claude's stdout after spawn — fails because there is nothing to parse.

**Options considered:**
- A) Parse `--output-format stream-json --verbose` in headless `-p` mode to extract `session_id` from the first JSON event. Requires running every new session twice (once for ID, once for the actual conversation) or doing all interactions in headless mode.
- B) Pre-specify the session UUID via `--session-id <uuid>` at spawn time. Symmetric with `--resume <uuid>`. No parsing required.

**Choice:** B — pre-specify.

**Reasoning:** Simpler, deterministic, and the right Phase 4 design. TokenLess generates a `randomUUID()` at conversation creation time, persists it to `conversations.cc_session_id` on insert (rather than nullable + populated after parse), and uses the same UUID for both `--session-id` (new session) and `--resume` (resume). No fragile TUI parsing. Empirically verified end-to-end by `spike-resume.ts` (commit `74ed72e`).

**Implications for the data model:** `conversations.cc_session_id` should be `TEXT NOT NULL` and written on conversation insert. Update spec §3 accordingly when Phase 4 lands.

**Discovered:** Phase 1A integration spike. See `spikes/cc-pty/FINDINGS.md` for the journey.

## ADR-017 (2026-05-14) — Windows: spawn `claude.cmd` not `claude`

**Context:** On Windows, `node-pty.spawn('claude', ...)` fails with ENOENT because Windows `CreateProcess` cannot resolve extensionless Unix-style shell shims. npm installs `claude` as a JavaScript shell script (used by Git Bash) and `claude.cmd` as a Windows batch wrapper that dispatches to `claude.exe`. node-pty's PTY-mode spawn requires the `.cmd` form on Windows.

**Choice:** Use a platform-aware binary name helper:

```typescript
const CLAUDE_BIN = process.platform === 'win32' ? 'claude.cmd' : 'claude'
```

Codified as `getClaudeBinary()` in `src/main/cc/spawner.ts` when Phase 4 lands.

**Reasoning:** Required for any node-pty spawn of claude on Windows. Documented so Phase 4 doesn't re-derive the fix.

**Discovered:** Phase 1A integration spike (`spike-spawn.ts`, commit `3b93331`).

## ADR-018 (2026-05-14) — Multi-account: per-account `ANTHROPIC_API_KEY` injection (supersedes ADR-005's CLAUDE_CONFIG_DIR-only strategy)

**Context:** Phase 1A's `spike-config-dir.ts` discovered that `CLAUDE_CONFIG_DIR` isolates **preferences and config state** (theme, hooks, recent projects, onboarding) but **does NOT isolate credentials**. Pointing the env var at a freshly-created empty directory triggers Claude Code's first-run onboarding flow, proving the env var is honored — but claude proceeds with authenticated state anyway. Most likely cause: claude reads credentials from the Windows Credential Manager (OS keyring) and/or inherits `ANTHROPIC_API_KEY` from the parent environment, both of which survive a `CLAUDE_CONFIG_DIR` swap.

**Options considered:**
- A) Strip `ANTHROPIC_API_KEY` from the env when spawning a different account, hope keyring isolation is sufficient. Brittle — keyring behavior is implicit.
- B) Inject a per-account `ANTHROPIC_API_KEY` via the spawn env. TokenLess stores each account's API key in its DB; on spawn, `env: { ANTHROPIC_API_KEY: account.api_key, CLAUDE_CONFIG_DIR: account.config_dir, ... }`. Deterministic regardless of keyring state.
- C) Require users to set `claude logout` / `claude login` between account switches. Defeats the purpose of multi-account.

**Choice:** B — per-account API key injection, paired with `CLAUDE_CONFIG_DIR` for preference isolation.

**Reasoning:** Deterministic, OS-agnostic, decoupled from keyring quirks. The `CLAUDE_CONFIG_DIR` still serves a purpose (separates per-account config) but is no longer load-bearing for identity.

**Implications:**
- Phase 6 (multi-account) plan needs to add an "API key entry" step to account creation. The user provides each account's API key once, TokenLess persists it (encrypted at rest via Electron's `safeStorage`), and injects it on every spawn for that account.
- ADR-005's "set `CLAUDE_CONFIG_DIR` per account" plan is **partially superseded**. The persistence + resumability decision stands; only the identity-isolation mechanism is corrected.
- Update spec §5.1 and §5.3 to reflect this when Phase 6's plan is written.

**Discovered:** Phase 1A integration spike (`spike-config-dir.ts`, commit `cd3a311`). See `spikes/cc-pty/FINDINGS.md` for the full analysis.

## ADR-019 (2026-05-14) — Logger cornerstone shape: ring buffer + JSONL file + IPC broadcast subscribers

**Context:** Spec §6 made observability a cornerstone but left implementation specifics open. Phase 1B implementation chose three fan-out sinks per record and a few specific shape decisions.

**Choices:**
- **Three sinks per record:** in-memory `RingBuffer<LogRecord>` (capacity 5000), `FileSink` (daily-rotating JSONL files under `~/.tokenless/logs/`, 30-day retention), and an IPC subscriber pool (the `LogBridge` subscribes once and broadcasts to all renderer windows). Each record fans out to all three.
- **`errorBoundary` returns `undefined` on throw, not rethrowing.** Forces every call site to handle absence-of-result explicitly. Catches the "I forgot the error path existed" bug class.
- **Renderer records are materialized in the renderer.** The renderer's `rendererLogger` builds the `LogRecord` (id, ts, source='renderer', fingerprint) and ships it via IPC. Main's `logger.ingestFromRenderer` does NOT re-materialize. This means renderer records preserve their `source: 'renderer'` field and don't get incorrectly tagged as main.
- **Fingerprint algorithm differs main vs renderer.** Main uses SHA-256 truncated to 16 hex chars (via `node:crypto`). Renderer uses a simple polynomial hash truncated to 8 hex chars (synchronous; `crypto.subtle.digest` is async-only). Both fingerprints satisfy the same purpose: deduplicate AI error analysis caching (per spec §6.5). They don't need cryptographic strength — they need stability per `(category, event, stack)` tuple.
- **Categories are a closed enum.** Adding a new category requires changes to `src/shared/observability.ts` AND `docs/observability.md`. This prevents drift and keeps Dev Mode filter chips finite.

**Reasoning:**

- Three sinks because: ring buffer is for fast Dev Mode display; file sink is for forensic debugging post-crash; subscribers are for live UI streaming. Each addresses a different access pattern; combining into one would compromise on at least one.
- 5000 record buffer: ~5MB at typical record size (~1KB JSON). Cheap, generous for active debugging.
- 30 days file retention: long enough for any "what happened last week" investigation; not so long that disk fills up. Trivial to adjust later.
- `errorBoundary` discipline: see "Choices" above. Caller-explicit handling matches the CLAUDE.md cornerstone directive that every error path has a user-facing recovery path.

**Discovered:** Phase 1B implementation. See `src/main/observability/` for the code, `docs/observability.md` for the usage manual.

## ADR-020 (2026-05-14) — Date strategy: local time for both log files and Dev Mode display

**Context:** Phase 1B's final review caught a mismatch — `FileSink.dateString()` used `getUTCFullYear`/`getUTCMonth`/`getUTCDate` to produce filenames like `tokenless-2026-05-14.jsonl`, while `LogTableRow.formatTs()` used local-time getters for the Dev Mode panel display. A user in UTC+10 logging at 23:00 UTC would see the row labeled `09:00` (next-day local) but find it in a UTC-dated file from the prior day — a mental-model mismatch.

**Options:**
- A) All UTC. Aligns with backend logging conventions; predictable across timezones. But every user has to do timezone math when correlating a Dev Mode row to a file.
- B) All local time. Aligns with user mental model. Filenames and row labels match. Cross-timezone correlation (e.g., sharing a log file with someone in another zone) requires noting the originating timezone, but that's a niche case.

**Choice:** B — local time everywhere.

**Reasoning:** TokenLess is a single-user developer tool. The user looks at Dev Mode rows and at their `~/.tokenless/logs/` directory through the same mental model: "what was happening on Tuesday afternoon?" Both should agree on what counts as Tuesday. Cross-zone log sharing is rare; when it happens, the JSON `ts` field (epoch ms) carries timezone-independent truth.

**Implications:**
- `FileSink.dateString()` switches from `getUTC*` to local-time getters.
- File-sink tests use local-time constructors (`new Date(2026, 4, 14, 23, 0, 0)`) so assertions hold in any test machine's timezone.
- `LogTableRow.formatTs()` remains unchanged (already local).

**Discovered:** Phase 1B final code review.

## Implementation note (Phase 2A) — @xterm/addon-fit version

The Phase 2A plan migrated `xterm-addon-fit@^0.8` → `@xterm/addon-fit@^0.8`. At install time, no `^0.8` version of the scoped `@xterm/addon-fit` package exists on npm — the migration to scoped names was accompanied by a major version bump and the lowest published version is `0.11.0`. The install resolved to `@xterm/addon-fit@^0.11.0`. The addon API is unchanged across the rebrand, so this is a non-issue for downstream code; logged here so future plans don't waste time reconciling the version difference.

## ADR-021 (2026-05-14) — Cross-cutting UI primitives: generic Dropdown + InfoTooltip

**Context:** Phase 2A introduced two dropdown components (ProjectSwitcher, AccountSwitcher) with structurally identical logic — open/close state, outside-click handling, Escape handling, menu rendering, item ARIA. Phase 2B adds 4+ more (Model, Breadth, Format, Skill in ConfigsRow). Phase 2A's marker comments flagged that a 3rd instance should trigger extraction.

Phase 2B also needs a tooltip system — per spec §6.4 / brainstorm Q-G, tooltips should be context-aware (text changes by current state) and outcome-aware (text cites real telemetry). This is cross-cutting too: every config control, every meaningful button, every metric in the telemetry strip can benefit.

**Choices:**

- **`useDropdown()` hook** owns the open/close state, outside-click listener, and Escape handler. Returns `{ open, setOpen, toggle, rootRef }`. Tested in isolation under happy-dom.
- **`<Dropdown>` component** is a thin shell on top of the hook. Takes typed `items: { value, label, description? }[]`, an `activeValue`, an `onSelect` callback, and an optional `renderItem` for custom item bodies. Handles menu styling + full ARIA menu pattern (`role="menu"` / `"none"` / `"menuitem"`, `aria-haspopup`, `aria-expanded`).
- **`<InfoTooltip>` component** wraps children with a focusable `(i)` icon. Always renders `helperText`. Optional `contextFn() => string | null` and `outcomeFn() => string | null` add additional lines when truthy. Open state is internal; hover and focus both trigger it.

**Reasoning:**
- The 4-instance dropdown explosion in ConfigsRow forced the extraction; deferring further would have meant 4 near-identical copies.
- Separating the hook from the component lets future Phase 5+ components (search-as-you-type combobox, multi-select chip selector, etc.) reuse the open/close discipline without inheriting the typed-items shape.
- InfoTooltip's `contextFn` and `outcomeFn` are deliberately simple closures (no DI of state, no observer subscriptions). They're called on every render and should be pure. Phase 5 will pass real telemetry-driven closures from a hook like `useSavingsTelemetry()`.

**Implications for Phase 2B and beyond:**
- ProjectSwitcher and AccountSwitcher refactor to thin wrappers that pass typed items to `<Dropdown>` (Tasks 5-6 of Phase 2B).
- ConfigsRow uses 4 `<Dropdown>` instances directly.
- Tooltips appear on individual config dropdowns and on telemetry strip metrics. For Phase 2B, `contextFn`/`outcomeFn` return static stubs; Phase 5 wires real per-state and per-telemetry data.

## ADR-022 (2026-05-14) — Dedicated `--tl-z-gear-review` token above the dev toggle overlay

**Context:** The Dev Mode toggle button (`.app__dev-toggle` in `src/renderer/src/styles.css`) is `position: fixed` at `z-index: var(--tl-z-modal)` (200) so it floats above the regular shell. When the user clicks "Gear" and the composer transitions into the inline 2-pane GearReviewPane (per ADR-004), the pane sits inside the composer area but visually overlaps the dev toggle's fixed footprint near the top-right. Without an explicit stacking context, the dev toggle painted on top of the gear review header, obscuring the cancel button and disrupting the focused "review then send" flow.

**Options considered:**
- A) Hide the dev toggle while GearReviewPane is mounted. Couples an unrelated UI primitive to a feature; awkward for users mid-review who want to peek at logs.
- B) Lower the dev toggle's z-index. Defeats its purpose as a globally-accessible overlay.
- C) Use `calc(var(--tl-z-modal) + 10)` directly on the pane. Works but is ad-hoc and hides the layering intent.
- D) Add a dedicated `--tl-z-gear-review` token between `--tl-z-modal` (200) and `--tl-z-toast` (300), and apply it from the pane.

**Choice:** D — `--tl-z-gear-review: 210` in `tokens.css`, referenced from `gear-review/styles.css`.

**Reasoning:** Gear review is a transient, focus-stealing surface that semantically sits *above* the modal/overlay layer (which is where the dev toggle lives) but *below* toasts (which should still surface success/error feedback during a review). A named token makes the stacking order self-documenting and keeps token discipline — no inline `calc()` workarounds drifting through component CSS. Toast remains the top layer; the dev toggle remains globally accessible everywhere except behind the gear review pane, which is the correct trade-off for a review-in-progress.

**Discovered:** Phase 2B during integration of GearReviewPane with the global dev toggle overlay.

## ADR-023 (2026-05-14) — SQLite via better-sqlite3, stored under `app.getPath('userData')`, schema applied by an idempotent migration runner

**Context:** Phase 3 needs persistent storage for projects, conversations, turns, accounts, drafts, templates, and settings. The spec (§3) prescribes "all persistence in one SQLite file" with version-numbered migrations and no ORM.

**Options considered:**
- A) better-sqlite3 (synchronous, native, fastest read path; well-supported on Electron)
- B) sql.js (pure-JS, WASM-backed; no native build but slow + can't write to disk transactionally)
- C) node-sqlite3 (async, callback-style, slower than better-sqlite3 in practice)

**Choice:** A — better-sqlite3 11.x. DB path = `path.join(app.getPath('userData'), 'tokenless.db')` (resolves to `%APPDATA%/tokenless/tokenless.db` on Windows). Native module rebuilt for Electron's ABI via `@electron/rebuild` in `postinstall`.

**Schema strategy:** All DDL lives in `src/main/db/migrations/NNN_*.sql`. A `_meta` table tracks `(version INTEGER PRIMARY KEY, applied_at INTEGER)`. At startup, the migration runner reads applied versions, applies any newer ones inside a transaction, and records the version. Order is deterministic via the numeric prefix. The whole startup is wrapped in `logger.errorBoundary('db', …)` — a corrupt DB surfaces as a fatal log and a user-facing error rather than a silent crash.

**Why `userData` over the spec's `~/.tokenless/`:** the spec was written platform-agnostically. `app.getPath('userData')` is the Electron convention, gets backed up with the user profile on Windows, and avoids polluting the user's home directory. Log files (Phase 1B) live under `~/.tokenless/logs/` for now — we'll consider migrating them in Phase 8 polish if it matters.

**Reasoning:** better-sqlite3's synchronous API drastically simplifies DAO code (no `await` rabbit hole through every handler), and its per-op latency on small queries is in the microsecond range — well under the IPC roundtrip cost. We accept the native-rebuild cost (mitigated by `postinstall` hook) because the alternative (sql.js) can't durable-write and the async wrapper (node-sqlite3) makes the code harder to test.

## ADR-024 (2026-05-14) — Dual-ABI workflow for better-sqlite3: explicit `rebuild:electron` / `rebuild:node`, no `postinstall` (supersedes ADR-023's postinstall claim)

**Context:** better-sqlite3 is a native module — its compiled `.node` binary is ABI-specific. Electron 32 bundles a Node.js with `NODE_MODULE_VERSION 128` while host Node 20 (used by vitest, `npm ci`) is `MODULE_VERSION 115`. Only one binary can exist on disk at a time. Discovered during Task 16 smoke-testing when the Electron launch failed with: *"compiled against a different Node.js version using NODE_MODULE_VERSION 115. This version of Node.js requires NODE_MODULE_VERSION 128."*

**Options considered:**
- A) Keep `postinstall: electron-rebuild` → after `npm ci`, binary is for Electron. Tests under host Node fail.
- B) Run tests inside Electron (electron-mocha / playwright-electron). Heavyweight; slows the inner-loop dramatically.
- C) Explicit `rebuild:electron` / `rebuild:node` scripts. Developer / CI runs the right one before each task.
- D) Ship both binaries (rename + dynamic load). Fragile; not supported by better-sqlite3 upstream.

**Choice:** C. Remove `postinstall`. Add two explicit scripts:
- `npm run rebuild:electron` → `electron-rebuild --force --module-dir node_modules/better-sqlite3`
- `npm run rebuild:node` → `npm rebuild better-sqlite3`

CI's e2e job runs `rebuild:electron` after `npm ci` and before `npm run build` / `npm run test:e2e`. The unit-and-integration job runs `npm ci` only — the prebuild-install fetched during `npm ci` matches the host Node ABI, which is what vitest needs.

Developers wanting to run `npm run dev` or `npm run test:e2e` locally run `npm run rebuild:electron` once. To switch back to running tests, `npm run rebuild:node`.

**Reasoning:** The dual-ABI cost is real but localized. Making it explicit puts the rebuild step where it belongs (next to the workflow that needs it) and avoids surprising silent ABI mismatches. The alternative — running unit tests inside Electron — would add ~5–10 s per test invocation and complicate vitest's `happy-dom` environment, with no observability/debugging gain. The workflow steps are obvious from the script names (`:electron` vs `:node`).

**Supersedes:** ADR-023's "Native module rebuilt for Electron's ABI via `@electron/rebuild` in `postinstall`" claim. That worked for the spike but breaks once tests reference the same module.

**Discovered:** Phase 3 Task 16, during the post-wiring smoke test.

## ADR-025 (2026-05-14) — Renderer hook pattern for IPC-backed data: fetch on mount, refetch on change-event broadcast

**Context:** The renderer needs project/conversation/account lists with reasonably current data without polling and without overcomplicating with a state library.

**Options considered:**
- A) React Query / SWR (rich cache, devtools, but adds 8–12 KB gzipped + a dependency)
- B) Zustand / Jotai global store (manual cache invalidation)
- C) Hand-rolled hooks: fetch on mount, refetch when main emits `<channel>:changed`

**Choice:** C — `useProjects`, `useConversations`, `useAccounts`. Each subscribes to its own `*:changed` IPC event. The mutation methods (`create/update/delete`) don't optimistically update — they return after the broadcast triggers a fresh fetch.

**Reasoning:** The dataset is tiny (projects + conversations measured in dozens), reads are near-free (in-memory SQLite via better-sqlite3), and we have only one window. Adding a cache library here would optimize a cost that doesn't exist. If Phase 7's branching or templates UI develops complex client cache behavior we can revisit.

## ADR-026 (2026-05-14) — Mock-claude binary for CI E2E (TOKENLESS_CLAUDE_BIN override)

**Context:** Phase 4A E2E tests need to verify the cc:start / cc:send / cc:output-chunk loop end-to-end. CI runners don't have `claude` installed, authenticated, or quota — and even if they did, real claude responses are non-deterministic. Without a stand-in, the entire cc subsystem would be untestable in CI.

**Options considered:**
- A) Mock node-pty at the import level (vi.mock in unit tests). Works for unit tests but not E2E — E2E launches the built Electron app which loads node-pty natively.
- B) Conditionally skip cc E2E tests in CI. Defeats the purpose of E2E; the integration we most want to verify (spawn → write → read → exit) is the part that gets skipped.
- C) Spawner reads `TOKENLESS_CLAUDE_BIN` env var. Defaults to `claude.cmd` on Windows / `claude` elsewhere. Tests + CI set this to a deterministic mock binary that mimics the claude protocol surface we care about.

**Choice:** C. `test/doubles/claude-mock.cjs` is a tiny Node script that:
1. Writes a "claude-mock> " prompt to stdout on startup
2. Reads stdin line by line; for each non-empty line, writes `[mock-claude] received: <line>` + a fresh prompt
3. Exits cleanly on stdin close / SIGTERM / SIGINT
4. Acknowledges the `--session-id <uuid>` arg (so we can verify ADR-016's pre-specification flows through correctly)

A `.cmd` wrapper (`claude-mock.cmd`) lets Windows spawn the `.cjs` via cmd.exe — same dispatch pattern as ADR-017's `claude.cmd`.

**Reasoning:** Keeps the E2E surface honest: the test really does spawn a process, really does write to a PTY, really does read bytes back. The only fakery is the response content — which is the right place to fake, since real claude responses are unstable. Phase 4B's parser tests will use richer mock outputs (tool-call markers, end-of-response indicators) without changing this architecture.

**Discovered:** Phase 4A E2E design.

## ADR-027 (2026-05-14) — PTY lifecycle ownership: CcLifecycle owns the conversationId → PtyHandle map; one PTY per conversation

**Context:** Where does the per-conversation PTY state live? Options range from "stateless — renderer holds it" to "fully encapsulated — main process owns it." The renderer cannot hold PtyHandles (they're not serializable across IPC), so the question is about how the main-process state is shaped.

**Options considered:**
- A) Per-window/per-renderer map (one PTY per window). Doesn't compose with multi-conversation workflows.
- B) Per-Conversation map, owned by a single CcLifecycle singleton in main. Each `start` mutates the map; each `stop` / `closeAll` clears it. The IPC handler is a thin wrapper.
- C) Per-Conversation Actor model (each Conversation is an actor with its own message queue). Overkill for Phase 4A's one-send-at-a-time semantics.

**Choice:** B. CcLifecycle holds a `Map<number, Slot>` where `Slot = { conversationId, sessionId, pty }`. Two conversations can have live PTYs simultaneously (e.g., user has two tabs/projects); one conversation cannot have two PTYs at once (start throws if a slot already exists). PTY data + exit events fan out via constructor callbacks (`onChunk`, `onExit`) — not EventEmitter — for trivial test ergonomics.

**Invariants:**
- `start(conversationId)` is the only path that adds to the map
- `stop(conversationId)` and `closeAll()` are the only paths that remove (plus the implicit removal in the onExit handler)
- The PtyHandle never leaves CcLifecycle — only event payloads + sessionId cross the IPC boundary

**Reasoning:** Single owner = single source of truth. Easy to test (inject a MockPty factory). Easy to reason about shutdown (closeAll in before-quit kills everything synchronously). The "one PTY per conversation" rule prevents the "two sends in flight to the same PTY" failure §7.7 — the renderer can't accidentally create the race because main rejects the second start.

**Future:** Phase 4B's resume flow will distinguish "no live PTY but has stored cc_session_id" (resume path) from "no live PTY ever" (error path). The slot map remains the right place to look this up.

**Discovered:** Phase 4A lifecycle design.

## ADR-028 (2026-05-14) — Output parser is a pure-state line matcher; ANSI strip first, pattern match second

**Context:** Phase 4B introduces a parser over claude's stdout/stderr stream to detect prompts, tool calls, response-complete markers, and token usage. The parser sits between PTY chunks (raw bytes including ANSI) and the renderer's UI state (xterm shows raw chunks, the rest of the UI consumes typed CcEvents).

**Options considered:**
- A) Parse against raw ANSI-containing text. Brittle — escape sequences can appear inside what looks like a pattern.
- B) Pre-strip ANSI then run regex/state matchers against clean text. Slightly more compute (each chunk passes through two passes), but matches are reliable.
- C) Use a parser combinator library. Overkill for ~4 patterns.

**Choice:** B. `AnsiStripper` (CSI + OSC state machine) runs first; `CcParser` runs second over its output. Both are pure state — they hold buffered state across chunks (a partial sequence, a partial line) but emit deterministic output for any given input sequence.

**Patterns recognized in Phase 4B:**
- `claude-mock>` or `>` alone on a line → `prompt-ready`
- `[mock-claude] received:` → `response-complete`
- `tokens: <used>/<total>` → `tokens-used`
- `tool: <name>(<summary>)` → `tool-call`

These are deliberately conservative — built around the mock-claude's output so the parser can be unit-tested. Phase 4D will calibrate against real claude's output formats (which evolve with the CLI) and add quota / auth / resume-failed patterns from §7.1.

**Reasoning:** ANSI stripping has a stable spec (CSI + OSC are well-defined). Pure-state matchers are trivial to test. The tolerance behavior (unknown lines ignored) means claude CLI updates won't break the parser — they'll just stop emitting some events until we update the patterns. The downside — events emit only when a line completes — is acceptable: token counts and tool calls are line-oriented anyway.

**Discovered:** Phase 4B parser design.

## ADR-029 (2026-05-14) — Telemetry tick design: 3s interval, server-coalesced, conversation-scoped

**Context:** Phase 4C wires the ContextBudgetMeter to real values from the parser's `tokens-used` events. The naive design — fire a `telemetry:tick` IPC for every parser event — would flood the IPC channel during active streaming. A coalescing emitter trades latency for bandwidth.

**Options considered:**
- A) Per-event IPC: every `tokens-used` parser event broadcasts immediately. Simple but high-frequency. Renderer must dedup.
- B) Renderer-side coalescing: parser events flow as cc:event; renderer derives telemetry from them with its own debounce. Couples telemetry shape to the parser event shape.
- C) Main-side coalescing: `TelemetryEmitter` keeps per-conversation latest state, fires a single `telemetry:tick` on a fixed interval (3s) only when the value changed since the previous flush. One IPC payload type per tick. Renderer just consumes the tick.

**Choice:** C — `TelemetryEmitter` in `main/cc/`. Interval is 3 seconds (matches the spec's "every ~5s" tolerance — 3s gives a smoother UI without being chatty). Per-conversation dirty flag means an idle conversation generates zero ticks even though the emitter is running. Phase 5 will extend the `TelemetryTick` payload with cost fields (`$ spent`, `model usage breakdown`) without changing the cadence.

**Reasoning:** Main-side coalescing keeps the renderer's data shape stable across phases. The 3s cadence is fast enough that the user perceives the meter as live (claude streams responses over many seconds anyway) and slow enough that we won't crash the IPC under burst load. Test ergonomics are clean — the emitter takes an injectable interval and a clock-friendly `emit` callback.

**Trade-offs:**
- A 3s delay between the parser seeing a `tokens-used` line and the user seeing the meter update. Acceptable.
- Multi-conversation users see two independent meters tick on their own schedules — that's correct (no cross-talk).

**Phase 5 extension:** the `TelemetryTick` interface has comment-marked Phase 5 fields. When the Anthropic SDK lands, the emitter will also fold in `$ spent` derived from per-turn token counts × model-specific pricing.

**Discovered:** Phase 4C telemetry wiring.

## ADR-030 (2026-05-14) — Anthropic SDK wrapper: typed errors, transparent retry for 429/5xx, recorded fixtures for tests

**Context:** Phase 5A integrates the Anthropic Messages API for gearing. The raw SDK throws strongly-typed errors but is awkward to test (real API calls) and doesn't retry by default. Spec §7.2 prescribes specific recovery for 401, 429, 5xx, network, malformed JSON.

**Options considered:**
- A) Use the SDK directly inside the gearing engine. Simple but couples gearing to retry / fixture-replay logic.
- B) Thin wrapper that exposes `complete(request)` returning a discriminated union `OK | typed error`. Wrapper owns retry + classification. Tests inject a `MockAnthropicClient` that implements the same interface.
- C) Full HTTP client abstraction. Overkill — the SDK already handles HTTP.

**Choice:** B. `AnthropicClient` class with one method: `complete(request): Promise<Result<MessageResponse, ApiError>>`. Internally retries 429 and 5xx with exponential backoff + jitter (3 attempts total). Classifies errors:
- `API_AUTH_FAILED` (HTTP 401) — non-retried
- `API_RATE_LIMITED` (HTTP 429) — retried, exposed if exhausted
- `API_SERVER_ERROR` (HTTP 5xx) — retried, exposed if exhausted
- `API_NETWORK_DOWN` (fetch reject before any HTTP response) — non-retried
- `API_TIMEOUT` (request timeout — default 30s) — non-retried in Phase 5A; Phase 5B may add retry
- `API_UNKNOWN` (anything else) — non-retried

**Fixture pattern:** `test/fixtures/api/<scenario>.json` stores a complete `MessageResponse` shape. `MockAnthropicClient` is constructed with a mapping `Map<string, MessageResponse>` and routes by a request signature (model + first 200 chars of system + first 200 chars of user). Initial fixtures are hand-synthesized to match the Haiku output shape; `npm run fixtures:record` (added in Phase 5B) regenerates them against the real API.

**Reasoning:** A thin wrapper keeps the engine pure (deterministic given client output) and makes the failure surface explicit at the type level. Transparent retry for 429/5xx mirrors what users expect from a robust client — the UI only sees the final outcome, not the intermediate attempts. Recorded fixtures keep tests fast, deterministic, and free of API costs.

**Discovered:** Phase 5A API design.

## ADR-031 (2026-05-14) — Gearing system prompt versioning + JSON-only response contract

**Context:** Phase 5A's gearing engine sends a Haiku call with a system prompt that defines the gearing rules + the strict JSON response shape. Two related decisions: where the prompt lives, and how we enforce the response shape.

**Choice:**
1. **System prompt is a markdown file** at `src/main/gearing/system-prompt.md`, loaded via Vite's `?raw` import. The build inlines its content into the main bundle.
2. **Response shape is enforced server-side by Zod** in `gearing/parser.ts`. The system prompt tells Haiku to return JSON-only (no fences, no prose); if it disobeys, the parser strips fences as a kindness and Zod-validates the structure. Failures map to `GEAR_PARSE_FAILED`.
3. **Versioning is implicit via git history.** When the prompt changes, the commit message documents the change. Test fixtures in `test/fixtures/api/` are regenerated against the new prompt (Phase 5B adds the regeneration script). If a fixture's gearing call signature changes such that the existing fixture no longer matches, the test fails loudly — the fixture file itself becomes the version marker.

**Reasoning:** Markdown is human-readable + diff-friendly + easy to maintain. The `?raw` Vite pattern (used since Phase 3 for SQL migrations) is already proven in the build. Zod validation keeps the parser tolerant of formatting variance (the fence-stripping kindness) while strict about structure. Implicit git versioning avoids over-engineering a registry for a single prompt; Phase 7+ may add a real prompt-versioning table if we run experiments.

**Discovered:** Phase 5A gearing engine design.

## ADR-032 (2026-05-15) — Background summary refresh: per-conversation debounced Haiku call on response-complete

**Context:** ADR-014 prescribes refreshing the rolling Haiku summary after every completed assistant turn. Phase 4B's parser already emits `response-complete` events. Phase 5B wires those events to a Haiku call that updates `conversations.summary` so future gearings see fresh context.

**Options considered:**
- A) Refresh on EVERY `response-complete` event, blocking the next user action until done. Adds per-turn latency and burns tokens for users who don't gear again immediately.
- B) Refresh inside the gearing flow only (lazy). Cheaper but means the FIRST gear after a long claude session sees a stale summary.
- C) Refresh in the BACKGROUND with per-conversation debounce (500ms) so rapid-fire response-complete events coalesce into one Haiku call.

**Choice:** C — `SummaryRefresher` in `main/gearing/`. Per-conversation debounce timer; on `response-complete`, schedule a 500ms timer (or reset an existing one); when it fires, run the refresh.

**Refresh algorithm:**
1. Read the conversation's prior summary + last N turns (default 6 — covers most claude session shapes).
2. Build a Haiku message: system prompt asks "produce a 200-token summary of this conversation's purpose + current state".
3. Call `anthropicClient.complete(...)`.
4. On success: `ConversationsDao.updateConversation({ id, summary, summaryUpdatedAt: Date.now() })`. Log `summary-refresh-ok` info.
5. On failure: log `summary-refresh-failed` warn. NO toast (per spec §7.2 row 6 — silent failure; use stale summary).

**Reasoning:** Background + debounce balances freshness with cost. Failures are invisible because a stale summary is OK — the rolling summary is an OPTIMIZATION, not a correctness primitive. Phase 5A's gearing engine works WITHOUT a fresh summary (the system prompt doesn't require one; it just helps with multi-turn context). This isolates the summary subsystem from the user's main flow.

**Trade-offs:**
- Two consecutive sends with claude responses ~1s apart: only one summary refresh happens (debounce). User won't notice.
- A claude crash mid-stream means `response-complete` never fires; the summary stays stale. Acceptable — Phase 4C's crash detection handles the user-visible side.
- Summary refresh fires per cc:event broadcast, NOT per turns table row. The two are correlated but not 1:1. Phase 5B accepts this; Phase 6 may revisit.

**Discovered:** Phase 5B summary refresh design.

## ADR-033 (2026-05-15) — Drafts auto-save: 750ms debounce per conversation; null-conversation drafts NOT persisted

**Context:** ADR-013 prescribed per-conversation auto-saved drafts (750ms debounce, cleared on Send). Phase 7A implements it.

**Three sub-decisions:**

1. **The drafts table's `UNIQUE(conversation_id)` has weird NULL semantics in SQLite** — multiple NULL rows are allowed. To avoid an unbounded pile of "no-conversation" drafts, Phase 7A drafts ONLY save when `conversationId !== null`. The Composer can still have a typed prompt without an active conversation; it just won't survive process restart in that state. The user can always create a conversation first if they care about persistence.

2. **Load timing:** the hook fetches on mount + on conversationId change. Saves are suppressed until the load finishes (a `initialLoadDone` ref guard) to prevent racing the load → "save empty string overtop of the draft" bug.

3. **Clear on Send wins:** Send fires `clearDraft()` BEFORE the next debounce tick. We cancel the pending timer and set a `cancelled` flag so the next effect re-render doesn't immediately schedule another save (which would happen because `prompt` just changed to `''`).

**Reasoning:** Simple, predictable. The null-conversation exclusion is the only design liberty taken — UX cost is low (rare case) and it sidesteps SQLite UNIQUE-NULL footguns.

**Discovered:** Phase 7A draft-autosave wiring.

## ADR-034 (2026-05-15) — Per-account ANTHROPIC_API_KEY stored plaintext in `accounts.api_key_ref`; OS keychain migration deferred to Phase 8

**Context:** ADR-018 (2026-05-14) prescribed per-account API key injection but left the storage backend open ("opaque keychain reference"). Phase 6A actually wires per-account keys for the first time. Two implementation options:

A) OS keychain (Windows Credential Manager via a native module like `keytar` or `windows-credential-manager`). Encrypted at rest, accessible to TokenLess only.
B) Plaintext in the existing `api_key_ref` column of the SQLite DB. Simple, no new native modules, fits the existing migration story.

**Choice:** B for v1. The `api_key_ref` column name is preserved (semantic mismatch acknowledged); the field stores the literal API key string.

**Reasoning:**
- The keychain approach adds a Windows-only native module (cross-platform fork later) plus a runtime dependency on a service that can be locked.
- The DB file lives at `app.getPath('userData')/tokenless.db`. On Windows that's `%APPDATA%/tokenless/` — protected by NTFS user permissions. Backups of `%APPDATA%` (e.g., OneDrive) WILL include the key. Acceptable risk for v1 (the user opts in by setting a key in their account).
- Plaintext lets the user inspect / export / migrate keys with standard tools. The keychain approach makes recovery scenarios (DB corruption, account migration) harder.
- Phase 8 polish adds a `Settings → Security` view that can offer "move to keychain" as an opt-in migration. The schema column name `api_key_ref` is forward-compatible: if Phase 8 stores a keychain handle instead, no migration needed.

**Storage shape:** column `accounts.api_key_ref TEXT` — already exists from Phase 3. Phase 6A stores the literal key (e.g. `sk-ant-api03-...`) directly. TypeScript field renamed to `apiKey` for clarity.

**Tradeoffs:**
- Backup snapshots contain keys. Document this in the Settings UI.
- Reading the DB while running has no encryption layer. Acceptable for a single-user desktop app.

**Discovered:** Phase 6A multi-account auth wiring.


## ADR-035 (2026-05-15) — Last-active selections persisted via the `settings` key/value table; restore on mount with fallback if the target is missing

**Context:** Phase 6B needs to remember which account + project the user had selected at the last session, so reopening the app doesn't dump them back to defaults.

**Options considered:**
- A) Dedicated `app_state` table with one row. Overkill for two fields.
- B) JSON file at `userData/last-active.json`. Adds a second persistence mechanism.
- C) Use the existing `settings(key, value)` table (schema landed Phase 3, never wired). Two rows: `lastActiveAccountId`, `lastActiveProjectId`. Values are stringified ints.

**Choice:** C.

**Reasoning:**
- The `settings` table was designed exactly for this — Phase 3 just never wired it.
- Phase 8 will add more app-wide singletons here (theme preference, send-confirm toggle, etc.). One table, one access pattern.
- On boot, AppShell reads both keys in parallel, validates the IDs still exist in the current `accounts` / `projects` lists, and only sets state via a functional setter (`(current) => current ?? id`) — so the restore never clobbers a value the user has already picked between mount and when the async read resolves. If the stored ID is stale (the account/project was deleted in a prior session), it's silently ignored and the existing "first-in-list" default-picker effect runs as fallback.

**Trade-offs:**
- The renderer makes 2 IPC calls on mount (async). Acceptable — the activeAccountId/activeProjectId state briefly shows null before snapping to last-active. Phase 8 could batch via a single `settings:get-batch` IPC if it matters for UX.
- Stale IDs are silently ignored (no toast). The fallback picker covers it.
- Persist failures are warn-level (non-critical); the next launch loses the most-recent active id but nothing else.

**Discovered:** Phase 6B account+project CRUD work.


## ADR-036 (2026-05-15) — Skills discovery: scan-on-boot + chokidar watcher; never delete rows, mark stale instead

**Context:** Phase 6C lands the skills subsystem per spec §5.3. Three roots: `~/.claude/skills/`, `~/.claude/plugins/*/skills/`, `<project>/.claude/skills/`. Each skill = a directory containing a `SKILL.md` file with `name` + (optional) `description` in frontmatter.

**Options considered for missing skills:**
- A) DELETE rows whose paths are no longer on disk. Simple, but loses the user's favorited/hidden state if they uninstall+reinstall a skill.
- B) Mark `last_seen_at` stale (older than the current scan timestamp). Preserves all state; downstream queries can filter `last_seen_at < cutoff` if they need "currently installed only".
- C) Soft-delete flag (separate column). Same effect as B with more schema.

**Choice:** B.

**Reasoning:**
- The user's favorited/hidden state is the only durable per-skill data we own. Losing it on a transient filesystem change (e.g., a plugin update temporarily renames a directory) is bad UX.
- `last_seen_at` is already in the schema (Phase 3); using it as the staleness marker is the lowest-impact path.
- The dropdown in Composer can still filter out skills with `last_seen_at < (now - 7days)` if "currently installed only" becomes a feature — defer that until a user complains.

**Scanner architecture:**
- `scanner.ts` is pure relative to fs: all calls go through an injectable `ScannerOptions` interface so unit tests use an in-memory map without touching disk.
- `reconciler.ts` is pure relative to the DB. Owns the upsert + mark-stale logic.
- `watcher.ts` wraps chokidar with a 1s debounce. `chokidarFactory` is injectable for tests.
- The three are wired in `main/ipc/index.ts` at boot. Initial scan kicks off explicitly via `watcher.start()` — chokidar's `ignoreInitial: true` keeps boot-time `add` events from flooding the watcher (we'd otherwise get one event per existing skill file).

**Frontmatter parser:**
- Inline minimal YAML parser (key: value lines between `---` fences). Supports quoted strings. Does NOT support nested objects, arrays, or multiline strings — none of which the SKILL.md format requires.
- Falls back to the body's first paragraph as description if frontmatter omits `description`.

**Migration 002:** added `UNIQUE INDEX idx_skills_path ON skills(path)`. Required for the DAO's `ON CONFLICT(path) DO UPDATE` upsert. Phase 3's original `skills` table declared `path TEXT NOT NULL` without UNIQUE — corrected without rewriting migration 001 (append-only migrations is the project rule).

**Project-local skills:** Phase 6C resolves `~/.claude/skills/` + `~/.claude/plugins/*/skills/` only. The `<project>/.claude/skills/` root is supported by `resolveSkillsRoots` but not wired in `main/ipc/index.ts` (active project tracking is Phase 7). When that lands, only the call site changes — the scanner/reconciler/watcher are already project-aware.

**Discovered:** Phase 6C implementation.


## ADR-037 (2026-05-15) — Turn capture: one user-side write at Send, one assistant-side write on response-complete; ResponseAccumulator owns the bracketing

**Context:** Phase 7B closes the persistence gap where the `turns` table was being written only on the user side (via an inline INSERT in `cc-handler.send` that conflated original vs. final text and skipped tokens entirely), with no assistant rows ever written.

**Options considered:**
- A) Write user + assistant turns in cc-handler.send (assistant in a setTimeout). Doesn't actually capture text — the response hasn't arrived yet.
- B) Subscribe to cc:output-chunk in the renderer and write turns from there. Crosses the main/renderer boundary unnecessarily; the main process already has the stream.
- C) **Chosen.** Extend the PTY parser to emit `response-chunk` for non-event lines; introduce `ResponseAccumulator` per-slot that buffers chunks between user-send (`startCollecting()`) and `response-complete` (drain). On drain, lifecycle hooks call `TurnsDao.createAssistantTurn` via a new `onAssistantTurn` callback.

**Why C:**
- Single source of truth: lifecycle owns the per-PTY accumulator just like it owns the parser. No renderer logic needs to know about turn persistence.
- Pure functions are testable: accumulator + parser logic are isolated and unit-tested without touching DB or PTY.
- Pre-existing `response-complete` event from Phase 4B already exists — we hook the data flow into the same event boundary.
- `cc-handler.send` becomes the single user-side write site via `TurnsDao.createUserTurn` (replaces the inline INSERT that Phase 5 added).

**GearMeta on user turn:** when Send fires from the GearReviewPane, the renderer threads `{ originalPrompt, gearedPrompt, originalTokens, gearedTokens, haikuMetaTokens, critiqueFlags }` through `cc:send`. TurnsDao writes all of it into one user-turn row. Plain Send passes `gearMeta: null` and the user turn ends up with `original_prompt = req.prompt` (no geared variant; that's correct semantically).

**Critique flag lossy mapping:** `GearMeta.critiqueFlags: readonly string[]` stores `"<severity>: <message>"` strings. The full `CritiqueFlag { severity, message }` shape from the gearing API is collapsed at the Composer's `handleGearSendGeared` mapping. For v1 telemetry / replay this is sufficient; Phase 7C/8 may extend the schema if structured critique becomes important.

**Feedback model:** assistant turns get a nullable `feedback` column accepting `'up' | 'down' | 'shrug'`. The Composer mounts a `TurnFeedbackBar` ONLY when the latest turn is an unrated assistant turn (so it disappears after clicking and doesn't reappear unless a new assistant turn arrives). Aggregate counts surface in the Dev Mode panel footer for v1; a per-project breakdown is Phase 6D / Phase 8 polish.

**Trade-offs:**
- The parser now emits one `response-chunk` event per non-event line — higher volume on the IPC channel. Acceptable: events are small + the existing throttle / IPC pipeline handles it. Phase 8 can debounce if measured to matter.
- The accumulator joins lines with `\n` — preserves original line breaks but loses trailing/leading whitespace from the raw PTY stream. Acceptable for prompt-feeding purposes; visual replay can fetch raw chunks separately if needed (post-v1 / replay UI).
- `responseTokens` comes from the most recent `tokens-used` event before `response-complete`. Real claude may not always emit `tokens-used` mid-stream; in that case we record `null`. UI must handle null (already does).
- A resumed conversation that's mid-response when restored will MISS that response's assistant turn (the accumulator starts fresh and isn't collecting). Acceptable for v1; the user gets to see the response on screen and the next turn captures normally.

**Discovered:** Phase 7B implementation; the gap was identified during Phase 6D telemetry-summary scope planning (turns table was being written too sparsely to support cost-over-time queries).


## ADR-038 (2026-05-15) — Telemetry summary: aggregate cost + net-savings derived in main process, fed from TurnsDao; period boundaries align to local-time day/week/month starts

**Context:** Phase 6D adds a per-user summary view of "what gearing has cost vs. saved." Phase 7B made the underlying `turns` table fully populated (user + assistant + token columns + `model_used`), so the aggregation is straightforward.

**Decisions:**

1. **Computation happens in main, not renderer.** The renderer asks for `TelemetrySummary` via `telemetry:get-summary` IPC; main runs the SQL (TurnsDao.getTokenSummary) + cost math (computeTelemetrySummary) + returns the finished object. Keeps the renderer free of pricing tables / cost math (which is duplicated in `useLiveCostEstimate` today — Phase 8 polish will consolidate).

2. **Period boundary = local time.** "Today" starts at midnight in the user's local timezone, "Week" at Monday 00:00 local, "Month" at the 1st 00:00 local. We don't try to sync across machines or accept a timezone parameter for v1. The renderer computes the boundary epoch-ms via `Date` and passes it as `sinceMs` to the IPC.

3. **Net savings can be negative.** If the user gears very short prompts, the haiku investment exceeds the savings. The UI surfaces this as "Cost $X" with red color (vs. "Saved $X" green). Rationale: hiding the negative case would be dishonest and prevent the user from learning that gearing isn't always worth it on tiny prompts.

4. **Haiku rows excluded from per-model breakdown.** The haiku model serves the gearing engine; its token usage is summed separately as `haikuCostDollars` (the "investment"). Per-model breakdowns show only models that actually answered user prompts (Sonnet, Opus, etc.).

5. **Refresh on `turns:changed`.** The renderer subscribes to the same broadcast that turn-feedback uses. A feedback click triggers a (cheap) refetch — acceptable for v1; Phase 8 can split the broadcast into `turns:created` vs `turns:feedback-changed` if measured to matter.

**Trade-offs:**
- Periods reset on calendar boundaries, not rolling windows. A user opening the app on Monday morning may see "$0 this week" briefly, even if they had savings on Sunday. Acceptable — calendar periods are what users intuitively expect.
- The savings calc uses the user-turn's `model_used` to price the original/geared diff. If the user changes model between gearing and sending, the savings number reflects the model at SEND time, not at GEAR time. Acceptable — they ARE sending to that model.
- `byModel` keys are the internal model keys (`'sonnet'`, `'opus'`), not the displayName. UI shows the raw key for v1; Phase 8 can join to PRICING.displayName.
- The Pill is hidden when there's NO usage data (haikuMetaTokens === 0 AND responseOutputTokens === 0). Prevents a useless "Saved $0.00" pill from cluttering the TopBar before the user has done anything.

**Discovered:** Phase 6D implementation; the gap was identified during Phase 6C scope planning and explicitly blocked on Phase 7B turn capture (so the math has data to operate on).


## ADR-039 (2026-05-15) — Templates: seeded built-ins are read-only; picker inserts body at the bottom of the composer with a single newline separator

**Context:** Phase 7D ships the templates feature per spec §2. v1 surface is a picker; the full `/templates` CRUD route is Phase 8.

**Decisions:**

1. **Built-ins are read-only.** Update + delete on a `builtin=1` row return business error code `BUILTIN_PROTECTED`. Rationale: built-ins are documentation of "the way TokenLess intends gearing to be used"; users can copy a built-in and edit the copy (Phase 8). Hiding the original would be a reasonable v1.5 feature.

2. **Seeding is idempotent by (builtin=1, name).** Re-running on every boot is safe. Adding a NEW built-in in a future release just adds it (existing rows by other names are unaffected). RENAMING a built-in would orphan the old row; if that becomes necessary, the seed function should grow a "deprecations" list. Not yet.

3. **Insert behavior: append, don't replace.** Clicking a template appends the body to the existing prompt with `\n` if non-empty, or replaces the empty composer with the body. Rationale: users may have already started typing context ("for the auth module, ..."); a template should COMPLEMENT, not stomp it. Power users can always select-all + delete first.

4. **Popover anchored to ActionsRow, opens upward.** The Templates button sits in `actions-row__secondary`; the popover renders above (bottom-up). Avoids collisions with the textarea above.

5. **No template variables (`{{file}}` etc.) in v1.** Templates are plain-text bodies. Phase 8 may add a templating language; YAGNI for v1.

6. **Code-focused built-ins, not project-management.** TokenLess wraps Claude Code — the 8 built-ins (Refactor for clarity, Add JSDoc, Write tests, Code review, Explain this code, Debug this error, Commit message, PR description) target common code-work prompts.

**Trade-offs:**
- Built-in-protected returns an error code, not a UI guard. The picker UI doesn't render edit/delete affordances on built-ins (Phase 8 view will). For v1 the picker is read-only — only the insert action.
- The 8 chosen built-ins are opinionated. Easy to extend in `seed-templates.ts`.
- Clicking outside the popover does NOT close it (only the × button or selecting a template closes it). Phase 8 polish can add an outside-click handler.

**Discovered:** Phase 7D implementation.

