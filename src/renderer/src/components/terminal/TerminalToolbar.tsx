import { InfoTooltip } from '../common/InfoTooltip'

export interface ContextBudget {
  readonly usedTokens: number
  readonly totalTokens: number
  readonly percentUsed: number
}

interface TerminalToolbarProps {
  onStop: () => void
  streaming: boolean
  contextBudget: ContextBudget | null
}

// Top of TerminalSection. Houses the Stop button (sends SIGINT in Phase 4)
// and the context-budget meter. Phase 2B used MOCK_CONTEXT_BUDGET; Phase 4C
// wires real values parsed from Claude Code output stream via useTelemetry.

export function TerminalToolbar({ onStop, streaming, contextBudget }: TerminalToolbarProps): JSX.Element {
  const meterClass =
    contextBudget === null
      ? 'terminal-toolbar__meter--idle'
      : contextBudget.percentUsed >= 80
      ? 'terminal-toolbar__meter--warn'
      : contextBudget.percentUsed >= 60
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
          if (contextBudget === null) return 'No active session yet.'
          if (contextBudget.percentUsed >= 80) return 'Approaching capacity — consider starting a fresh conversation.'
          return null
        }}
        outcomeFn={() =>
          contextBudget === null
            ? 'no tokens used yet'
            : `${contextBudget.usedTokens.toLocaleString()} of ${contextBudget.totalTokens.toLocaleString()} tokens used`
        }
      >
        <div className={`terminal-toolbar__meter ${meterClass}`}>
          <span className="terminal-toolbar__meter-label">Context:</span>
          <div className="terminal-toolbar__meter-bar">
            <div
              className="terminal-toolbar__meter-fill"
              style={{ width: `${contextBudget?.percentUsed ?? 0}%` }}
            />
          </div>
          <span className="terminal-toolbar__meter-value">
            {contextBudget !== null ? `${contextBudget.percentUsed}%` : '—'}
          </span>
        </div>
      </InfoTooltip>
    </div>
  )
}
