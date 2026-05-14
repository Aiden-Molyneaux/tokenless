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
