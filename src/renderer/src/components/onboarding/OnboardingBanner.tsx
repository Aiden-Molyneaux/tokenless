import './styles.css'

interface OnboardingBannerProps {
  visible: boolean
  onCreateProject: () => void
  onDismiss: () => void
}

export function OnboardingBanner({ visible, onCreateProject, onDismiss }: OnboardingBannerProps): JSX.Element | null {
  if (!visible) return null
  return (
    <div className="onboarding-banner" role="status">
      <span>👋 New here? Create your first project to start gearing prompts.</span>
      <div className="onboarding-banner__actions">
        <button type="button" className="btn btn--primary btn--small" onClick={onCreateProject}>
          Create project
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={onDismiss}
          aria-label="Dismiss onboarding banner"
        >
          Later
        </button>
      </div>
    </div>
  )
}
