# Phase 4C: §7.1 Failure Modes + Telemetry Tick Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the user-visible reliability gaps from spec §7.1 (mid-session crash, watchdog hang, PTY write-fail) plus light up the ContextBudgetMeter with real values via the §4 "telemetry tick" flow. Also resolve the Phase 4B review nits (cc-stop test magic sleep, parser `>` false-positive, modal text). Output-pattern failures (quota/auth/resume-fail) are still deferred to Phase 4D because their deep recovery UIs (AccountSwitcher highlight, "Switch to API" toggle, branch-from-last-turn button) depend on Phases 5–7 backends.

**Architecture:** A cross-cutting `<Toast>` component (rendered once at the AppShell root) consumes a tiny in-renderer event bus so any component can `pushToast(...)`. Mid-session crashes fire from `CcLifecycle`'s existing `onExit` callback — when the exit code is non-zero AND no graceful prompt-ready event came beforehand, the main process emits a structured `cc:crashed` IPC broadcast that AppShell maps to a toast. A `Watchdog` class lives inside CcLifecycle (one per slot), resetting on every `onData` chunk; it fires a `cc:hung` IPC event after 90s of silence (configurable for tests). PTY write failures throw from `lifecycle.write()` — `CcHandler.send` catches and returns a `PTY_WRITE_FAILED`-coded envelope. Telemetry tick is driven by the parser's existing `tokens-used` events: main keeps the latest per-conversation value and pushes a `telemetry:tick` IPC every ~3s while the conversation is active. `ContextBudgetMeter` switches from `MOCK_CONTEXT_BUDGET` to a `useTelemetry(conversationId)` hook. Orphan rows (created by `handleNewConversation` before a failed `cc:start`) get deleted from the renderer when the handler reports a non-recoverable error.

**Tech Stack:** Same as Phase 4B. No new dependencies. The watchdog uses `setTimeout` — easy to mock in tests via a clock-injection seam (`now: () => number` + `schedule: (fn, ms) => Timer`).

---

## File Structure

**New files (main):**
- `src/main/cc/watchdog.ts` — `Watchdog` class (per-slot idle timer)
- `src/main/cc/telemetry-emitter.ts` — periodic `telemetry:tick` emitter
- `src/main/__tests__/cc/watchdog.unit.test.ts`
- `src/main/__tests__/cc/telemetry-emitter.unit.test.ts`

**New files (shared):**
- `src/shared/ipc/telemetry.ts` — `telemetry:tick` channel + payload
- `src/shared/types/telemetry.ts` — `TelemetryTick` interface

**New files (renderer):**
- `src/renderer/src/components/notifications/Toast.tsx`
- `src/renderer/src/components/notifications/ToastHost.tsx`
- `src/renderer/src/hooks/use-toast.ts` (or context + provider)
- `src/renderer/src/hooks/use-telemetry.ts`
- `src/renderer/src/hooks/__tests__/use-telemetry.unit.test.tsx`
- `src/renderer/src/components/terminal/HungBanner.tsx`

**New files (tests):**
- `test/e2e/cc-crash.e2e.test.ts`
- `test/e2e/telemetry-meter.e2e.test.ts`

**Modified files:**
- `src/shared/ipc/cc.ts` — add `IPC_CC_CRASHED`, `IPC_CC_HUNG` channels + payloads; add `PTY_WRITE_FAILED` to result codes (just a type union)
- `src/shared/ipc.ts` — re-export new constants
- `src/main/cc/lifecycle.ts` — instantiate Watchdog per slot; route non-zero exits through a "crashed" path; wrap `write()` in try/catch and surface as IPC event
- `src/main/cc/parser.ts` — narrow prompt regex (drop the bare `>` matcher); add a Phase 4D placeholder note for quota/auth/resume-fail patterns
- `src/main/ipc/cc-handler.ts` — `send()` catches `PTY_WRITE_FAILED` from lifecycle.write
- `src/main/ipc/index.ts` — broadcast `cc:crashed` + `cc:hung` from lifecycle callbacks; start `TelemetryEmitter` with the lifecycle
- `src/preload/index.ts`, `src/preload/index.d.ts` — expose `cc.onCrashed`, `cc.onHung`, `telemetry.onTick`
- `src/renderer/src/components/layout/AppShell.tsx` — mount `<ToastHost>`; subscribe to `cc.onCrashed` + `cc.onHung` + delete orphan conversation row on `cc:start` failure; replace ClaudeNotFoundModal body text
- `src/renderer/src/components/terminal/TerminalSection.tsx` — render `<HungBanner>` over xterm when conversation is hung
- `src/renderer/src/components/terminal/TerminalToolbar.tsx` — accept `contextBudget: { used, total, percentUsed } | null` prop instead of importing `MOCK_CONTEXT_BUDGET`; render fallback when null
- `src/renderer/src/mocks/telemetry.ts` — DELETE `MOCK_CONTEXT_BUDGET` (keep `MOCK_COST_PREVIEW` — Phase 5 owns that)
- `test/e2e/cc-stop.e2e.test.ts` — replace `waitForTimeout(500)` with a deterministic wait
- `docs/decisions.md` — ADR-029 (telemetry tick design)
- `docs/observability.md` — add Phase 4C events
- `docs/test-scenarios.md` — append Phase 4C scenarios

---

## Task 1: Phase 4B nits — narrow prompt matcher + modal text refresh

**Why first:** small, isolated, removes a known false-positive risk before more parser work lands.

**Files:**
- Modify: `src/main/cc/parser.ts`
- Modify: `src/main/__tests__/cc/parser.unit.test.ts`
- Modify: `src/renderer/src/components/notifications/ClaudeNotFoundModal.tsx`

- [ ] **Step 1: Narrow `isPromptLine`**

The Phase 4B parser had `isPromptLine` matching `^(?:claude-mock>|>)\s*$` — the bare `>` matches any line that's just `>` (which claude or any shell-like output can produce). Tighten it to known prompt strings only:

Edit `src/main/cc/parser.ts`:

```ts
function isPromptLine(line: string): boolean {
  const trimmed = line.replace(/\r/g, '').trimEnd()
  // Known prompt patterns. The bare `>` regex from Phase 4B is removed because
  // it false-positives on shell-style continuation output. Phase 4D will
  // calibrate this against real claude output (which uses different markers).
  return trimmed === 'claude-mock>' || trimmed === 'claude>'
}
```

- [ ] **Step 2: Update tests to remove the bare-`>` case**

The Phase 4B test had cases that may rely on the bare `>` matcher. Find them:

```bash
grep -n "'>'" src/main/__tests__/cc/parser.unit.test.ts
```

Review each — if a test feeds a bare `>` and expects prompt-ready, rewrite it to feed `claude-mock>`. If a test feeds `> ` expecting prompt-ready, same change.

- [ ] **Step 3: Refine `ClaudeNotFoundModal` body text**

Phase 4B's Modal said something like "Make sure Claude Code CLI is installed and available in your PATH." The plan's original text was more specific:

```tsx
<p>
  TokenLess couldn&apos;t find the <code>claude</code> command. Install Claude
  Code from{' '}
  <a href="https://claude.com/code" target="_blank" rel="noreferrer">
    claude.com/code
  </a>{' '}
  and ensure it&apos;s on your PATH, or set <code>TOKENLESS_CLAUDE_BIN</code>
  to its full path.
</p>
<p className="claude-not-found-modal__hint">
  (A Settings &rarr; &ldquo;Claude Code path&rdquo; field lands in Phase 8 polish.)
</p>
```

Read the current `ClaudeNotFoundModal.tsx` and adapt to its existing structure. The contract: link to claude.com, mention `TOKENLESS_CLAUDE_BIN` as the path override, note Settings is forthcoming.

- [ ] **Step 4: Verify**

```bash
npm run typecheck
npm run test:run
```

Expected: clean + parser tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/cc/parser.ts src/main/__tests__/cc/parser.unit.test.ts \
        src/renderer/src/components/notifications/ClaudeNotFoundModal.tsx
git commit -m "fix(phase-4c): narrow CcParser prompt matcher + refine ClaudeNotFoundModal copy"
```

---

## Task 2: Toast component + ToastHost + useToast

**Why early:** Tasks 6 (crash), 7 (write-fail), 10 (hung — though hung uses an inline banner not a toast) all surface via toasts. Toast infrastructure first lets later tasks just push.

**Files:**
- Create: `src/renderer/src/components/notifications/Toast.tsx`
- Create: `src/renderer/src/components/notifications/ToastHost.tsx`
- Create: `src/renderer/src/hooks/use-toast.ts`
- Modify: `src/renderer/src/components/notifications/styles.css` (already exists from Phase 4B)
- Create: `src/renderer/src/hooks/__tests__/use-toast.unit.test.tsx`

- [ ] **Step 1: Write the failing useToast test**

Create `src/renderer/src/hooks/__tests__/use-toast.unit.test.tsx`:

```ts
import { describe, it, expect, beforeEach, act } from 'vitest'
import { render, screen } from '@testing-library/react'

import { ToastProvider, useToast } from '../use-toast'
import { ToastHost } from '../../components/notifications/ToastHost'

// Purpose: pushToast adds a toast to the rendered list. dismissToast removes
// it. Toasts have a stable id + auto-expire after their duration (timer logic
// will land later — for this task just verify the push + dismiss path).

function ConsumerButton({ label, severity }: { label: string; severity: 'info' | 'warn' | 'error' }): JSX.Element {
  const { push } = useToast()
  return (
    <button type="button" onClick={() => push({ message: label, severity })}>
      Push
    </button>
  )
}

describe('hooks/use-toast', () => {
  beforeEach(() => {
    // Each test starts with a fresh provider (mounted by render below)
  })

  it('pushToast adds a toast that ToastHost renders', () => {
    render(
      <ToastProvider>
        <ToastHost />
        <ConsumerButton label="hello world" severity="info" />
      </ToastProvider>
    )
    act(() => {
      screen.getByRole('button', { name: /push/i }).click()
    })
    expect(screen.getByText('hello world')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('the dismiss button removes the toast', () => {
    render(
      <ToastProvider>
        <ToastHost />
        <ConsumerButton label="dismiss me" severity="warn" />
      </ToastProvider>
    )
    act(() => {
      screen.getByRole('button', { name: /push/i }).click()
    })
    expect(screen.getByText('dismiss me')).toBeInTheDocument()
    act(() => {
      screen.getByRole('button', { name: /dismiss toast/i }).click()
    })
    expect(screen.queryByText('dismiss me')).not.toBeInTheDocument()
  })
})
```

The `act` import is from `vitest`'s react testing tooling — if it's not there, import from `@testing-library/react`.

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:run -- src/renderer/src/hooks/__tests__/use-toast.unit.test.tsx
```

Expected: FAIL — `use-toast` not found.

- [ ] **Step 3: Implement ToastProvider + useToast hook**

Create `src/renderer/src/hooks/use-toast.ts`:

```tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type ToastSeverity = 'info' | 'warn' | 'error'

export interface Toast {
  readonly id: string
  readonly message: string
  readonly severity: ToastSeverity
  // Optional action label + callback for a single "Open in Dev Mode" / "Retry"
  // / "Dismiss" affordance. Phase 4D will use this for branch-from-turn.
  readonly action?: {
    readonly label: string
    readonly onActivate: () => void
  }
}

export interface ToastInput {
  readonly message: string
  readonly severity: ToastSeverity
  readonly action?: Toast['action']
}

interface ToastContextValue {
  readonly toasts: readonly Toast[]
  readonly push: (input: ToastInput) => string
  readonly dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let nextId = 0
function generateId(): string {
  nextId += 1
  return `toast-${Date.now()}-${nextId}`
}

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<readonly Toast[]>([])

  const push = useCallback((input: ToastInput): string => {
    const id = generateId()
    setToasts((cur) => [...cur, { id, ...input }])
    return id
  }, [])

  const dismiss = useCallback((id: string): void => {
    setToasts((cur) => cur.filter((t) => t.id !== id))
  }, [])

  const value = useMemo<ToastContextValue>(() => ({ toasts, push, dismiss }), [toasts, push, dismiss])

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be called inside a ToastProvider')
  return ctx
}
```

Note: the file is `.ts` but contains JSX. Either rename to `use-toast.tsx` (preferred — consistent with project convention for files with JSX) or use `React.createElement`. Pick the `.tsx` rename.

- [ ] **Step 4: Implement Toast component + ToastHost**

Create `src/renderer/src/components/notifications/Toast.tsx`:

```tsx
import type { Toast as ToastModel } from '../../hooks/use-toast'

interface ToastProps {
  readonly toast: ToastModel
  readonly onDismiss: (id: string) => void
}

export function Toast({ toast, onDismiss }: ToastProps): JSX.Element {
  return (
    <div className={`toast toast--${toast.severity}`} role="alert" aria-live="polite">
      <span className="toast__message">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="toast__action"
          onClick={() => {
            toast.action!.onActivate()
            onDismiss(toast.id)
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        className="toast__dismiss"
        aria-label="Dismiss toast"
        onClick={() => onDismiss(toast.id)}
      >
        ×
      </button>
    </div>
  )
}
```

Create `src/renderer/src/components/notifications/ToastHost.tsx`:

```tsx
import { useToast } from '../../hooks/use-toast'
import { Toast } from './Toast'

export function ToastHost(): JSX.Element {
  const { toasts, dismiss } = useToast()
  if (toasts.length === 0) return <></>
  return (
    <div className="toast-host" aria-label="Notifications">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Append styles**

Append to `src/renderer/src/components/notifications/styles.css`:

```css
.toast-host {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: var(--tl-z-toast);
  max-width: 28rem;
}

.toast {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.9rem;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  font-size: 0.9rem;
  background: var(--tl-bg-base);
  border-left: 4px solid var(--tl-rule-subtle);
}
.toast--info  { border-left-color: var(--tl-accent); }
.toast--warn  { border-left-color: #d4a017; }
.toast--error { border-left-color: var(--tl-color-danger); }
.toast__message { flex: 1; }
.toast__action {
  background: transparent;
  border: 1px solid var(--tl-rule-subtle);
  border-radius: 4px;
  padding: 0.2rem 0.55rem;
  font: inherit;
  cursor: pointer;
}
.toast__dismiss {
  background: transparent;
  border: none;
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
  color: var(--tl-text-muted);
}
.toast__dismiss:hover { color: var(--tl-text-base); }
```

- [ ] **Step 6: Run tests**

```bash
npm run test:run -- src/renderer/src/hooks/__tests__/use-toast.unit.test.tsx
```

Expected: PASS (2/2).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/hooks/use-toast.tsx \
        src/renderer/src/hooks/__tests__/use-toast.unit.test.tsx \
        src/renderer/src/components/notifications/Toast.tsx \
        src/renderer/src/components/notifications/ToastHost.tsx \
        src/renderer/src/components/notifications/styles.css
git commit -m "feat(phase-4c): Toast component + ToastProvider + useToast hook"
```

---

## Task 3: Mount ToastHost in AppShell

**Files:**
- Modify: `src/renderer/src/App.tsx` (or wherever the top-level provider chain lives)
- Modify: `src/renderer/src/components/layout/AppShell.tsx`

- [ ] **Step 1: Wrap the renderer root in `<ToastProvider>`**

Read `src/renderer/src/App.tsx` (or `main.tsx`) to find where the root component is rendered. Wrap whatever is currently the top-level content (typically `<AppShell />` or `<AppContent />`) in `<ToastProvider>...</ToastProvider>`.

- [ ] **Step 2: Mount `<ToastHost />` once at the AppShell level**

Edit `src/renderer/src/components/layout/AppShell.tsx`. Add `<ToastHost />` at the bottom of the JSX tree (alongside `<ClaudeNotFoundModal />` and `<CreateProjectModal />`). Import:

```ts
import { ToastHost } from '../notifications/ToastHost'
```

- [ ] **Step 3: Verify**

```bash
npm run typecheck
npm run test:run
```

Expected: clean. Renderer tests should still pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/components/layout/AppShell.tsx
git commit -m "feat(phase-4c): mount ToastProvider + ToastHost at the renderer root"
```

---

## Task 4: cc:crashed + cc:hung IPC channels + payload types

**Files:**
- Modify: `src/shared/ipc/cc.ts`
- Modify: `src/shared/ipc.ts`

- [ ] **Step 1: Add channels + payloads**

Edit `src/shared/ipc/cc.ts`. Append:

```ts
// Phase 4C — failure events broadcast from main → renderer.

export const IPC_CC_CRASHED = 'cc:crashed'
export const IPC_CC_HUNG = 'cc:hung'

export interface CcCrashedPayload {
  readonly conversationId: number
  readonly exitCode: number
  readonly signal?: number
  readonly logId: string
}

export interface CcHungPayload {
  readonly conversationId: number
  readonly idleMs: number
  readonly severity: 'warn' | 'error'
}
```

- [ ] **Step 2: Re-export from `src/shared/ipc.ts`**

Add `IPC_CC_CRASHED`, `IPC_CC_HUNG`, `CcCrashedPayload`, `CcHungPayload` to the existing `from './ipc/cc'` re-export block. Add `'cc:crashed' | 'cc:hung'` to the `IpcChannelName` union.

- [ ] **Step 3: Typecheck + commit**

```bash
npm run typecheck
git add src/shared/ipc/cc.ts src/shared/ipc.ts
git commit -m "feat(phase-4c): shared IPC channels — cc:crashed + cc:hung payloads"
```

---

## Task 5: Watchdog class

**Files:**
- Create: `src/main/cc/watchdog.ts`
- Create: `src/main/__tests__/cc/watchdog.unit.test.ts`

- [ ] **Step 1: Failing test**

Create `src/main/__tests__/cc/watchdog.unit.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

import { Watchdog } from '../../cc/watchdog'

// Purpose: Watchdog fires onIdle callbacks after configured idle periods.
// reset() restarts the timers. stop() cancels them. Two thresholds: warn
// (default 60s) and error (default 90s). Fully time-injected for tests.

describe('cc/watchdog', () => {
  function makeClock() {
    let now = 0
    const queued: { fireAt: number; fn: () => void; cancelled: boolean }[] = []
    const setTimeoutFn: typeof setTimeout = ((fn: () => void, ms: number) => {
      const entry = { fireAt: now + ms, fn, cancelled: false }
      queued.push(entry)
      return entry as unknown as ReturnType<typeof setTimeout>
    }) as never
    const clearTimeoutFn: typeof clearTimeout = ((timer: { cancelled: boolean }) => {
      timer.cancelled = true
    }) as never
    return {
      advance(ms: number): void {
        now += ms
        for (const e of queued) {
          if (!e.cancelled && e.fireAt <= now) {
            e.cancelled = true
            e.fn()
          }
        }
      },
      setTimeoutFn,
      clearTimeoutFn
    }
  }

  it('fires warn callback after warnMs, error callback after errorMs', () => {
    const onIdle = vi.fn()
    const clock = makeClock()
    const wd = new Watchdog({
      warnMs: 1000,
      errorMs: 2000,
      onIdle,
      setTimeout: clock.setTimeoutFn,
      clearTimeout: clock.clearTimeoutFn
    })
    wd.start()
    clock.advance(1000)
    expect(onIdle).toHaveBeenCalledWith('warn')
    clock.advance(1000)
    expect(onIdle).toHaveBeenCalledWith('error')
  })

  it('reset cancels pending timers and starts fresh', () => {
    const onIdle = vi.fn()
    const clock = makeClock()
    const wd = new Watchdog({
      warnMs: 1000,
      errorMs: 2000,
      onIdle,
      setTimeout: clock.setTimeoutFn,
      clearTimeout: clock.clearTimeoutFn
    })
    wd.start()
    clock.advance(500)
    wd.reset()
    clock.advance(800) // total 1300 — would have fired if not reset
    expect(onIdle).not.toHaveBeenCalled()
    clock.advance(200) // 1000 since reset
    expect(onIdle).toHaveBeenCalledWith('warn')
  })

  it('stop cancels all pending timers', () => {
    const onIdle = vi.fn()
    const clock = makeClock()
    const wd = new Watchdog({
      warnMs: 1000,
      errorMs: 2000,
      onIdle,
      setTimeout: clock.setTimeoutFn,
      clearTimeout: clock.clearTimeoutFn
    })
    wd.start()
    wd.stop()
    clock.advance(5000)
    expect(onIdle).not.toHaveBeenCalled()
  })

  it('does not double-fire if reset happens after warn', () => {
    const onIdle = vi.fn()
    const clock = makeClock()
    const wd = new Watchdog({
      warnMs: 1000,
      errorMs: 2000,
      onIdle,
      setTimeout: clock.setTimeoutFn,
      clearTimeout: clock.clearTimeoutFn
    })
    wd.start()
    clock.advance(1000) // warn fires
    expect(onIdle).toHaveBeenCalledTimes(1)
    wd.reset()
    clock.advance(1000) // warn fires again (fresh)
    expect(onIdle).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Implement Watchdog**

Create `src/main/cc/watchdog.ts`:

```ts
// Watchdog — per-slot idle timer. Fires `onIdle('warn')` after warnMs of no
// reset, then `onIdle('error')` after errorMs. `reset()` cancels both and
// restarts; the production wiring resets on every PTY data chunk so a
// streaming conversation never trips the watchdog.
//
// Timer functions are injected so tests don't need fake timers from vitest.

export type WatchdogSeverity = 'warn' | 'error'

interface WatchdogOptions {
  readonly warnMs: number
  readonly errorMs: number
  readonly onIdle: (severity: WatchdogSeverity) => void
  readonly setTimeout?: (fn: () => void, ms: number) => unknown
  readonly clearTimeout?: (timer: unknown) => void
}

export class Watchdog {
  private warnTimer: unknown = null
  private errorTimer: unknown = null
  private readonly setTimeoutFn: (fn: () => void, ms: number) => unknown
  private readonly clearTimeoutFn: (timer: unknown) => void

  constructor(private readonly opts: WatchdogOptions) {
    this.setTimeoutFn = opts.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms))
    this.clearTimeoutFn = opts.clearTimeout ?? ((t) => globalThis.clearTimeout(t as never))
  }

  start(): void {
    this.scheduleBoth()
  }

  reset(): void {
    this.clearBoth()
    this.scheduleBoth()
  }

  stop(): void {
    this.clearBoth()
  }

  private scheduleBoth(): void {
    this.warnTimer = this.setTimeoutFn(() => {
      this.warnTimer = null
      this.opts.onIdle('warn')
    }, this.opts.warnMs)
    this.errorTimer = this.setTimeoutFn(() => {
      this.errorTimer = null
      this.opts.onIdle('error')
    }, this.opts.errorMs)
  }

  private clearBoth(): void {
    if (this.warnTimer !== null) {
      this.clearTimeoutFn(this.warnTimer)
      this.warnTimer = null
    }
    if (this.errorTimer !== null) {
      this.clearTimeoutFn(this.errorTimer)
      this.errorTimer = null
    }
  }
}
```

- [ ] **Step 3: Run tests + commit**

```bash
npm run test:run -- src/main/__tests__/cc/watchdog.unit.test.ts
git add src/main/cc/watchdog.ts src/main/__tests__/cc/watchdog.unit.test.ts
git commit -m "feat(phase-4c): Watchdog — per-slot idle timer with warn + error thresholds"
```

---

## Task 6: Crash + hang detection in CcLifecycle

**Files:**
- Modify: `src/main/cc/lifecycle.ts`
- Modify: `src/main/__tests__/cc/lifecycle.integration.test.ts`

- [ ] **Step 1: Extend `LifecycleCallbacks`**

Edit `src/main/cc/lifecycle.ts`:

```ts
export interface LifecycleCallbacks {
  onChunk(event: { conversationId: number; chunk: string }): void
  onExit(event: { conversationId: number; exitCode: number; signal?: number }): void
  onEvent(event: { conversationId: number; event: CcEvent }): void
  // Phase 4C
  onCrashed(event: { conversationId: number; exitCode: number; signal?: number }): void
  onHung(event: { conversationId: number; idleMs: number; severity: 'warn' | 'error' }): void
}

export interface LifecycleConfig {
  readonly watchdogWarnMs?: number   // default 60_000
  readonly watchdogErrorMs?: number  // default 90_000
}
```

Update `CcLifecycle` constructor to accept optional `LifecycleConfig`:

```ts
constructor(
  private readonly ptyFactory: PtySpawnFn,
  private readonly cb: LifecycleCallbacks,
  private readonly config: LifecycleConfig = {}
) {}
```

- [ ] **Step 2: Wire watchdog into `start()` and `resume()`**

Update the slot creation in both `start()` and `resume()`. Add a watchdog field to `Slot`:

```ts
interface Slot {
  readonly conversationId: number
  readonly sessionId: string
  readonly pty: PtyHandle
  readonly parser: CcParser
  readonly watchdog: Watchdog
  // sawGracefulPrompt is set when the parser fires prompt-ready. Used by
  // the onExit handler to distinguish "claude crashed mid-response" from
  // "claude exited cleanly after returning to a prompt."
  sawGracefulPrompt: boolean
}
```

In the slot creation, after creating the parser:

```ts
const slot: Slot = {
  conversationId: opts.conversationId,
  sessionId,
  pty,
  parser,
  watchdog: new Watchdog({
    warnMs: this.config.watchdogWarnMs ?? 60_000,
    errorMs: this.config.watchdogErrorMs ?? 90_000,
    onIdle: (severity) => {
      const idleMs = severity === 'warn'
        ? (this.config.watchdogWarnMs ?? 60_000)
        : (this.config.watchdogErrorMs ?? 90_000)
      this.cb.onHung({ conversationId: opts.conversationId, idleMs, severity })
    }
  }),
  sawGracefulPrompt: false
}
this.slots.set(opts.conversationId, slot)
slot.watchdog.start()
```

In the `pty.onData` handler, reset the watchdog on every chunk. Also update sawGracefulPrompt when the parser fires `prompt-ready`:

```ts
const parser = new CcParser((event) => {
  if (event.kind === 'prompt-ready') {
    const s = this.slots.get(opts.conversationId)
    if (s) s.sawGracefulPrompt = true
  }
  this.cb.onEvent({ conversationId: opts.conversationId, event })
})
// ... create slot ...
pty.onData((chunk) => {
  slot.watchdog.reset()
  parser.feed(chunk)
  this.cb.onChunk({ conversationId: opts.conversationId, chunk })
})
```

In the `pty.onExit` handler, stop the watchdog and route through onCrashed when warranted:

```ts
pty.onExit(({ exitCode, signal }) => {
  const s = this.slots.get(opts.conversationId)
  if (s) s.watchdog.stop()
  this.slots.delete(opts.conversationId)
  // Decide if this is a crash: non-zero exit code AND we didn't see a
  // graceful prompt-ready before exit. SIGTERM/SIGINT from our own stop()
  // are NOT crashes (signal is set).
  const isCrash = exitCode !== 0 && signal === undefined && !(s?.sawGracefulPrompt ?? false)
  if (isCrash) {
    this.cb.onCrashed({ conversationId: opts.conversationId, exitCode, signal })
  }
  this.cb.onExit({ conversationId: opts.conversationId, exitCode, signal })
})
```

(Same wiring in `resume()`. Consider extracting a private `_attachSlot(opts, sessionId)` helper to DRY this — but only if it doesn't bloat the diff.)

- [ ] **Step 3: Update existing lifecycle tests**

The existing tests instantiate `CcLifecycle` with only two args. They need the third `config` arg to be optional (set above) so they keep compiling. They also need to provide `onCrashed: vi.fn()` and `onHung: vi.fn()` in the callbacks. Update `beforeEach` accordingly.

- [ ] **Step 4: Add lifecycle tests for crash + watchdog**

Add to `src/main/__tests__/cc/lifecycle.integration.test.ts`:

```ts
it('emits onCrashed when the PTY exits with non-zero code and no graceful prompt seen', async () => {
  const onCrashed = vi.fn()
  const lc = new CcLifecycle(
    factory,
    { onChunk, onExit, onEvent: vi.fn(), onCrashed, onHung: vi.fn() }
  )
  lc.start({
    conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30,
    env: { CLAUDE_CONFIG_DIR: 'C:/c' }
  })
  // Simulate crash — no prompt-ready event before exit
  lastPty!.emitExit(1, undefined)
  await new Promise((r) => queueMicrotask(() => r(undefined)))
  expect(onCrashed).toHaveBeenCalledWith({ conversationId: 7, exitCode: 1, signal: undefined })
})

it('does NOT emit onCrashed when SIGINT/SIGTERM caused the exit (signal set)', async () => {
  const onCrashed = vi.fn()
  const lc = new CcLifecycle(
    factory,
    { onChunk, onExit, onEvent: vi.fn(), onCrashed, onHung: vi.fn() }
  )
  lc.start({
    conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30,
    env: { CLAUDE_CONFIG_DIR: 'C:/c' }
  })
  // Simulate a signal-driven exit (our own stop() path)
  lastPty!.emitExit(1, 2)  // signal=2 (SIGINT)
  await new Promise((r) => queueMicrotask(() => r(undefined)))
  expect(onCrashed).not.toHaveBeenCalled()
})

it('does NOT emit onCrashed when a graceful prompt-ready was seen before exit', async () => {
  const onCrashed = vi.fn()
  const lc = new CcLifecycle(
    factory,
    { onChunk, onExit, onEvent: vi.fn(), onCrashed, onHung: vi.fn() }
  )
  lc.start({
    conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30,
    env: { CLAUDE_CONFIG_DIR: 'C:/c' }
  })
  // Receive a graceful prompt, THEN exit non-zero (unusual but possible)
  lastPty!.emitData('claude-mock> ')
  lastPty!.emitExit(1, undefined)
  await new Promise((r) => queueMicrotask(() => r(undefined)))
  expect(onCrashed).not.toHaveBeenCalled()
})

it('emits onHung after the configured warn/error thresholds', () => {
  vi.useFakeTimers()
  const onHung = vi.fn()
  const lc = new CcLifecycle(
    factory,
    { onChunk, onExit, onEvent: vi.fn(), onCrashed: vi.fn(), onHung },
    { watchdogWarnMs: 1000, watchdogErrorMs: 2000 }
  )
  lc.start({
    conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30,
    env: { CLAUDE_CONFIG_DIR: 'C:/c' }
  })
  vi.advanceTimersByTime(1000)
  expect(onHung).toHaveBeenCalledWith({ conversationId: 7, idleMs: 1000, severity: 'warn' })
  vi.advanceTimersByTime(1000)
  expect(onHung).toHaveBeenCalledWith({ conversationId: 7, idleMs: 2000, severity: 'error' })
  vi.useRealTimers()
})

it('watchdog resets on every onData chunk so streaming conversations never hang', () => {
  vi.useFakeTimers()
  const onHung = vi.fn()
  const lc = new CcLifecycle(
    factory,
    { onChunk, onExit, onEvent: vi.fn(), onCrashed: vi.fn(), onHung },
    { watchdogWarnMs: 1000, watchdogErrorMs: 2000 }
  )
  lc.start({
    conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30,
    env: { CLAUDE_CONFIG_DIR: 'C:/c' }
  })
  for (let i = 0; i < 5; i++) {
    vi.advanceTimersByTime(500)
    lastPty!.emitData('chunk')
  }
  // 2.5s elapsed with regular activity — no hang
  expect(onHung).not.toHaveBeenCalled()
  vi.useRealTimers()
})
```

- [ ] **Step 5: Run all lifecycle tests + commit**

```bash
npm run test:run -- src/main/__tests__/cc/lifecycle.integration.test.ts
git add src/main/cc/lifecycle.ts src/main/__tests__/cc/lifecycle.integration.test.ts
git commit -m "feat(phase-4c): lifecycle wires Watchdog + emits onCrashed (non-zero exit + no graceful prompt) + onHung"
```

---

## Task 7: PTY write failure handling

**Files:**
- Modify: `src/main/cc/lifecycle.ts`
- Modify: `src/main/ipc/cc-handler.ts`
- Modify: `src/main/__tests__/cc/lifecycle.integration.test.ts`
- Modify: `src/main/__tests__/ipc/cc-handler.integration.test.ts`

- [ ] **Step 1: Wrap `lifecycle.write` in try/catch + tag PTY_WRITE_FAILED**

Edit `src/main/cc/lifecycle.ts`. The current `write()`:

```ts
write(conversationId: number, data: string): void {
  const slot = this.slots.get(conversationId)
  if (!slot) throw new Error(`no active pty for conversation ${conversationId}`)
  slot.pty.write(data + '\r')
}
```

Update to:

```ts
write(conversationId: number, data: string): void {
  const slot = this.slots.get(conversationId)
  if (!slot) throw new Error(`no active pty for conversation ${conversationId}`)
  try {
    slot.pty.write(data + '\r')
  } catch (err) {
    const tagged = new Error(
      `pty.write failed for conversation ${conversationId}: ${err instanceof Error ? err.message : String(err)}`
    ) as Error & { code?: string; cause?: unknown }
    tagged.code = 'PTY_WRITE_FAILED'
    tagged.cause = err
    throw tagged
  }
}
```

- [ ] **Step 2: Add lifecycle test**

Add to `lifecycle.integration.test.ts`:

```ts
it('write throws PTY_WRITE_FAILED-tagged error when the underlying pty.write throws', () => {
  const lc = new CcLifecycle(
    factory,
    { onChunk, onExit, onEvent: vi.fn(), onCrashed: vi.fn(), onHung: vi.fn() }
  )
  lc.start({
    conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30,
    env: { CLAUDE_CONFIG_DIR: 'C:/c' }
  })
  // Inject a write failure by marking the pty as disposed (MockPty.write
  // throws for disposed ptys per its definition).
  lastPty!.markDisposed()
  let caught: (Error & { code?: string }) | null = null
  try {
    lc.write(7, 'hi')
  } catch (e) {
    caught = e as Error & { code?: string }
  }
  expect(caught?.code).toBe('PTY_WRITE_FAILED')
})
```

- [ ] **Step 3: CcHandler.send already wraps in withIpcResult**

`withIpcResult` from Phase 4B propagates the `code` from any throw. So `cc:send` will return `{ ok: false, error: { code: 'PTY_WRITE_FAILED', ...} }` automatically. Add a handler test verifying this:

```ts
it('send returns PTY_WRITE_FAILED when pty.write throws', async () => {
  await handler.start({ conversationId, cwd: 'C:/x', cols: 100, rows: 30, accountId })
  lastPty!.markDisposed()
  const result = await handler.send({
    conversationId,
    prompt: 'hello',
    model: null, breadth: null, format: null
  })
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error.code).toBe('PTY_WRITE_FAILED')
})
```

**Important:** `send()` inserts a turn row BEFORE calling `lifecycle.write`. With the throw, the turn row exists but the prompt never reached claude. Phase 4C does NOT roll back the turn row — it's the user's intent and lives on with status='complete'. Phase 4D may reconsider this (mark turn status='write-failed').

- [ ] **Step 4: Run tests + commit**

```bash
npm run test:run -- src/main/__tests__/cc/lifecycle.integration.test.ts src/main/__tests__/ipc/cc-handler.integration.test.ts
git add src/main/cc/lifecycle.ts \
        src/main/__tests__/cc/lifecycle.integration.test.ts \
        src/main/__tests__/ipc/cc-handler.integration.test.ts
git commit -m "feat(phase-4c): lifecycle.write tags PTY_WRITE_FAILED on throw + propagates via withIpcResult"
```

---

## Task 8: Wire cc:crashed + cc:hung broadcasts from main

**Files:**
- Modify: `src/main/ipc/index.ts`

- [ ] **Step 1: Add onCrashed + onHung to the CcLifecycle constructor's callbacks**

Edit `src/main/ipc/index.ts`. The current code has:

```ts
const ccLifecycle = new CcLifecycle(productionPtyFactory, {
  onChunk: (e) => broadcast('cc:output-chunk', e),
  onExit: (e) => broadcast('cc:exit', e),
  onEvent: (e) => broadcast(IPC_CC_EVENT, e)
})
```

Add the two new callbacks:

```ts
const ccLifecycle = new CcLifecycle(productionPtyFactory, {
  onChunk: (e) => broadcast('cc:output-chunk', e),
  onExit: (e) => broadcast('cc:exit', e),
  onEvent: (e) => broadcast(IPC_CC_EVENT, e),
  onCrashed: (e) => {
    const logId = randomUUID()
    logger.error('cc', 'cc-crashed', `claude exited non-zero (code=${e.exitCode})`, {
      conversationId: e.conversationId,
      exitCode: e.exitCode,
      signal: e.signal,
      logId
    })
    broadcast(IPC_CC_CRASHED, { ...e, logId })
  },
  onHung: (e) => {
    logger.warn('cc', 'cc-hung', `claude idle for ${e.idleMs}ms (${e.severity})`, {
      conversationId: e.conversationId,
      idleMs: e.idleMs,
      severity: e.severity
    })
    broadcast(IPC_CC_HUNG, e)
  }
})
```

Import `randomUUID` from `node:crypto` and the new channel constants.

- [ ] **Step 2: Typecheck + smoke**

```bash
npm run typecheck
npm run test:run
```

Both should be clean. The renderer-side consumption lands in Tasks 11 + 12.

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/index.ts
git commit -m "feat(phase-4c): broadcast cc:crashed + cc:hung from CcLifecycle callbacks + log via Logger"
```

---

## Task 9: Preload exposure — cc.onCrashed + cc.onHung

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

- [ ] **Step 1: Expose**

Edit `src/preload/index.ts`. Add to the `cc` namespace:

```ts
onCrashed(fn: (payload: CcCrashedPayload) => void): () => void {
  const listener = (_e: unknown, payload: CcCrashedPayload): void => fn(payload)
  ipcRenderer.on(IPC_CC_CRASHED, listener as never)
  return () => ipcRenderer.removeListener(IPC_CC_CRASHED, listener as never)
},
onHung(fn: (payload: CcHungPayload) => void): () => void {
  const listener = (_e: unknown, payload: CcHungPayload): void => fn(payload)
  ipcRenderer.on(IPC_CC_HUNG, listener as never)
  return () => ipcRenderer.removeListener(IPC_CC_HUNG, listener as never)
}
```

Import the channel constants + payload types. Update `src/preload/index.d.ts` to declare these on the `cc` namespace of `TokenlessApi`.

- [ ] **Step 2: Typecheck + commit**

```bash
npm run typecheck
git add src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(phase-4c): preload exposes cc.onCrashed + cc.onHung subscriptions"
```

---

## Task 10: HungBanner component + TerminalSection integration

**Files:**
- Create: `src/renderer/src/components/terminal/HungBanner.tsx`
- Modify: `src/renderer/src/components/terminal/styles.css`
- Modify: `src/renderer/src/components/terminal/TerminalSection.tsx`

- [ ] **Step 1: HungBanner**

Create `src/renderer/src/components/terminal/HungBanner.tsx`:

```tsx
interface HungBannerProps {
  visible: boolean
  severity: 'warn' | 'error'
  onStop: () => void
}

export function HungBanner({ visible, severity, onStop }: HungBannerProps): JSX.Element | null {
  if (!visible) return null
  const label = severity === 'error'
    ? 'No response from claude — try Stop and check Dev Mode'
    : 'Claude has been idle for a minute — still working?'
  return (
    <div className={`hung-banner hung-banner--${severity}`} role="status" aria-live="polite">
      <span className="hung-banner__message">{label}</span>
      <button type="button" className="hung-banner__stop" onClick={onStop}>
        Stop
      </button>
    </div>
  )
}
```

Append to `src/renderer/src/components/terminal/styles.css`:

```css
.hung-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.8rem;
  font-size: 0.85rem;
  border-bottom: 1px solid var(--tl-rule-subtle);
}
.hung-banner--warn  { background: rgba(212, 160, 23, 0.15); color: #d4a017; }
.hung-banner--error { background: rgba(210, 34, 34, 0.15); color: var(--tl-color-danger); }
.hung-banner__stop {
  background: transparent;
  border: 1px solid currentColor;
  border-radius: 4px;
  color: inherit;
  padding: 0.15rem 0.55rem;
  font: inherit;
  cursor: pointer;
}
```

- [ ] **Step 2: TerminalSection subscribes to cc.onHung + cc.onExit to manage banner state**

Edit `src/renderer/src/components/terminal/TerminalSection.tsx`:

```tsx
import { useEffect, useState } from 'react'

import { useCcEvents } from '../../hooks/use-cc-events'
import { rendererLogger } from '../../observability/logger-bridge'
import { HungBanner } from './HungBanner'
import { TerminalPane } from './TerminalPane'
import { TerminalToolbar } from './TerminalToolbar'
import './styles.css'

interface TerminalSectionProps {
  conversationId: number | null
}

export function TerminalSection({ conversationId }: TerminalSectionProps): JSX.Element {
  const [hung, setHung] = useState<{ severity: 'warn' | 'error' } | null>(null)

  useCcEvents(conversationId, () => {
    /* Phase 4D: drive budget meter from tokens-used events */
  })

  // Subscribe to cc.onHung for this conversation. Clear on cc.onExit (a stop
  // or successful response always clears the banner).
  useEffect(() => {
    if (conversationId === null) {
      setHung(null)
      return undefined
    }
    const unsubHung = window.tokenless.cc.onHung((payload) => {
      if (payload.conversationId === conversationId) {
        setHung({ severity: payload.severity })
      }
    })
    const unsubExit = window.tokenless.cc.onExit((payload) => {
      if (payload.conversationId === conversationId) setHung(null)
    })
    // Reset on conversation change
    setHung(null)
    return () => {
      unsubHung()
      unsubExit()
    }
  }, [conversationId])

  const handleStop = async (): Promise<void> => {
    if (conversationId === null) {
      rendererLogger.warn('ui', 'terminal-stop-no-conv', 'Stop clicked with no active conversation')
      return
    }
    const result = await window.tokenless.cc.stop({ conversationId })
    if (!result.ok) {
      rendererLogger.error('ui', 'terminal-stop-failed', result.error.message, {
        conversationId, code: result.error.code, logId: result.error.logId
      })
    } else {
      rendererLogger.info('ui', 'terminal-stop-ok', 'Sent stop to backend', { conversationId })
    }
  }

  return (
    <section className="terminal-section">
      <TerminalToolbar onStop={() => void handleStop()} streaming={conversationId !== null} />
      <HungBanner visible={hung !== null} severity={hung?.severity ?? 'warn'} onStop={() => void handleStop()} />
      <TerminalPane key={conversationId ?? 'none'} conversationId={conversationId} />
    </section>
  )
}
```

- [ ] **Step 3: Typecheck + tests + commit**

```bash
npm run typecheck
npm run test:run
git add src/renderer/src/components/terminal/HungBanner.tsx \
        src/renderer/src/components/terminal/styles.css \
        src/renderer/src/components/terminal/TerminalSection.tsx
git commit -m "feat(phase-4c): HungBanner — surfaces cc:hung events above terminal with Stop button"
```

---

## Task 11: AppShell subscribes to cc:crashed + cc:write-failed + shows toasts; orphan-row cleanup

**Files:**
- Modify: `src/renderer/src/components/layout/AppShell.tsx`

- [ ] **Step 1: Subscribe to cc.onCrashed and push toast**

Edit `src/renderer/src/components/layout/AppShell.tsx`. Add inside the AppShell component body:

```ts
import { useToast } from '../../hooks/use-toast'
// ...

const { push: pushToast } = useToast()

useEffect(() => {
  const unsubCrashed = window.tokenless.cc.onCrashed((payload) => {
    rendererLogger.warn('ui', 'cc-crash-toast', 'cc:crashed event received', {
      conversationId: payload.conversationId,
      exitCode: payload.exitCode,
      logId: payload.logId
    })
    pushToast({
      message: `Claude Code crashed (exit ${payload.exitCode}). Conversation saved — try resuming.`,
      severity: 'error'
    })
  })
  return () => unsubCrashed()
}, [pushToast])
```

- [ ] **Step 2: Surface PTY_WRITE_FAILED via toast from handleSend** 

Composer is where `cc:send` is called. The plan keeps it simple: when `handleSend` in Composer gets a result with `code: 'PTY_WRITE_FAILED'`, the existing `rendererLogger.error` path stays. ADD a toast push too:

This requires Composer to access `useToast`. Edit `src/renderer/src/components/composer/Composer.tsx`:

```ts
import { useToast } from '../../hooks/use-toast'
// ...
const { push: pushToast } = useToast()
// In handleSend's failure branch:
if (!result.ok) {
  rendererLogger.error('ui', 'send-failed', result.error.message, {
    conversationId, code: result.error.code, logId: result.error.logId
  })
  if (result.error.code === 'PTY_WRITE_FAILED') {
    pushToast({
      message: "Couldn't send prompt — PTY connection lost. Restart the conversation.",
      severity: 'error'
    })
  }
}
```

- [ ] **Step 3: Orphan-row cleanup**

In `handleNewConversation`, the existing code creates a conversation row BEFORE calling `cc.start`. If `cc.start` fails (e.g., CLAUDE_NOT_FOUND), the row is left without a session. Clean up:

```ts
if (!started.ok) {
  rendererLogger.error('ui', 'new-conversation-start-failed', started.error.message, {
    code: started.error.code,
    logId: started.error.logId,
    conversationId: created.data.conversation.id
  })
  if (started.error.code === 'CLAUDE_NOT_FOUND') {
    setClaudeNotFoundOpen(true)
  }
  // Cleanup the orphan conversation row — it was created in step 1 but step 2
  // (cc:start) failed so there's no PTY for it. Phase 4C deletes it; Phase 7's
  // branching feature may want to keep these around with a status='aborted'
  // marker — revisit then.
  const deleted = await window.tokenless.conversations.delete({ id: created.data.conversation.id })
  if (!deleted.ok) {
    rendererLogger.warn('ui', 'orphan-conversation-cleanup-failed', deleted.error.message, {
      conversationId: created.data.conversation.id,
      code: deleted.error.code
    })
  }
  return
}
```

- [ ] **Step 4: Typecheck + tests + commit**

```bash
npm run typecheck
npm run test:run
git add src/renderer/src/components/layout/AppShell.tsx \
        src/renderer/src/components/composer/Composer.tsx
git commit -m "feat(phase-4c): toasts for cc:crashed + PTY_WRITE_FAILED + orphan conversation cleanup"
```

---

## Task 12: Telemetry tick — shared types + IPC channel + emitter

**Files:**
- Create: `src/shared/types/telemetry.ts`
- Create: `src/shared/ipc/telemetry.ts`
- Modify: `src/shared/ipc.ts`
- Create: `src/main/cc/telemetry-emitter.ts`
- Create: `src/main/__tests__/cc/telemetry-emitter.unit.test.ts`

- [ ] **Step 1: Shared types**

Create `src/shared/types/telemetry.ts`:

```ts
export interface TelemetryTick {
  readonly conversationId: number
  // Context budget — pulled from the latest 'tokens-used' parser event for
  // this conversation. null when no tokens-used event has fired yet.
  readonly contextUsed: number | null
  readonly contextTotal: number | null
  readonly contextPercent: number | null
  // Phase 5 will add cost fields here ($ spent so far, model usage breakdown).
  readonly tickAt: number
}
```

Create `src/shared/ipc/telemetry.ts`:

```ts
import type { TelemetryTick } from '../types/telemetry'

export const IPC_TELEMETRY_TICK = 'telemetry:tick'

export interface TelemetryTickPayload {
  readonly tick: TelemetryTick
}

export type { TelemetryTick }
```

Re-export from `src/shared/ipc.ts` and add `'telemetry:tick'` to the `IpcChannelName` union.

- [ ] **Step 2: TelemetryEmitter test (failing first)**

Create `src/main/__tests__/cc/telemetry-emitter.unit.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

import { TelemetryEmitter } from '../../cc/telemetry-emitter'

describe('cc/telemetry-emitter', () => {
  it('emits a tick when handle is called with tokens-used; coalesces multiple within interval', () => {
    vi.useFakeTimers()
    const emit = vi.fn()
    const te = new TelemetryEmitter({ intervalMs: 1000, emit })
    te.start()
    te.handle({ conversationId: 7, event: { kind: 'tokens-used', used: 100, total: 200000 } })
    te.handle({ conversationId: 7, event: { kind: 'tokens-used', used: 150, total: 200000 } })
    expect(emit).not.toHaveBeenCalled() // Not yet — waiting for interval
    vi.advanceTimersByTime(1000)
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 7,
      contextUsed: 150,
      contextTotal: 200000,
      contextPercent: expect.any(Number)
    }))
    vi.useRealTimers()
  })

  it('does not emit when nothing changed in the last interval', () => {
    vi.useFakeTimers()
    const emit = vi.fn()
    const te = new TelemetryEmitter({ intervalMs: 1000, emit })
    te.start()
    vi.advanceTimersByTime(3000)
    expect(emit).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('emits independent ticks for different conversations', () => {
    vi.useFakeTimers()
    const emit = vi.fn()
    const te = new TelemetryEmitter({ intervalMs: 1000, emit })
    te.start()
    te.handle({ conversationId: 1, event: { kind: 'tokens-used', used: 100, total: 200000 } })
    te.handle({ conversationId: 2, event: { kind: 'tokens-used', used: 5000, total: 200000 } })
    vi.advanceTimersByTime(1000)
    expect(emit).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('stop cancels the interval', () => {
    vi.useFakeTimers()
    const emit = vi.fn()
    const te = new TelemetryEmitter({ intervalMs: 1000, emit })
    te.start()
    te.handle({ conversationId: 1, event: { kind: 'tokens-used', used: 100, total: 200000 } })
    te.stop()
    vi.advanceTimersByTime(5000)
    expect(emit).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('removeConversation clears state so subsequent ticks for that id stop', () => {
    vi.useFakeTimers()
    const emit = vi.fn()
    const te = new TelemetryEmitter({ intervalMs: 1000, emit })
    te.start()
    te.handle({ conversationId: 1, event: { kind: 'tokens-used', used: 100, total: 200000 } })
    te.removeConversation(1)
    vi.advanceTimersByTime(1000)
    expect(emit).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
```

- [ ] **Step 3: Implement emitter**

Create `src/main/cc/telemetry-emitter.ts`:

```ts
// TelemetryEmitter — coalesces tokens-used parser events into periodic
// telemetry:tick broadcasts. Per-conversation state. Phase 4C only does
// context budget; Phase 5 will add cost fields.

import type { CcEvent } from '@shared/types/cc-events'
import type { TelemetryTick } from '@shared/types/telemetry'

interface ConvState {
  contextUsed: number | null
  contextTotal: number | null
  dirty: boolean
}

interface TelemetryEmitterOptions {
  readonly intervalMs: number
  readonly emit: (tick: TelemetryTick) => void
}

export class TelemetryEmitter {
  private readonly state = new Map<number, ConvState>()
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly opts: TelemetryEmitterOptions) {}

  start(): void {
    if (this.timer !== null) return
    this.timer = setInterval(() => this.flush(), this.opts.intervalMs)
  }

  stop(): void {
    if (this.timer === null) return
    clearInterval(this.timer)
    this.timer = null
  }

  handle(event: { conversationId: number; event: CcEvent }): void {
    if (event.event.kind !== 'tokens-used') return
    let s = this.state.get(event.conversationId)
    if (!s) {
      s = { contextUsed: null, contextTotal: null, dirty: false }
      this.state.set(event.conversationId, s)
    }
    s.contextUsed = event.event.used
    s.contextTotal = event.event.total
    s.dirty = true
  }

  removeConversation(conversationId: number): void {
    this.state.delete(conversationId)
  }

  private flush(): void {
    const now = Date.now()
    for (const [conversationId, s] of this.state.entries()) {
      if (!s.dirty) continue
      const percent = s.contextUsed !== null && s.contextTotal && s.contextTotal > 0
        ? Math.round((s.contextUsed / s.contextTotal) * 100)
        : null
      const tick: TelemetryTick = {
        conversationId,
        contextUsed: s.contextUsed,
        contextTotal: s.contextTotal,
        contextPercent: percent,
        tickAt: now
      }
      this.opts.emit(tick)
      s.dirty = false
    }
  }
}
```

- [ ] **Step 4: Run tests + commit**

```bash
npm run test:run -- src/main/__tests__/cc/telemetry-emitter.unit.test.ts
git add src/shared/types/telemetry.ts src/shared/ipc/telemetry.ts src/shared/ipc.ts \
        src/main/cc/telemetry-emitter.ts \
        src/main/__tests__/cc/telemetry-emitter.unit.test.ts
git commit -m "feat(phase-4c): TelemetryEmitter — coalesces tokens-used into periodic telemetry:tick"
```

---

## Task 13: Wire TelemetryEmitter into main + preload

**Files:**
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`, `src/preload/index.d.ts`

- [ ] **Step 1: Construct emitter + wire into lifecycle**

Edit `src/main/ipc/index.ts`. Construct the emitter alongside CcLifecycle:

```ts
import { TelemetryEmitter } from '@main/cc/telemetry-emitter'
import { IPC_TELEMETRY_TICK } from '@shared/ipc/telemetry'

// ... inside registerIpcHandlers, after broadcast is defined:
const telemetryEmitter = new TelemetryEmitter({
  intervalMs: 3000,
  emit: (tick) => broadcast(IPC_TELEMETRY_TICK, { tick })
})
telemetryEmitter.start()
```

Then in the CcLifecycle `onEvent` callback, ALSO feed the emitter:

```ts
onEvent: (e) => {
  telemetryEmitter.handle(e)
  broadcast(IPC_CC_EVENT, e)
}
```

Hook `onExit` to call `telemetryEmitter.removeConversation`:

```ts
onExit: (e) => {
  telemetryEmitter.removeConversation(e.conversationId)
  broadcast('cc:exit', e)
}
```

Stop the emitter in `uninstallAll`:

```ts
uninstallAll: () => {
  logBridge.uninstall()
  accountsHandler.uninstall(ipcMain)
  projectsHandler.uninstall(ipcMain)
  conversationsHandler.uninstall(ipcMain)
  ccHandler.uninstall(ipcMain)
  ccLifecycle.closeAll()
  telemetryEmitter.stop()
}
```

- [ ] **Step 2: Preload — expose telemetry.onTick**

Edit `src/preload/index.ts`. Add a new top-level `telemetry` namespace:

```ts
telemetry: {
  onTick(fn: (tick: TelemetryTick) => void): () => void {
    const listener = (_e: unknown, payload: { tick: TelemetryTick }): void => fn(payload.tick)
    ipcRenderer.on(IPC_TELEMETRY_TICK, listener as never)
    return () => ipcRenderer.removeListener(IPC_TELEMETRY_TICK, listener as never)
  }
}
```

Import `IPC_TELEMETRY_TICK` + `TelemetryTick`. Update `src/preload/index.d.ts` to declare the `telemetry` namespace.

- [ ] **Step 3: Typecheck + commit**

```bash
npm run typecheck
git add src/main/ipc/index.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(phase-4c): wire TelemetryEmitter into main + expose telemetry.onTick via preload"
```

---

## Task 14: useTelemetry hook

**Files:**
- Create: `src/renderer/src/hooks/use-telemetry.ts`
- Create: `src/renderer/src/hooks/__tests__/use-telemetry.unit.test.tsx`

- [ ] **Step 1: Failing test**

Create `src/renderer/src/hooks/__tests__/use-telemetry.unit.test.tsx`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useTelemetry } from '../use-telemetry'

describe('hooks/use-telemetry', () => {
  let listener: ((tick: { conversationId: number; contextUsed: number | null; contextTotal: number | null; contextPercent: number | null; tickAt: number }) => void) | null
  let unsub: ReturnType<typeof vi.fn>

  beforeEach(() => {
    listener = null
    unsub = vi.fn()
    ;(window as unknown as { tokenless: unknown }).tokenless = {
      telemetry: {
        onTick: (fn: typeof listener) => {
          listener = fn
          return unsub
        }
      }
    }
  })

  it('returns null tick until one arrives for the conversation', () => {
    const { result } = renderHook(() => useTelemetry(7))
    expect(result.current).toBeNull()
  })

  it('returns the matching tick when one arrives', () => {
    const { result } = renderHook(() => useTelemetry(7))
    act(() => listener?.({
      conversationId: 7,
      contextUsed: 1000,
      contextTotal: 200000,
      contextPercent: 1,
      tickAt: 123
    }))
    expect(result.current?.contextPercent).toBe(1)
  })

  it('ignores ticks for other conversations', () => {
    const { result } = renderHook(() => useTelemetry(7))
    act(() => listener?.({
      conversationId: 99,
      contextUsed: 5000,
      contextTotal: 200000,
      contextPercent: 3,
      tickAt: 123
    }))
    expect(result.current).toBeNull()
  })

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useTelemetry(7))
    unmount()
    expect(unsub).toHaveBeenCalled()
  })

  it('does not subscribe when conversationId is null', () => {
    renderHook(() => useTelemetry(null))
    expect(listener).toBeNull()
  })
})
```

- [ ] **Step 2: Implement**

Create `src/renderer/src/hooks/use-telemetry.ts`:

```ts
import { useEffect, useState } from 'react'

import type { TelemetryTick } from '@shared/types/telemetry'

export function useTelemetry(conversationId: number | null): TelemetryTick | null {
  const [tick, setTick] = useState<TelemetryTick | null>(null)

  useEffect(() => {
    if (conversationId === null) {
      setTick(null)
      return undefined
    }
    // Reset on conversation switch
    setTick(null)
    const unsub = window.tokenless.telemetry.onTick((incoming) => {
      if (incoming.conversationId === conversationId) {
        setTick(incoming)
      }
    })
    return () => unsub()
  }, [conversationId])

  return tick
}
```

- [ ] **Step 3: Run tests + commit**

```bash
npm run test:run -- src/renderer/src/hooks/__tests__/use-telemetry.unit.test.tsx
git add src/renderer/src/hooks/use-telemetry.ts \
        src/renderer/src/hooks/__tests__/use-telemetry.unit.test.tsx
git commit -m "feat(phase-4c): useTelemetry hook — subscribe to telemetry:tick scoped to conversationId"
```

---

## Task 15: ContextBudgetMeter — consume real values

**Files:**
- Modify: `src/renderer/src/components/terminal/TerminalToolbar.tsx`
- Modify: `src/renderer/src/components/terminal/TerminalSection.tsx`
- Delete: `MOCK_CONTEXT_BUDGET` from `src/renderer/src/mocks/telemetry.ts`

- [ ] **Step 1: Refactor TerminalToolbar to accept budget prop**

Edit `src/renderer/src/components/terminal/TerminalToolbar.tsx`. Replace the `MOCK_CONTEXT_BUDGET` import with a prop:

```tsx
import { InfoTooltip } from '../common/InfoTooltip'

export interface ContextBudget {
  readonly usedTokens: number
  readonly totalTokens: number
  readonly percentUsed: number
}

interface TerminalToolbarProps {
  onStop: () => void
  streaming: boolean
  contextBudget: ContextBudget | null
}

export function TerminalToolbar({ onStop, streaming, contextBudget }: TerminalToolbarProps): JSX.Element {
  const meterClass =
    contextBudget === null
      ? 'terminal-toolbar__meter--idle'
      : contextBudget.percentUsed >= 80
      ? 'terminal-toolbar__meter--warn'
      : contextBudget.percentUsed >= 60
      ? 'terminal-toolbar__meter--info'
      : 'terminal-toolbar__meter--ok'

  return (
    <div className="terminal-toolbar">
      <InfoTooltip helperText="Send SIGINT to Claude Code (stops current response)">
        <button
          type="button"
          className="terminal-toolbar__stop"
          onClick={onStop}
          disabled={!streaming}
        >
          ◼ Stop
        </button>
      </InfoTooltip>
      <InfoTooltip
        helperText="Context window usage for the current Claude Code session"
        contextFn={() => {
          if (contextBudget === null) return 'No active session yet.'
          if (contextBudget.percentUsed >= 80) return 'Approaching capacity — consider starting a fresh conversation.'
          return null
        }}
        outcomeFn={() =>
          contextBudget === null
            ? 'no tokens used yet'
            : `${contextBudget.usedTokens.toLocaleString()} of ${contextBudget.totalTokens.toLocaleString()} tokens used`
        }
      >
        <div className={`terminal-toolbar__meter ${meterClass}`}>
          <span className="terminal-toolbar__meter-label">Context:</span>
          <div className="terminal-toolbar__meter-bar">
            <div
              className="terminal-toolbar__meter-fill"
              style={{ width: `${contextBudget?.percentUsed ?? 0}%` }}
            />
          </div>
          <span className="terminal-toolbar__meter-value">
            {contextBudget !== null ? `${contextBudget.percentUsed}%` : '—'}
          </span>
        </div>
      </InfoTooltip>
    </div>
  )
}
```

Add an idle style for the meter:

```css
.terminal-toolbar__meter--idle .terminal-toolbar__meter-fill { background: var(--tl-rule-subtle); }
```

- [ ] **Step 2: TerminalSection passes the prop**

Edit `src/renderer/src/components/terminal/TerminalSection.tsx`. Add the `useTelemetry` hook and pass the derived budget:

```ts
import { useTelemetry } from '../../hooks/use-telemetry'
// ...

const tick = useTelemetry(conversationId)
const contextBudget = tick && tick.contextUsed !== null && tick.contextTotal !== null && tick.contextPercent !== null
  ? {
      usedTokens: tick.contextUsed,
      totalTokens: tick.contextTotal,
      percentUsed: tick.contextPercent
    }
  : null

// In JSX:
<TerminalToolbar
  onStop={() => void handleStop()}
  streaming={conversationId !== null}
  contextBudget={contextBudget}
/>
```

- [ ] **Step 3: Delete MOCK_CONTEXT_BUDGET**

Edit `src/renderer/src/mocks/telemetry.ts`. Remove the `MockContextBudget` interface and `MOCK_CONTEXT_BUDGET` constant. Keep `MOCK_COST_PREVIEW` (Phase 5 owns that).

Verify no other file imports `MOCK_CONTEXT_BUDGET`:

```bash
grep -r "MOCK_CONTEXT_BUDGET" src/
```

Should return nothing.

- [ ] **Step 4: Typecheck + run tests + commit**

```bash
npm run typecheck
npm run test:run
git add src/renderer/src/components/terminal/TerminalToolbar.tsx \
        src/renderer/src/components/terminal/TerminalSection.tsx \
        src/renderer/src/components/terminal/styles.css \
        src/renderer/src/mocks/telemetry.ts
git commit -m "feat(phase-4c): ContextBudgetMeter consumes useTelemetry; drop MOCK_CONTEXT_BUDGET"
```

---

## Task 16: cc-stop E2E magic-sleep fix

**Files:**
- Modify: `test/e2e/cc-stop.e2e.test.ts`

- [ ] **Step 1: Replace `waitForTimeout(500)` with a deterministic wait**

Edit `test/e2e/cc-stop.e2e.test.ts`. Find the `await win.waitForTimeout(500)` line. Replace with a poll for cc:exit broadcast:

```ts
// Wait for the cc:exit event to propagate (lifecycle.stop fires SIGINT,
// pty.onExit then removes the slot — this is async). Poll the renderer's
// log bridge for cc-exited or terminal-stop-ok.
await win.evaluate(async () => {
  interface RendererApi {
    log: { getRecent: (n: number) => Promise<readonly { event: string }[]> }
  }
  const api = (window as unknown as { tokenless: RendererApi }).tokenless
  for (let i = 0; i < 30; i++) {
    const records = await api.log.getRecent(200)
    if (records.find((r) => r.event === 'terminal-stop-ok')) return
    await new Promise((r) => setTimeout(r, 100))
  }
})
```

(That's the same polling pattern the existing test already uses — just hoist it before the post-stop send.)

- [ ] **Step 2: Run E2E to verify the fix doesn't regress**

```bash
npm run rebuild:electron
npm run build
npm run test:e2e
npm run rebuild:node
```

Expected: 16/16 pass.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/cc-stop.e2e.test.ts
git commit -m "test(phase-4c): cc-stop E2E uses log-poll instead of waitForTimeout(500)"
```

---

## Task 17: E2E — crash toast

**Files:**
- Modify: `test/doubles/claude-mock.cjs` — add a crash mode triggered by env var
- Create: `test/e2e/cc-crash.e2e.test.ts`

- [ ] **Step 1: Extend mock-claude with a crash mode**

Edit `test/doubles/claude-mock.cjs`. Near the top, add:

```js
// CRASH_MODE: if env TOKENLESS_MOCK_CRASH_AFTER_MS is set, exit with code 1
// after that many milliseconds. Used by Phase 4C cc-crash E2E test.
if (process.env.TOKENLESS_MOCK_CRASH_AFTER_MS) {
  const ms = parseInt(process.env.TOKENLESS_MOCK_CRASH_AFTER_MS, 10)
  setTimeout(() => process.exit(1), ms)
}
```

- [ ] **Step 2: E2E test**

Create `test/e2e/cc-crash.e2e.test.ts`:

```ts
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test.describe('Phase 4C cc:crashed', () => {
  let userDataDir: string
  let app: ElectronApplication

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), 'tokenless-e2e-'))
  })

  test.afterEach(async () => {
    if (app) {
      try { await app.close() } catch { /* best-effort */ }
    }
    if (existsSync(userDataDir)) {
      rmSync(userDataDir, { recursive: true, force: true })
    }
  })

  test('crash toast appears when claude exits non-zero before a graceful prompt', async () => {
    const mockClaudeCmd = resolve('test/doubles/claude-mock.cmd')
    app = await electron.launch({
      args: ['out/main/index.js'],
      env: {
        ...process.env,
        TOKENLESS_USER_DATA_DIR: userDataDir,
        TOKENLESS_CLAUDE_BIN: mockClaudeCmd,
        TOKENLESS_MOCK_CRASH_AFTER_MS: '500' // crash 0.5s after spawn
      }
    })
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')

    // Project setup
    await expect(win.getByRole('region', { name: /welcome to tokenless/i })).toBeVisible()
    await win.getByRole('button', { name: /create your first project/i }).click()
    await win.getByPlaceholder('My Project').fill('Crash Test')
    await win.getByPlaceholder('C:/path/to/project').fill(process.cwd())
    await win.getByRole('button', { name: /^create$/i }).click()
    await expect(win.locator('.terminal-pane')).toBeVisible({ timeout: 10000 })

    // Start a conversation — mock-claude will exit non-zero within ~500ms
    await win.getByRole('button', { name: /new conversation/i }).click()

    // Wait for the crash toast
    await expect(win.getByRole('alert')).toBeVisible({ timeout: 5000 })
    await expect(win.getByText(/claude code crashed/i)).toBeVisible()
  })
})
```

- [ ] **Step 3: Run E2E + commit**

```bash
npm run rebuild:electron
npm run build
npm run test:e2e
npm run rebuild:node
git add test/doubles/claude-mock.cjs test/e2e/cc-crash.e2e.test.ts
git commit -m "test(phase-4c): E2E — crash toast appears when claude exits non-zero pre-prompt"
```

---

## Task 18: ADR-029 + docs + Phase 4C scenarios + tag v0.9.0-phase-4c

**Files:**
- Modify: `docs/decisions.md`
- Modify: `docs/observability.md`
- Modify: `docs/test-scenarios.md`

- [ ] **Step 1: ADR-029**

Append to `docs/decisions.md`:

```markdown

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

```

- [ ] **Step 2: Observability — add Phase 4C events**

Edit `docs/observability.md`. Update the `cc` row:

```
| `cc` | ... Phase 4C events: `cc-crashed`, `cc-hung`. Parsed events (via `cc:event` IPC): `prompt-ready`, `tool-call`, `response-complete`, `tokens-used`. |
```

Update the `ui` row with: `cc-crash-toast`, `orphan-conversation-cleanup-failed`.

Add a new row or note for `telemetry` events broadcast (not logged): `telemetry:tick`.

- [ ] **Step 3: Test scenarios**

Append to `docs/test-scenarios.md`:

```markdown

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
```

- [ ] **Step 4: Switch ABIs, run all gates, tag**

```bash
npm run rebuild:node
npm run typecheck
npm run test:run
npm run rebuild:electron
npm run build
npm run test:e2e
npm run rebuild:node
```

All four gates green.

```bash
git add docs/decisions.md docs/observability.md docs/test-scenarios.md
git commit -m "docs(phase-4c): ADR-029 telemetry tick design + manual scenarios + observability events"
```

- [ ] **Step 5: Tag**

```bash
git tag -s -a v0.9.0-phase-4c -m "Phase 4C complete — crash + hung detection, telemetry tick driving real ContextBudgetMeter, orphan-row cleanup"
git rev-parse v0.9.0-phase-4c^{commit}
```

- [ ] **Step 6: Hand off**

Report `Phase 4C complete locally. Tag v0.9.0-phase-4c at <sha>. Push + CI watch is next.`

---

## Self-Review Checklist

After all tasks land:

- [ ] **§7.1 progress vs the spec table:**
  - Row 1 `claude` not found ✓ (Phase 4B)
  - Row 2 CC crashes mid-session ✓ (this phase — crash toast)
  - Row 3 CC hangs ✓ (this phase — hung banner with warn at 60s, error at 90s)
  - Row 4 `--resume` fails — DEFERRED to Phase 4D (depends on real-claude output pattern detection + branch-from-last-turn recovery)
  - Row 5 Quota — DEFERRED to Phase 4D
  - Row 6 Auth expired — DEFERRED to Phase 4D
  - Row 7 PTY write fails ✓ (this phase — toast + PTY_WRITE_FAILED envelope)
- [ ] **Spec §4 telemetry tick** — covered, 3s cadence per ADR-029.
- [ ] **Phase 4B nits resolved:** parser narrowed, modal text updated, cc-stop magic sleep replaced.
- [ ] **No new silent catches.**
- [ ] **`MOCK_CONTEXT_BUDGET` deleted; `MOCK_COST_PREVIEW` kept for Phase 5.**
- [ ] **All commit messages follow conventional commits.**
- [ ] **`npm run typecheck`** clean.

---

## Exit State

**Visible to user:**
- If claude crashes (non-zero exit before a graceful response), an error toast appears with the exit code + suggests resuming.
- If the conversation stalls for ≥60 seconds, a warning banner appears above the terminal with a Stop button. At 90s the banner upgrades to error severity.
- The context-budget meter shows REAL token usage from the latest `tokens-used` parser event (incrementing as claude responds), instead of static 42%.
- Failed conversation starts (e.g., CLAUDE_NOT_FOUND) no longer leave orphan rows in the sidebar.
- PTY write failures surface as a clear toast instead of silent send.

**Under the hood:**
- `CcLifecycle` instantiates a `Watchdog` per slot; chunk arrival resets both timers; non-zero exits without graceful prompts emit a structured `onCrashed` event.
- `TelemetryEmitter` keeps per-conversation latest tokens-used state and fires `telemetry:tick` IPCs every 3s (only when dirty).
- `ToastProvider` + `ToastHost` are a cross-cutting renderer primitive — Phase 4D will use it for quota/auth/resume-fail surfacing.
- `useTelemetry` and `useToast` hooks expose the new flows.

**Phase 4D will deliver:**
- Output-pattern failures: `--resume fails`, quota hit, auth expired (parser regex matchers + toasts + the recovery actions where their backends exist)
- Branch-from-last-turn recovery (depends on Phase 7's branching backend — coordinate with that)
- "Switch to API" toggle (depends on Phase 6's multi-account UI)
- Real-claude output calibration (the parser patterns are mock-tuned in Phase 4B-C)

**Tag:** `v0.9.0-phase-4c`
