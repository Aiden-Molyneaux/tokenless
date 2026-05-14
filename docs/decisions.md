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
