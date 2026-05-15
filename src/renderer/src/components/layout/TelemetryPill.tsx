import { useState } from 'react'

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

  if (!summary) return null
  if (summary.haikuMetaTokens === 0 && summary.responseOutputTokens === 0) return null

  const isSavings = summary.netSavingsDollars >= 0
  const label = isSavings ? 'Saved' : 'Cost'
  const cls = `telemetry-pill ${isSavings ? 'is-savings' : 'is-cost'}`

  return (
    <div className="telemetry-pill-host">
      <button
        type="button"
        className={cls}
        onClick={() => setOpen((v) => !v)}
        aria-label="Show telemetry summary"
        aria-expanded={open}
      >
        {label} {formatDollars(summary.netSavingsDollars)} <span className="telemetry-pill__suffix">this week</span>
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
