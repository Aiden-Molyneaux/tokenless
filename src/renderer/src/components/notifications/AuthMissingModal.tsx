import './styles.css'

interface AuthMissingModalProps {
  open: boolean
  onDismiss: () => void
  accountLabel?: string | null
}

export function AuthMissingModal({ open, onDismiss, accountLabel }: AuthMissingModalProps): JSX.Element | null {
  if (!open) return null

  const headline = accountLabel
    ? `Account "${accountLabel}" needs an API key`
    : 'Anthropic API key required'
  const body = accountLabel
    ? `The "${accountLabel}" account has no Anthropic API key configured. Gearing won't work for this account until you add one.`
    : "Gearing uses Claude Haiku via the Anthropic API. TokenLess didn't find an ANTHROPIC_API_KEY for the active account."

  return (
    <div className="modal-backdrop" role="presentation" onClick={onDismiss}>
      <div
        className="modal auth-missing-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-missing-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="auth-missing-title" className="modal__title">{headline}</h2>
        <p>{body}</p>
        <p>
          To use gearing now: close TokenLess, set the env var, and relaunch. On Windows:
        </p>
        <pre className="auth-missing-modal__pre">
{`$env:ANTHROPIC_API_KEY = 'sk-ant-...'
npm run dev`}
        </pre>
        <p className="auth-missing-modal__hint">
          A proper Settings → &ldquo;API key&rdquo; field lands in Phase 8 polish.
        </p>
        <div className="modal__actions">
          <button type="button" className="btn btn--primary" onClick={onDismiss}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
