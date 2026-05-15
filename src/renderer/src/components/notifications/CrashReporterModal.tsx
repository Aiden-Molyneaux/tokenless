import { useEffect, useRef, useState } from 'react'

import type { CrashReport } from '@shared/types/crash-report'

interface CrashReporterModalProps {
  open: boolean
  report: CrashReport | null
  // Only meaningful when the crash was caught in the renderer (boundary path).
  // Hidden for main-process crashes — those can't be safely continued.
  allowContinue: boolean
  onContinue: () => void
}

export function CrashReporterModal({
  open, report, allowContinue, onContinue
}: CrashReporterModalProps): JSX.Element | null {
  const [copied, setCopied] = useState(false)
  const restartRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => restartRef.current?.focus(), 0)
  }, [open])

  if (!open || !report) return null

  const handleCopy = async (): Promise<void> => {
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRestart = (): void => {
    void window.tokenless.crash.restart()
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal crash-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crash-modal-title"
      >
        <h2 id="crash-modal-title" className="modal__title">Something went wrong</h2>
        <p className="crash-modal__source">
          {report.source === 'main' ? 'Main process crash' : 'Renderer error'}
        </p>
        <pre className="crash-modal__message">{report.message}</pre>
        {report.stack && <pre className="crash-modal__stack">{report.stack.slice(0, 800)}</pre>}
        <p className="crash-modal__hint">
          Click <strong>Copy report</strong> to bundle the error + the last 100 log records into your
          clipboard. Paste it into a GitHub issue or save it for later. No data is sent automatically.
        </p>
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={() => void handleCopy()}>
            {copied ? 'Copied ✓' : 'Copy report'}
          </button>
          {allowContinue && (
            <button type="button" className="btn btn--ghost" onClick={onContinue}>Continue</button>
          )}
          <button ref={restartRef} type="button" className="btn btn--primary" onClick={handleRestart}>
            Restart
          </button>
        </div>
      </div>
    </div>
  )
}
