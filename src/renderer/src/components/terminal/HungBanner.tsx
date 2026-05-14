interface HungBannerProps {
  visible: boolean
  severity: 'warn' | 'error'
  onStop: () => void
}

export function HungBanner({ visible, severity, onStop }: HungBannerProps): JSX.Element | null {
  if (!visible) return null
  const label = severity === 'error'
    ? 'No response from claude — try Stop and check Dev Mode'
    : 'Claude has been idle for a minute — still working?'
  return (
    <div className={`hung-banner hung-banner--${severity}`} role="status" aria-live="polite">
      <span className="hung-banner__message">{label}</span>
      <button type="button" className="hung-banner__stop" onClick={onStop}>
        Stop
      </button>
    </div>
  )
}
