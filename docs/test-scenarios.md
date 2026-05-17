# Manual Test Scenarios

Scenarios a human should exercise before any release. Each scenario lists preconditions, steps, and expected outcomes. Every feature PR adds or updates at least one scenario.

Format:

```
## Scenario: <name>

**Preconditions:** <state of the system before>

**Steps:**
1. ...
2. ...

**Expected:** <observable outcome>
```

---

## Scenario: Phase 0 — Fresh launch

**Preconditions:** Fresh `npm install` complete; no `out/` directory yet.

**Steps:**
1. Run `npm run build`
2. Run `npm run preview` (or `npm run dev`)
3. Observe the window that opens

**Expected:**
- Window title is "TokenLess"
- Window displays "TokenLess — Phase 0 stub" header
- A version line shows `preload.version = 0.0.1`

## Scenario: Phase 1B — Logger writes to disk

**Preconditions:** App built and not currently running. `~/.tokenless/logs/` may or may not exist.

**Steps:**
1. Run `npm run preview` to launch the built app.
2. Wait for the window to open, then close it.
3. Inspect `~/.tokenless/logs/`.

**Expected:**
- A file `tokenless-YYYY-MM-DD.jsonl` exists (today's date).
- It contains at least 3 JSONL records: `logger-online`, `app-ready`, `shutdown` (from main) plus `mount` (from renderer via IPC).
- Each line parses as JSON with id, ts, severity, category, event, message, fingerprint, source fields.

## Scenario: Phase 1B — Dev Mode panel displays records

**Preconditions:** App built and running (`npm run preview`).

**Steps:**
1. Click "Show Dev Mode" in the top-right.
2. Observe the bottom drawer.
3. Click any severity chip (e.g., "warn") to filter.
4. Type into the search box (e.g., "mount").
5. Click any visible row to expand.
6. Reload the window (Ctrl+R).

**Expected:**
- Panel slides up from the bottom; shows a sortable table of log records.
- Severity filter narrows the visible rows.
- Search filter further narrows by event/message substring.
- Clicking a row reveals pretty-printed JSON below it; "Copy as JSONL" copies a single-line JSON string to clipboard.
- After reload, the Dev Mode panel is still open (localStorage persistence).

## Scenario: Phase 2A — App shell renders with theme

**Preconditions:** App built and running (`npm run preview`).

**Steps:**
1. Observe the top bar.
2. Click the "Project:" dropdown, observe project list, pick a different project.
3. Click the "Account:" dropdown, observe accounts.
4. Click the sidebar collapse arrow.
5. Click a conversation in the sidebar.
6. Click "+ New Conversation".
7. Click the ⚙ Settings button.
8. Toggle Dev Mode on (top-right button) and confirm `ui/project-switch`, `ui/account-switch`, etc. records appear.

**Expected:**
- Top bar shows "TokenLess" brand in orange, with Project, Account, and Settings controls.
- Project dropdown opens; selecting a different project changes the sidebar's conversation list.
- Account dropdown opens; selecting changes the active account label.
- Sidebar collapses to a thin strip and re-expands.
- Clicking a conversation marks it active (orange left border + tinted background).
- "+ New Conversation" and ⚙ Settings emit `info` records visible in Dev Mode.
- All interactions log to Dev Mode under `ui/*` events with relevant context.

## Scenario: Phase 2B — Composer flow

**Preconditions:** App built and running (`npm run preview`).

**Steps:**
1. Click in the prompt textarea, type a few sentences.
2. Click each of the 4 config dropdowns (Model, Breadth, Format, Skill), pick a non-default value.
3. Hover the `(i)` icons next to the dropdowns. Verify tooltip text appears with context-aware lines (e.g., picking Haiku surfaces "Haiku needs explicit instructions for non-trivial tasks").
4. Click "Gear". Verify the composer is replaced by the GearReviewPane.
5. Inspect the side-by-side panes: original on the left (dimmed), geared on the right (highlighted, editable).
6. Inspect the critique flags (1 info + 1 warn).
7. Edit the geared text in the right pane.
8. Click "Re-gear". Verify the geared content refreshes (Phase 2B re-uses the same mock — phase 5 re-calls Haiku).
9. Click "Cancel" (×). Verify the composer reappears with the original prompt text preserved.
~~10. Click "Gear" again, then "Send geared". Verify composer reappears with prompt cleared.~~ *(removed v2 — Send-into-PTY gone; use "Copy Geared" instead — see S-v2.2)*

**Expected:**
- All dropdowns open/close with outside-click + Escape behavior intact.
- Tooltips render on hover and disappear on mouse leave.
- GearReviewPane shows the canned MOCK_GEARED_PROMPT in the editable side.
- Token-savings indicator appears in the geared pane header ("saves ~N tok").
- ~~Re-gear logs `ui/re-gear-clicked` to Dev Mode; Send geared logs `ui/send-geared`; Cancel logs `ui/gear-cancel`.~~ *(v2: Re-gear logs `ui/re-gear-clicked`; Copy Geared logs `ui/copy-geared`; Cancel/Discard logs `ui/gear-cancel`)*

~~## Scenario: Phase 2B — Terminal section displays canned ANSI~~ *(removed v2 — embedded PTY gone)*

~~**Preconditions:** App built and running.~~

~~**Steps:**~~
~~1. Observe the terminal pane at the bottom of MainPane.~~
~~2. Wait for the mock stream to play through (~10-15 seconds total).~~
~~3. Click the "◼ Stop" button.~~
~~4. Hover the context budget meter.~~

~~**Expected:**~~
~~- Terminal pane displays dark background with the Claude Code banner, Read/Glob tool calls, refactor narrative, and savings summary.~~
~~- ANSI color codes render (cyan for user prompt, yellow for tool calls, green for Claude's response, dim gray for tool output).~~
~~- Stop button is enabled during streaming, disabled after click.~~
~~- Context budget meter shows "42%" with a blue bar fill.~~
~~- Hover on meter shows tooltip with current/total token counts.~~

## Scenario: Phase 2B — Dev Mode toggle below TopBar

**Preconditions:** App built and running.

**Steps:**
1. Observe the Dev Mode toggle button position.
2. Click the ⚙ Settings icon in the TopBar.

**Expected:**
- The Dev Mode toggle floats below the TopBar in the top-right corner, NOT overlapping the Settings icon.
- Settings click is unobstructed; emits `ui/settings-clicked` log.

## Phase 3 — Database + persistence

### S-3.1 First-run welcome

**Preconditions:** Delete `%APPDATA%/tokenless/tokenless.db` (or run on a clean machine).

**Steps:**
1. Launch the app.
2. Observe the UI state.

**Expected:**
- TopBar shows "No project" in the ProjectSwitcher.
- Onboarding banner "👋 New here? Create your first project…" visible.
- EmptyProjectsState shows "Create your first project" CTA.
- Sidebar empty.

### S-3.2 Create first project

**Preconditions:** Fresh first-run state from S-3.1.

**Steps:**
1. Click "Create your first project."
2. CreateProjectModal opens with focus on the Name field.
3. Type a name and root path; click Create.
4. Observe modal closure and ProjectSwitcher update.
5. Click "Later" on the banner.
6. Reload (Ctrl+R).

**Expected:**
- Modal closes.
- Onboarding banner remains visible until dismissed.
- ProjectSwitcher now shows the new project as active.
- EmptyProjectsState is replaced by the Composer.
- After clicking "Later" and reloading, banner does not return.

### S-3.3 Persistence across restart

**Preconditions:** Complete S-3.2 (project created and banner dismissed).

**Steps:**
1. Fully quit the app (Ctrl+Q).
2. Relaunch.

**Expected:**
- The created project still appears in the ProjectSwitcher.
- Default account ("Personal") still in the AccountSwitcher.

### S-3.4 Multi-project switch

**Preconditions:** Completed S-3.3 (one project persisted).

**Steps:**
1. Create a second project via the UI ("Add project" affordance — can be invoked from Dev Mode or via SQL if not surfaced).
2. Click the ProjectSwitcher dropdown.
3. Select the other project.

**Expected:**
- ProjectSwitcher dropdown lists both projects.
- Selecting either refreshes the (empty) ConversationList.

### S-3.5 DB failure recovery

**Preconditions:** App has launched at least once (DB exists).

**Steps:**
1. Set `%APPDATA%/tokenless/tokenless.db` read-only (via file properties or `attrib +r`).
2. Launch the app.
3. Observe logs in Dev Mode panel.
4. Make the file writable again.
5. Restart the app.

**Expected:**
- Fatal-severity log entry `db-init-failed` visible in Dev Mode panel.
- App quits gracefully (does not white-screen or hang).
- After making the file writable, restart succeeds.

~~## Phase 4A — Real claude subprocess + Send~~ *(removed v2 — embedded PTY gone)*

~~### S-4A.1 New conversation spawns real claude~~
~~**Preconditions:** real claude installed + authenticated for the active account; project root is a directory you don't mind claude reading.~~

~~1. Launch the app. Active project + Personal account selected.~~
~~2. Click "New Conversation" in the sidebar.~~
~~3. **Expect:** A new conversation row appears in the sidebar with status active. The terminal pane shows real claude's banner / prompt. `db-online` and `cc-start` log entries visible in Dev Mode (with the sessionId UUID).~~
~~4. **Verify (Dev Mode):** Find the `cc-start` row; expand its context. `pid` is a real OS process id. `sessionId` matches a `--session-id <uuid>` arg you can see in Task Manager → claude.exe → command line.~~

~~### S-4A.2 Send echoes through the real claude~~
~~1. Continuing from S-4A.1, type "Reply with exactly PING-OK" into the composer.~~
~~2. Click Send.~~
~~3. **Expect:** The terminal pane scrolls with claude's response, ending with "PING-OK" somewhere in the stream. The composer textarea clears. A `send-success` log entry shows up in Dev Mode with the `turnId`.~~
~~4. **Verify (DB):** Open `%APPDATA%/tokenless/tokenless.db` in SQLite Browser. The `turns` table has a row with role=`user`, `original_prompt` = "Reply with exactly PING-OK", `conversation_id` matching the active conversation.~~

~~### S-4A.3 Two conversations, two PTYs~~
~~1. Open a second conversation via "New Conversation" while the first is still active.~~
~~2. **Expect:** Both conversations appear in the sidebar. Switching between them swaps the terminal pane's `conversationId` prop — but the previous terminal's PTY is still running in main. The new conversation's terminal pane shows its own claude session.~~
~~3. **Verify (Dev Mode):** Two distinct `cc-start` entries with distinct sessionIds.~~

~~### S-4A.4 Quit closes all PTYs~~
~~1. With at least one conversation active, quit the app (Cmd/Ctrl+Q).~~
~~2. **Expect:** Task Manager shows no leftover `claude.exe` processes after 2 seconds. A `shutdown` log entry plus `before-quit, releasing resources` precedes the quit.~~

~~### S-4A.5 Send with no active conversation~~
~~1. Launch the app with NO conversations (delete the DB or fresh first-run).~~
~~2. Click into the composer textarea, type a prompt, click Send.~~
~~3. **Expect:** Send is disabled (greyed out). If somehow clicked, a `send-no-conversation` warn log entry appears. No turn row created.~~

~~## Phase 4B — Parser + Stop + Resume~~ *(removed v2 — embedded PTY gone)*

~~### S-4B.1 Stop kills a running response~~
~~1. Launch the app, create project, click New Conversation, send a long prompt.~~
~~2. While claude is streaming a response, click Stop.~~
~~3. **Expect:** The terminal stops appending output. Dev Mode shows `cc-stop` and `terminal-stop-ok` log entries. The `turns` table's most-recent row has `status = 'stopped'`.~~

~~### S-4B.2 Resume across restart~~
~~1. Launch the app, create project, New Conversation, send a prompt, wait for completion.~~
~~2. Quit the app entirely (Cmd/Ctrl+Q).~~
~~3. Relaunch. The conversation appears in the sidebar.~~
~~4. Click the conversation.~~
~~5. **Expect:** Dev Mode shows `cc-resume` log entry with the stored `sessionId`. The Send button is enabled — typing + Send works as expected.~~

~~### S-4B.3 Resume with no stored sessionId fails cleanly~~
~~1. Open DB browser, NULL out a conversation's `cc_session_id` column.~~
~~2. Restart the app, click that conversation.~~
~~3. **Expect:** `cc-resume` warn log fires with `NOT_FOUND` code. UI proceeds — Stop is enabled (since we still consider the conversation active) but Send will also fail with NOT_FOUND until a fresh `cc:start` happens.~~

~~### S-4B.4 Claude not found~~
~~1. Quit the app. Set `TOKENLESS_CLAUDE_BIN=C:/no/such/path/claude.cmd`. Relaunch.~~
~~2. Create project, click New Conversation.~~
~~3. **Expect:** Modal appears: "Claude Code not found." Dev Mode shows `cc-start` warn with `CLAUDE_NOT_FOUND` code. Dismiss closes the modal; no conversation is created (the DB row that was created BEFORE the spawn is left orphaned for now — Phase 4C cleanup task).~~

~~### S-4B.5 Two conversations, stop one while the other streams~~
~~1. Open conversation A, send a long prompt. Open conversation B (sidebar click on a different conversation row), send another prompt.~~
~~2. **Expect:** Both stream independently — switching tabs shows the right output (because TerminalPane is keyed by conversationId, the xterm instance is per-conversation).~~
~~3. Click Stop on B.~~
~~4. **Expect:** B stops, A continues. The turns table for B has the latest row with `status='stopped'`. A's turns are unaffected.~~

~~## Phase 4C — Failure modes + telemetry~~ *(removed v2 — embedded PTY gone)*

~~### S-4C.1 Crash toast on non-zero exit~~
~~1. Launch with TOKENLESS_MOCK_CRASH_AFTER_MS=500 + TOKENLESS_CLAUDE_BIN=mock-claude.cmd.~~
~~2. Create project, click New Conversation.~~
~~3. **Expect:** Within ~1s an error toast appears: "Claude Code crashed (exit 1). Conversation saved — try resuming." Dev Mode shows `cc-crashed` log entry. The conversation row IS persisted (still in sidebar after restart).~~

~~### S-4C.2 Hung banner on idle conversation~~
~~1. Launch with the mock. Create project, New Conversation.~~
~~2. Manually pause the mock's stdin (or just don't type anything) for >60s.~~
~~3. **Expect:** Hung banner appears above the terminal: "Claude has been idle for a minute — still working?" Click Stop to dismiss + kill the PTY.~~

~~### S-4C.3 PTY write fail toast~~
~~Hard to trigger manually — the test double simulates this. Scenario for documentation:~~
~~1. After a Stop or crash, the PTY is dead but the renderer hasn't fully caught up.~~
~~2. Type a prompt + Send.~~
~~3. **Expect:** Error toast: "Couldn't send prompt — PTY connection lost. Restart the conversation." Dev Mode shows `send-failed` with code `PTY_WRITE_FAILED`.~~

~~### S-4C.4 Orphan cleanup on CLAUDE_NOT_FOUND~~
~~1. Launch with TOKENLESS_CLAUDE_BIN=C:/nonexistent.cmd.~~
~~2. Create project, click New Conversation.~~
~~3. CLAUDE_NOT_FOUND modal appears.~~
~~4. **Expect:** After dismissing the modal, the sidebar has NO orphan conversation row (it was deleted because cc:start failed).~~

~~### S-4C.5 Telemetry meter shows real usage~~
~~1. Launch with the mock (which emits `tokens: N/200000` lines).~~
~~2. Create project, New Conversation, send a few prompts.~~
~~3. **Expect:** The Context: meter in the terminal toolbar shows a non-zero value within 3-4 seconds of each send. The value increases monotonically as the mock's tokens counter accumulates.~~

## Phase 5A — Gearing engine

### S-5A.1 Happy gearing path
1. Set `ANTHROPIC_API_KEY` env var. Launch the app. Create project + New Conversation.
2. Type a verbose prompt (e.g., "Could you please take a look at the auth middleware...").
3. Click Gear.
4. **Expect:** Within ~2s the GearReviewPane appears with a noticeably shorter geared prompt. Critique flags (info/warn) visible if applicable. Cost preview shows expected $ for the user-selected model + Haiku meta cost.

~~### S-5A.2 Send the geared prompt~~ *(removed v2 — Send-into-PTY gone; replaced by Copy Geared in S-v2.2)*
~~1. From the gear review pane, click "Send geared".~~
~~2. **Expect:** The prompt sent to claude is the GEARED text. Verify in Dev Mode logs: `send-success` entry's `promptLength` matches the geared length, not the original.~~

### S-5A.3 Bad API key
1. Set `ANTHROPIC_API_KEY=invalid_key`. Launch. Try to gear.
2. **Expect:** Error toast: "Anthropic API key invalid or missing." Dev Mode shows `gearing-gear` warn with code `API_AUTH_FAILED`.

### S-5A.4 Network down
1. Unplug network. Try to gear.
2. **Expect:** Error toast: "Network unreachable. Gearing offline." Dev Mode shows code `API_NETWORK_DOWN`.

### S-5A.5 Rate-limited (synthetic)
Hard to trigger manually. The retry path is unit-tested. When/if rate-limit hits in production:
- 1st attempt: retry transparently
- 2nd attempt: retry transparently
- 3rd attempt: failure → toast "Anthropic API rate-limited. Try again in a moment."

### S-5A.6 Malformed JSON from Haiku
Hard to trigger manually (Haiku usually obeys). The parser handles this via Zod. If it does occur:
- Toast: "Couldn't parse the gearing response. Send the original prompt."
- Dev Mode: code `GEAR_PARSE_FAILED`.

## Phase 5B — Summary refresh + polish

### S-5B.1 Auth modal (replaces toast)
1. Launch with no `ANTHROPIC_API_KEY` set (or with an invalid key).
2. Create project + new conversation, type a prompt, click Gear.
3. **Expect:** Modal "Anthropic API key required" appears with PowerShell instructions. NOT a toast.

~~### S-5B.2 Send original auto-suggest~~ *(removed v2 — Send-into-PTY gone)*
~~1. Trigger any non-auth gearing failure (easiest: temporarily set `ANTHROPIC_API_KEY=invalid_after_validation` so the call fails post-auth somehow — or simulate via 5xx by network manipulation).~~
~~2. **Expect:** Toast appears with a "Send original" button. Clicking it sends the original prompt to claude (verify in Dev Mode `send-success` entry, prompt clears).~~

### S-5B.3 Live cost estimate
1. With a project + conversation active, type into the composer.
2. **Expect:** Within ~500ms of typing pause, the TelemetryStrip shows the current model + estimated $ + token counts. Updates as you change the model selection or breadth.
3. Clear the prompt.
4. **Expect:** Strip returns to idle hint.

~~### S-5B.4 Summary refresh after assistant turn~~ *(removed v2 — no assistant turn capture without PTY)*
~~1. Launch with real Claude Code installed + `ANTHROPIC_API_KEY` set.~~
~~2. Start a conversation, send a prompt, wait for claude's response to complete (prompt-ready event fires).~~
~~3. **Expect:** Within ~1s, Dev Mode shows `summary-refresh-ok` log entry with a summary length. DB inspection: `conversations.summary` column for this conversation has a populated string; `summary_updated_at` is recent.~~

### S-5B.5 Retry attempts visible in Dev Mode
1. Hard to reliably trigger — only fires on 429/5xx.
2. **Expect when it happens:** Dev Mode shows multiple `api-retry-attempt` warn entries with attempt counters, then either a success log OR `api-retry-exhausted` error.

### S-5B.6 Fixture recording
1. `$env:ANTHROPIC_API_KEY = 'sk-ant-...'; npm run fixtures:record`
2. **Expect:** Existing fixture files in `test/fixtures/api/` get updated with fresh timestamps + actual API responses. `npm run test:run` still green afterward.

## Phase 7A — Drafts auto-save

### S-7A.1 Type → switch away → come back → draft preserved
1. Launch app with a project + at least one conversation. Click into the conversation.
2. Type "this is my draft prompt" into the composer.
3. Wait ~1 second. Verify in Dev Mode that a `drafts-save` log entry appeared.
4. Click a DIFFERENT conversation in the sidebar.
5. **Expect:** Composer either clears or shows the OTHER conversation's draft (if any).
6. Click back to the original conversation.
7. **Expect:** "this is my draft prompt" is restored in the composer.

~~### S-7A.2 Send clears the draft~~ *(removed v2 — Send-into-PTY gone; draft is cleared by Discard or Copy Geared instead)*
~~1. Continuing from S-7A.1, click Send.~~
~~2. **Expect:** Composer text clears. `drafts-clear` log entry visible in Dev Mode.~~
~~3. Switch away + back.~~
~~4. **Expect:** Composer is empty (no leftover draft).~~

### S-7A.3 Restart preserves drafts
1. Type a long prompt into a conversation. Wait for `drafts-save` to fire.
2. Quit the app (Cmd/Ctrl+Q).
3. Relaunch.
4. Click the conversation.
5. **Expect:** The draft is restored.

### S-7A.4 No-conversation drafts not persisted
1. Launch with no projects yet (or all projects with no conversations).
2. Type a prompt anyway (the textarea is editable even without a conversation).
3. Quit the app.
4. Relaunch.
5. **Expect:** Composer is empty (no persistence for null-conversation drafts per ADR-033).

## Phase 6A — Multi-account API keys

### S-6A.1 Create a second account with its own key
1. Launch the app with the seeded "Personal" account. Click the `+` next to AccountSwitcher.
2. Fill the modal: label="Work", configDir blank, API key set to a valid `sk-ant-...`. Click Add.
3. **Expect:** "Work" appears in AccountSwitcher and is auto-selected as active. Dev Mode shows `account-create` info log.

### S-6A.2 Gear uses the active account's key
1. Continuing from S-6A.1, type a prompt and click Gear.
2. **Expect:** Gearing succeeds (assuming the key is valid). The Haiku call is billed to the Work account's key, not Personal's.

### S-6A.3 Switch to an account with no key
1. Switch back to "Personal" (which was seeded with no key).
2. Type a prompt and click Gear.
3. **Expect:** `AuthMissingModal` opens with the headline "Account 'Personal' needs an API key". Dismissable.

### S-6A.4 Per-account state survives restart
1. Set up two accounts. Pick one as active. Restart the app.
2. **Expect:** Both accounts still in AccountSwitcher; the previously-active one is active again (Phase 6B may persist this further; for 6A the auto-active behaviour falls back to first-account).

### S-6A.5 Summary refresh respects account boundaries
1. With Account A as the conversation owner (account_id on the row), send a prompt + wait for response-complete.
2. Switch active account to B in the UI.
3. **Expect:** Background summary refresh uses Account A's key (because the conversation's accountId is A), not B's. Dev Mode shows `summary-refresh-ok` for that conversation.

## Phase 6B — Account + Project CRUD + last-active persistence

### S-6B.1 Edit account API key
1. Active account "Test" has a working key. Click ✎ next to AccountSwitcher.
2. Clear the API key field, paste a new key. Save.
3. **Expect:** Account is updated. Next Gear call uses the new key (registry was invalidated). Dev Mode shows `account-update` info log + `accounts-update` db log.

### S-6B.2 Delete account
1. With "Test" account active, click ✎. Click Delete in the modal. Confirm at the OS prompt.
2. **Expect:** Account is removed from the dropdown. Active account falls back to first remaining ("Personal"). Dev Mode shows `account-delete` info + `accounts-delete` db log.

### S-6B.3 Edit project rootPath
1. Click ✎ next to ProjectSwitcher. Change rootPath to a different real directory. Save.
2. **Expect:** Project is updated. The NEXT New Conversation uses the new path as claude's cwd. Existing conversations keep their original rootPath (Phase 7 may reconcile).

### S-6B.4 CreateProjectModal validates rootPath
1. Click + next to ProjectSwitcher. Type a path that doesn't exist. Wait ~400ms.
2. **Expect:** Inline error "Directory doesn't exist on disk." appears under the field. Submit is blocked (handleSubmit early-returns).
3. Change to a real directory. Error clears. Submit succeeds.

### S-6B.5 EditProjectModal also validates rootPath
1. Click ✎ next to ProjectSwitcher. Change rootPath to a non-existent path.
2. **Expect:** Same inline error as S-6B.4. Save blocked until the path is valid.

### S-6B.6 Last-active persistence
1. Set active account = "Test" and active project = "Foo". Close the app.
2. Relaunch.
3. **Expect:** "Test" and "Foo" are auto-selected as active (not the first-in-list defaults). Dev Mode shows two `settings-get` events at boot.

### S-6B.7 Stale last-active gracefully ignored
1. With "Test" + "Foo" persisted as last-active, delete "Foo" project via the edit modal. Close the app.
2. Relaunch.
3. **Expect:** activeProjectId falls back to first remaining project. No error toast. Dev Mode shows `settings-get` returned the stale id but the fallback default-picker effect ran.

### S-6B.8 Dropdown menu paints above MainPane
1. Click the Project: or Account: dropdown trigger.
2. **Expect:** The expanded list is FULLY VISIBLE — not clipped behind the composer or terminal pane. (Fixed by raising --tl-z-dropdown to 1000.)

## Phase 6C — Skills discovery + ConfirmModal

### S-6C.1 User skill discovered on app boot
1. Create `~/.claude/skills/test-skill/SKILL.md` with frontmatter `---\nname: test-skill\ndescription: a test\n---`.
2. Launch the app.
3. Open the Skill: dropdown in Composer.
4. **Expect:** "test-skill" appears in the list with description "a test". Dev Mode shows `skills-watcher-started` info log at boot.

### S-6C.2 Skill add/remove reflected without restart
1. With the app running, add a new `~/.claude/skills/another/SKILL.md`.
2. **Expect:** within ~1-2s (chokidar debounce), the dropdown updates and includes "another" without restart.
3. Delete the file. The skill row stays in DB (verify via `select * from skills`) but the watcher's next debounced rescan calls `markStale` on it. Phase 6C MVP keeps showing stale skills in the dropdown — user can manually hide them; Phase 8 may filter.

### S-6C.3 Favorite + hide actions
1. Open the Skill: dropdown.
2. Click the ☆ next to "test-skill". The button becomes ★ and the row floats to the top with a ★ prefix in its label.
3. Click the ✕ next to another skill. The skill disappears from the dropdown. Verify via `select * from skills where hidden = 1` that the row persists with `hidden = 1`.
4. Clicking ☆ / ✕ must NOT select the row as the active skill.

### S-6C.4 Plugin skills discovered
1. Create `~/.claude/plugins/my-pack/skills/my-skill/SKILL.md`.
2. Launch (or trigger a manual rescan via the `skills:rescan` IPC channel).
3. **Expect:** "my-skill" appears with the source-derived fallback description `plugin skill` when frontmatter has no description.

### S-6C.5 Invalid SKILL.md silently skipped
1. Create `~/.claude/skills/broken/SKILL.md` with `# heading\nbody` (no frontmatter).
2. Trigger rescan (toggle a favorite or wait for chokidar).
3. **Expect:** "broken" does not appear in the dropdown. Other valid skills are unaffected. Logger does NOT emit `error` (silent skip is the scanner contract).

### S-6C.6 Favorited skill preserved across uninstall
1. Favorite a skill.
2. Delete the skill's directory.
3. Wait for chokidar debounce + rescan.
4. **Expect:** the row stays in DB with `favorited = 1` and a `last_seen_at` lowered below the current scan timestamp.
5. Re-create the SKILL.md file.
6. **Expect:** the skill shows up again in the dropdown, still favorited.

### S-6C.7 ConfirmModal replaces window.confirm in delete flows
1. Click ✎ next to an account, click Delete in the EditAccountModal.
2. **Expect:** a styled in-app ConfirmModal appears (NOT the OS `window.confirm`). The "Delete" button is red (danger variant) and has focus. Escape closes it. Cancel button works. Clicking Delete actually deletes the account.
3. Same scenario for EditProjectModal (with the project name in the message).

~~## Phase 7B — Turn capture + Feedback buttons~~ *(removed v2 — assistant turn capture + feedback bar gone; no PTY response stream)*

~~### S-7B.1 Plain Send writes a user turn (no gearMeta)~~
~~1. With an active conversation, type "hello" and click Send.~~
~~2. **Expect:** A `turns` row exists with `role='user'`, `original_prompt='hello'`, `geared_prompt IS NULL`, `original_tokens IS NULL`, `critique_flags_json IS NULL`. Dev Mode shows no extra event (the underlying log is `turn-list-by-conversation` only fired when the renderer queries).~~

~~### S-7B.2 Send geared writes a full user turn with original + geared + tokens~~
~~1. Type "hello", click Gear, then click Send Geared in the review pane.~~
~~2. **Expect:** The user turn row has both `original_prompt` (the literal "hello") AND `geared_prompt` (the geared text), with numeric `original_tokens` / `geared_tokens` / `haiku_meta_tokens` values, and `critique_flags_json` populated as a JSON array of `"<severity>: <message>"` strings (or null if there were no flags).~~

~~### S-7B.3 Assistant turn captured after response-complete~~
~~1. After Send, wait for Claude's response to finish (mock-claude echoes + emits "received:").~~
~~2. **Expect:** A second `turns` row exists with `role='assistant'`, `response_text` containing Claude's output lines joined by `\n`, and `response_tokens` set (if a `tokens:` line was emitted; null otherwise).~~

~~### S-7B.4 TurnFeedbackBar appears below Composer after assistant turn~~
~~1. After a complete user → assistant exchange.~~
~~2. **Expect:** A small 👍 👎 🤷 bar appears at the bottom of the Composer (NOT during gear review).~~
~~3. Click 👍. The bar disappears immediately (the `turns:changed` broadcast causes useTurns to refetch; the last turn now has `feedback='up'`).~~

~~### S-7B.5 Feedback persists across restart~~
~~1. After clicking 👍 in S-7B.4, close + relaunch the app.~~
~~2. Open Dev Mode.~~
~~3. **Expect:** Footer shows `👍 1 · 👎 0 · 🤷 0 · ❓ N unrated` (where N is the count of other unrated assistant turns).~~

~~### S-7B.6 Multi-turn conversation: alternating rows in correct order~~
~~1. Send three prompts in a row, waiting for response each time.~~
~~2. Query `SELECT id, role, original_prompt, response_text FROM turns WHERE conversation_id = ? ORDER BY sent_at ASC, id ASC`.~~
~~3. **Expect:** Six rows alternating user / assistant / user / assistant / user / assistant.~~

~~### S-7B.7 Dev Mode footer updates live~~
~~1. With Dev Mode open, click a feedback button on the latest turn.~~
~~2. **Expect:** The footer counts update within ~100ms (no manual refresh). The bar disappears.~~

~~### S-7B.8 Resumed conversation captures NEW turns but not the in-flight one~~
~~1. While Claude is mid-response, close the app.~~
~~2. Relaunch + resume the conversation.~~
~~3. **Expect:** No assistant row for the truncated response. The NEXT user prompt + response captures normally. (Phase 8 may add a "scrape backlog" feature.)~~

## Phase 6D — Telemetry summary view

### S-6D.1 Pill hidden when turns table is empty
1. Fresh install, no conversations.
2. **Expect:** No TelemetryPill in the TopBar (the `haikuMetaTokens === 0 && responseOutputTokens === 0` guard).

### S-6D.2 Pill shows "Saved $0.00 this week" after a tiny non-geared send (placeholder math)
1. Start a conversation, send "hi" (no gearing). Wait for response-complete.
2. **Expect:** Pill appears showing "Saved $0.00 this week" (response tokens > 0 even if savings are zero — there was a turn so the pill mounts).

### S-6D.3 Pill shows green "Saved $X" after a substantial geared send
1. Type a long prompt (~500 chars). Click Gear → Send Geared.
2. **Expect:** Pill renders green with "Saved $X.XX this week" where X is positive.

### S-6D.4 Pill shows red "Cost $X" when haiku investment exceeds savings
1. Gear several tiny prompts (5-10 chars each). The haiku call's overhead exceeds the input-token savings.
2. **Expect:** Pill renders red "Cost $X.XX this week".

### S-6D.5 Clicking the pill opens the popover with four period tabs
1. With the pill visible, click it.
2. **Expect:** Popover opens below the pill with tabs "Today / This Week / This Month / All Time", a totals grid (gross savings / haiku cost / net savings / spend), and a per-model breakdown table.
3. Click each tab — the numbers refetch with the appropriate sinceMs boundary.

### S-6D.6 Per-model rows appear in the popover
1. After exchanges with multiple models (e.g., Sonnet + Opus), open popover.
2. **Expect:** The byModel table has one row per model with Spend + Savings columns.

### S-6D.7 Popover refreshes after a new geared send (turns:changed broadcast)
1. With popover open, send a new geared prompt + wait for response.
2. **Expect:** Within ~100ms the numbers update without manual refresh.

### S-6D.8 Popover refreshes after a feedback click too (acceptable per ADR-038)
1. With popover open, click a turn-feedback button (👍/👎/🤷).
2. **Expect:** The popover refetches (same broadcast). Numbers stay the same — feedback doesn't affect cost. Slight visual blink is acceptable for v1.

## Phase 7D — Templates picker

### S-7D.1 Templates button visible in ActionsRow
1. Open the app; create a project + conversation.
2. **Expect:** A "Templates ▾" button appears in the actions row (5-button layout: Capture · Gear · Copy Geared · Discard · Templates).

### S-7D.2 Built-ins seeded on first launch
1. Fresh install. Click "Templates ▾".
2. **Expect:** Popover opens with 8 built-in templates grouped by category (refactor / docs / tests / review / explain / debug / git). Names: "Refactor for clarity", "Add JSDoc", "Write tests", "Code review", "Explain this code", "Debug this error", "Commit message", "Pull request description".

### S-7D.3 Insert into empty composer
1. With composer empty, click Templates → click "Refactor for clarity".
2. **Expect:** The popover closes. Composer textarea now contains the template body verbatim ("Refactor the highlighted code for clarity. ...").

### S-7D.4 Append behavior with existing prompt
1. Type "fix the auth bug — " into the composer.
2. Open Templates → click "Code review".
3. **Expect:** Composer now contains:
   ```
   fix the auth bug —
   Review the pending changes. ...
   ```
   The existing text was preserved, with a `\n` before the appended body.

### S-7D.5 Built-in protection — direct IPC denies update/delete
1. Open Dev Mode. Run via the IPC: `window.tokenless.templates.delete({ id: <builtin-id> })`.
2. **Expect:** Result is `{ ok: false, error: { code: 'BUILTIN_PROTECTED', ... } }`. The row still exists in the DB.
3. Same for `templates.update` on a builtin: returns `BUILTIN_PROTECTED`.

### S-7D.6 Re-seed idempotency
1. Launch the app.
2. Quit and relaunch.
3. **Expect:** Still exactly 8 builtin templates (no duplicates). DB inspection: `SELECT COUNT(*) FROM templates WHERE builtin = 1` returns 8.

### S-7D.7 Templates seed survives across schema migrations
(Future-proofing — covered by the idempotency contract in ADR-039.)

~~## Phase 7C — Branching MVP~~ *(removed v2 — branching depended on PTY spawning a new session)*

~~### S-7C.1 Branch button visible in ActionsRow~~
~~1. Open the app with an active conversation.~~
~~2. **Expect:** A "Branch" button appears in the actions row's secondary group, between Templates and Commit.~~

~~### S-7C.2 Branch from a conversation with turns~~
~~1. With an active conversation and at least one user turn already sent (S-7B.1).~~
~~2. Click Branch.~~
~~3. **Expect:** A new conversation appears in the sidebar prefixed with "↳ " and indented. The new conversation auto-selects (its xterm pane is empty — fresh PTY). Dev Mode shows `branch-created` info log.~~

~~### S-7C.3 Branched conversation indented in sidebar~~
~~1. Visually inspect the sidebar after S-7C.2.~~
~~2. **Expect:** The branch row's title starts with "↳" and the row is visibly indented compared to non-branched siblings. The title text is muted (var(--tl-text-muted)).~~

~~### S-7C.4 Branch with no prior turns → toast~~
~~1. Create a brand-new conversation but do NOT send anything. Click Branch.~~
~~2. **Expect:** A warn-severity toast: "Could not branch — the conversation has no turns yet." No new conversation row appears in the sidebar. Dev Mode shows `branch-failed`.~~

~~### S-7C.5 Branch inherits parent's summary~~
~~1. After enough turns that the parent's summary has been refreshed (Phase 5B — verify via SQLite: `select summary from conversations where id = <parent>`).~~
~~2. Click Branch.~~
~~3. Inspect new row: `select summary from conversations where id = <branch>`.~~
~~4. **Expect:** Same non-null summary string as the parent.~~

~~### S-7C.6 Branched conversation has its own PTY~~
~~1. After branching, click between parent and branch in the sidebar.~~
~~2. **Expect:** Each has its own xterm pane state (different output / scrollback). Stop button on the branch only kills the branch's PTY.~~

~~### S-7C.7 Parent deletion sets branch.parent_conversation_id to NULL~~
~~1. Branch a conversation. Then delete the parent (via the existing conversations:delete IPC; UI for this is currently only direct DB or future Phase 8).~~
~~2. **Expect:** The branch's `parent_conversation_id` becomes NULL (ON DELETE SET NULL). The branch keeps existing. Its title still starts with "↳" but the sidebar indent disappears on next render (since `parentConversationId === null` now).~~

## Phase 8A — Polish

### S-8A.1 Logs at userData/logs/
1. Launch the app.
2. Inspect `%APPDATA%\tokenless\logs\` (Windows) — there should be a `tokenless-<date>.jsonl` file growing as you click around.
3. `%USERPROFILE%\.tokenless\logs\` (the old location) is no longer being written to.

### S-8A.2 Main window resizable + has minimum size
1. Drag the right edge of the main window inward.
2. **Expect:** window stops at 600px wide (v2 minimum — reduced from 900px to support half-screen use). Same for height at 600px.
3. Drag outward — no maximum; the layout reflows correctly.

~~### S-8A.3 Terminal copy with Ctrl+Shift+C~~ *(removed v2 — embedded terminal gone)*
~~1. Send a prompt; wait for response output.~~
~~2. Drag-select some response text in the terminal pane.~~
~~3. Press Ctrl+Shift+C. Paste into another app — the selected text arrives.~~
~~4. Press Ctrl+C (no Shift) — sends SIGINT to claude, NOT copy. The selection stays visible but no clipboard write.~~

~~### S-8A.4 Terminal copy with right-click~~ *(removed v2 — embedded terminal gone)*
~~1. Drag-select some text. Right-click anywhere in the terminal pane.~~
~~2. **Expect:** text copied to clipboard. No OS context menu appears (we prevented default).~~
~~3. Right-click without a selection: OS default menu appears (we didn't preventDefault).~~

~~### S-8A.5 Terminal keystroke pass-through (Y/N prompts)~~ *(removed v2 — embedded terminal gone)*
~~1. Trigger a flow where claude asks a Y/N question (e.g. "Use tool X? [y/n]").~~
~~2. Click the terminal pane to give it focus.~~
~~3. Press `y` followed by Enter.~~
~~4. **Expect:** the keystroke goes to claude directly. No new turn row in the `turns` table.~~

### S-8A.6 Dev Mode shows historical logs on open
1. Click around for ~30 seconds (generates ui logs).
2. Open Dev Mode.
3. **Expect:** Within ~1 second the panel shows records from app boot onward (header briefly shows "loading history…"). LogTable sorts newest at top by default — scroll down to find boot-time records.

### S-8A.7 Pricing IPC drives model dropdown
1. Open the composer's Model dropdown.
2. **Expect:** Three options (Haiku 4.5, Sonnet 4.6, Opus 4.7) with descriptions ("fastest · cheapest", "balanced", "most capable"). No references to "mock" anywhere.
3. Default selection is Opus (until gearing defaults set otherwise via Settings).

### S-8A.8 Outside-click closes popovers
1. Click the TelemetryPill in the TopBar — popover opens.
2. Click anywhere outside the pill/popover.
3. **Expect:** popover closes.
4. Same for the Templates ▾ button + popover.

### S-8A.9 Modal focus management
1. Trigger AuthMissingModal (e.g., switch to an account with no API key, click Gear).
2. **Expect:** the "Got it" button is focused (visible focus ring). Press Escape — modal closes.
~~3. Same for ClaudeNotFoundModal.~~ *(ClaudeNotFoundModal removed v2)*

### S-8A.10 Persistent CostPreview after Copy Geared
1. Type a prompt + click Gear + wait for the geared pane.
2. Click "Copy Geared".
3. After the copy, the composer textarea is empty.
4. **Expect:** TelemetryStrip shows "Last gear cost: $X.XX" (the cost from the gearing call just completed).
5. Start typing a new prompt — TelemetryStrip switches to showing the live estimate.

~~### S-8A.11 "Send original" toast reads latest prompt~~ *(removed v2 — Send-into-PTY gone)*
~~1. Type "first prompt", click Gear, wait for failure (e.g. with no API key).~~
~~2. The error toast appears with "Send original" action.~~
~~3. While the toast is visible, type more — now the composer says "first prompt and more".~~
~~4. Click "Send original" in the toast.~~
~~5. **Expect:** the FULL CURRENT prompt ("first prompt and more") is sent, not the original captured at toast-creation time.~~

### S-8A.12 AI error analysis on Dev Mode error row
1. Trigger an error log (e.g. attempt Gear with no account/key).
2. Open Dev Mode. Find the error row (severity=error). Click it to expand.
3. **Expect:** "Analyze with AI" button visible.
4. Click it. Loading state briefly. Result panel appears with Haiku's analysis (≤200 words plain text).

### S-8A.13 Settings page opens via TopBar gear icon
1. Click the Settings button in the TopBar.
2. **Expect:** the view switches from AppShell to SettingsView with 5 sections (Accounts, Gearing Defaults, Dev Mode, Telemetry, Paths). *(v2: Send Confirm section removed — Send-into-PTY gone)*
3. Click "← Back" — returns to AppShell.

### S-8A.14 Gearing defaults persist + take effect
1. In Settings → Gearing Defaults, change model to "Haiku 4.5".
2. Back to shell. Open a new conversation.
3. **Expect:** the Composer's Model dropdown defaults to Haiku, not Opus.
4. Restart the app. Verify the default still sticks.

~~### S-8A.15 Send-confirm toggle gates Send~~ *(removed v2 — Send-into-PTY gone; Settings Send Confirm section removed)*
~~1. In Settings → Send Confirm, toggle on.~~
~~2. Back to shell. Type a prompt + click Send.~~
~~3. **Expect:** ConfirmModal "Send prompt?" appears. Click Cancel — nothing sent. Click Confirm — prompt sent normally.~~
~~4. Toggle off in Settings — Send works without the modal.~~

### S-8A.16 Paths section "Open folder" buttons
1. Settings → Paths. Click "Open folder" next to Logs.
2. **Expect:** Windows file explorer (or OS equivalent) opens to `%APPDATA%\tokenless\logs\`.

### S-8A.17 Onboarding wizard runs on first launch
1. Fresh install (delete `%APPDATA%\tokenless\`).
2. Launch.
3. **Expect:** Welcome step appears over a dimmed AppShell. Progress dots show step 1 of 4.
4. Click through: Welcome → API Key (paste a real `sk-ant-...` key) → First Project (name + valid rootPath) → Done.
5. After "Start your first conversation": wizard closes; you're in the AppShell with one account + one project ready.
6. Restart the app — wizard does NOT reappear.

### S-8A.18 Skip in wizard re-shows next launch
1. Fresh install. Launch. Wizard appears.
2. Click "Skip" (top-right).
3. **Expect:** wizard closes. You see the AppShell with no projects.
4. Restart the app — wizard reappears.

### S-8A.19 Run onboarding again from Settings
1. Complete the wizard once.
2. Open Settings. Click "Run onboarding again".
3. **Expect:** Wizard reappears at step 1. The previously-created account + project still exist (the wizard doesn't delete them — it just re-runs the flow).

## Phase 8B — Release prep

### S-8B.1 `npm run build:unpack` produces a runnable .exe
1. Fresh checkout. `npm install && npm run rebuild:electron && npm run build:unpack`.
2. **Expect:** `dist/win-unpacked/TokenLess.exe` exists. Double-click it — TokenLess launches; DB persists at `%APPDATA%/tokenless/tokenless.db`; logs at `%APPDATA%/tokenless/logs/`.

### S-8B.2 Icon fallback when .ico is absent
1. Ensure `resources/icon.ico` is NOT present.
2. `npm run build:unpack` — should log a warning ("default Electron icon will be used"). Build still succeeds.
3. The built `.exe`'s taskbar/Alt-Tab icon is the Electron default.

### S-8B.3 Icon applies when .ico is present
1. Convert `resources/icon.svg` → `resources/icon.ico` (per resources/icon-design.md).
2. `npm run build:unpack`.
3. The built `.exe`'s taskbar/Alt-Tab icon shows the TL monogram.

### S-8B.4 Privacy notice appears on first launch
1. Delete `%APPDATA%/tokenless/`. Launch the app.
2. **Expect:** Privacy notice modal appears FIRST (before the Onboarding wizard). The "I understand" button is focused. Pressing Enter accepts.

### S-8B.5 Privacy notice does not reappear after ack
1. Continuing from S-8B.4: after clicking "I understand", restart the app.
2. **Expect:** Privacy notice does NOT reappear. The Onboarding wizard appears directly (if not already completed).

### S-8B.6 About dialog shows correct version
1. Settings → "About TokenLess" footer link.
2. **Expect:** Modal opens. "Version" row shows the package.json's current version. "Platform" notes ADR-002. Close button works; Escape closes; backdrop click closes.

### S-8B.7 DB backup created when a migration applies
1. Launch the app once on a fresh `%APPDATA%/tokenless/`. Check `%APPDATA%/tokenless/backups/` — empty (no backup on first run because there's no existing DB to back up).
2. Bump the migrations list (e.g., add a dummy migration 003 in `src/main/db/migrations/index.ts` for testing only). Restart the app.
3. **Expect:** A backup file appears at `%APPDATA%/tokenless/backups/tokenless-pre-v2-to-v3-{timestamp}.db`.

### S-8B.8 Old backups pruned after 5+
1. Force-create 7 backups (manually or by repeated migration bumps).
2. Trigger one more migration.
3. **Expect:** `%APPDATA%/tokenless/backups/` contains only the 5 most recent (by mtime).

### S-8B.9 Crash reporter modal on main-process crash
1. Trigger a synthetic crash in the main process (e.g., a temporary `process.nextTick(() => { throw new Error('test crash') })` added to the IPC index, then back out).
2. **Expect:** The crash reporter modal appears. Shows "Main process crash" tag, the error message, the (truncated) stack. Continue button is NOT shown (main crashes can't be continued). Restart button works.

### S-8B.10 Crash report Copy button writes JSON to clipboard
1. With the modal open, click "Copy report".
2. **Expect:** Button changes to "Copied ✓" for ~2s. Paste into a text editor — the clipboard contains a valid JSON object with `source`, `message`, `stack`, `timestamp`, `recentLogs` (array of last 100), and `system` (platform/electron/node/app versions).

### S-8B.11 Crash reporter modal on renderer React error
1. Trigger a synthetic crash in the renderer (e.g., throw from a component during render — backdoor a `if (Math.random() < 0.5) throw` in App.tsx temporarily).
2. **Expect:** The crash reporter modal appears. Shows "Renderer error" tag. Continue button IS shown (it'll re-mount the component tree on click).
3. Click Continue. The app might recover, or might re-crash if the error condition persists.

### S-8B.12 Release workflow runs all gates and uploads asset
1. Commit + tag + push `v0.99.0-test-release` (or similar non-conflicting tag).
2. Watch `.github/workflows/release.yml` run in Actions. Verify all steps pass (typecheck → tests → e2e → build → build:unpack → zip → release upload).
3. **Expect:** A new Release at `github.com/.../releases` with `TokenLess-v0.99.0-test-release-win-x64.zip` attached. Release notes auto-generated from commits since the previous tag.

---

## S-v2.1: Clipboard capture (Phase 3)

**Setup:** Launch the unpacked app. Have any other application open (Notepad, browser, terminal) ready to be the clipboard source.

**Empty case:** With nothing on the clipboard (or all-whitespace), click Capture. Expect: inline hint "Clipboard is empty. Copy text in your terminal first, then click Capture." appears below the action row. The Capture button is disabled for 3 seconds. After 3 seconds, the button re-enables and the hint clears.

**Typical case:** Copy a multi-line prompt from any application (e.g., "Refactor src/auth.ts to flatten conditionals."). Click Capture. Expect: the prompt textarea fills with the exact text (modulo ANSI escapes stripped + Unicode normalized to NFC + a trailing prompt prefix like `$ ` stripped if present).

**Too-large case:** Generate ~40 KB of text (`x` repeated, or paste a large log file). Click Capture. Expect: a warn toast "Clipboard contains more than 32 KB. Trim your selection." appears; the prompt textarea is unchanged.

**Read-failed case:** Hard to reproduce manually on Windows — `clipboard.readText()` rarely throws. Verified in the integration test by injecting a fake clipboard that throws.


## S-v2.2: Gear + Copy round-trip (Phase 4)

**Setup:** Launch the unpacked app with at least one project. Open Notepad (or any other app) ready to receive a paste.

1. Type a prompt in the composer (e.g., "Refactor src/auth.ts please").
2. Click Gear. Wait for the GearReviewPane to render (with the geared variant + critique flags + cost preview).
3. Optionally edit the geared text in the right pane.
4. Click "Copy geared".
5. Expect: A toast appears: "Geared prompt copied — paste into your terminal." The Composer returns to the empty-prompt state (textarea cleared, GearReviewPane closed).
6. Switch to Notepad. Press Ctrl+V.
7. Expect: The geared text (post-edits, exact bytes) appears in Notepad.

**Variant — Copy original:** Repeat steps 1-2. Instead of clicking "Copy geared", click "Copy original". Expect: the clipboard receives the ORIGINAL un-geared prompt (the text you typed before Gear ran). Paste in Notepad confirms.

**Failure case (hard to reproduce manually):** If the OS clipboard is locked by another process during the write, the toast "Couldn't write to clipboard. Geared text remains in TokenLess — try Copy Geared again." appears, and the composer state is preserved so the user can retry. Verified in the integration test by injecting a fake clipboard that throws on writeText.


## S-v2.3: Half-screen layout (Phase 5)

**Setup:** Resize the TokenLess window to 720px wide × 900px tall (roughly half of a 1440p monitor). For comparison, also test at 600×900 (very narrow) and 1280×900 (wide).

**At 720×900:**
- Sidebar should be collapsed to the icon strip by default (first launch with this width).
- TopBar should fit on a single 36px row without overflow: account initial, telemetry pill, window controls.
- Composer textarea + ConfigsRow + 5-button ActionsRow visible.
- Empty-state hint: "Capture a prompt from your terminal (Ctrl+C in terminal → click Capture)." visible when no prompt typed.
- Click Capture (after copying something elsewhere) → text loads.
- Click Gear → GearReviewPane drawer slides in from below, side-by-side original + geared.
- Click Copy Geared in ActionsRow → text on clipboard, composer + drawer clear.

**At 600×900:**
- Same flow, but the GearReviewPane drawer's original/geared panes stack vertically.
- ConfigsRow may overflow horizontally (known Phase 6 cleanup target — not a regression).

**At 1280×900:**
- Sidebar expanded by default.
- Same flow, all widgets fit comfortably.

**Manual sidebar toggle:** Click the chevron at the top of the sidebar. At any width, the sidebar collapses/expands. Setting persists across app restarts.

**Drawer chevron:** Click the ▾ in the GearReviewPane header. The drawer closes, geared text is discarded (same effect as the Discard button).

**Discard button:** From any state (with or without geared text), clicking Discard clears the composer + draft + closes the drawer.
