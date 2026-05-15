import { useEffect, useRef } from 'react'

import './styles.css'

interface ClaudeNotFoundModalProps {
  open: boolean
  onDismiss: () => void
}

export function ClaudeNotFoundModal({ open, onDismiss }: ClaudeNotFoundModalProps): JSX.Element | null {
  const dismissRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => dismissRef.current?.focus(), 0)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onDismiss])

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
          TokenLess couldn&apos;t find the <code>claude</code> command. Install Claude Code from{' '}
          <a href="https://claude.com/code" target="_blank" rel="noreferrer">
            claude.com/code
          </a>{' '}
          and ensure it&apos;s on your PATH, or set <code>TOKENLESS_CLAUDE_BIN</code> to its full
          path.
        </p>
        <p className="claude-not-found-modal__hint">
          (A Settings → &ldquo;Claude Code path&rdquo; field lands in Phase 8 polish.)
        </p>
        <div className="modal__actions">
          <button
            ref={dismissRef}
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
