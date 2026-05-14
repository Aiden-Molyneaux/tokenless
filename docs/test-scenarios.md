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
