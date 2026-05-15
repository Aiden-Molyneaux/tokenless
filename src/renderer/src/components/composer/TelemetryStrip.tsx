import type { CostPreview } from '@shared/types/gearing'

// The narrow strip at the bottom of the composer showing cost preview +
// token estimate for the geared prompt. Prop-driven — Composer passes the
// live CostPreview while the user types, and the last gearing cost preview
// after a Send so the user can see their last spend.

interface TelemetryStripProps {
  prompt: string
  liveEstimate: CostPreview | null
  lastCostPreview: CostPreview | null
}

export function TelemetryStrip({ prompt, liveEstimate, lastCostPreview }: TelemetryStripProps): JSX.Element {
  // Show live estimate while there's typed text and a live estimate is ready.
  if (prompt.length > 0 && liveEstimate) {
    return (
      <div className="telemetry-strip">
        <span className="telemetry-strip__model">{liveEstimate.modelLabel}</span>
        <span className="telemetry-strip__cost">${liveEstimate.expectedDollars.toFixed(4)}</span>
        <span className="telemetry-strip__tokens">
          {liveEstimate.expectedInputTokens.toLocaleString()} in + {liveEstimate.expectedOutputTokens.toLocaleString()} out
        </span>
        {liveEstimate.haikuMetaDollars > 0 && (
          <span className="telemetry-strip__meta">
            +${liveEstimate.haikuMetaDollars.toFixed(4)} gearing
          </span>
        )}
      </div>
    )
  }
  // After Send clears the prompt, surface the last gear cost preview so the
  // user can see what the most recent gearing session cost.
  if (lastCostPreview) {
    return (
      <div className="telemetry-strip">
        <span className="telemetry-strip__last-cost">
          Last gear cost: ${Math.abs(lastCostPreview.expectedDollars).toFixed(4)}
        </span>
      </div>
    )
  }
  return (
    <div className="telemetry-strip telemetry-strip--idle">
      <span className="telemetry-strip__hint">Type a prompt + click Gear to see cost estimate</span>
    </div>
  )
}
