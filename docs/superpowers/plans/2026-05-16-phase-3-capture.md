# Phase 3: Clipboard Capture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `clipboard:read-prompt` IPC channel + a new Capture button in the Composer that reads the user's clipboard, sanitizes the text, loads it into the prompt textarea, and surfaces all failure modes via the existing toast + Logger infrastructure. This is the READ direction of the v2 capture/send flow; Phase 4 mirrors it with the WRITE direction (Copy Geared).

**Architecture:** New IPC channel `clipboard:read-prompt` (invoke, returns `IpcResult<{text: string}>`). Main-process handler reads `clipboard.readText()`, runs a permissive sanitizer (ANSI escape strip + lone trailing prompt-prefix strip + NFC normalization), enforces a 32 KB length cap, and emits structured logs through a new `clipboard` Logger category. The renderer's Composer gets a "Capture" button on the left of ActionsRow that wires to the handler, manages a 3-second debounce on empty-clipboard misclicks via local state, shows an inline hint below the button on empty, and pushes toasts on too-large / read-failed.

**Tech Stack:** TypeScript 5 strict, Electron 32 (`clipboard` from `'electron'`), electron-vite 2, React 18, Vitest 2, Playwright 1.45.

**Branch:** All work happens on `v2/headless`. Phase exit is annotated tag `v2.0.0-phase-3-capture`.

---

## Out of scope

- The WRITE direction (`clipboard:write-geared` + Copy Geared button) → Phase 4
- Automated paste-into-terminal (Windows SendInput, global hotkey, terminal-window enumeration) → v2.1+
- Removing the Send button → Phase 4 replaces it with Copy Geared
- Removing Commit / Push buttons → Phase 5 may rework the ActionsRow into the final 4-button shape
- Half-screen layout reflow → Phase 5
- Settings UI for the clipboard length cap → Phase 5 / Settings rewrite (cap is hardcoded at 32 KB in Phase 3)
- CLAUDE.md / observability.md cleanup for the deferred `cc` / `pty` categories → Phase 6

---

## Design decisions captured during planning

| Decision | Choice | Why |
|---|---|---|
| Length cap | 32 KB after sanitization | Spec §4; large enough for any realistic prompt, small enough to catch "user pasted a 5MB log file." Configurable in Phase 5+. |
| Sanitization | ANSI escape strip + NFC normalize + lone trailing prompt-prefix strip | Spec §10 mitigation row 1. Permissive — preserve content + newlines. |
| Empty-clipboard UI | Inline hint below the Capture button, fades after 3s | Spec §7 row 1. Subtler than a toast for a high-frequency miss-click case. |
| Too-large / read-failed UI | Toast (existing `pushToast` surface) | Spec §7 rows 2-3. Rare cases, deserve attention. |
| Debounce on empty | Disable Capture for 3s after an EMPTY result | Spec §5 — "Disabled if clipboard read returned EMPTY in the last 3 seconds (debounce repeated misclicks)." |
| ActionsRow button count | Temporarily 6 (Capture, Gear, Send, Templates, Commit, Push) | Phase 4 will replace Send with Copy Geared (still 6); Phase 5 may drop Commit/Push to reach the final 4. The E2E count assertion bumps to 6 here. |
| Clipboard mocking strategy | Inject the Electron `clipboard` interface into the handler at construction time, with the real `clipboard` as the default | Lets the integration test pass a fake without touching the real OS clipboard. |
| Logger category | New `'clipboard'` entry in CATEGORIES tuple | Spec §7 — distinguishes capture/send paths from the catch-all `'ui'` and `'ipc'` categories. |

---

## File structure (created / modified / deleted)

**Created:**
- `src/shared/ipc/clipboard.ts` — IPC channel constant + types (`IPC_CLIPBOARD_READ_PROMPT`, `ClipboardReadPromptResponse`)
- `src/main/ipc/clipboard-handler.ts` — handler class with `install()` / `uninstall()` pattern, sanitizer, length-cap check, structured logging
- `src/main/__tests__/ipc/clipboard-handler.integration.test.ts` — exercises happy / empty / too-large / read-failed paths with a fake clipboard interface
- `src/renderer/src/components/composer/__tests__/capture-button.unit.test.tsx` — debounce + success path + error toasts + inline hint
- `test/e2e/capture-flow.e2e.test.ts` — full flow with the Electron clipboard pre-seeded

**Modified:**
- `src/shared/observability.ts` — add `'clipboard'` to the `CATEGORIES` tuple
- `docs/observability.md` — add a row describing the `clipboard` category
- `src/shared/ipc.ts` — re-export `IPC_CLIPBOARD_READ_PROMPT` + types; add `'clipboard:read-prompt'` to the `IpcChannelName` union
- `src/main/ipc/index.ts` — instantiate + install `ClipboardHandler`; add to `IpcRegistration`; uninstall in `uninstallAll`
- `src/preload/index.ts` — add `clipboard: { readPrompt(): Promise<ClipboardReadPromptResult> }` namespace + matching imports
- `src/preload/index.d.ts` — mirror the preload binding in the `TokenlessApi` type
- `src/renderer/src/components/composer/ActionsRow.tsx` — add the Capture `<button>` as the leftmost action
- `src/renderer/src/components/composer/Composer.tsx` — wire the Capture button: state for debounce + hint, handler that calls `window.tokenless.clipboard.readPrompt()`, loads text into the prompt textarea on success, pushes toasts on error, manages the hint state
- `src/renderer/src/components/composer/styles.css` — `.actions-row__button--capture` + `.capture-hint` styles
- `test/e2e/composer.e2e.test.ts` — bump the action-button count assertion 5 → 6
- `docs/test-scenarios.md` — append S-v2.1 (Capture from clipboard: empty / typical / 33KB)
- `docs/superpowers/specs/2026-05-16-tokenless-v2-headless-design.md` — mark Phase 3 shipped in §9 phase table (last commit of phase)

**Deleted:** none.

---

## Tasks

### Task 1: Add `clipboard` Logger category

**Files:**
- Modify: `src/shared/observability.ts`
- Modify: `docs/observability.md`

- [ ] **Step 1: Add `'clipboard'` to the CATEGORIES tuple**

Open `src/shared/observability.ts`. The `CATEGORIES` array currently has 11 entries (cc, pty, api, db, ipc, ui, skill, auth, gearing, fs, observability). Add `'clipboard'` — recommended position: between `'gearing'` and `'fs'` (alphabetical-ish grouping by feature area, with the catch-alls trailing).

Resulting tuple:
```typescript
export const CATEGORIES = [
  'cc',
  'pty',
  'api',
  'db',
  'ipc',
  'ui',
  'skill',
  'auth',
  'gearing',
  'clipboard',
  'fs',
  'observability'
] as const
```

- [ ] **Step 2: Add a row to observability.md**

In `docs/observability.md`, locate the `| Category | Use for |` table. Insert a new row for `clipboard` right after `gearing`. Content:

```markdown
| `clipboard` | Clipboard read/write paths for the v2 capture/send-back flow. Phase 3 events: `capture-read` (info, on successful read with sanitized-length context), `capture-empty` (info, on empty clipboard click), `capture-too-large` (warn, on >32KB clipboard), `capture-read-failed` (error, when `clipboard.readText()` throws). Phase 4 will add: `send-copied`, `send-write-failed`. |
```

- [ ] **Step 3: Verify**

```bash
git grep -n "'clipboard'" src/shared/observability.ts
git grep -n "clipboard" docs/observability.md | head -3
npm run typecheck
```
Expected: matches for both, typecheck PASS.

- [ ] **Step 4: Commit**

```bash
git add src/shared/observability.ts docs/observability.md
git commit -m "feat(phase-3): add 'clipboard' Logger category

Phase 3 introduces the capture flow (clipboard:read-prompt IPC).
The new category distinguishes clipboard paths from generic 'ui' /
'ipc' logs. Phase 4 will reuse it for the write direction.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Shared IPC types + channel constant

**Files:**
- Create: `src/shared/ipc/clipboard.ts`
- Modify: `src/shared/ipc.ts`

- [ ] **Step 1: Create `src/shared/ipc/clipboard.ts`**

```typescript
// IPC channels for the v2 clipboard-based capture / send-back flow.
// Phase 3 ships the READ direction (capture). Phase 4 adds WRITE (send).

import type { IpcResult } from './envelope'

export const IPC_CLIPBOARD_READ_PROMPT = 'clipboard:read-prompt'

export type ClipboardReadFailureCode = 'EMPTY' | 'TOO_LARGE' | 'READ_FAILED'

export interface ClipboardReadPromptResponse {
  readonly text: string
  // Optional: report how many characters were stripped by the sanitizer.
  // Useful for the renderer to show "captured (N chars trimmed)" hints
  // later if we want. Phase 3 doesn't surface this in UI; it's logged.
  readonly sanitizedLength: number
}

export type ClipboardReadPromptResult = IpcResult<ClipboardReadPromptResponse, ClipboardReadFailureCode>
```

- [ ] **Step 2: Re-export from `src/shared/ipc.ts`**

Add a new export block (recommended location: alphabetical-ish, between the existing blocks for `gearing` and `drafts` or at the end of the export list):

```typescript
export {
  IPC_CLIPBOARD_READ_PROMPT,
  type ClipboardReadFailureCode,
  type ClipboardReadPromptResponse,
  type ClipboardReadPromptResult
} from './ipc/clipboard'
```

Then add `'clipboard:read-prompt'` to the `IpcChannelName` union — recommended position: with the other newer channels, alphabetical-ish.

- [ ] **Step 3: Verify**

```bash
npm run typecheck
```
Expected: PASS. No runtime tests added in this task — they come in Task 3.

- [ ] **Step 4: Commit**

```bash
git add src/shared/ipc/clipboard.ts src/shared/ipc.ts
git commit -m "feat(phase-3): add IPC_CLIPBOARD_READ_PROMPT channel + types

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Main-process clipboard handler (TDD)

**Files:**
- Create: `src/main/__tests__/ipc/clipboard-handler.integration.test.ts` (write FIRST)
- Create: `src/main/ipc/clipboard-handler.ts`
- Modify: `src/main/ipc/index.ts`

This task is TDD: write the failing test first, then implement to make it pass.

- [ ] **Step 1: Write the failing integration test**

Create `src/main/__tests__/ipc/clipboard-handler.integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { ipcMain } from 'electron'
import { ClipboardHandler } from '@main/ipc/clipboard-handler'
import { IPC_CLIPBOARD_READ_PROMPT } from '@shared/ipc/clipboard'
import { Logger } from '@main/observability/logger'
import { RingBuffer } from '@main/observability/ring-buffer'

// Minimal fake of Electron's clipboard module — supports readText() returning
// whatever the test seeded.
interface FakeClipboard {
  readText(): string
  __seed(text: string): void
  __throw(err: Error): void
}

function makeFakeClipboard(): FakeClipboard {
  let value = ''
  let error: Error | null = null
  return {
    readText: () => {
      if (error) throw error
      return value
    },
    __seed: (text: string) => {
      value = text
      error = null
    },
    __throw: (err: Error) => {
      error = err
    }
  }
}

describe('ClipboardHandler integration', () => {
  let logger: Logger
  let fakeClipboard: FakeClipboard
  let handler: ClipboardHandler

  beforeEach(() => {
    logger = new Logger({ ringBuffer: new RingBuffer(100), sinks: [] })
    fakeClipboard = makeFakeClipboard()
    handler = new ClipboardHandler(logger, fakeClipboard)
    handler.install(ipcMain)
  })

  afterEach(() => {
    handler.uninstall(ipcMain)
  })

  async function invoke(): Promise<unknown> {
    // ipcMain's handlers receive a fake IpcMainInvokeEvent. We pass undefined args.
    const listeners = (ipcMain as unknown as EventEmitter).listeners(IPC_CLIPBOARD_READ_PROMPT)
    expect(listeners.length).toBeGreaterThan(0)
    return await (listeners[0] as (event: unknown) => Promise<unknown>)({})
  }

  it('returns the clipboard text on success', async () => {
    fakeClipboard.__seed('Refactor my auth middleware')
    const result = await invoke()
    expect(result).toEqual({
      ok: true,
      data: {
        text: 'Refactor my auth middleware',
        sanitizedLength: 'Refactor my auth middleware'.length
      }
    })
  })

  it('strips ANSI escape sequences from the captured text', async () => {
    fakeClipboard.__seed('\x1b[31mhello\x1b[0m world')
    const result = await invoke()
    expect(result).toEqual({
      ok: true,
      data: { text: 'hello world', sanitizedLength: 11 }
    })
  })

  it('strips a lone trailing terminal prompt prefix', async () => {
    fakeClipboard.__seed('Do the thing\n$ ')
    const result = await invoke() as { ok: true; data: { text: string } }
    expect(result.ok).toBe(true)
    expect(result.data.text).toBe('Do the thing')
  })

  it('normalizes Unicode to NFC', async () => {
    // 'é' as two code points (e + combining acute) → one composed code point
    fakeClipboard.__seed('é')
    const result = await invoke() as { ok: true; data: { text: string } }
    expect(result.data.text).toBe('é')
  })

  it('returns EMPTY when the clipboard is empty or whitespace-only', async () => {
    fakeClipboard.__seed('   \n  ')
    const result = await invoke()
    expect(result).toEqual({ ok: false, code: 'EMPTY' })
  })

  it('returns TOO_LARGE when the sanitized text exceeds 32KB', async () => {
    fakeClipboard.__seed('x'.repeat(33 * 1024))
    const result = await invoke()
    expect(result).toEqual({ ok: false, code: 'TOO_LARGE' })
  })

  it('returns READ_FAILED when readText() throws', async () => {
    fakeClipboard.__throw(new Error('clipboard access denied'))
    const result = await invoke()
    expect(result).toEqual({ ok: false, code: 'READ_FAILED' })
  })
})
```

Run: `npm run test:run -- clipboard-handler` (Vitest filter)

Expected: FAILS with "Cannot find module '@main/ipc/clipboard-handler'" or equivalent.

- [ ] **Step 2: Implement `src/main/ipc/clipboard-handler.ts`**

```typescript
// ClipboardHandler — Phase 3 of the v2 headless refactor. Reads the user's
// system clipboard, sanitizes the text, validates length, and returns an
// IpcResult. The clipboard interface is injected so tests can pass a fake.

import { clipboard as electronClipboard, type IpcMain } from 'electron'

import { IPC_CLIPBOARD_READ_PROMPT } from '@shared/ipc/clipboard'
import type { ClipboardReadPromptResult } from '@shared/ipc/clipboard'
import type { Logger } from '../observability/logger'

const MAX_LENGTH_BYTES = 32 * 1024

// Minimal interface so tests can inject a fake.
export interface ClipboardSurface {
  readText(): string
}

const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*[A-Za-z]/g
const TRAILING_PROMPT_PREFIX_RE = /\n\s*(?:PS\s*>|\$|>|#)\s*$/

function sanitize(raw: string): string {
  return raw
    .replace(ANSI_ESCAPE_RE, '')
    .normalize('NFC')
    .replace(TRAILING_PROMPT_PREFIX_RE, '')
}

export class ClipboardHandler {
  constructor(
    private readonly logger: Logger,
    private readonly clipboard: ClipboardSurface = electronClipboard
  ) {}

  install(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_CLIPBOARD_READ_PROMPT, () => this.handleReadPrompt())
  }

  uninstall(ipcMain: IpcMain): void {
    ipcMain.removeHandler(IPC_CLIPBOARD_READ_PROMPT)
  }

  private handleReadPrompt(): ClipboardReadPromptResult {
    let raw: string
    try {
      raw = this.clipboard.readText()
    } catch (err) {
      this.logger.error('clipboard', 'capture-read-failed', 'clipboard.readText() threw', {
        errorString: err instanceof Error ? err.message : String(err)
      })
      return { ok: false, code: 'READ_FAILED' }
    }

    const text = sanitize(raw)

    if (text.trim().length === 0) {
      this.logger.info('clipboard', 'capture-empty', 'clipboard returned empty/whitespace text', {
        rawLength: raw.length
      })
      return { ok: false, code: 'EMPTY' }
    }

    if (Buffer.byteLength(text, 'utf-8') > MAX_LENGTH_BYTES) {
      this.logger.warn('clipboard', 'capture-too-large', `clipboard text exceeds ${MAX_LENGTH_BYTES} bytes`, {
        sanitizedLength: text.length,
        sanitizedByteLength: Buffer.byteLength(text, 'utf-8')
      })
      return { ok: false, code: 'TOO_LARGE' }
    }

    this.logger.info('clipboard', 'capture-read', 'clipboard captured', {
      sanitizedLength: text.length,
      rawLength: raw.length
    })

    return { ok: true, data: { text, sanitizedLength: text.length } }
  }
}
```

- [ ] **Step 3: Register in `src/main/ipc/index.ts`**

Add the import:
```typescript
import { ClipboardHandler } from './clipboard-handler'
```

Inside `registerIpcHandlers(...)`, add:
```typescript
  const clipboardHandler = new ClipboardHandler(logger)
  clipboardHandler.install(ipcMain)
```

Add `clipboardHandler: ClipboardHandler` to `IpcRegistration`. Include `clipboardHandler` in the returned object. Add `clipboardHandler.uninstall(ipcMain)` to the `uninstallAll` body.

- [ ] **Step 4: Run the test — confirm it now passes**

```bash
npm run test:run -- clipboard-handler
```
Expected: all 7 cases PASS.

```bash
npm run typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/clipboard-handler.ts src/main/ipc/index.ts src/main/__tests__/ipc/clipboard-handler.integration.test.ts
git commit -m "feat(phase-3): add ClipboardHandler with sanitize + length cap + logs

Reads clipboard.readText(), strips ANSI escapes, normalizes Unicode
to NFC, strips a lone trailing terminal prompt prefix, and enforces
a 32 KB cap. Every path logs through the new 'clipboard' Logger
category. Clipboard surface is injected so the integration test
can swap in a fake.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Preload binding

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

- [ ] **Step 1: Add the namespace to `src/preload/index.ts`**

At the top, add the import (group with the other `IPC_*` + type imports):

```typescript
import {
  IPC_CLIPBOARD_READ_PROMPT,
  type ClipboardReadPromptResult
} from '@shared/ipc'
```

In the `api = { ... }` object, add a new namespace (recommended location: after `gearing` or near other small namespaces):

```typescript
  clipboard: {
    readPrompt(): Promise<ClipboardReadPromptResult> {
      return ipcRenderer.invoke(IPC_CLIPBOARD_READ_PROMPT) as Promise<ClipboardReadPromptResult>
    }
  },
```

- [ ] **Step 2: Mirror in `src/preload/index.d.ts`**

Add the matching method to the `TokenlessApi` interface. Recommended shape:

```typescript
  readonly clipboard: {
    readPrompt(): Promise<ClipboardReadPromptResult>
  }
```

Import `ClipboardReadPromptResult` from `@shared/ipc` at the top of the `.d.ts` file.

- [ ] **Step 3: Verify**

```bash
npm run typecheck
```
Expected: PASS.

```bash
git grep -n "clipboard\.readPrompt\|ClipboardReadPromptResult" src/preload
```
Expected: hits in both files.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(phase-3): expose window.tokenless.clipboard.readPrompt() on preload

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Composer Capture button — happy path

**Files:**
- Modify: `src/renderer/src/components/composer/ActionsRow.tsx`
- Modify: `src/renderer/src/components/composer/Composer.tsx`
- Modify: `src/renderer/src/components/composer/styles.css`

This task ships the happy path only — click Capture, the prompt textarea fills with whatever the clipboard returned. Task 6 adds the error handling + debounce. We split because the happy-path UI is the load-bearing change; error handling is incremental.

- [ ] **Step 1: Update the `ActionsRow` props type**

Open `src/renderer/src/components/composer/ActionsRow.tsx`. Add `onCapture: () => void` to the props interface. Add `captureDisabled?: boolean` (optional). Destructure in the component.

- [ ] **Step 2: Add the Capture button**

Place it as the LEFTMOST button in the row (before Gear). Pattern matches the other action buttons:

```tsx
<button
  type="button"
  className="actions-row__button actions-row__button--capture"
  onClick={onCapture}
  disabled={captureDisabled}
  aria-label="Capture prompt from clipboard"
>
  Capture
</button>
```

- [ ] **Step 3: Wire from `Composer.tsx`**

Add the handler near the existing `handleSend` / `handleGear`:

```typescript
const handleCapture = async (): Promise<void> => {
  const result = await window.tokenless.clipboard.readPrompt()
  if (result.ok) {
    setPrompt(result.data.text)
    return
  }
  // Error handling (debounce, hint, toasts) — Task 6.
  // For now, silently do nothing on failure paths so the happy path is testable.
}
```

Pass `onCapture={() => void handleCapture()}` to `<ActionsRow ... />`. No `captureDisabled` prop yet (Task 6 adds it).

- [ ] **Step 4: Add a styles.css rule for the Capture variant**

In `src/renderer/src/components/composer/styles.css`, find the existing `.actions-row__button--gear` / `--send` block. Add:

```css
.actions-row__button--capture {
  /* No special accent in phase 3 — the button gets visual prominence in
     phase 5 layout work. Phase 3 just renders it identical to other
     secondary buttons. */
}
```

(Empty block is fine — it documents intent and reserves the class for phase 5.)

- [ ] **Step 5: Manual smoke**

Run `npm run build && npm run build:unpack`, then launch `dist/win-unpacked/TokenLess.exe`. Open the Composer, copy some text in any application, click Capture, confirm the text appears in the prompt textarea.

If the build-unpack step fails on this dev box due to the winCodeSign noise (documented in phase 1), trust the integration test from Task 3 — Phase 5's E2E covers the renderer wiring end-to-end.

- [ ] **Step 6: Verify**

```bash
npm run typecheck
npm run test:run
```
Expected: PASS. No new tests yet (Task 6 + Task 7 add them).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/composer/ActionsRow.tsx src/renderer/src/components/composer/Composer.tsx src/renderer/src/components/composer/styles.css
git commit -m "feat(phase-3): add Capture button to ActionsRow (happy path)

Clicks the new clipboard:read-prompt IPC. On success, loads the
sanitized text into the prompt textarea. Error handling + debounce
land in the next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Capture button — error handling + debounce + tests (TDD)

**Files:**
- Create: `src/renderer/src/components/composer/__tests__/capture-button.unit.test.tsx`
- Modify: `src/renderer/src/components/composer/Composer.tsx`
- Modify: `src/renderer/src/components/composer/styles.css`

- [ ] **Step 1: Write the failing unit test**

Create `src/renderer/src/components/composer/__tests__/capture-button.unit.test.tsx`. The test exercises the Composer's Capture flow:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { Composer } from '../Composer'

// The full Composer has many deps. The test wraps it with minimal-stub deps
// so the Capture button + its hint state is what we're really testing.
// Replace this stub with whatever matches the existing Composer test fixture
// pattern (see turn-feedback-bar.unit.test.tsx for an example — but that file
// is gone after phase 2. Use any other Composer/component test for fixtures.)

interface ComposerHarnessProps {
  clipboard: { readPrompt: ReturnType<typeof vi.fn> }
  pushToast?: ReturnType<typeof vi.fn>
}

function renderComposer({ clipboard, pushToast = vi.fn() }: ComposerHarnessProps) {
  ;(window as unknown as { tokenless: unknown }).tokenless = {
    clipboard,
    log: { send: vi.fn(), subscribe: () => () => {}, getRecent: async () => [] },
    drafts: { save: vi.fn(), get: vi.fn().mockResolvedValue({ ok: true, data: null }), clear: vi.fn() },
    settings: { get: vi.fn().mockResolvedValue({ ok: true, data: null }), set: vi.fn() },
    gearing: { gear: vi.fn() },
    turns: { listByConversation: vi.fn().mockResolvedValue({ ok: true, data: [] }), onChanged: () => () => {} },
    telemetry: { onTick: () => () => {} },
    api: { onRetryAttempt: () => () => {} }
  }
  // Render with whatever the existing Composer harness expects — see
  // src/renderer/src/components/composer/__tests__ for the established pattern.
  return render(
    <Composer
      conversationId={null}
      pushToast={pushToast}
      // Add other required Composer props from the type — match existing tests.
    />
  )
}

describe('Composer / Capture button', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads the captured text into the prompt textarea on success', async () => {
    const clipboard = { readPrompt: vi.fn().mockResolvedValue({ ok: true, data: { text: 'captured!', sanitizedLength: 9 } }) }
    renderComposer({ clipboard })
    fireEvent.click(screen.getByRole('button', { name: /capture/i }))
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/your prompt|message/i)).toHaveValue('captured!')
    })
  })

  it('shows an inline hint on EMPTY result', async () => {
    const clipboard = { readPrompt: vi.fn().mockResolvedValue({ ok: false, code: 'EMPTY' }) }
    renderComposer({ clipboard })
    fireEvent.click(screen.getByRole('button', { name: /capture/i }))
    await waitFor(() => {
      expect(screen.getByText(/clipboard is empty/i)).toBeInTheDocument()
    })
  })

  it('disables the Capture button for 3 seconds after an EMPTY result', async () => {
    const clipboard = { readPrompt: vi.fn().mockResolvedValue({ ok: false, code: 'EMPTY' }) }
    renderComposer({ clipboard })
    const button = screen.getByRole('button', { name: /capture/i })
    fireEvent.click(button)
    await waitFor(() => expect(button).toBeDisabled())
    // After 3 seconds, the button re-enables.
    act(() => { vi.advanceTimersByTime(3000) })
    await waitFor(() => expect(button).not.toBeDisabled())
  })

  it('pushes a toast on TOO_LARGE', async () => {
    const pushToast = vi.fn()
    const clipboard = { readPrompt: vi.fn().mockResolvedValue({ ok: false, code: 'TOO_LARGE' }) }
    renderComposer({ clipboard, pushToast })
    fireEvent.click(screen.getByRole('button', { name: /capture/i }))
    await waitFor(() => {
      expect(pushToast).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringMatching(/more than 32 ?KB/i)
      }))
    })
  })

  it('pushes a toast on READ_FAILED', async () => {
    const pushToast = vi.fn()
    const clipboard = { readPrompt: vi.fn().mockResolvedValue({ ok: false, code: 'READ_FAILED' }) }
    renderComposer({ clipboard, pushToast })
    fireEvent.click(screen.getByRole('button', { name: /capture/i }))
    await waitFor(() => {
      expect(pushToast).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringMatching(/couldn't read clipboard/i)
      }))
    })
  })
})
```

**Important:** Match the existing Composer test harness pattern. If Composer requires props the harness above doesn't pass, copy them from a surviving Composer test in `src/renderer/src/components/composer/__tests__/` (Task 3 of Phase 2 left `turn-feedback-bar.unit.test.tsx` deleted, so look at other Composer-adjacent tests or any phase-1-era unit test that still wraps the Composer).

Run: `npm run test:run -- capture-button` — expected to FAIL on the 4 error-handling cases (happy path may pass from Task 5).

- [ ] **Step 2: Implement the error handling in `Composer.tsx`**

Replace the simplified `handleCapture` from Task 5 with:

```typescript
const [captureHint, setCaptureHint] = useState<string | null>(null)
const [captureDisabled, setCaptureDisabled] = useState<boolean>(false)
const captureHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

const handleCapture = async (): Promise<void> => {
  if (captureDisabled) return
  const result = await window.tokenless.clipboard.readPrompt()
  if (result.ok) {
    setPrompt(result.data.text)
    setCaptureHint(null)
    return
  }
  if (result.code === 'EMPTY') {
    setCaptureHint('Clipboard is empty. Copy text in your terminal first, then click Capture.')
    setCaptureDisabled(true)
    if (captureHintTimerRef.current) clearTimeout(captureHintTimerRef.current)
    captureHintTimerRef.current = setTimeout(() => {
      setCaptureDisabled(false)
      setCaptureHint(null)
      captureHintTimerRef.current = null
    }, 3000)
    return
  }
  if (result.code === 'TOO_LARGE') {
    pushToast({ severity: 'warn', message: 'Clipboard contains more than 32 KB. Trim your selection.' })
    return
  }
  if (result.code === 'READ_FAILED') {
    pushToast({ severity: 'error', message: "Couldn't read clipboard. Check Settings → Privacy → Clipboard permissions." })
    return
  }
}

// Cleanup the timer on unmount.
useEffect(() => () => {
  if (captureHintTimerRef.current) clearTimeout(captureHintTimerRef.current)
}, [])
```

Pass `captureDisabled={captureDisabled}` to `<ActionsRow ... />`. Render the hint somewhere below the action row (inside the Composer's main content, but visually under the Capture button — exact position depends on the existing layout; placing it as a sibling of `<TelemetryStrip ... />` is reasonable):

```tsx
{captureHint && (
  <p className="capture-hint" role="status">{captureHint}</p>
)}
```

Match `pushToast` to whatever shape the surviving Composer test fixtures expect (e.g., `pushToast({ severity, message })`). If the surface uses different arg shapes (`pushToast(message, severity)`), update accordingly.

- [ ] **Step 3: Add `.capture-hint` CSS**

In `src/renderer/src/components/composer/styles.css`:

```css
.capture-hint {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--text-muted, #666);
}
```

- [ ] **Step 4: Re-run the unit test**

```bash
npm run test:run -- capture-button
```
Expected: all 5 cases PASS.

```bash
npm run typecheck
npm run test:run
```
Expected: both PASS. Full suite at ~277 tests (was 272, +5 from this test).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/composer/Composer.tsx src/renderer/src/components/composer/styles.css src/renderer/src/components/composer/__tests__/capture-button.unit.test.tsx
git commit -m "feat(phase-3): Capture button error handling + 3s debounce + tests

Empty clipboard → inline hint below the row, button disabled for 3s.
Too-large → warn toast. Read-failed → error toast. New unit test
covers happy + 4 error paths.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: E2E + scenarios doc + button-count update

**Files:**
- Modify: `test/e2e/composer.e2e.test.ts`
- Create: `test/e2e/capture-flow.e2e.test.ts`
- Modify: `docs/test-scenarios.md`

- [ ] **Step 1: Bump the action-button count assertion in `composer.e2e.test.ts`**

Find the line `await expect(page.locator('.actions-row__button')).toHaveCount(5)` (added in Phase 2 task 10). Change to 6, update the surrounding comment:

```typescript
  // Phase 3 (v2 headless): Capture + Gear + Send + Templates + Commit + Push = 6 buttons.
  // Phase 4 will replace Send with Copy Geared (still 6); Phase 5 may drop
  // Commit/Push to reach the final 4-button row.
  await expect(page.locator('.actions-row__button')).toHaveCount(6)
```

- [ ] **Step 2: Create `test/e2e/capture-flow.e2e.test.ts`**

```typescript
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test.describe('Phase 3 capture flow', () => {
  let userDataDir: string
  let app: ElectronApplication

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'tokenless-e2e-'))
    app = await electron.launch({
      args: ['out/main/index.js'],
      env: {
        ...process.env,
        TOKENLESS_USER_DATA_DIR: userDataDir,
        TOKENLESS_SKIP_ONBOARDING: '1'
      }
    })
  })

  test.afterEach(async () => {
    if (app) {
      try { await app.close() } catch { /* best-effort */ }
    }
    if (existsSync(userDataDir)) {
      rmSync(userDataDir, { recursive: true, force: true })
    }
  })

  test('Capture button loads sanitized clipboard text into the prompt textarea', async () => {
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')

    // Seed the OS clipboard via Electron's clipboard module (main-process side).
    await app.evaluate(({ clipboard }) => {
      clipboard.writeText('Refactor src/auth.ts — short answer please')
    })

    // Skip past the project-creation onboarding by clicking "Create your first
    // project" (this app uses TOKENLESS_SKIP_ONBOARDING=1 to skip the wizard,
    // but the EmptyProjectsState still shows. Match the existing E2E pattern
    // for project creation in smoke.e2e.test.ts or composer.e2e.test.ts.)
    await win.getByRole('button', { name: /create your first project/i }).click()
    await win.getByPlaceholder('My Project').fill('Capture Test')
    await win.getByPlaceholder('C:/path/to/project').fill('C:/tmp/e2e-capture')
    await win.getByRole('button', { name: /^create$/i }).click()
    await win.waitForSelector('.composer', { timeout: 5000 })

    // Click Capture
    await win.getByRole('button', { name: /capture prompt from clipboard|^capture$/i }).click()

    // The prompt textarea fills with the sanitized clipboard text.
    await expect(win.locator('.prompt-textarea')).toHaveValue('Refactor src/auth.ts — short answer please')
  })

  test('shows the inline empty-hint when the clipboard is empty', async () => {
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')

    await app.evaluate(({ clipboard }) => {
      clipboard.writeText('')
    })

    await win.getByRole('button', { name: /create your first project/i }).click()
    await win.getByPlaceholder('My Project').fill('Empty Test')
    await win.getByPlaceholder('C:/path/to/project').fill('C:/tmp/e2e-empty')
    await win.getByRole('button', { name: /^create$/i }).click()
    await win.waitForSelector('.composer', { timeout: 5000 })

    await win.getByRole('button', { name: /capture prompt from clipboard|^capture$/i }).click()

    await expect(win.getByText(/clipboard is empty/i)).toBeVisible()
  })
})
```

- [ ] **Step 3: Append to `docs/test-scenarios.md`**

At the end of the file, add:

```markdown
## S-v2.1: Clipboard capture (Phase 3)

**Setup:** Launch the unpacked app. Have any other application open (Notepad, browser, terminal) ready to be the clipboard source.

**Empty case:** With nothing on the clipboard (or all-whitespace), click Capture. Expect: inline hint "Clipboard is empty. Copy text in your terminal first, then click Capture." appears below the action row. The Capture button is disabled for 3 seconds. After 3 seconds, the button re-enables and the hint clears.

**Typical case:** Copy a multi-line prompt from any application (e.g., "Refactor src/auth.ts to flatten conditionals."). Click Capture. Expect: the prompt textarea fills with the exact text (modulo ANSI escapes stripped + Unicode normalized to NFC + a trailing prompt prefix like `$ ` stripped if present).

**Too-large case:** Generate ~40 KB of text (`x` repeated, or paste a large log file). Click Capture. Expect: a warn toast "Clipboard contains more than 32 KB. Trim your selection." appears; the prompt textarea is unchanged.

**Read-failed case:** Hard to reproduce manually on Windows — `clipboard.readText()` rarely throws. Verified in the integration test by injecting a fake clipboard that throws.
```

- [ ] **Step 4: Verify**

```bash
npm run build
npm run build:unpack
npm run test:e2e
```
Expected: 11 + 2 (capture-flow) + 0 (the previous skipped tests stay skipped) = 13 passed, 2 skipped, 0 failures.

If `test:e2e` flakes on the project-creation onboarding (the buttons may have changed since the test was drafted), update the locators to match the current app — borrow from `composer.e2e.test.ts` lines 60-65 which use the same pattern.

- [ ] **Step 5: Commit**

```bash
git add test/e2e/composer.e2e.test.ts test/e2e/capture-flow.e2e.test.ts docs/test-scenarios.md
git commit -m "test(phase-3): E2E capture-flow + scenarios + button-count bump

E2E pre-seeds the Electron clipboard via app.evaluate(), clicks
Capture, asserts the prompt textarea fills. Empty-case test
verifies the inline hint appears. Composer button count 5 -> 6.
Scenarios doc gets S-v2.1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Verification gate + phase tag

- [ ] **Step 1: Typecheck**

```bash
npm run typecheck
```
Expected: exit 0.

- [ ] **Step 2: Unit + integration tests**

```bash
npm run test:run
```
Expected: PASS. ~284 tests (Phase 2 ended at 272; Task 3 adds 7 integration tests, Task 6 adds 5 unit tests).

- [ ] **Step 3: Build**

```bash
npm run rebuild:electron
npm run build
```
Expected: PASS.

- [ ] **Step 4: Build unpacked**

```bash
npm run build:unpack
```
Expected: `dist/win-unpacked/TokenLess.exe` produced. winCodeSign symlink errors are harmless noise.

- [ ] **Step 5: E2E suite**

```bash
npm run test:e2e
```
Expected: 13 passed, 2 skipped, 0 failures.

- [ ] **Step 6: Update spec phase table**

In `docs/superpowers/specs/2026-05-16-tokenless-v2-headless-design.md`, update row 3 of the §9 phase table:

```markdown
| 3 | `v2.0.0-phase-3-capture` | `clipboard:read-prompt` IPC, Capture button in Composer, validation + observability + tests. | shipped 2026-05-16 (8 tasks, ~284 tests green, E2E capture-flow passing) |
```

Commit:
```bash
git add docs/superpowers/specs/2026-05-16-tokenless-v2-headless-design.md
git commit -m "docs(phase-3): mark phase 3 shipped in spec phase table

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Tag the phase exit**

```bash
git tag -a v2.0.0-phase-3-capture -m "Phase 3: clipboard capture flow shipped.

Adds clipboard:read-prompt IPC, ClipboardHandler with sanitize
(ANSI strip + NFC normalize + lone trailing prompt-prefix strip)
+ 32 KB length cap, new 'clipboard' Logger category, Capture
button (leftmost in ActionsRow) with 3s debounce on empty + toasts
on too-large/read-failed + inline hint on empty.

Verification gate:
- Typecheck: clean
- Unit + integration: ~284 tests green
- Build + build:unpack: TokenLess.exe produced
- E2E: 13 passed (incl. new capture-flow.e2e.test.ts), 2 skipped, 0 failures

8 tasks (~9 commits) between v2.0.0-phase-2-strip-dependents and this tag.

Carry-over to phase 4 (send direction): the symmetric
'clipboard:write-geared' IPC + Copy Geared button + send-copied /
send-write-failed log events."
```

Do NOT push the tag yet — user pushes.

---

## Self-review

**Spec coverage (§9 phase plan row 3: "`clipboard:read-prompt` IPC, Capture button in Composer, validation + observability + tests."):**
- Clipboard read IPC: Task 2 (types) + Task 3 (handler) ✓
- Capture button: Task 5 (happy path) + Task 6 (error handling + debounce) ✓
- Validation: Task 3 (length cap + empty + sanitize) ✓
- Observability: Task 1 (Logger category + docs row) + structured logging in Task 3 handler ✓
- Tests: Task 3 (integration), Task 6 (unit), Task 7 (E2E + scenarios) ✓

**Placeholder scan:** No "TBD" / "TODO" / "appropriate". The empty `.actions-row__button--capture` CSS rule in Task 5 is intentional (reserves the class for Phase 5 styling) and documented as such. ✓

**Type consistency:**
- `ClipboardReadPromptResult` = `IpcResult<ClipboardReadPromptResponse, ClipboardReadFailureCode>` — defined in Task 2, consumed by handler in Task 3, by preload in Task 4, by Composer in Tasks 5-6, by tests in Tasks 3 + 6 + 7. ✓
- `ClipboardReadFailureCode` = `'EMPTY' | 'TOO_LARGE' | 'READ_FAILED'` — handler emits these codes, Composer discriminates on them via switch / if-chain. ✓
- `'clipboard'` category — added to `CATEGORIES` tuple in Task 1, used by handler logs in Task 3. ✓

**Open notes resolved inline:**
- Composer test harness — Task 6 explicitly says "match the existing Composer test fixture pattern; if Composer requires props the harness doesn't pass, copy them from a surviving test." This is delegated to the implementer because the exact prop shape post-Phase-2 isn't fully knowable without reading the current Composer.tsx.
- `pushToast` shape — same note. Implementer adapts to the surviving call shape.
- E2E project-creation onboarding — Task 7 says "borrow from composer.e2e.test.ts lines 60-65 for the locator pattern." Concrete enough.

---

## Exit state

- Branch `v2/headless` advanced by ~9 commits + 1 tag (`v2.0.0-phase-3-capture`).
- App builds + launches; Composer has 6 action buttons (Capture is leftmost). Clicking Capture reads the clipboard, sanitizes the text, loads it into the prompt textarea. Edge cases surface as toast or inline hint.
- Unit + integration suite green at ~284 tests (was 272).
- E2E suite green at 13 passed, 2 skipped, 0 failures.
- `clipboard` Logger category registered; events `capture-read` / `capture-empty` / `capture-too-large` / `capture-read-failed` flow through Developer Mode.
- `package.json` unchanged.
- DB schema unchanged.
- CLAUDE.md unchanged (Phase 6).
- Tag `v2.0.0-phase-3-capture` exists locally, awaiting user push.

Phase 4 plan (`2026-05-16-phase-4-send.md`) — adds the `clipboard:write-geared` IPC + Copy Geared button that replaces Send + `send-copied` / `send-write-failed` log events — is the next planning step, written after Phase 3 ships.

---
