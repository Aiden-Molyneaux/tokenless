import type { CostPreview } from '@shared/types/gearing'

// The narrow strip at the bottom of the composer showing cost preview +
// token estimate for the geared prompt. Prop-driven — Composer passes the
// CostPreview from the last successful gearing call, or null before first gear.

interface TelemetryStripProps {
  costPreview: CostPreview | null
}

export function TelemetryStrip({ costPreview }: TelemetryStripProps): JSX.Element {
  if (!costPreview) {
    return (
      <div className="telemetry-strip telemetry-strip--idle">
        <span className="telemetry-strip__hint">Type a prompt + click Gear to see cost estimate</span>
      </div>
    )
  }
  return (
    <div className="telemetry-strip">
      <span className="telemetry-strip__model">{costPreview.modelLabel}</span>
      <span className="telemetry-strip__cost">${costPreview.expectedDollars.toFixed(4)}</span>
      <span className="telemetry-strip__tokens">
        {costPreview.expectedInputTokens.toLocaleString()} in + {costPreview.expectedOutputTokens.toLocaleString()} out
      </span>
      {costPreview.haikuMetaDollars > 0 && (
        <span className="telemetry-strip__meta">
          +${costPreview.haikuMetaDollars.toFixed(4)} gearing
        </span>
      )}
    </div>
  )
}
