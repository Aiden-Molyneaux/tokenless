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
