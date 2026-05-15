interface StepDoneProps {
  onComplete: () => Promise<void>
}

export function StepDone({ onComplete }: StepDoneProps): JSX.Element {
  return (
    <div className="onboarding-step">
      <h2 className="onboarding-step__title">You&apos;re all set!</h2>
      <div className="onboarding-step__body">
        <p>
          Your account &ldquo;Personal&rdquo; has its API key configured, and your first project is
          ready. Click &ldquo;Start your first conversation&rdquo; to begin.
        </p>
      </div>
      <div className="onboarding-step__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void onComplete()}
        >
          Start your first conversation
        </button>
      </div>
    </div>
  )
}
