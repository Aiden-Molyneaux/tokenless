import './styles.css'

interface ClaudeNotFoundModalProps {
  open: boolean
  onDismiss: () => void
}

export function ClaudeNotFoundModal({ open, onDismiss }: ClaudeNotFoundModalProps): JSX.Element | null {
  if (!open) return null

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onDismiss}
    >
      <div
        className="modal claude-not-found-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="claude-not-found-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="claude-not-found-title" className="modal__title claude-not-found-modal__title">
          Claude not found
        </h2>
        <p className="claude-not-found-modal__body">
          TokenLess could not start Claude because the <code>claude</code> binary was not found
          on your system. Make sure Claude Code CLI is installed and available in your PATH.
        </p>
        <div className="modal__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
