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
