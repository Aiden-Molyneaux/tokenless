import { useEffect, useRef } from 'react'

interface AboutDialogProps {
  open: boolean
  onClose: () => void
}

export function AboutDialog({ open, onClose }: AboutDialogProps): JSX.Element | null {
  const closeRef = useRef<HTMLButtonElement>(null)
  const version = window.tokenless.version

  useEffect(() => {
    if (open) setTimeout(() => closeRef.current?.focus(), 0)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal about-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="about-dialog-title" className="modal__title">About TokenLess</h2>
        <dl className="about-dialog__dl">
          <dt>Version</dt>
          <dd>{version}</dd>
          <dt>Platform</dt>
          <dd>Windows (ADR-002 — Windows-first; macOS/Linux deferred)</dd>
          <dt>License</dt>
          <dd>Private — personal use</dd>
        </dl>
        <p className="about-dialog__tagline">
          A clipboard-based prompt-gearing tool for Claude Code. Capture your prompt, optimize it with Haiku, copy the geared version back. Built with Electron + React.
        </p>
        <div className="modal__actions">
          <button
            ref={closeRef}
            type="button"
            className="btn btn--primary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
