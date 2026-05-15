interface StepWelcomeProps {
  onNext: () => void
}

export function StepWelcome({ onNext }: StepWelcomeProps): JSX.Element {
  return (
    <div className="onboarding-step">
      <h2 className="onboarding-step__title">Welcome to TokenLess.</h2>
      <div className="onboarding-step__body">
        <p>
          TokenLess sits between you and Claude. It rewrites your prompts via Haiku
          (&ldquo;gearing&rdquo;) to reduce token waste, and hosts Claude Code in an embedded terminal.
        </p>
        <p>Three things to set up before you can start:</p>
        <ol>
          <li>Your Anthropic API key</li>
          <li>Your first project (a working directory for claude)</li>
          <li>A first conversation</li>
        </ol>
        <p>Click Next to begin.</p>
      </div>
      <div className="onboarding-step__actions">
        <button type="button" className="btn btn--primary" onClick={onNext}>
          Next &rarr;
        </button>
      </div>
    </div>
  )
}
