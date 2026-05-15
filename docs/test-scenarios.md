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
10. Click "Gear" again, then "Send geared". Verify composer reappears with prompt cleared.

**Expected:**
- All dropdowns open/close with outside-click + Escape behavior intact.
- Tooltips render on hover and disappear on mouse leave.
- GearReviewPane shows the canned MOCK_GEARED_PROMPT in the editable side.
- Token-savings indicator appears in the geared pane header ("saves ~N tok").
- Re-gear logs `ui/re-gear-clicked` to Dev Mode; Send geared logs `ui/send-geared`; Cancel logs `ui/gear-cancel`.

## Scenario: Phase 2B — Terminal section displays canned ANSI

**Preconditions:** App built and running.

**Steps:**
1. Observe the terminal pane at the bottom of MainPane.
2. Wait for the mock stream to play through (~10-15 seconds total).
3. Click the "◼ Stop" button.
4. Hover the context budget meter.

**Expected:**
- Terminal pane displays dark background with the Claude Code banner, Read/Glob tool calls, refactor narrative, and savings summary.
- ANSI color codes render (cyan for user prompt, yellow for tool calls, green for Claude's response, dim gray for tool output).
- Stop button is enabled during streaming, disabled after click.
- Context budget meter shows "42%" with a blue bar fill.
- Hover on meter shows tooltip with current/total token counts.

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

## Phase 4A — Real claude subprocess + Send

### S-4A.1 New conversation spawns real claude
**Preconditions:** real claude installed + authenticated for the active account; project root is a directory you don't mind claude reading.

1. Launch the app. Active project + Personal account selected.
2. Click "New Conversation" in the sidebar.
3. **Expect:** A new conversation row appears in the sidebar with status active. The terminal pane shows real claude's banner / prompt. `db-online` and `cc-start` log entries visible in Dev Mode (with the sessionId UUID).
4. **Verify (Dev Mode):** Find the `cc-start` row; expand its context. `pid` is a real OS process id. `sessionId` matches a `--session-id <uuid>` arg you can see in Task Manager → claude.exe → command line.

### S-4A.2 Send echoes through the real claude
1. Continuing from S-4A.1, type "Reply with exactly PING-OK" into the composer.
2. Click Send.
3. **Expect:** The terminal pane scrolls with claude's response, ending with "PING-OK" somewhere in the stream. The composer textarea clears. A `send-success` log entry shows up in Dev Mode with the `turnId`.
4. **Verify (DB):** Open `%APPDATA%/tokenless/tokenless.db` in SQLite Browser. The `turns` table has a row with role=`user`, `original_prompt` = "Reply with exactly PING-OK", `conversation_id` matching the active conversation.

### S-4A.3 Two conversations, two PTYs
1. Open a second conversation via "New Conversation" while the first is still active.
2. **Expect:** Both conversations appear in the sidebar. Switching between them swaps the terminal pane's `conversationId` prop — but the previous terminal's PTY is still running in main. The new conversation's terminal pane shows its own claude session.
3. **Verify (Dev Mode):** Two distinct `cc-start` entries with distinct sessionIds.

### S-4A.4 Quit closes all PTYs
1. With at least one conversation active, quit the app (Cmd/Ctrl+Q).
2. **Expect:** Task Manager shows no leftover `claude.exe` processes after 2 seconds. A `shutdown` log entry plus `before-quit, releasing resources` precedes the quit.

### S-4A.5 Send with no active conversation
1. Launch the app with NO conversations (delete the DB or fresh first-run).
2. Click into the composer textarea, type a prompt, click Send.
3. **Expect:** Send is disabled (greyed out). If somehow clicked, a `send-no-conversation` warn log entry appears. No turn row created.

## Phase 4B — Parser + Stop + Resume

### S-4B.1 Stop kills a running response
1. Launch the app, create project, click New Conversation, send a long prompt.
2. While claude is streaming a response, click Stop.
3. **Expect:** The terminal stops appending output. Dev Mode shows `cc-stop` and `terminal-stop-ok` log entries. The `turns` table's most-recent row has `status = 'stopped'`.

### S-4B.2 Resume across restart
1. Launch the app, create project, New Conversation, send a prompt, wait for completion.
2. Quit the app entirely (Cmd/Ctrl+Q).
3. Relaunch. The conversation appears in the sidebar.
4. Click the conversation.
5. **Expect:** Dev Mode shows `cc-resume` log entry with the stored `sessionId`. The Send button is enabled — typing + Send works as expected.

### S-4B.3 Resume with no stored sessionId fails cleanly
1. Open DB browser, NULL out a conversation's `cc_session_id` column.
2. Restart the app, click that conversation.
3. **Expect:** `cc-resume` warn log fires with `NOT_FOUND` code. UI proceeds — Stop is enabled (since we still consider the conversation active) but Send will also fail with NOT_FOUND until a fresh `cc:start` happens.

### S-4B.4 Claude not found
1. Quit the app. Set `TOKENLESS_CLAUDE_BIN=C:/no/such/path/claude.cmd`. Relaunch.
2. Create project, click New Conversation.
3. **Expect:** Modal appears: "Claude Code not found." Dev Mode shows `cc-start` warn with `CLAUDE_NOT_FOUND` code. Dismiss closes the modal; no conversation is created (the DB row that was created BEFORE the spawn is left orphaned for now — Phase 4C cleanup task).

### S-4B.5 Two conversations, stop one while the other streams
1. Open conversation A, send a long prompt. Open conversation B (sidebar click on a different conversation row), send another prompt.
2. **Expect:** Both stream independently — switching tabs shows the right output (because TerminalPane is keyed by conversationId, the xterm instance is per-conversation).
3. Click Stop on B.
4. **Expect:** B stops, A continues. The turns table for B has the latest row with `status='stopped'`. A's turns are unaffected.

## Phase 4C — Failure modes + telemetry

### S-4C.1 Crash toast on non-zero exit
1. Launch with TOKENLESS_MOCK_CRASH_AFTER_MS=500 + TOKENLESS_CLAUDE_BIN=mock-claude.cmd.
2. Create project, click New Conversation.
3. **Expect:** Within ~1s an error toast appears: "Claude Code crashed (exit 1). Conversation saved — try resuming." Dev Mode shows `cc-crashed` log entry. The conversation row IS persisted (still in sidebar after restart).

### S-4C.2 Hung banner on idle conversation
1. Launch with the mock. Create project, New Conversation.
2. Manually pause the mock's stdin (or just don't type anything) for >60s.
3. **Expect:** Hung banner appears above the terminal: "Claude has been idle for a minute — still working?" Click Stop to dismiss + kill the PTY.

### S-4C.3 PTY write fail toast
Hard to trigger manually — the test double simulates this. Scenario for documentation:
1. After a Stop or crash, the PTY is dead but the renderer hasn't fully caught up.
2. Type a prompt + Send.
3. **Expect:** Error toast: "Couldn't send prompt — PTY connection lost. Restart the conversation." Dev Mode shows `send-failed` with code `PTY_WRITE_FAILED`.

### S-4C.4 Orphan cleanup on CLAUDE_NOT_FOUND
1. Launch with TOKENLESS_CLAUDE_BIN=C:/nonexistent.cmd.
2. Create project, click New Conversation.
3. CLAUDE_NOT_FOUND modal appears.
4. **Expect:** After dismissing the modal, the sidebar has NO orphan conversation row (it was deleted because cc:start failed).

### S-4C.5 Telemetry meter shows real usage
1. Launch with the mock (which emits `tokens: N/200000` lines).
2. Create project, New Conversation, send a few prompts.
3. **Expect:** The Context: meter in the terminal toolbar shows a non-zero value within 3-4 seconds of each send. The value increases monotonically as the mock's tokens counter accumulates.

## Phase 5A — Gearing engine

### S-5A.1 Happy gearing path
1. Set `ANTHROPIC_API_KEY` env var. Launch the app. Create project + New Conversation.
2. Type a verbose prompt (e.g., "Could you please take a look at the auth middleware...").
3. Click Gear.
4. **Expect:** Within ~2s the GearReviewPane appears with a noticeably shorter geared prompt. Critique flags (info/warn) visible if applicable. Cost preview shows expected $ for the user-selected model + Haiku meta cost.

### S-5A.2 Send the geared prompt
1. From the gear review pane, click "Send geared".
2. **Expect:** The prompt sent to claude is the GEARED text. Verify in Dev Mode logs: `send-success` entry's `promptLength` matches the geared length, not the original.

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

### S-5B.2 Send original auto-suggest
1. Trigger any non-auth gearing failure (easiest: temporarily set `ANTHROPIC_API_KEY=invalid_after_validation` so the call fails post-auth somehow — or simulate via 5xx by network manipulation).
2. **Expect:** Toast appears with a "Send original" button. Clicking it sends the original prompt to claude (verify in Dev Mode `send-success` entry, prompt clears).

### S-5B.3 Live cost estimate
1. With a project + conversation active, type into the composer.
2. **Expect:** Within ~500ms of typing pause, the TelemetryStrip shows the current model + estimated $ + token counts. Updates as you change the model selection or breadth.
3. Clear the prompt.
4. **Expect:** Strip returns to idle hint.

### S-5B.4 Summary refresh after assistant turn
1. Launch with real Claude Code installed + `ANTHROPIC_API_KEY` set.
2. Start a conversation, send a prompt, wait for claude's response to complete (prompt-ready event fires).
3. **Expect:** Within ~1s, Dev Mode shows `summary-refresh-ok` log entry with a summary length. DB inspection: `conversations.summary` column for this conversation has a populated string; `summary_updated_at` is recent.

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

### S-7A.2 Send clears the draft
1. Continuing from S-7A.1, click Send.
2. **Expect:** Composer text clears. `drafts-clear` log entry visible in Dev Mode.
3. Switch away + back.
4. **Expect:** Composer is empty (no leftover draft).

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
