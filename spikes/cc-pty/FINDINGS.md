# cc-pty Spike Findings

**Date run:** 2026-05-14
**Platform:** Windows 10 Enterprise 25H2, Node v20.19.6, Electron ^32.3.3
**`claude --version`:** Claude Code v2.1.141

This document records what each spike actually proved (or didn't). Phase 4's CC subprocess module (`src/main/cc/`) reads this and uses it to make design decisions.

---

## spike-spawn — basic PTY + claude

**Status:** PASS

**What worked:**
- node-pty spawn of `claude` via `CreateProcess` (Windows) — once we used `claude.cmd` (see "What didn't")
- Writing a prompt followed by `\r` carriage return triggers claude to process the input
- Output streams back via `onData` chunks; reaches us within seconds
- xterm-256color, 100x30 terminal size — claude renders its full TUI within these bounds

**What didn't:**
- `pty.spawn('claude', [])` fails on Windows with ENOENT — node-pty's `CreateProcess` cannot resolve extensionless Unix shims. The `claude` command lives in npm's bin directory as both `claude` (shell shim, used by Git Bash) and `claude.cmd` (Windows cmd dispatch). Solution: use `process.platform === 'win32' ? 'claude.cmd' : 'claude'`.

**Notes for Phase 4 (CC subprocess module):**
- Always use the platform-aware binary name — codify this as `getClaudeBinary()` in `src/main/cc/spawner.ts`
- The output stream is wall-to-wall ANSI escape sequences (cursor positioning, 24-bit color, terminal mode switches like `?9001h`, `?2004h`, `?25l/h`, etc.). For Phase 4's parser, **do not try to strip ANSI to detect content patterns** — the TUI redraws continuously and substrings appear/disappear across redraws. Instead, use Claude Code's structured output modes (see spike-resume below) for any machine-readable data extraction. The raw stream goes verbatim to xterm.js in the renderer for display.

---

## spike-resume — `--resume <session-id>` round-trip

**Status:** PASS (after rewrite — see "What didn't" below)

**Session ID format:** standard UUID v4 (e.g., `155203a8-438f-48e1-939a-7bac97748108`, `cd18ea8d-0de4-41ab-9caf-9a7b5b41256d`)

**Working strategy: pre-specify via `--session-id <uuid>`**

```typescript
// Generate UUID up front, persist it as conversations.cc_session_id, then:
const sessionId = randomUUID()
spawn('claude', ['--session-id', sessionId])  // new session with known ID
// later:
spawn('claude', ['--resume', sessionId])  // resume same session
```

This is **simpler, deterministic, and the right Phase 4 design**. No parsing of claude output required. Symmetric usage for new vs. resume.

**What didn't:**
- The original spike approach — regex-capturing the session ID from claude's interactive TUI startup banner — failed. The session ID is **not displayed anywhere** in the interactive TUI. The banner shows version, model, account tier, and welcome text, but no session ID.
- An alternative working approach for cases where the session ID wasn't pre-specified: run claude in headless mode with `--output-format stream-json --verbose` and parse the first JSON event (`{"type":"system","subtype":"hook_started",...,"session_id":"<uuid>"}`). Not needed if pre-specifying.

**Notes for Phase 4:**
- `conversations.cc_session_id` (from spec section 3 data model) gets populated at conversation **creation time** with a fresh `randomUUID()`, not after spawn by parsing output. Update the data flow in spec section 4 accordingly.
- The `claude.cmd` Windows guard from spike-spawn applies here too (and to all subsequent spikes).
- Empirically verified: session A with `--session-id UUID_X` sends "remember 7423" killed; session B with `--resume UUID_X` asks "what number?" — response contains `7423`. Round-trip works.

**Data model impact:** `cc_session_id TEXT NOT NULL` becomes appropriate for the schema (it is always known up front). The current schema has it nullable — that is still fine if we want to support importing externally-created sessions later, but for v1 we can write it on insert.

---

## spike-model — `--model claude-haiku-4-5`

**Status:** PASS

**What worked:**
- `--model claude-haiku-4-5` is accepted by the current CLI (v2.1.141)
- Verified by inspecting the TUI banner: "Claude Code v2.1.141 · Haiku 4.5 · Claude Max" appears in claude's startup output. The banner reflects the model passed via `--model`.
- The implementation should accept these model identifiers: `claude-haiku-4-5`, `claude-sonnet-4-5`, `claude-opus-4-1` (or whatever the latest opus identifier is at Phase 4 time — verify against `claude --help` then).

**Notes for Phase 4:**
- Model selection is a spawn-time flag (`--model`). To switch models mid-conversation requires a fresh session. This matches the TokenLess design (per-conversation `model` field in `conversations` table).
- Per-turn model override is not supported by the CLI at session-start; it is a session-level setting.

---

## spike-config-dir — `CLAUDE_CONFIG_DIR` account isolation

**Status:** AMBIGUOUS — partial isolation, NOT sufficient for multi-account

**Behavior observed:**
- Pointed `CLAUDE_CONFIG_DIR` at a freshly-created empty temp directory
- claude **did** treat this as a fresh installation: it launched its first-run onboarding flow (theme picker, "Choose the text style that looks best with your terminal")
- claude **did NOT** prompt for authentication — it proceeded with the user already authenticated despite the empty config dir

**Implication:** `CLAUDE_CONFIG_DIR` isolates **preferences and config state** (theme, recent projects, hooks, etc.) but does **not** isolate **credentials**. Credentials appear to be read from one of:
- Windows Credential Manager (OS keyring) — DPAPI-protected per-user storage
- `ANTHROPIC_API_KEY` environment variable inherited via `...process.env` spread
- Some other shared location outside `CLAUDE_CONFIG_DIR`

**Implications for Phase 6 (multi-account, ADR-005):**

The current ADR-005 / design spec assumption that "setting `CLAUDE_CONFIG_DIR` per account switches identity" is **incorrect on Windows**. The Phase 6 plan needs a different or compound mechanism:

1. **Strip credentials from the environment.** When spawning claude for a different account, remove `ANTHROPIC_API_KEY` from the env passed to `pty.spawn`. (Won't help with keyring creds, but eliminates one vector.)
2. **Inject per-account `ANTHROPIC_API_KEY`.** If TokenLess stores each account's API key in its DB, it can set `ANTHROPIC_API_KEY=<account_key>` when spawning. Bypasses keyring entirely.
3. **Investigate keyring isolation.** Whether `CLAUDE_CONFIG_DIR` includes any keyring-namespacing logic is unclear from this spike. Phase 6 research needed.
4. **Most pragmatic v1 approach:** make TokenLess require API keys (not OAuth/keyring) for multi-account use. The user provides each account's API key once during account setup. TokenLess injects it via env on every spawn. Simpler, deterministic, no keyring entanglement.

**Recommendation:** raise an ADR (ADR-016 candidate) updating the multi-account strategy to "per-account API key injected via `ANTHROPIC_API_KEY` env var, paired with `CLAUDE_CONFIG_DIR` for preference isolation." Phase 6's plan should reflect this.

---

## Overall recommendations

**For Phase 4 (CC subprocess module — `src/main/cc/`):**

1. **Use platform-aware binary resolution** for spawning claude:
   ```typescript
   const CLAUDE_BIN = process.platform === 'win32' ? 'claude.cmd' : 'claude'
   ```
2. **Generate session IDs up front** with `randomUUID()` and persist them to `conversations.cc_session_id` on creation. Pass them via `--session-id <uuid>` at spawn time. Use them symmetrically for `--resume <uuid>`. Do NOT parse the TUI for session IDs.
3. **Treat the raw PTY output as opaque** for display purposes — pipe directly to xterm.js. For machine-readable telemetry (token counts, tool calls, completion signals), use Claude Code's `--output-format stream-json --verbose` mode if available, or limit telemetry parsing to clearly-delimited patterns. **Do not try to extract structured data from the interactive TUI.**
4. **Spawn dimensions** (cols=100, rows=30) work; let xterm.js negotiate live size after mount.
5. **`\r` (CR), not `\n`,** is the correct prompt-submission character.

**For Phase 6 (multi-account):**

1. Drop the "CLAUDE_CONFIG_DIR alone isolates accounts" assumption. It doesn't — on Windows, credentials bypass the config dir via the OS keyring.
2. Add a "per-account API key" mechanism. Each account stores its `ANTHROPIC_API_KEY` in TokenLess's DB; when spawning claude for that account, inject the key via env. This works deterministically regardless of keyring state.
3. Keep `CLAUDE_CONFIG_DIR` per-account for preference/hooks/recent-projects isolation (which it DOES handle).
4. Update ADR-005 or add a new ADR to capture the revised strategy.

**For the spec / decisions log:**

- Add an ADR documenting the `--session-id` pre-specify pattern (Phase 4 design decision)
- Add an ADR documenting the Windows `claude.cmd` shim requirement (Phase 4 implementation note)
- Update or supersede ADR-005 with the multi-account credential-injection finding (Phase 6 design correction)

---

## Cleanup

After Phase 4's `src/main/cc/` module lands and incorporates these learnings, the `spikes/cc-pty/` directory can be deleted. A reference link from `src/main/cc/README.md` (when it exists) back to this FINDINGS.md (via git history) preserves the institutional memory.
