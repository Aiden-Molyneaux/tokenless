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
