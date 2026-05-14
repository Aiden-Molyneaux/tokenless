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
