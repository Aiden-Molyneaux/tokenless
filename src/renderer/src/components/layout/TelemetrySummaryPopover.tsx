import { useState } from 'react'

import { useTelemetrySummary } from '../../hooks/use-telemetry-summary'

interface TelemetrySummaryPopoverProps {
  weekSince: number
  onClose: () => void
}

function startOfDayMs(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function startOfMonthMs(): number {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

type Period = 'today' | 'week' | 'month' | 'all'

const PERIOD_LABEL: Record<Period, string> = {
  today: 'Today', week: 'This Week', month: 'This Month', all: 'All Time'
}

function formatDollars(n: number): string {
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toFixed(2)}`
}

export function TelemetrySummaryPopover({ weekSince, onClose }: TelemetrySummaryPopoverProps): JSX.Element {
  const [period, setPeriod] = useState<Period>('week')

  let sinceMs: number | null = weekSince
  if (period === 'today') sinceMs = startOfDayMs()
  else if (period === 'month') sinceMs = startOfMonthMs()
  else if (period === 'all') sinceMs = null

  const { summary } = useTelemetrySummary(sinceMs)

  return (
    <div className="telemetry-summary-popover" role="dialog" aria-label="Telemetry summary">
      <div className="telemetry-summary-popover__tabs" role="tablist">
        {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={period === p}
            className={`telemetry-summary-popover__tab ${period === p ? 'is-active' : ''}`}
            onClick={() => setPeriod(p)}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
        <button
          type="button"
          aria-label="Close telemetry summary"
          className="telemetry-summary-popover__close"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="telemetry-summary-popover__body">
        {!summary ? (
          <p className="telemetry-summary-popover__empty">Loading…</p>
        ) : (
          <>
            <dl className="telemetry-summary-popover__totals">
              <div><dt>Gross savings</dt><dd>{formatDollars(summary.grossSavingsDollars)}</dd></div>
              <div><dt>Haiku cost</dt><dd>{formatDollars(summary.haikuCostDollars)}</dd></div>
              <div><dt>Net savings</dt><dd>{formatDollars(summary.netSavingsDollars)}</dd></div>
              <div><dt>Spend</dt><dd>{formatDollars(summary.spendDollars)}</dd></div>
            </dl>
            {summary.byModel.length > 0 && (
              <table className="telemetry-summary-popover__models">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Spend</th>
                    <th>Savings</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byModel.map((m) => (
                    <tr key={m.model}>
                      <td>{m.model}</td>
                      <td>{formatDollars(m.inputCostDollars + m.outputCostDollars)}</td>
                      <td>{formatDollars(m.savingsDollars)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  )
}
