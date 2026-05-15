import { useEffect, useRef } from 'react'

interface PrivacyNoticeModalProps {
  open: boolean
  onAcknowledge: () => void
}

export function PrivacyNoticeModal({ open, onAcknowledge }: PrivacyNoticeModalProps): JSX.Element | null {
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => buttonRef.current?.focus(), 0)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') onAcknowledge()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onAcknowledge])

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal privacy-notice"
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-notice-title"
      >
        <h2 id="privacy-notice-title" className="modal__title">Welcome to TokenLess</h2>
        <p className="privacy-notice__body">
          A heads-up about how TokenLess handles your data:
        </p>
        <ul className="privacy-notice__list">
          <li>
            <strong>Prompts:</strong> when you click <em>Gear</em>, your prompt is sent to
            Anthropic&apos;s API to be rewritten by Haiku. When you click <em>Send</em>, the prompt
            goes to claude code (which calls Anthropic). Nothing leaves your machine outside
            those calls.
          </li>
          <li>
            <strong>API key:</strong> stored in plaintext in the local database at
            <code> %APPDATA%/tokenless/tokenless.db</code> (see ADR-034). It never leaves
            your machine except in request headers to Anthropic.
          </li>
          <li>
            <strong>Logs:</strong> all events stay local at <code>%APPDATA%/tokenless/logs/</code>.
            TokenLess does not send telemetry to any third party.
          </li>
        </ul>
        <p className="privacy-notice__body">
          You can review the architectural choices in the project&apos;s <code>docs/decisions.md</code>.
        </p>
        <div className="modal__actions">
          <button
            ref={buttonRef}
            type="button"
            className="btn btn--primary"
            onClick={onAcknowledge}
          >
            I understand
          </button>
        </div>
      </div>
    </div>
  )
}
