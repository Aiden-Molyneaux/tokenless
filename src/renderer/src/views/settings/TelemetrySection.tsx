import { useTelemetrySummary } from '../../hooks/use-telemetry-summary'

// TelemetrySection — embeds an all-time TelemetrySummary inline.
// sinceMs=null means all time (per useTelemetrySummary contract).

function formatDollars(n: number): string {
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toFixed(2)}`
}

export function TelemetrySection(): JSX.Element {
  const { summary, loading, error } = useTelemetrySummary(null)

  return (
    <section className="settings-section">
      <h3 className="settings-section__heading">Telemetry (All Time)</h3>
      <div className="telemetry-section__body">
        {loading && <p className="telemetry-section__loading">Loading…</p>}
        {!loading && error && <p className="telemetry-section__error">{error}</p>}
        {!loading && !error && summary && (
          <>
            <dl className="telemetry-section__totals">
              <div><dt>Gross savings</dt><dd>{formatDollars(summary.grossSavingsDollars)}</dd></div>
              <div><dt>Haiku cost</dt><dd>{formatDollars(summary.haikuCostDollars)}</dd></div>
              <div><dt>Net savings</dt><dd>{formatDollars(summary.netSavingsDollars)}</dd></div>
              <div><dt>Spend</dt><dd>{formatDollars(summary.spendDollars)}</dd></div>
            </dl>
            {summary.byModel.length > 0 && (
              <table className="telemetry-section__models">
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
        {!loading && !error && !summary && (
          <p className="telemetry-section__loading">No data yet.</p>
        )}
      </div>
    </section>
  )
}
