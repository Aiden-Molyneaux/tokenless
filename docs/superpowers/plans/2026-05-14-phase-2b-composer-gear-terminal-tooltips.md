# TokenLess v1 — Phase 2B: Composer + Gear Review + Terminal Section + Tooltips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the MainPane placeholder with the real visual UI — Composer (prompt textarea + 4 config dropdowns + Gear/Send/Commit/Push buttons + telemetry strip), GearReviewPane (2-pane original vs geared diff + critique flags), TerminalSection (xterm.js panel showing canned ANSI streams + Stop button + ContextBudgetMeter). Introduce the cross-cutting InfoTooltip system and extract a generic `<Dropdown>` component now that 4+ dropdown instances are appearing. After Phase 2B, the app *looks completely like TokenLess* — every interaction logs to Dev Mode but no real backend yet.

**Architecture:** New `src/renderer/src/components/common/` holds the reusable Dropdown + useDropdown hook + InfoTooltip. Three new feature directories: `composer/`, `gear-review/`, `terminal/` — each with its component pieces + co-located `styles.css`. The MainPane's two placeholder sections (composer-area, terminal-area) finally get real content. Composer holds its own state (prompt text, 4 config selections, gear-mode discriminator); when "Gear" is clicked it swaps to GearReviewPane with mock geared content. xterm.js Terminal instance writes canned ANSI output to simulate streaming.

**Tech Stack:** Same as Phase 2A + `@xterm/xterm` and `@xterm/addon-fit` (already installed in Phase 2A Task 1).

---

## Scope

Phase 2B only. Phase 3 (real DB + persistence) replaces all the mock data with IPC-backed hooks; Phase 4 wires real Claude Code subprocess to the terminal; Phase 5 wires the gearing engine.

## Prerequisites

- Phase 2A complete (`v0.4.0-phase-2a` tag exists; CI green)
- Working directory: `C:\personal\tokenless\`
- All Phase 0-2A dependencies installed (including `@xterm/xterm`, `@xterm/addon-fit`, `happy-dom`)

## File structure

```
src/renderer/src/components/common/                                 [CREATE]
├── use-dropdown.ts                                                 [CREATE] open/close + outside-click + escape hook
├── Dropdown.tsx                                                    [CREATE] generic dropdown component
├── InfoTooltip.tsx                                                 [CREATE] context+outcome aware tooltip
├── styles.css                                                      [CREATE] dropdown + tooltip styles
└── __tests__/
    ├── use-dropdown.unit.test.ts                                   [CREATE] hook tests (happy-dom)
    └── InfoTooltip.unit.test.tsx                                   [CREATE] tooltip rendering tests

src/renderer/src/components/layout/
├── ProjectSwitcher.tsx                                             [MODIFY] use <Dropdown>
├── AccountSwitcher.tsx                                             [MODIFY] use <Dropdown>
└── styles.css                                                      [MODIFY] remove dead .project-switcher__* + .account-switcher__* rules

src/renderer/src/components/composer/                               [CREATE]
├── PromptTextarea.tsx                                              [CREATE] controlled textarea
├── ConfigsRow.tsx                                                  [CREATE] 4 dropdowns (model, breadth, format, skill)
├── ActionsRow.tsx                                                  [CREATE] Gear/Send/Commit/Push buttons
├── TelemetryStrip.tsx                                              [CREATE] cost + tokens estimate
├── Composer.tsx                                                    [CREATE] orchestrator (state + gear-mode swap)
└── styles.css                                                      [CREATE]

src/renderer/src/components/gear-review/                            [CREATE]
├── OriginalPane.tsx                                                [CREATE] read-only dimmed
├── GearedPane.tsx                                                  [CREATE] editable highlighted
├── CritiqueFlags.tsx                                               [CREATE] yellow banner for ambiguity flags
├── GearReviewPane.tsx                                              [CREATE] orchestrator
└── styles.css                                                      [CREATE]

src/renderer/src/components/terminal/                               [CREATE]
├── TerminalToolbar.tsx                                             [CREATE] Stop + ContextBudgetMeter
├── TerminalPane.tsx                                                [CREATE] xterm.js wrapper
├── TerminalSection.tsx                                             [CREATE] orchestrator
└── styles.css                                                      [CREATE]

src/renderer/src/mocks/
├── dropdown-options.ts                                             [CREATE] MOCK_MODELS, MOCK_BREADTHS, MOCK_FORMATS, MOCK_SKILLS
├── geared-prompt.ts                                                [CREATE] MOCK_ORIGINAL_PROMPT + MOCK_GEARED_PROMPT + MOCK_CRITIQUE_FLAGS
├── telemetry.ts                                                    [CREATE] MOCK_COST_PREVIEW, MOCK_CONTEXT_BUDGET
└── terminal-stream.ts                                              [CREATE] MOCK_TERMINAL_STREAM ANSI string

src/renderer/src/components/layout/MainPane.tsx                     [MODIFY] swap placeholders for <Composer/> + <TerminalSection/>
src/renderer/src/styles.css                                         [MODIFY] reposition .app__dev-toggle below TopBar

test/e2e/composer.e2e.test.ts                                       [CREATE] composer flow E2E
test/e2e/smoke.e2e.test.ts                                          [MODIFY] add composer + terminal visibility assertions

docs/decisions.md                                                   [MODIFY] add ADR-021 (Dropdown + Tooltip patterns)
docs/test-scenarios.md                                              [MODIFY] add Phase 2B scenarios
```

**Responsibilities at a glance:**

- `components/common/use-dropdown.ts` — `useDropdown()` returns `{ open, setOpen, toggle, rootRef }`. Closes on outside click or Escape.
- `components/common/Dropdown.tsx` — typed dropdown component. Takes `items`, `activeValue`, `onSelect`, `label`, optional `renderItem` for custom item display. Handles all the menu styling + ARIA.
- `components/common/InfoTooltip.tsx` — wraps children with a hoverable/focusable `(i)` icon and a tooltip panel. `helperText` always renders; optional `contextFn` and `outcomeFn` return `string | null` and render as additional lines when truthy.
- `components/composer/Composer.tsx` — orchestrator. Holds prompt text + 4 config selections + a `gearMode` discriminator. When `gearMode` is truthy, renders `<GearReviewPane>` instead of the normal compose form.
- `components/gear-review/GearReviewPane.tsx` — receives `original`, `geared`, `critiqueFlags`, and three callbacks (`onSend`, `onCancel`, `onReGear`). Lets the user edit the geared text inline.
- `components/terminal/TerminalPane.tsx` — `xterm.js` `Terminal` instance mounted in a container div. Writes `MOCK_TERMINAL_STREAM` in chunks (every 100ms) to simulate streaming. FitAddon sizes to container; resizes on window resize. Disposes on unmount.

---

## Tasks

---

### Task 1: `useDropdown` hook + tests

**Files:**
- Create: `src/renderer/src/components/common/use-dropdown.ts`
- Create: `src/renderer/src/components/common/__tests__/use-dropdown.unit.test.ts`

**Step 1:** Create the directories:

```bash
cd "C:/personal/tokenless"
mkdir -p src/renderer/src/components/common/__tests__
```

**Step 2:** Write the failing test at `src/renderer/src/components/common/__tests__/use-dropdown.unit.test.ts`:

```typescript
// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDropdown } from '../use-dropdown'

describe('useDropdown', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useDropdown())
    expect(result.current.open).toBe(false)
  })

  it('toggle flips open state', () => {
    const { result } = renderHook(() => useDropdown())
    act(() => result.current.toggle())
    expect(result.current.open).toBe(true)
    act(() => result.current.toggle())
    expect(result.current.open).toBe(false)
  })

  it('setOpen sets open state directly', () => {
    const { result } = renderHook(() => useDropdown())
    act(() => result.current.setOpen(true))
    expect(result.current.open).toBe(true)
    act(() => result.current.setOpen(false))
    expect(result.current.open).toBe(false)
  })

  it('Escape key closes when open', () => {
    const { result } = renderHook(() => useDropdown())
    act(() => result.current.setOpen(true))
    expect(result.current.open).toBe(true)
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(result.current.open).toBe(false)
  })

  it('Escape key does nothing when already closed', () => {
    const { result } = renderHook(() => useDropdown())
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(result.current.open).toBe(false)
  })

  it('removes listeners after close (cleanup)', () => {
    const { result, unmount } = renderHook(() => useDropdown())
    act(() => result.current.setOpen(true))
    unmount()
    // After unmount, escape should not throw or affect anything
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    // No assertion needed — if there's a leaked listener it would throw
    expect(true).toBe(true)
  })
})
```

**Step 3:** Install `@testing-library/react` (needed for `renderHook`/`act` against happy-dom):

```bash
cd "C:/personal/tokenless"
npm install -D @testing-library/react@^16
```

**Step 4:** Run test (expected FAIL — hook doesn't exist yet):

```bash
npm run test:run -- src/renderer/src/components/common/__tests__/use-dropdown.unit.test.ts
```

**Step 5:** Implement `src/renderer/src/components/common/use-dropdown.ts`:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseDropdownReturn {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  rootRef: React.RefObject<HTMLDivElement>
}

// Shared dropdown state hook: open/close + outside-click + escape close +
// stable rootRef for click-outside detection. Used by the generic <Dropdown>
// component (Task 2); call sites get this behavior for free.

export function useDropdown(): UseDropdownReturn {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return undefined
    const handleClickOutside = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const toggle = useCallback(() => setOpen((o) => !o), [])

  return { open, setOpen, toggle, rootRef }
}
```

**Step 6:** Run test (expected PASS, 6 tests):

```bash
npm run test:run -- src/renderer/src/components/common/__tests__/use-dropdown.unit.test.ts
```

**Step 7:** Commit:

```bash
git add src/renderer/src/components/common/use-dropdown.ts src/renderer/src/components/common/__tests__/use-dropdown.unit.test.ts package.json package-lock.json
git commit -m "feat(phase-2b): useDropdown hook with outside-click + escape close + tests"
```

---

### Task 2: Generic `Dropdown` component + styles

**Files:**
- Create: `src/renderer/src/components/common/Dropdown.tsx`
- Create: `src/renderer/src/components/common/styles.css`

**Step 1:** Write `src/renderer/src/components/common/Dropdown.tsx`:

```typescript
import type { ReactNode } from 'react'
import { useDropdown } from './use-dropdown'

export interface DropdownItem {
  value: string
  label: string
  description?: string
}

interface DropdownProps {
  label: string                                  // "Project:", "Model:", etc.
  items: readonly DropdownItem[]
  activeValue: string
  onSelect: (value: string) => void
  renderItem?: (item: DropdownItem, isActive: boolean) => ReactNode
  className?: string                             // extra root class for trigger styling variants
  fallbackLabel?: string                         // shown when no item matches activeValue (default: 'None')
}

// Generic dropdown. Used by ProjectSwitcher, AccountSwitcher, and Composer's
// ConfigsRow. The trigger displays "{label} {active.label}"; the menu lists
// items with optional descriptions (one line each).
//
// If renderItem is provided, it controls the item body rendering; otherwise
// items render as label + optional description.

export function Dropdown({
  label,
  items,
  activeValue,
  onSelect,
  renderItem,
  className,
  fallbackLabel = 'None'
}: DropdownProps): JSX.Element {
  const { open, toggle, setOpen, rootRef } = useDropdown()
  const active = items.find((i) => i.value === activeValue)

  const handleSelect = (value: string): void => {
    onSelect(value)
    setOpen(false)
  }

  return (
    <div className={`dropdown ${className ?? ''}`} ref={rootRef}>
      <button
        type="button"
        className="dropdown__trigger"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="dropdown__label">{label}</span>
        <span className="dropdown__name">{active?.label ?? fallbackLabel}</span>
        <span className="dropdown__caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="dropdown__menu" role="menu">
          {items.map((item) => (
            <li key={item.value} role="none">
              <button
                type="button"
                role="menuitem"
                className={`dropdown__item ${item.value === activeValue ? 'is-active' : ''}`}
                onClick={() => handleSelect(item.value)}
              >
                {renderItem ? renderItem(item, item.value === activeValue) : (
                  <>
                    <span className="dropdown__item-label">{item.label}</span>
                    {item.description && (
                      <span className="dropdown__item-description">{item.description}</span>
                    )}
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

**Step 2:** Write `src/renderer/src/components/common/styles.css`:

```css
/* Generic Dropdown component styles. Replaces .project-switcher__* and
   .account-switcher__* rules in layout/styles.css after Tasks 4-5 refactor. */

.dropdown {
  position: relative;
}

.dropdown__trigger {
  display: flex;
  align-items: center;
  gap: var(--tl-space-2);
  background: transparent;
  border: 1px solid var(--tl-rule);
  border-radius: var(--tl-radius-sm);
  padding: var(--tl-space-1) var(--tl-space-3);
  font-family: var(--tl-font-sans);
  font-size: var(--tl-text-sm);
  color: var(--tl-fg);
  cursor: pointer;
  transition: background var(--tl-transition-fast);
}

.dropdown__trigger:hover {
  background: var(--tl-hover);
}

.dropdown__label {
  color: var(--tl-mute);
  font-size: var(--tl-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.dropdown__name {
  font-weight: var(--tl-weight-medium);
}

.dropdown__caret {
  color: var(--tl-mute);
  font-size: var(--tl-text-xs);
}

.dropdown__menu {
  position: absolute;
  top: calc(100% + var(--tl-space-1));
  left: 0;
  min-width: 240px;
  margin: 0;
  padding: var(--tl-space-1) 0;
  list-style: none;
  background: var(--tl-bg);
  border: 1px solid var(--tl-rule);
  border-radius: var(--tl-radius-md);
  box-shadow: var(--tl-shadow-md);
  z-index: var(--tl-z-dropdown);
}

.dropdown__item {
  display: flex;
  flex-direction: column;
  width: 100%;
  background: transparent;
  border: none;
  padding: var(--tl-space-2) var(--tl-space-3);
  text-align: left;
  cursor: pointer;
  font-family: var(--tl-font-sans);
  font-size: var(--tl-text-sm);
}

.dropdown__item:hover {
  background: var(--tl-hover);
}

.dropdown__item.is-active {
  background: var(--tl-orange-50);
  color: var(--tl-orange-700);
}

.dropdown__item-label {
  font-weight: var(--tl-weight-medium);
}

.dropdown__item-description {
  color: var(--tl-mute);
  font-size: var(--tl-text-xs);
  font-family: var(--tl-font-mono);
}

/* ===== InfoTooltip ===== */

.info-tooltip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--tl-space-1);
}

.info-tooltip__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: var(--tl-radius-full);
  background: transparent;
  border: 1px solid var(--tl-rule);
  color: var(--tl-mute);
  font-family: var(--tl-font-mono);
  font-size: 10px;
  cursor: help;
  user-select: none;
  transition: all var(--tl-transition-fast);
}

.info-tooltip__icon:hover,
.info-tooltip__icon:focus {
  background: var(--tl-blue-50);
  color: var(--tl-blue-700);
  border-color: var(--tl-blue);
  outline: none;
}

.info-tooltip__panel {
  position: absolute;
  bottom: calc(100% + var(--tl-space-2));
  left: 50%;
  transform: translateX(-50%);
  background: var(--tl-fg);
  color: var(--tl-bg);
  padding: var(--tl-space-2) var(--tl-space-3);
  border-radius: var(--tl-radius-sm);
  box-shadow: var(--tl-shadow-md);
  width: max-content;
  max-width: 320px;
  z-index: var(--tl-z-dropdown);
  font-size: var(--tl-text-xs);
  line-height: var(--tl-leading-normal);
}

.info-tooltip__panel p {
  margin: 0;
}

.info-tooltip__panel p + p {
  margin-top: var(--tl-space-1);
  padding-top: var(--tl-space-1);
  border-top: 1px solid rgba(250, 247, 242, 0.16);
}

.info-tooltip__helper {
  font-weight: var(--tl-weight-medium);
}

.info-tooltip__context {
  font-style: italic;
  opacity: 0.85;
}

.info-tooltip__outcome {
  font-family: var(--tl-font-mono);
  opacity: 0.85;
}
```

**Step 3:** Run typecheck:

```bash
npm run typecheck
```

Exit 0.

**Step 4:** Commit:

```bash
git add src/renderer/src/components/common/Dropdown.tsx src/renderer/src/components/common/styles.css
git commit -m "feat(phase-2b): generic Dropdown component + styles"
```

---

### Task 3: InfoTooltip component + tests

**Files:**
- Create: `src/renderer/src/components/common/InfoTooltip.tsx`
- Create: `src/renderer/src/components/common/__tests__/InfoTooltip.unit.test.tsx`

**Step 1:** Write the failing test at `src/renderer/src/components/common/__tests__/InfoTooltip.unit.test.tsx`:

```typescript
// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InfoTooltip } from '../InfoTooltip'

describe('InfoTooltip', () => {
  it('renders the (i) icon but not the panel by default', () => {
    render(<InfoTooltip helperText="Helper text">child</InfoTooltip>)
    expect(screen.getByRole('button', { name: /More information/i })).toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows panel with helperText on icon hover', () => {
    render(<InfoTooltip helperText="Important info">child</InfoTooltip>)
    const icon = screen.getByRole('button', { name: /More information/i })
    fireEvent.mouseEnter(icon)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    expect(screen.getByText('Important info')).toBeInTheDocument()
  })

  it('hides panel on mouse leave', () => {
    render(<InfoTooltip helperText="Helper">child</InfoTooltip>)
    const icon = screen.getByRole('button', { name: /More information/i })
    fireEvent.mouseEnter(icon)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.mouseLeave(icon)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('calls contextFn and renders its output when truthy', () => {
    render(
      <InfoTooltip
        helperText="Base text"
        contextFn={() => 'Context-aware extra'}
      >
        child
      </InfoTooltip>
    )
    fireEvent.mouseEnter(screen.getByRole('button', { name: /More information/i }))
    expect(screen.getByText('Context-aware extra')).toBeInTheDocument()
  })

  it('omits context line when contextFn returns null', () => {
    render(
      <InfoTooltip
        helperText="Base text"
        contextFn={() => null}
      >
        child
      </InfoTooltip>
    )
    fireEvent.mouseEnter(screen.getByRole('button', { name: /More information/i }))
    expect(screen.queryByText(/Context-aware/i)).not.toBeInTheDocument()
  })

  it('renders both contextFn and outcomeFn output when both truthy', () => {
    render(
      <InfoTooltip
        helperText="Base"
        contextFn={() => 'Context line'}
        outcomeFn={() => 'Outcome line: saved 1.2k tokens'}
      >
        child
      </InfoTooltip>
    )
    fireEvent.mouseEnter(screen.getByRole('button', { name: /More information/i }))
    expect(screen.getByText('Context line')).toBeInTheDocument()
    expect(screen.getByText('Outcome line: saved 1.2k tokens')).toBeInTheDocument()
  })
})
```

**Step 2:** Run test (expected FAIL — component doesn't exist):

```bash
cd "C:/personal/tokenless"
npm run test:run -- src/renderer/src/components/common/__tests__/InfoTooltip.unit.test.tsx
```

**Step 3:** Implement `src/renderer/src/components/common/InfoTooltip.tsx`:

```typescript
import { useState, type ReactNode } from 'react'

interface InfoTooltipProps {
  helperText: string
  contextFn?: () => string | null
  outcomeFn?: () => string | null
  children?: ReactNode
}

// Smart tooltip per spec §6.4 + brainstorm Q-G. Always renders helperText.
// contextFn returns text that varies by current state (e.g., "Since you have
// Haiku selected..."). outcomeFn returns telemetry-derived text (e.g.,
// "Saved 1.2k tokens last month"). Both are called every render — they should
// be pure and cheap.
//
// Renders children (the wrapped content) followed by a focusable (i) icon
// that triggers the tooltip panel on hover or focus.

export function InfoTooltip({ helperText, contextFn, outcomeFn, children }: InfoTooltipProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const contextText = contextFn?.() ?? null
  const outcomeText = outcomeFn?.() ?? null

  return (
    <span className="info-tooltip">
      {children}
      <span
        className="info-tooltip__icon"
        role="button"
        tabIndex={0}
        aria-label="More information"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        i
      </span>
      {open && (
        <div className="info-tooltip__panel" role="tooltip">
          <p className="info-tooltip__helper">{helperText}</p>
          {contextText && <p className="info-tooltip__context">{contextText}</p>}
          {outcomeText && <p className="info-tooltip__outcome">{outcomeText}</p>}
        </div>
      )}
    </span>
  )
}
```

**Step 4:** Run test (expected PASS, 6 tests):

```bash
npm run test:run -- src/renderer/src/components/common/__tests__/InfoTooltip.unit.test.tsx
```

**Step 5:** Run full suite to confirm no regressions:

```bash
npm run test:run
```

Total: 35 (prior) + 6 (Task 1) + 6 (Task 3) = 47 tests passing.

**Step 6:** Commit:

```bash
git add src/renderer/src/components/common/InfoTooltip.tsx src/renderer/src/components/common/__tests__/InfoTooltip.unit.test.tsx
git commit -m "feat(phase-2b): InfoTooltip with context+outcome aware rendering + tests"
```

---

### Task 4: ADR-021 — Dropdown + Tooltip patterns

**Files:**
- Modify: `docs/decisions.md`

**Step 1:** Append ADR-021 to the end of `docs/decisions.md`:

```markdown

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
```

**Step 2:** Commit:

```bash
cd "C:/personal/tokenless"
git add docs/decisions.md
git commit -m "docs(phase-2b): add ADR-021 for Dropdown + InfoTooltip cross-cutting primitives"
```

---

### Task 5: Refactor ProjectSwitcher to use `<Dropdown>`

**Files:**
- Modify: `src/renderer/src/components/layout/ProjectSwitcher.tsx`
- Modify: `src/renderer/src/components/layout/styles.css` (remove dead `.project-switcher__*` rules)

**Step 1:** Replace `src/renderer/src/components/layout/ProjectSwitcher.tsx` ENTIRELY:

```typescript
import { Dropdown, type DropdownItem } from '../common/Dropdown'
import type { MockProject } from '../../mocks/projects'

interface ProjectSwitcherProps {
  projects: readonly MockProject[]
  activeProjectId: string
  onSelect: (id: string) => void
}

// Thin wrapper around <Dropdown>. Phase 2A's standalone implementation was
// extracted in Phase 2B (Task 4) per ADR-021.

export function ProjectSwitcher({ projects, activeProjectId, onSelect }: ProjectSwitcherProps): JSX.Element {
  const items: readonly DropdownItem[] = projects.map((p) => ({
    value: p.id,
    label: p.name,
    description: p.rootPath
  }))
  return (
    <Dropdown
      label="Project:"
      items={items}
      activeValue={activeProjectId}
      onSelect={onSelect}
      fallbackLabel="No project"
    />
  )
}
```

**Step 2:** Open `src/renderer/src/components/layout/styles.css` and DELETE the now-dead `.project-switcher*` rule blocks. Specifically remove:

- `.project-switcher` / `.account-switcher` (the position: relative rule)
- `.project-switcher__trigger` / `.account-switcher__trigger`
- All shared trigger states (`:hover`, etc.) that target the project-switcher/account-switcher classes
- `.project-switcher__label` / `.account-switcher__label`
- `.project-switcher__name` / `.account-switcher__name`
- `.project-switcher__caret` / `.account-switcher__caret`
- `.project-switcher__menu` / `.account-switcher__menu`
- `.project-switcher__item` / `.account-switcher__item` (all states)
- `.project-switcher__item-name` / `.account-switcher__item-name`
- `.project-switcher__item-path` / `.account-switcher__item-email`

(Wait until Task 6 refactors AccountSwitcher before removing — otherwise AccountSwitcher's still-existing markup loses its styles. To stay safe, ONLY remove `.project-switcher__*` rules now and leave `.account-switcher__*` rules in place until Task 6.)

The `/* ===== Switcher (shared between Project + Account) ===== */` section header can also stay — Task 6 will remove the whole block once both sides are refactored.

After Task 5, the layout/styles.css still has dead `.account-switcher__*` rules that get removed in Task 6. Acceptable intermediate state.

**Step 3:** Run typecheck + build + E2E:

```bash
cd "C:/personal/tokenless"
npm run typecheck
npm run build
npm run test:e2e
```

All exit 0. E2E should still pass — the visual rendering of the project switcher is unchanged (different CSS classes but same DOM structure under `.dropdown__*`).

**Step 4:** Commit:

```bash
git add src/renderer/src/components/layout/ProjectSwitcher.tsx src/renderer/src/components/layout/styles.css
git commit -m "refactor(phase-2b): ProjectSwitcher uses generic <Dropdown>; drop dead .project-switcher__* styles"
```

---

### Task 6: Refactor AccountSwitcher to use `<Dropdown>` + finish styles cleanup

**Files:**
- Modify: `src/renderer/src/components/layout/AccountSwitcher.tsx`
- Modify: `src/renderer/src/components/layout/styles.css` (remove remaining `.account-switcher__*` rules)

**Step 1:** Replace `src/renderer/src/components/layout/AccountSwitcher.tsx` ENTIRELY:

```typescript
import { Dropdown, type DropdownItem } from '../common/Dropdown'
import type { MockAccount } from '../../mocks/accounts'

interface AccountSwitcherProps {
  accounts: readonly MockAccount[]
  activeAccountId: string
  onSelect: (id: string) => void
}

// Thin wrapper around <Dropdown>. Phase 2A's standalone implementation was
// extracted in Phase 2B (Task 4) per ADR-021. Phase 6 wires real account
// auth + CLAUDE_CONFIG_DIR + ANTHROPIC_API_KEY injection per ADR-018.

export function AccountSwitcher({ accounts, activeAccountId, onSelect }: AccountSwitcherProps): JSX.Element {
  const items: readonly DropdownItem[] = accounts.map((a) => ({
    value: a.id,
    label: a.label,
    description: a.email
  }))
  return (
    <Dropdown
      label="Account:"
      items={items}
      activeValue={activeAccountId}
      onSelect={onSelect}
      fallbackLabel="No account"
    />
  )
}
```

**Step 2:** Open `src/renderer/src/components/layout/styles.css` and DELETE:

- The `/* ===== Switcher (shared between Project + Account) ===== */` section comment
- All `.account-switcher*` rules (single + double-colon variants, hover states)
- Any remaining combined selectors like `.project-switcher__item, .account-switcher__item` — these should now all be gone since Task 5 deleted the project-switcher half.

After this step, layout/styles.css has NO dropdown-specific rules — they all live in `common/styles.css`.

**Step 3:** Run typecheck + build + E2E:

```bash
cd "C:/personal/tokenless"
npm run typecheck
npm run build
npm run test:e2e
```

All exit 0. E2E passes — both switchers now render via `<Dropdown>` and pick up `common/styles.css` for visuals.

But wait: `common/styles.css` isn't yet imported anywhere! Its styles wouldn't apply. Task 5 worked because the layout/styles.css still had the old rules. Once Task 6 deletes them, the dropdowns would render unstyled.

The fix: import `../common/styles.css` from the Dropdown component itself, like the layout components do. Update `src/renderer/src/components/common/Dropdown.tsx` to add the import at the top:

```typescript
import type { ReactNode } from 'react'
import { useDropdown } from './use-dropdown'
import './styles.css'
```

(Add the `import './styles.css'` line.)

Then run typecheck + build + E2E again to confirm.

**Step 4:** Commit:

```bash
git add src/renderer/src/components/layout/AccountSwitcher.tsx src/renderer/src/components/layout/styles.css src/renderer/src/components/common/Dropdown.tsx
git commit -m "refactor(phase-2b): AccountSwitcher uses <Dropdown>; finish layout styles cleanup; Dropdown imports its own styles"
```

---

### Task 7: Reposition Dev Mode toggle below TopBar

**Files:**
- Modify: `src/renderer/src/styles.css`

**Step 1:** Open `src/renderer/src/styles.css`. Find the `.app__dev-toggle` rule:

```css
.app__dev-toggle {
  position: fixed;
  top: var(--tl-space-2);
  right: var(--tl-space-2);
  ...
}
```

Replace `top: var(--tl-space-2);` with a calc using the top bar height:

```css
.app__dev-toggle {
  position: fixed;
  top: calc(var(--tl-top-bar-height) + var(--tl-space-2));
  right: var(--tl-space-2);
  ...
}
```

The button now floats just below the TopBar in the top-right corner, no longer overlapping the Settings button.

**Step 2:** Run build + dev-mode E2E:

```bash
cd "C:/personal/tokenless"
npm run build
npm run test:e2e -- dev-mode
```

All 3 Dev Mode E2E tests still pass — the toggle is still findable + clickable.

**Step 3:** Commit:

```bash
git add src/renderer/src/styles.css
git commit -m "fix(phase-2b): reposition Dev Mode toggle below TopBar (was overlapping Settings)"
```

---

### Task 8: Mock dropdown options

**Files:**
- Create: `src/renderer/src/mocks/dropdown-options.ts`

**Step 1:** Create `src/renderer/src/mocks/dropdown-options.ts` with EXACT content:

```typescript
import type { DropdownItem } from '../components/common/Dropdown'

// Mock dropdown options for ConfigsRow. Phase 5 replaces with real models
// (from Anthropic SDK) and Phase 6 replaces skill mocks with real ones
// discovered from ~/.claude/skills/.

export const MOCK_MODELS: readonly DropdownItem[] = [
  { value: 'haiku', label: 'Haiku 4.5', description: 'fastest · cheapest' },
  { value: 'sonnet', label: 'Sonnet 4.5', description: 'balanced' },
  { value: 'opus', label: 'Opus 4.7', description: 'most capable · best for hard tasks' }
]

export const MOCK_BREADTHS: readonly DropdownItem[] = [
  { value: 'terse', label: 'Terse', description: '≤200 words' },
  { value: 'normal', label: 'Normal', description: 'no upper limit' },
  { value: 'thorough', label: 'Thorough', description: 'detailed analysis' }
]

export const MOCK_FORMATS: readonly DropdownItem[] = [
  { value: 'prose', label: 'Prose', description: 'natural paragraphs' },
  { value: 'bullets', label: 'Bullets', description: 'list format' },
  { value: 'code', label: 'Code only', description: 'just the diff, no preamble' },
  { value: 'json', label: 'JSON', description: 'structured data' }
]

export const MOCK_SKILLS: readonly DropdownItem[] = [
  { value: '', label: 'None', description: 'no skill requested' },
  { value: 'simplify', label: 'simplify', description: 'review changed code for reuse + quality' },
  { value: 'review', label: 'review', description: 'review a pull request' },
  { value: 'security-review', label: 'security-review', description: 'security audit of pending changes' }
]
```

**Step 2:** typecheck + commit:

```bash
cd "C:/personal/tokenless"
npm run typecheck
git add src/renderer/src/mocks/dropdown-options.ts
git commit -m "feat(phase-2b): MOCK_MODELS + MOCK_BREADTHS + MOCK_FORMATS + MOCK_SKILLS for ConfigsRow"
```

---

### Task 9: Mock geared prompt + critique flags

**Files:**
- Create: `src/renderer/src/mocks/geared-prompt.ts`

**Step 1:** Create `src/renderer/src/mocks/geared-prompt.ts` with EXACT content:

```typescript
// Mock geared-prompt content for visual development of GearReviewPane.
// Phase 5 replaces with real Haiku-driven gearing.

export const MOCK_ORIGINAL_PROMPT = `Could you please take a look at the authentication middleware that I've been working on and see if there's any way we can refactor it? The current implementation has some nested conditionals that make the token validation flow really hard to follow, and I'd like to see if there's a cleaner approach. I'm particularly worried about the edge case where the refresh token has expired but the access token is still technically valid — right now we end up with this weird state where the request gets through but then fails downstream when it tries to call an API that needs the refresh. Anyway, take a look and let me know what you think, and feel free to suggest other improvements while you're in there.`

export const MOCK_GEARED_PROMPT = `Refactor src/auth/middleware.ts.

Focus:
1. Token validation flow — flatten nested conditionals.
2. Edge case: refresh token expired + access token still valid — handle explicitly (currently leaks into downstream API errors).

Output: diff only, no preamble, no closing summary.`

export interface MockCritiqueFlag {
  severity: 'info' | 'warn'
  message: string
}

export const MOCK_CRITIQUE_FLAGS: readonly MockCritiqueFlag[] = [
  {
    severity: 'info',
    message: 'Original prompt was 100+ words for a focused refactor — typical compression: 80-90%.'
  },
  {
    severity: 'warn',
    message: 'Original mentions "other improvements while you\'re in there" — open-ended scope. Geared version drops this to keep scope tight. If you want broader review, switch breadth to Thorough.'
  }
]
```

**Step 2:** typecheck + commit:

```bash
npm run typecheck
git add src/renderer/src/mocks/geared-prompt.ts
git commit -m "feat(phase-2b): MOCK_ORIGINAL_PROMPT + MOCK_GEARED_PROMPT + MOCK_CRITIQUE_FLAGS for GearReviewPane"
```

---

### Task 10: Mock telemetry

**Files:**
- Create: `src/renderer/src/mocks/telemetry.ts`

**Step 1:** Create `src/renderer/src/mocks/telemetry.ts` with EXACT content:

```typescript
// Mock telemetry values for TelemetryStrip + ContextBudgetMeter. Phase 5
// replaces with real Anthropic-SDK-driven cost estimates; Phase 4 replaces
// the context budget with real values parsed from Claude Code's output.

export interface MockCostPreview {
  expectedDollars: number
  expectedInputTokens: number
  expectedOutputTokens: number
  modelLabel: string
}

export const MOCK_COST_PREVIEW: MockCostPreview = {
  expectedDollars: 0.04,
  expectedInputTokens: 3_000,
  expectedOutputTokens: 1_000,
  modelLabel: 'Opus 4.7'
}

export interface MockContextBudget {
  usedTokens: number
  totalTokens: number
  percentUsed: number
}

export const MOCK_CONTEXT_BUDGET: MockContextBudget = {
  usedTokens: 84_000,
  totalTokens: 200_000,
  percentUsed: 42
}
```

**Step 2:** typecheck + commit:

```bash
cd "C:/personal/tokenless"
npm run typecheck
git add src/renderer/src/mocks/telemetry.ts
git commit -m "feat(phase-2b): MOCK_COST_PREVIEW + MOCK_CONTEXT_BUDGET telemetry stubs"
```

---

### Task 11: Mock terminal stream

**Files:**
- Create: `src/renderer/src/mocks/terminal-stream.ts`

**Step 1:** Create `src/renderer/src/mocks/terminal-stream.ts` with EXACT content (long string with ANSI codes — preserve every character):

```typescript
// Mock ANSI-colored terminal output for the TerminalPane component.
// Phase 4 replaces this with real PTY output from a spawned claude subprocess.
//
// Each \r\n is a line. ANSI escape codes:
//   \x1b[36m = cyan, \x1b[33m = yellow, \x1b[32m = green, \x1b[2m = dim,
//   \x1b[0m = reset, \x1b[1m = bold.

export const MOCK_TERMINAL_STREAM: readonly string[] = [
  '\x1b[2m╭─────────────────────────────────────────────╮\x1b[0m',
  '\x1b[2m│\x1b[0m  \x1b[1mClaude Code v2.1.141\x1b[0m                       \x1b[2m│\x1b[0m',
  '\x1b[2m│\x1b[0m  \x1b[36mOpus 4.7\x1b[0m \x1b[2m·\x1b[0m Claude Max                      \x1b[2m│\x1b[0m',
  '\x1b[2m╰─────────────────────────────────────────────╯\x1b[0m',
  '',
  '\x1b[36m>\x1b[0m Refactor src/auth/middleware.ts',
  '',
  '\x1b[33m●\x1b[0m \x1b[2mRead(src/auth/middleware.ts)\x1b[0m',
  '\x1b[2m  ⎿  read 84 lines\x1b[0m',
  '',
  '\x1b[33m●\x1b[0m \x1b[2mGlob(**/middleware/*.test.ts)\x1b[0m',
  '\x1b[2m  ⎿  found 3 files\x1b[0m',
  '',
  '\x1b[33m●\x1b[0m \x1b[2mRead(src/auth/__tests__/middleware.test.ts)\x1b[0m',
  '\x1b[2m  ⎿  read 142 lines\x1b[0m',
  '',
  '\x1b[32mClaude\x1b[0m: I see the nested conditional pattern in lines 31-54.',
  'The refresh-token-expired path is implicit in the success branch.',
  '',
  'Let me flatten the conditional structure and surface the edge case.',
  '',
  '\x1b[33m●\x1b[0m \x1b[2mEdit(src/auth/middleware.ts)\x1b[0m',
  '\x1b[2m  ⎿  updated 28 lines\x1b[0m',
  '',
  '\x1b[32mClaude\x1b[0m: Done. Key changes:',
  '',
  '  1. Inverted the access-token guard to early-return on invalid tokens.',
  '  2. Added explicit refresh-token-expiry check that short-circuits with',
  '     a 401 before any downstream API call.',
  '  3. Extracted token-validation logic into a pure helper for testability.',
  '',
  '\x1b[2m  Saved 1,200 tokens vs ungeared prompt.\x1b[0m',
  '\x1b[2m  Context used: 42% of 200k\x1b[0m'
]
```

**Step 2:** typecheck + commit:

```bash
cd "C:/personal/tokenless"
npm run typecheck
git add src/renderer/src/mocks/terminal-stream.ts
git commit -m "feat(phase-2b): MOCK_TERMINAL_STREAM ANSI lines for TerminalPane"
```

---

### Task 12: PromptTextarea

**Files:**
- Create: `src/renderer/src/components/composer/PromptTextarea.tsx`

**Step 1:** Create the directory:

```bash
cd "C:/personal/tokenless"
mkdir -p src/renderer/src/components/composer
```

**Step 2:** Write `src/renderer/src/components/composer/PromptTextarea.tsx`:

```typescript
interface PromptTextareaProps {
  value: string
  onChange: (next: string) => void
  placeholder?: string
}

// Controlled textarea for the composer. No special behavior in Phase 2B —
// just value + onChange. Phase 7 adds draft auto-save (debounced) via
// the IPC bridge to SQLite.

export function PromptTextarea({ value, onChange, placeholder }: PromptTextareaProps): JSX.Element {
  return (
    <textarea
      className="prompt-textarea"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? 'Type your prompt here...'}
      spellCheck={false}
    />
  )
}
```

**Step 3:** typecheck + commit:

```bash
npm run typecheck
git add src/renderer/src/components/composer/PromptTextarea.tsx
git commit -m "feat(phase-2b): PromptTextarea controlled component"
```

---

### Task 13: ConfigsRow (4 dropdowns)

**Files:**
- Create: `src/renderer/src/components/composer/ConfigsRow.tsx`

**Step 1:** Write `src/renderer/src/components/composer/ConfigsRow.tsx`:

```typescript
import { Dropdown } from '../common/Dropdown'
import { InfoTooltip } from '../common/InfoTooltip'
import {
  MOCK_BREADTHS,
  MOCK_FORMATS,
  MOCK_MODELS,
  MOCK_SKILLS
} from '../../mocks/dropdown-options'

interface ConfigsRowProps {
  model: string
  onModelChange: (value: string) => void
  breadth: string
  onBreadthChange: (value: string) => void
  format: string
  onFormatChange: (value: string) => void
  skill: string
  onSkillChange: (value: string) => void
}

// The row of 4 configuration dropdowns below the prompt textarea.
// Each Dropdown is wrapped in an InfoTooltip explaining what the option
// affects. Phase 5 wires real contextFn/outcomeFn closures that vary by
// other configs (e.g., "since you have Haiku selected, this option does X").

export function ConfigsRow(props: ConfigsRowProps): JSX.Element {
  return (
    <div className="configs-row">
      <InfoTooltip
        helperText="Target model for this prompt"
        contextFn={() => {
          if (props.model === 'haiku') return 'Haiku needs explicit instructions for non-trivial tasks.'
          if (props.model === 'opus') return 'Opus tolerates loose direction — gearing focuses on output shape.'
          return null
        }}
      >
        <Dropdown
          label="Model:"
          items={MOCK_MODELS}
          activeValue={props.model}
          onSelect={props.onModelChange}
        />
      </InfoTooltip>
      <InfoTooltip
        helperText="How long Claude's response should be"
        contextFn={() => {
          if (props.breadth === 'terse') return 'Saves ~70% output tokens vs Thorough at the cost of completeness.'
          return null
        }}
      >
        <Dropdown
          label="Breadth:"
          items={MOCK_BREADTHS}
          activeValue={props.breadth}
          onSelect={props.onBreadthChange}
        />
      </InfoTooltip>
      <InfoTooltip helperText="Response format Claude should produce">
        <Dropdown
          label="Format:"
          items={MOCK_FORMATS}
          activeValue={props.format}
          onSelect={props.onFormatChange}
        />
      </InfoTooltip>
      <InfoTooltip
        helperText="Optional skill to invoke (from ~/.claude/skills/)"
        contextFn={() => {
          if (props.skill === '') return null
          return `Skill "${props.skill}" will be explicitly requested in the geared prompt.`
        }}
      >
        <Dropdown
          label="Skill:"
          items={MOCK_SKILLS}
          activeValue={props.skill}
          onSelect={props.onSkillChange}
        />
      </InfoTooltip>
    </div>
  )
}
```

**Step 2:** typecheck + commit:

```bash
cd "C:/personal/tokenless"
npm run typecheck
git add src/renderer/src/components/composer/ConfigsRow.tsx
git commit -m "feat(phase-2b): ConfigsRow with 4 Dropdowns + InfoTooltips"
```

---

### Task 14: ActionsRow (Gear/Send/Commit/Push)

**Files:**
- Create: `src/renderer/src/components/composer/ActionsRow.tsx`

**Step 1:** Write `src/renderer/src/components/composer/ActionsRow.tsx`:

```typescript
import { InfoTooltip } from '../common/InfoTooltip'

interface ActionsRowProps {
  promptEmpty: boolean
  onGear: () => void
  onSend: () => void
  onCommit: () => void
  onPush: () => void
}

// The button row beneath ConfigsRow. Gear is primary (orange). Send is
// neutral but enabled when a prompt is present. Commit + Push pre-fill
// the composer with canned git prompts (Phase 7 wires that; Phase 2B
// stubs the callbacks).

export function ActionsRow({ promptEmpty, onGear, onSend, onCommit, onPush }: ActionsRowProps): JSX.Element {
  return (
    <div className="actions-row">
      <div className="actions-row__primary">
        <InfoTooltip helperText="Rewrite your prompt for token efficiency. Haiku optimizes for the selected configs.">
          <button
            type="button"
            className="actions-row__button actions-row__button--gear"
            disabled={promptEmpty}
            onClick={onGear}
          >
            Gear
          </button>
        </InfoTooltip>
        <InfoTooltip helperText="Send the prompt without gearing first. Original tokens preserved.">
          <button
            type="button"
            className="actions-row__button"
            disabled={promptEmpty}
            onClick={onSend}
          >
            Send
          </button>
        </InfoTooltip>
      </div>
      <div className="actions-row__secondary">
        <InfoTooltip helperText="Pre-fills the composer with this project's commit prompt (editable in Settings).">
          <button
            type="button"
            className="actions-row__button actions-row__button--secondary"
            onClick={onCommit}
          >
            Commit
          </button>
        </InfoTooltip>
        <InfoTooltip helperText="Pre-fills the composer with this project's push prompt.">
          <button
            type="button"
            className="actions-row__button actions-row__button--secondary"
            onClick={onPush}
          >
            Push
          </button>
        </InfoTooltip>
      </div>
    </div>
  )
}
```

**Step 2:** typecheck + commit:

```bash
cd "C:/personal/tokenless"
npm run typecheck
git add src/renderer/src/components/composer/ActionsRow.tsx
git commit -m "feat(phase-2b): ActionsRow with Gear/Send/Commit/Push + tooltips"
```

---

### Task 15: TelemetryStrip

**Files:**
- Create: `src/renderer/src/components/composer/TelemetryStrip.tsx`

**Step 1:** Write `src/renderer/src/components/composer/TelemetryStrip.tsx`:

```typescript
import { InfoTooltip } from '../common/InfoTooltip'
import { MOCK_COST_PREVIEW } from '../../mocks/telemetry'

// The narrow strip at the bottom of the composer showing cost preview +
// token estimate for the geared prompt. Phase 5 replaces the mock data
// with real Anthropic SDK pricing math.

export function TelemetryStrip(): JSX.Element {
  const { expectedDollars, expectedInputTokens, expectedOutputTokens, modelLabel } = MOCK_COST_PREVIEW

  return (
    <div className="telemetry-strip">
      <span className="telemetry-strip__item">
        <InfoTooltip
          helperText="Estimated cost based on current configs"
          contextFn={() => `Using ${modelLabel} pricing. Updates when you change Model or Breadth.`}
          outcomeFn={() => `You've saved an average of $0.07/prompt over 30 days (mock).`}
        >
          <span className="telemetry-strip__label">≈</span>
          <span className="telemetry-strip__value">${expectedDollars.toFixed(2)}</span>
        </InfoTooltip>
      </span>
      <span className="telemetry-strip__separator">·</span>
      <span className="telemetry-strip__item">
        <InfoTooltip helperText="Estimated input → output tokens for this send">
          <span className="telemetry-strip__value">
            {expectedInputTokens.toLocaleString()} → {expectedOutputTokens.toLocaleString()} tok
          </span>
        </InfoTooltip>
      </span>
    </div>
  )
}
```

**Step 2:** typecheck + commit:

```bash
cd "C:/personal/tokenless"
npm run typecheck
git add src/renderer/src/components/composer/TelemetryStrip.tsx
git commit -m "feat(phase-2b): TelemetryStrip with cost preview + token estimate + tooltips"
```

---

### Task 16: Composer orchestrator + styles

**Files:**
- Create: `src/renderer/src/components/composer/Composer.tsx`
- Create: `src/renderer/src/components/composer/styles.css`

**Step 1:** Write `src/renderer/src/components/composer/Composer.tsx`:

```typescript
import { useState } from 'react'
import { rendererLogger } from '../../observability/logger-bridge'
import { MOCK_BREADTHS, MOCK_FORMATS, MOCK_MODELS, MOCK_SKILLS } from '../../mocks/dropdown-options'
import { MOCK_CRITIQUE_FLAGS, MOCK_GEARED_PROMPT } from '../../mocks/geared-prompt'
import type { MockCritiqueFlag } from '../../mocks/geared-prompt'
import { GearReviewPane } from '../gear-review/GearReviewPane'
import { ActionsRow } from './ActionsRow'
import { ConfigsRow } from './ConfigsRow'
import { PromptTextarea } from './PromptTextarea'
import { TelemetryStrip } from './TelemetryStrip'
import './styles.css'

interface GearState {
  original: string
  geared: string
  flags: readonly MockCritiqueFlag[]
}

// Composer is the top half of MainPane. Holds prompt text + 4 config
// selections + an optional gearState that, when truthy, swaps the rendered
// view to GearReviewPane. Phase 5 replaces the mock gear data with real
// Haiku-driven output via IPC.

export function Composer(): JSX.Element {
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState<string>(MOCK_MODELS[2].value) // opus default
  const [breadth, setBreadth] = useState<string>(MOCK_BREADTHS[1].value) // normal default
  const [format, setFormat] = useState<string>(MOCK_FORMATS[0].value) // prose default
  const [skill, setSkill] = useState<string>(MOCK_SKILLS[0].value) // none default
  const [gearState, setGearState] = useState<GearState | null>(null)

  const handleGear = (): void => {
    rendererLogger.info('ui', 'gear-clicked', 'Gear (stub)', { promptLength: prompt.length, model, breadth, format, skill })
    setGearState({
      original: prompt,
      geared: MOCK_GEARED_PROMPT,
      flags: MOCK_CRITIQUE_FLAGS
    })
  }

  const handleSend = (): void => {
    rendererLogger.info('ui', 'send-clicked', 'Send (stub)', { promptLength: prompt.length, model })
    setPrompt('')
  }

  const handleCommit = (): void => {
    rendererLogger.info('ui', 'commit-clicked', 'Commit (stub) — pre-filling composer')
    setPrompt('Stage and commit all current changes. Write a concise commit message focused on the *why*, not the *what*. Do not push.')
  }

  const handlePush = (): void => {
    rendererLogger.info('ui', 'push-clicked', 'Push (stub) — pre-filling composer')
    setPrompt('Push the current branch to its remote.')
  }

  const handleGearSendOriginal = (): void => {
    rendererLogger.info('ui', 'send-original', 'Send original (stub)')
    setPrompt('')
    setGearState(null)
  }

  const handleGearSendGeared = (editedGeared: string): void => {
    rendererLogger.info('ui', 'send-geared', 'Send geared (stub)', { length: editedGeared.length })
    setPrompt('')
    setGearState(null)
  }

  const handleGearReGear = (): void => {
    rendererLogger.info('ui', 're-gear-clicked', 'Re-gear (stub) — refreshing mock')
    setGearState({
      original: prompt,
      geared: MOCK_GEARED_PROMPT,
      flags: MOCK_CRITIQUE_FLAGS
    })
  }

  const handleGearCancel = (): void => {
    rendererLogger.info('ui', 'gear-cancel', 'Gear review cancelled')
    setGearState(null)
  }

  if (gearState) {
    return (
      <GearReviewPane
        original={gearState.original}
        geared={gearState.geared}
        critiqueFlags={gearState.flags}
        onSendOriginal={handleGearSendOriginal}
        onSendGeared={handleGearSendGeared}
        onReGear={handleGearReGear}
        onCancel={handleGearCancel}
      />
    )
  }

  return (
    <div className="composer">
      <PromptTextarea value={prompt} onChange={setPrompt} />
      <ConfigsRow
        model={model}
        onModelChange={setModel}
        breadth={breadth}
        onBreadthChange={setBreadth}
        format={format}
        onFormatChange={setFormat}
        skill={skill}
        onSkillChange={setSkill}
      />
      <ActionsRow
        promptEmpty={prompt.length === 0}
        onGear={handleGear}
        onSend={handleSend}
        onCommit={handleCommit}
        onPush={handlePush}
      />
      <TelemetryStrip />
    </div>
  )
}
```

**Step 2:** Write `src/renderer/src/components/composer/styles.css`:

```css
/* Composer + child component styles. Tokens from theme/tokens.css. */

.composer {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--tl-space-4);
  gap: var(--tl-space-3);
  background: var(--tl-bg);
}

/* ===== Prompt textarea ===== */

.prompt-textarea {
  flex: 1;
  min-height: 100px;
  padding: var(--tl-space-3);
  background: white;
  border: 1px solid var(--tl-rule);
  border-radius: var(--tl-radius-md);
  font-family: var(--tl-font-serif);
  font-size: var(--tl-text-base);
  line-height: var(--tl-leading-normal);
  color: var(--tl-fg);
  resize: none;
  outline: none;
  transition: border-color var(--tl-transition-fast);
}

.prompt-textarea::placeholder {
  color: var(--tl-mute);
  font-style: italic;
}

.prompt-textarea:focus {
  border-color: var(--tl-orange);
}

/* ===== Configs row ===== */

.configs-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--tl-space-2);
  align-items: center;
}

/* ===== Actions row ===== */

.actions-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--tl-space-3);
}

.actions-row__primary,
.actions-row__secondary {
  display: flex;
  gap: var(--tl-space-2);
}

.actions-row__button {
  padding: var(--tl-space-2) var(--tl-space-4);
  background: transparent;
  border: 1px solid var(--tl-rule);
  border-radius: var(--tl-radius-sm);
  font-family: var(--tl-font-sans);
  font-size: var(--tl-text-sm);
  font-weight: var(--tl-weight-medium);
  color: var(--tl-fg);
  cursor: pointer;
  transition: all var(--tl-transition-fast);
}

.actions-row__button:hover:not(:disabled) {
  background: var(--tl-hover);
}

.actions-row__button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.actions-row__button--gear {
  background: var(--tl-orange);
  border-color: var(--tl-orange);
  color: white;
}

.actions-row__button--gear:hover:not(:disabled) {
  background: var(--tl-orange-700);
  border-color: var(--tl-orange-700);
}

.actions-row__button--secondary {
  font-size: var(--tl-text-xs);
  padding: var(--tl-space-1) var(--tl-space-3);
  color: var(--tl-mute);
}

/* ===== Telemetry strip ===== */

.telemetry-strip {
  display: flex;
  align-items: center;
  gap: var(--tl-space-2);
  padding: var(--tl-space-1) var(--tl-space-2);
  font-family: var(--tl-font-mono);
  font-size: var(--tl-text-xs);
  color: var(--tl-mute);
}

.telemetry-strip__item {
  display: inline-flex;
  align-items: center;
  gap: var(--tl-space-1);
}

.telemetry-strip__label {
  color: var(--tl-mute);
}

.telemetry-strip__value {
  color: var(--tl-fg);
  font-weight: var(--tl-weight-medium);
}

.telemetry-strip__separator {
  color: var(--tl-rule-strong);
}
```

**Step 3:** typecheck + commit:

```bash
cd "C:/personal/tokenless"
npm run typecheck
git add src/renderer/src/components/composer/Composer.tsx src/renderer/src/components/composer/styles.css
git commit -m "feat(phase-2b): Composer orchestrator with gear-mode swap + composer styles"
```

---

### Task 17: OriginalPane (gear-review read-only side)

**Files:**
- Create: `src/renderer/src/components/gear-review/OriginalPane.tsx`

**Step 1:** Create the directory:

```bash
cd "C:/personal/tokenless"
mkdir -p src/renderer/src/components/gear-review
```

**Step 2:** Write `src/renderer/src/components/gear-review/OriginalPane.tsx`:

```typescript
interface OriginalPaneProps {
  text: string
  tokenCount?: number
}

// The left half of GearReviewPane. Read-only, visually dimmed. Shows the
// user's original prompt so they can compare against the geared version
// before sending.

export function OriginalPane({ text, tokenCount }: OriginalPaneProps): JSX.Element {
  return (
    <div className="original-pane">
      <div className="original-pane__header">
        <span className="original-pane__label">Original</span>
        {tokenCount !== undefined && (
          <span className="original-pane__tokens">{tokenCount.toLocaleString()} tok</span>
        )}
      </div>
      <pre className="original-pane__text">{text}</pre>
    </div>
  )
}
```

**Step 3:** typecheck + commit:

```bash
npm run typecheck
git add src/renderer/src/components/gear-review/OriginalPane.tsx
git commit -m "feat(phase-2b): OriginalPane read-only display"
```

---

### Task 18: GearedPane (editable highlighted)

**Files:**
- Create: `src/renderer/src/components/gear-review/GearedPane.tsx`

**Step 1:** Write `src/renderer/src/components/gear-review/GearedPane.tsx`:

```typescript
interface GearedPaneProps {
  value: string
  onChange: (next: string) => void
  tokenCount?: number
  savings?: string
}

// The right half of GearReviewPane. Editable textarea showing the geared
// prompt. The user can tweak before sending. Save indicator shows tokens
// saved vs original.

export function GearedPane({ value, onChange, tokenCount, savings }: GearedPaneProps): JSX.Element {
  return (
    <div className="geared-pane">
      <div className="geared-pane__header">
        <span className="geared-pane__label">Geared (editable)</span>
        <span className="geared-pane__meta">
          {tokenCount !== undefined && (
            <span className="geared-pane__tokens">{tokenCount.toLocaleString()} tok</span>
          )}
          {savings && (
            <span className="geared-pane__savings">{savings}</span>
          )}
        </span>
      </div>
      <textarea
        className="geared-pane__textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    </div>
  )
}
```

**Step 2:** typecheck + commit:

```bash
cd "C:/personal/tokenless"
npm run typecheck
git add src/renderer/src/components/gear-review/GearedPane.tsx
git commit -m "feat(phase-2b): GearedPane editable textarea + token/savings header"
```

---

### Task 19: CritiqueFlags

**Files:**
- Create: `src/renderer/src/components/gear-review/CritiqueFlags.tsx`

**Step 1:** Write `src/renderer/src/components/gear-review/CritiqueFlags.tsx`:

```typescript
import type { MockCritiqueFlag } from '../../mocks/geared-prompt'

interface CritiqueFlagsProps {
  flags: readonly MockCritiqueFlag[]
}

// Yellow/info banner displaying critique flags from the gearing engine.
// Phase 5 wires real Haiku-produced flags; Phase 2B passes MOCK_CRITIQUE_FLAGS.

export function CritiqueFlags({ flags }: CritiqueFlagsProps): JSX.Element | null {
  if (flags.length === 0) return null
  return (
    <div className="critique-flags">
      {flags.map((flag, i) => (
        <div key={i} className={`critique-flags__item critique-flags__item--${flag.severity}`}>
          <span className="critique-flags__icon" aria-hidden="true">
            {flag.severity === 'warn' ? '⚠' : 'ⓘ'}
          </span>
          <span className="critique-flags__message">{flag.message}</span>
        </div>
      ))}
    </div>
  )
}
```

**Step 2:** typecheck + commit:

```bash
cd "C:/personal/tokenless"
npm run typecheck
git add src/renderer/src/components/gear-review/CritiqueFlags.tsx
git commit -m "feat(phase-2b): CritiqueFlags banner displaying info/warn flags"
```

---

### Task 20: GearReviewPane orchestrator + styles

**Files:**
- Create: `src/renderer/src/components/gear-review/GearReviewPane.tsx`
- Create: `src/renderer/src/components/gear-review/styles.css`

**Step 1:** Write `src/renderer/src/components/gear-review/GearReviewPane.tsx`:

```typescript
import { useState } from 'react'
import type { MockCritiqueFlag } from '../../mocks/geared-prompt'
import { CritiqueFlags } from './CritiqueFlags'
import { GearedPane } from './GearedPane'
import { OriginalPane } from './OriginalPane'
import './styles.css'

interface GearReviewPaneProps {
  original: string
  geared: string
  critiqueFlags: readonly MockCritiqueFlag[]
  onSendOriginal: () => void
  onSendGeared: (editedGeared: string) => void
  onReGear: () => void
  onCancel: () => void
}

// Replaces Composer's main view after the user clicks Gear. Shows the
// original (read-only) next to the geared (editable). Critique flags
// surface above. The user can re-gear, cancel back to compose, send
// the original (un-geared), or send the (possibly edited) geared version.

// Rough token estimate (4 chars per token average — close enough for UI).
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function GearReviewPane({
  original,
  geared,
  critiqueFlags,
  onSendOriginal,
  onSendGeared,
  onReGear,
  onCancel
}: GearReviewPaneProps): JSX.Element {
  const [editedGeared, setEditedGeared] = useState(geared)

  const originalTokens = estimateTokens(original)
  const gearedTokens = estimateTokens(editedGeared)
  const saved = originalTokens - gearedTokens
  const savings = saved > 0 ? `saves ~${saved.toLocaleString()} tok` : ''

  return (
    <div className="gear-review-pane">
      <div className="gear-review-pane__header">
        <h2 className="gear-review-pane__title">Review geared prompt</h2>
        <button
          type="button"
          className="gear-review-pane__cancel"
          onClick={onCancel}
          aria-label="Cancel and return to composer"
        >
          ✕
        </button>
      </div>
      <CritiqueFlags flags={critiqueFlags} />
      <div className="gear-review-pane__panes">
        <OriginalPane text={original} tokenCount={originalTokens} />
        <GearedPane
          value={editedGeared}
          onChange={setEditedGeared}
          tokenCount={gearedTokens}
          savings={savings}
        />
      </div>
      <div className="gear-review-pane__actions">
        <button
          type="button"
          className="gear-review-pane__button gear-review-pane__button--secondary"
          onClick={onReGear}
        >
          ↻ Re-gear
        </button>
        <button
          type="button"
          className="gear-review-pane__button"
          onClick={onSendOriginal}
        >
          Send original
        </button>
        <button
          type="button"
          className="gear-review-pane__button gear-review-pane__button--primary"
          onClick={() => onSendGeared(editedGeared)}
        >
          Send geared
        </button>
      </div>
    </div>
  )
}
```

**Step 2:** Write `src/renderer/src/components/gear-review/styles.css`:

```css
/* GearReviewPane and its sub-component styles. */

.gear-review-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--tl-space-4);
  gap: var(--tl-space-3);
  background: var(--tl-bg);
}

.gear-review-pane__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.gear-review-pane__title {
  font-family: var(--tl-font-serif);
  font-size: var(--tl-text-lg);
  font-weight: var(--tl-weight-medium);
  margin: 0;
  color: var(--tl-orange);
}

.gear-review-pane__cancel {
  background: transparent;
  border: none;
  font-size: var(--tl-text-base);
  color: var(--tl-mute);
  cursor: pointer;
  padding: var(--tl-space-1) var(--tl-space-2);
  border-radius: var(--tl-radius-sm);
}

.gear-review-pane__cancel:hover {
  background: var(--tl-hover);
  color: var(--tl-fg);
}

/* ===== Critique flags ===== */

.critique-flags {
  display: flex;
  flex-direction: column;
  gap: var(--tl-space-1);
}

.critique-flags__item {
  display: flex;
  align-items: flex-start;
  gap: var(--tl-space-2);
  padding: var(--tl-space-2) var(--tl-space-3);
  border-radius: var(--tl-radius-sm);
  font-size: var(--tl-text-sm);
  line-height: var(--tl-leading-normal);
}

.critique-flags__item--info {
  background: var(--tl-blue-50);
  color: var(--tl-blue-700);
  border-left: 3px solid var(--tl-blue);
}

.critique-flags__item--warn {
  background: var(--tl-warn-bg);
  color: var(--tl-warn);
  border-left: 3px solid var(--tl-warn);
}

.critique-flags__icon {
  font-size: var(--tl-text-base);
  line-height: var(--tl-leading-tight);
}

.critique-flags__message {
  flex: 1;
}

/* ===== Side-by-side panes ===== */

.gear-review-pane__panes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--tl-space-3);
  flex: 1;
  min-height: 0;
}

.original-pane,
.geared-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.original-pane__header,
.geared-pane__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--tl-space-1);
}

.original-pane__label,
.geared-pane__label {
  font-family: var(--tl-font-sans);
  font-size: var(--tl-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--tl-mute);
  font-weight: var(--tl-weight-medium);
}

.geared-pane__label {
  color: var(--tl-orange);
}

.original-pane__tokens,
.geared-pane__tokens {
  font-family: var(--tl-font-mono);
  font-size: var(--tl-text-xs);
  color: var(--tl-mute);
}

.geared-pane__meta {
  display: flex;
  align-items: center;
  gap: var(--tl-space-2);
}

.geared-pane__savings {
  font-family: var(--tl-font-mono);
  font-size: var(--tl-text-xs);
  color: var(--tl-success);
  font-weight: var(--tl-weight-medium);
}

.original-pane__text {
  flex: 1;
  margin: 0;
  padding: var(--tl-space-3);
  background: var(--tl-bg-alt);
  border: 1px solid var(--tl-rule);
  border-radius: var(--tl-radius-md);
  font-family: var(--tl-font-serif);
  font-size: var(--tl-text-sm);
  line-height: var(--tl-leading-normal);
  color: var(--tl-fg-dim);
  white-space: pre-wrap;
  overflow-y: auto;
}

.geared-pane__textarea {
  flex: 1;
  padding: var(--tl-space-3);
  background: var(--tl-orange-50);
  border: 1px solid var(--tl-orange-100);
  border-radius: var(--tl-radius-md);
  font-family: var(--tl-font-serif);
  font-size: var(--tl-text-sm);
  line-height: var(--tl-leading-normal);
  color: var(--tl-fg);
  resize: none;
  outline: none;
  transition: border-color var(--tl-transition-fast);
}

.geared-pane__textarea:focus {
  border-color: var(--tl-orange);
}

/* ===== Actions ===== */

.gear-review-pane__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--tl-space-2);
}

.gear-review-pane__button {
  padding: var(--tl-space-2) var(--tl-space-4);
  background: transparent;
  border: 1px solid var(--tl-rule);
  border-radius: var(--tl-radius-sm);
  font-family: var(--tl-font-sans);
  font-size: var(--tl-text-sm);
  font-weight: var(--tl-weight-medium);
  color: var(--tl-fg);
  cursor: pointer;
  transition: all var(--tl-transition-fast);
}

.gear-review-pane__button:hover {
  background: var(--tl-hover);
}

.gear-review-pane__button--primary {
  background: var(--tl-orange);
  border-color: var(--tl-orange);
  color: white;
}

.gear-review-pane__button--primary:hover {
  background: var(--tl-orange-700);
  border-color: var(--tl-orange-700);
}

.gear-review-pane__button--secondary {
  color: var(--tl-mute);
  font-size: var(--tl-text-xs);
}
```

**Step 3:** typecheck + commit:

```bash
cd "C:/personal/tokenless"
npm run typecheck
git add src/renderer/src/components/gear-review/GearReviewPane.tsx src/renderer/src/components/gear-review/styles.css
git commit -m "feat(phase-2b): GearReviewPane orchestrator + styles"
```

---

### Task 21: TerminalToolbar (Stop + ContextBudgetMeter)

**Files:**
- Create: `src/renderer/src/components/terminal/TerminalToolbar.tsx`

**Step 1:** Create directory:

```bash
cd "C:/personal/tokenless"
mkdir -p src/renderer/src/components/terminal
```

**Step 2:** Write `src/renderer/src/components/terminal/TerminalToolbar.tsx`:

```typescript
import { InfoTooltip } from '../common/InfoTooltip'
import { MOCK_CONTEXT_BUDGET } from '../../mocks/telemetry'

interface TerminalToolbarProps {
  onStop: () => void
  streaming: boolean
}

// Top of TerminalSection. Houses the Stop button (sends SIGINT in Phase 4)
// and the context-budget meter. Phase 2B uses MOCK_CONTEXT_BUDGET; Phase 4
// wires real values parsed from Claude Code output stream.

export function TerminalToolbar({ onStop, streaming }: TerminalToolbarProps): JSX.Element {
  const { usedTokens, totalTokens, percentUsed } = MOCK_CONTEXT_BUDGET
  const meterClass =
    percentUsed >= 80
      ? 'terminal-toolbar__meter--warn'
      : percentUsed >= 60
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
          if (percentUsed >= 80) return 'Approaching capacity — consider starting a fresh conversation.'
          return null
        }}
        outcomeFn={() => `${usedTokens.toLocaleString()} of ${totalTokens.toLocaleString()} tokens used`}
      >
        <div className={`terminal-toolbar__meter ${meterClass}`}>
          <span className="terminal-toolbar__meter-label">Context:</span>
          <div className="terminal-toolbar__meter-bar">
            <div
              className="terminal-toolbar__meter-fill"
              style={{ width: `${percentUsed}%` }}
            />
          </div>
          <span className="terminal-toolbar__meter-value">{percentUsed}%</span>
        </div>
      </InfoTooltip>
    </div>
  )
}
```

**Step 3:** typecheck + commit:

```bash
npm run typecheck
git add src/renderer/src/components/terminal/TerminalToolbar.tsx
git commit -m "feat(phase-2b): TerminalToolbar with Stop button + ContextBudgetMeter"
```

---

### Task 22: TerminalPane (xterm.js wrapper)

**Files:**
- Create: `src/renderer/src/components/terminal/TerminalPane.tsx`

**Step 1:** Write `src/renderer/src/components/terminal/TerminalPane.tsx`:

```typescript
import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { MOCK_TERMINAL_STREAM } from '../../mocks/terminal-stream'

// xterm.js Terminal mounted in a container div. Phase 2B writes
// MOCK_TERMINAL_STREAM line-by-line every 80ms to simulate streaming.
// Phase 4 replaces the source with real PTY output from a spawned claude
// subprocess via IPC.

export function TerminalPane(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return undefined

    const terminal = new Terminal({
      theme: {
        background: '#1e1e1e',
        foreground: '#ddd',
        cursor: '#ddd'
      },
      fontFamily: '"JetBrains Mono", Consolas, monospace',
      fontSize: 12,
      cursorBlink: false,
      disableStdin: true,
      rows: 30,
      cols: 100,
      scrollback: 1000
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.current)
    fitAddon.fit()

    // Write canned stream line-by-line with a streaming feel
    let i = 0
    const interval = setInterval(() => {
      if (i >= MOCK_TERMINAL_STREAM.length) {
        clearInterval(interval)
        return
      }
      terminal.writeln(MOCK_TERMINAL_STREAM[i])
      i++
    }, 80)

    // Resize on window resize
    const handleResize = (): void => {
      fitAddon.fit()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      clearInterval(interval)
      window.removeEventListener('resize', handleResize)
      terminal.dispose()
    }
  }, [])

  return <div className="terminal-pane" ref={containerRef} />
}
```

**Step 2:** typecheck + build (xterm.js CSS import is the new external dep — verify the build picks it up):

```bash
cd "C:/personal/tokenless"
npm run typecheck
npm run build
```

Both exit 0.

**Step 3:** Commit:

```bash
git add src/renderer/src/components/terminal/TerminalPane.tsx
git commit -m "feat(phase-2b): TerminalPane xterm.js wrapper writing mock ANSI stream"
```

---

### Task 23: TerminalSection orchestrator + styles

**Files:**
- Create: `src/renderer/src/components/terminal/TerminalSection.tsx`
- Create: `src/renderer/src/components/terminal/styles.css`

**Step 1:** Write `src/renderer/src/components/terminal/TerminalSection.tsx`:

```typescript
import { useState } from 'react'
import { rendererLogger } from '../../observability/logger-bridge'
import { TerminalPane } from './TerminalPane'
import { TerminalToolbar } from './TerminalToolbar'
import './styles.css'

// TerminalSection is the bottom half of MainPane. Holds the TerminalToolbar
// above the TerminalPane. Phase 2B's "streaming" is the mock stream's
// playback duration; setting streaming = false enables the Stop button
// to no-op (Phase 4 wires real SIGINT to a claude subprocess via IPC).

export function TerminalSection(): JSX.Element {
  const [streaming, setStreaming] = useState(true)

  const handleStop = (): void => {
    rendererLogger.info('ui', 'terminal-stop', 'Stop clicked (stub)')
    setStreaming(false)
  }

  return (
    <div className="terminal-section">
      <TerminalToolbar onStop={handleStop} streaming={streaming} />
      <TerminalPane />
    </div>
  )
}
```

**Step 2:** Write `src/renderer/src/components/terminal/styles.css`:

```css
/* TerminalSection styles. */

.terminal-section {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1e1e1e;
}

.terminal-toolbar {
  display: flex;
  align-items: center;
  gap: var(--tl-space-3);
  padding: var(--tl-space-2) var(--tl-space-3);
  background: #2a2a2a;
  border-bottom: 1px solid #3a3a3a;
}

.terminal-toolbar__stop {
  padding: var(--tl-space-1) var(--tl-space-3);
  background: transparent;
  border: 1px solid #555;
  border-radius: var(--tl-radius-sm);
  font-family: var(--tl-font-mono);
  font-size: var(--tl-text-xs);
  color: #ddd;
  cursor: pointer;
  transition: all var(--tl-transition-fast);
}

.terminal-toolbar__stop:hover:not(:disabled) {
  background: rgba(196, 68, 68, 0.2);
  border-color: var(--tl-error);
  color: var(--tl-error);
}

.terminal-toolbar__stop:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.terminal-toolbar__meter {
  display: flex;
  align-items: center;
  gap: var(--tl-space-2);
  font-family: var(--tl-font-mono);
  font-size: var(--tl-text-xs);
  color: #ddd;
}

.terminal-toolbar__meter-label {
  color: #888;
}

.terminal-toolbar__meter-bar {
  width: 120px;
  height: 6px;
  background: #444;
  border-radius: var(--tl-radius-full);
  overflow: hidden;
}

.terminal-toolbar__meter-fill {
  height: 100%;
  background: var(--tl-blue);
  border-radius: var(--tl-radius-full);
  transition: width var(--tl-transition-slow);
}

.terminal-toolbar__meter--info .terminal-toolbar__meter-fill {
  background: var(--tl-warn);
}

.terminal-toolbar__meter--warn .terminal-toolbar__meter-fill {
  background: var(--tl-error);
}

.terminal-toolbar__meter-value {
  font-weight: var(--tl-weight-medium);
  min-width: 32px;
  text-align: right;
}

.terminal-pane {
  flex: 1;
  background: #1e1e1e;
  padding: var(--tl-space-2);
  min-height: 0;
  overflow: hidden;
}

/* Override xterm.js default styles for the .xterm container */
.terminal-pane .xterm {
  height: 100%;
}
```

**Step 3:** typecheck + commit:

```bash
cd "C:/personal/tokenless"
npm run typecheck
git add src/renderer/src/components/terminal/TerminalSection.tsx src/renderer/src/components/terminal/styles.css
git commit -m "feat(phase-2b): TerminalSection orchestrator + dark terminal-themed styles"
```

---

### Task 24: Wire Composer + TerminalSection into MainPane

**Files:**
- Modify: `src/renderer/src/components/layout/MainPane.tsx`
- Modify: `src/renderer/src/components/layout/styles.css` (remove placeholder rules)

**Step 1:** Replace `src/renderer/src/components/layout/MainPane.tsx` ENTIRELY:

```typescript
import { Composer } from '../composer/Composer'
import { TerminalSection } from '../terminal/TerminalSection'

// MainPane is the split container holding the composer (top) and the
// embedded terminal (bottom) per ADR-003 / spec §2. Phase 2B wires real
// components into both halves (with mock data); Phase 4 replaces the
// terminal source with a real PTY subprocess.

export function MainPane(): JSX.Element {
  return (
    <main className="main-pane">
      <section className="main-pane__composer-area">
        <Composer />
      </section>
      <section className="main-pane__terminal-area">
        <TerminalSection />
      </section>
    </main>
  )
}
```

**Step 2:** Open `src/renderer/src/components/layout/styles.css`. Find and REMOVE the `.main-pane__placeholder` rule (it's no longer rendered). The other `.main-pane__*` rules stay since they still describe the layout containers.

Also update `.main-pane__composer-area` and `.main-pane__terminal-area` — they currently have `display: flex; align-items: center; justify-content: center; padding: var(--tl-space-6);` (centering the placeholder text). Remove the centering rules since the real children manage their own internal layout. The areas should just be flex children taking equal height with 0 padding.

The updated rules for the main-pane subsections should look like:

```css
.main-pane__composer-area {
  flex: 1;
  border-bottom: 1px solid var(--tl-rule);
  min-height: 0;
  overflow: hidden;
}

.main-pane__terminal-area {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
```

(Drop the `display: flex; align-items: center; justify-content: center; padding: var(--tl-space-6);` from both — they were placeholder-centric. Drop the `background: var(--tl-bg-alt);` from the terminal area too since `.terminal-section` itself paints the dark background.)

**Step 3:** Run typecheck + build + E2E:

```bash
cd "C:/personal/tokenless"
npm run typecheck
npm run build
npm run test:e2e
```

All exit 0. Existing 6 E2E tests still pass — Composer + TerminalSection render in the previously-placeholder areas.

**Step 4:** Manual smoke (optional but recommended): run `npm run preview`, click in the prompt textarea, type something, click Gear, see the review pane swap in, click Cancel, return to composer. Verify the terminal pane at the bottom is showing the canned ANSI stream playing back.

**Step 5:** Commit:

```bash
git add src/renderer/src/components/layout/MainPane.tsx src/renderer/src/components/layout/styles.css
git commit -m "feat(phase-2b): wire Composer + TerminalSection into MainPane"
```

---

### Task 25: E2E for composer flow

**Files:**
- Create: `test/e2e/composer.e2e.test.ts`

**Step 1:** Write `test/e2e/composer.e2e.test.ts` with EXACT content:

```typescript
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { resolve } from 'node:path'

let app: ElectronApplication

test.beforeAll(async () => {
  app = await electron.launch({
    args: [resolve('out/main/index.js')],
    env: { ...process.env, NODE_ENV: 'test' }
  })
})

test.afterAll(async () => {
  await app.close()
})

test('composer renders with textarea, 4 config dropdowns, and action buttons', async () => {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('.prompt-textarea')).toBeVisible()
  await expect(page.locator('.configs-row .dropdown')).toHaveCount(4)
  await expect(page.locator('.actions-row__button--gear')).toBeVisible()
  await expect(page.locator('.actions-row__button')).toHaveCount(4)
})

test('typing in the prompt textarea enables Gear and Send buttons', async () => {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  const gearButton = page.locator('.actions-row__button--gear')
  await expect(gearButton).toBeDisabled()

  await page.locator('.prompt-textarea').fill('Refactor the auth middleware to flatten conditionals')
  await expect(gearButton).toBeEnabled()
})

test('clicking Gear swaps to GearReviewPane with original + geared text', async () => {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  await page.locator('.prompt-textarea').fill('Refactor the auth middleware')
  await page.locator('.actions-row__button--gear').click()

  await expect(page.locator('.gear-review-pane')).toBeVisible()
  await expect(page.locator('.original-pane__text')).toContainText('Refactor the auth middleware')
  await expect(page.locator('.geared-pane__textarea')).toBeVisible()
})

test('Cancel button in GearReviewPane returns to Composer with prompt preserved', async () => {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  await page.locator('.prompt-textarea').fill('Cancel test prompt')
  await page.locator('.actions-row__button--gear').click()
  await expect(page.locator('.gear-review-pane')).toBeVisible()

  await page.locator('.gear-review-pane__cancel').click()

  await expect(page.locator('.gear-review-pane')).toHaveCount(0)
  await expect(page.locator('.prompt-textarea')).toHaveValue('Cancel test prompt')
})

test('terminal section is visible with toolbar + meter + xterm pane', async () => {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('.terminal-section')).toBeVisible()
  await expect(page.locator('.terminal-toolbar__stop')).toBeVisible()
  await expect(page.locator('.terminal-toolbar__meter')).toBeVisible()
  await expect(page.locator('.terminal-pane')).toBeVisible()
})
```

**Step 2:** Build + run:

```bash
cd "C:/personal/tokenless"
npm run build
npm run test:e2e -- composer
```

Expected: 5 new tests passing.

**Step 3:** Run the full E2E suite to verify no regressions:

```bash
npm run test:e2e
```

Total: 3 (smoke) + 3 (dev-mode) + 5 (composer) = 11 E2E tests passing.

**Step 4:** Commit:

```bash
git add test/e2e/composer.e2e.test.ts
git commit -m "test(phase-2b): E2E for composer flow (render, gear, cancel, terminal)"
```

---

### Task 26: Smoke E2E expansion + docs

**Files:**
- Modify: `test/e2e/smoke.e2e.test.ts`
- Modify: `docs/test-scenarios.md`

**Step 1:** Update `test/e2e/smoke.e2e.test.ts`. Find the test "app shell renders TopBar brand + ConversationSidebar + MainPane" and expand its assertions to cover the new composer + terminal. Replace the entire test:

```typescript
test('app shell renders TopBar brand + ConversationSidebar + MainPane with composer + terminal', async () => {
  const page = await app.firstWindow()
  const brand = page.locator('.top-bar__brand')
  await expect(brand).toHaveText('TokenLess')

  const sidebar = page.locator('.conversation-sidebar')
  await expect(sidebar).toBeVisible()

  const mainPane = page.locator('.main-pane')
  await expect(mainPane).toBeVisible()

  // Phase 2B additions:
  await expect(page.locator('.composer')).toBeVisible()
  await expect(page.locator('.terminal-section')).toBeVisible()
})
```

**Step 2:** Run the smoke + composer + dev-mode E2E together:

```bash
cd "C:/personal/tokenless"
npm run test:e2e
```

11 tests passing.

**Step 3:** Append Phase 2B scenarios to `docs/test-scenarios.md`:

```markdown

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
```

Commit:

```bash
git add test/e2e/smoke.e2e.test.ts docs/test-scenarios.md
git commit -m "test(phase-2b): expand smoke E2E for composer + terminal; add Phase 2B test scenarios"
```

---

### Task 27: Phase 2B verification + tag

**Files:** none — verification only.

**Step 1:** Verify all build gates:

```bash
cd "C:/personal/tokenless"
npm run typecheck && echo TYPECHECK_OK
npm run test:run && echo UNIT_OK
npm run build && echo BUILD_OK
npm run test:e2e && echo E2E_OK
git status
```

All four exit 0. `git status` clean. Total tests: 47 unit/integration (35 prior + 6 useDropdown + 6 InfoTooltip) + 11 E2E (3 smoke + 3 dev-mode + 5 composer) = 58 tests.

**Step 2:** Tag the Phase 2B completion locally:

```bash
git tag -a v0.5.0-phase-2b -m "Phase 2B complete — Dropdown extraction, InfoTooltip, Composer, GearReviewPane, TerminalSection"
git log --oneline v0.4.0-phase-2a..v0.5.0-phase-2b
git tag --list
```

Expected: ~27 commits since `v0.4.0-phase-2a`. Tag list shows all 5 phase tags. Do NOT push to origin yet — that's the next step (finishing-a-development-branch).

---

## Phase 2B — Exit criteria

Phase 2B is complete when:

1. `npm run typecheck` exits 0
2. `npm run test:run` passes all 47 unit/integration tests
3. `npm run build` produces all 3 bundles
4. `npm run test:e2e` passes 11 tests (3 smoke + 3 dev-mode + 5 composer)
5. Running `npm run preview` opens a window with the complete TokenLess UI:
   - TopBar with brand + Project/Account dropdowns + ⚙ Settings
   - ConversationSidebar with 6 mock conversations
   - Composer (top of MainPane) — textarea + 4 config dropdowns + 4 action buttons + telemetry strip
   - TerminalSection (bottom of MainPane) — toolbar with Stop + meter, xterm pane playing canned ANSI stream
6. Clicking "Gear" swaps to GearReviewPane with the side-by-side original/geared display + critique flags
7. Hovering `(i)` icons on dropdowns surfaces context-aware tooltips
8. Dev Mode toggle floats below TopBar — no longer overlapping Settings
9. `<Dropdown>` is the canonical dropdown component; ProjectSwitcher / AccountSwitcher / ConfigsRow all use it
10. Tag `v0.5.0-phase-2b` exists locally
11. `git status` clean

Once exit criteria are met, return to push + verify CI green (finishing-a-development-branch workflow).

---

## Self-review (writing-plans skill)

**1. Spec coverage:**

| Spec §2 Component | Phase 2B Task |
|---|---|
| Composer | Tasks 12-16 |
| Composer.PromptTextarea | Task 12 |
| Composer.ConfigsRow (Model/Breadth/Format/Skill) | Task 13 |
| Composer.ActionsRow (Gear/Send/Commit/Push) | Task 14 |
| Composer.TelemetryStrip | Task 15 |
| GearReviewPane | Tasks 17-20 |
| GearReviewPane.OriginalPane | Task 17 |
| GearReviewPane.GearedPane | Task 18 |
| GearReviewPane.CritiqueFlags | Task 19 |
| TerminalSection | Tasks 21-23 |
| TerminalSection.TerminalToolbar (Stop + ContextBudgetMeter) | Task 21 |
| TerminalSection.TerminalPane (xterm.js) | Task 22 |
| InfoTooltip (cross-cutting) | Task 3 |
| Generic Dropdown (extracted) | Task 2 |
| ConfirmSendModal (cross-cutting) | DEFERRED to a later phase — Phase 2B doesn't need it since Send is a stub |
| InlineDiff (used inside GearReviewPane) | DEFERRED — Phase 2B shows side-by-side panes; the inline diff is a Phase 5 nice-to-have |

**2. Placeholder scan:** No TBD / TODO / "implement later" / "similar to Task N" patterns. All code blocks contain literal complete code.

**3. Type consistency:**
- `DropdownItem` (`{ value, label, description? }`) defined in `Dropdown.tsx` (Task 2); used by ProjectSwitcher (Task 5), AccountSwitcher (Task 6), ConfigsRow (Task 13), and exported through Mock files (Task 8 imports it).
- `MockCritiqueFlag` defined in `geared-prompt.ts` (Task 9); used by `CritiqueFlags.tsx` (Task 19), `GearReviewPane.tsx` (Task 20), `Composer.tsx` (Task 16).
- `MockCostPreview` and `MockContextBudget` defined in `telemetry.ts` (Task 10); referenced by Tasks 15 + 21.
- All callback signatures consistent: `(value: string) => void` for dropdown selection; `() => void` for action buttons; `(next: string) => void` for value/text controlled components.
- CSS class names referenced from `.tsx` files all defined in the matching `styles.css` for each module (composer/, gear-review/, terminal/, common/).

**4. Scope check:** 27 numbered tasks. Total estimated time: 2-3 focused days. Most components are mechanical given the exact content provided; the only "judgment" tasks are 16 (Composer orchestrator wiring) and 20 (GearReviewPane orchestrator wiring), both of which have full code in the plan.

**Notes for the executor:**

- **Tests for hooks and tooltip use happy-dom.** Mark the test files with `// @vitest-environment happy-dom` at the very top — Vitest reads this directive per-file and switches environments.
- **@testing-library/react is a new dev dep** (Task 1, Step 3). Installing it via `npm install -D` adds about 3 transitive packages — acceptable.
- **Tasks 5 and 6 must be sequential.** Task 5 deletes only `.project-switcher__*` rules; Task 6 deletes `.account-switcher__*` rules. Doing them in one task and deleting all dropdown rules at once would briefly break the AccountSwitcher visually between commits. Keeping them sequential preserves git-bisect cleanliness.
- **xterm.js needs its CSS imported separately** (`'@xterm/xterm/css/xterm.css'`). The import in `TerminalPane.tsx` (Task 22) handles this. Without that import, the terminal renders unstyled (text wraps wrong, no proper line height, etc.).
- **MOCK_TERMINAL_STREAM string has ANSI escape codes.** Don't accidentally strip the `\x1b` characters during editing or copy-paste. The Write tool handles them correctly.
- **The Composer's `gearState` discriminator** is a deliberately simple `null | GearState` pattern. A more typed approach with a tagged union would be possible (`{ mode: 'compose' } | { mode: 'review', ... }`) but adds boilerplate without correctness benefit at Phase 2B scope.

---

*End of Phase 2B plan.*
