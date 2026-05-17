import { useState } from 'react'

import { useOutsideClick } from '../../hooks/use-outside-click'
import { useTelemetrySummary } from '../../hooks/use-telemetry-summary'
import { TelemetrySummaryPopover } from './TelemetrySummaryPopover'

function startOfWeekMs(): number {
  const d = new Date()
  const day = d.getDay()
  const diff = (day + 6) % 7
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - diff)
  return d.getTime()
}

function formatDollars(n: number): string {
  return `$${Math.abs(n).toFixed(2)}`
}

export function TelemetryPill(): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const since = startOfWeekMs()
  const { summary } = useTelemetrySummary(since)
  const hostRef = useOutsideClick<HTMLDivElement>(open, () => setOpen(false))

  if (!summary) return null
  if (summary.haikuMetaTokens === 0 && summary.responseOutputTokens === 0) return null

  const isSavings = summary.netSavingsDollars >= 0
  const cls = `telemetry-pill telemetry-pill--compact ${isSavings ? 'is-savings' : 'is-cost'}`
  const ariaLabel = `${isSavings ? 'Saved' : 'Cost'} ${formatDollars(summary.netSavingsDollars)} this week — click for breakdown`

  return (
    <div className="telemetry-pill-host" ref={hostRef}>
      <button
        type="button"
        className={cls}
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-expanded={open}
        title={ariaLabel}
      >
        {formatDollars(summary.netSavingsDollars)}
      </button>
      {open && (
        <TelemetrySummaryPopover
          weekSince={since}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
