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
        {accountLabel ? (
          <>
            <p>
              Click the <code>+</code> next to the account selector to add a new account with
              an API key, or wait for Phase 6B to ship inline editing for the existing account.
            </p>
            <p className="auth-missing-modal__hint">
              Keys are stored in TokenLess&apos;s local DB (see ADR-034). A proper Settings →
              &ldquo;API key&rdquo; field with keychain integration lands in Phase 8 polish.
            </p>
          </>
        ) : (
          <>
            <p>
              Add an account from the <code>+</code> button next to the account selector — set
              the Anthropic API key field when you create it. Phase 6A removed the
              <code> ANTHROPIC_API_KEY </code>
              env var fallback; gearing now uses per-account keys.
            </p>
            <p className="auth-missing-modal__hint">
              A proper Settings → &ldquo;API key&rdquo; field lands in Phase 8 polish.
            </p>
          </>
        )}
        <div className="modal__actions">
          <button type="button" className="btn btn--primary" onClick={onDismiss}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
