import type { MockCritiqueFlag } from '../../mocks/geared-prompt'

interface CritiqueFlagsProps {
  flags: readonly MockCritiqueFlag[]
}

// Yellow/info banner displaying critique flags from the gearing engine.
// Phase 5 wires real Haiku-produced flags; Phase 2B passes MOCK_CRITIQUE_FLAGS.

export function CritiqueFlags({ flags }: CritiqueFlagsProps): JSX.Element | null {
  if (flags.length === 0) return null
  return (
    <div className="critique-flags">
      {flags.map((flag, i) => (
        <div key={i} className={`critique-flags__item critique-flags__item--${flag.severity}`}>
          <span className="critique-flags__icon" aria-hidden="true">
            {flag.severity === 'warn' ? '⚠' : 'ⓘ'}
          </span>
          <span className="critique-flags__message">{flag.message}</span>
        </div>
      ))}
    </div>
  )
}
