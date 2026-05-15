import { useEffect, useRef, useState } from 'react'

interface CreateAccountModalProps {
  open: boolean
  onClose: () => void
  onCreate: (input: { label: string; configDir: string; apiKey: string }) => Promise<void>
}

export function CreateAccountModal({ open, onClose, onCreate }: CreateAccountModalProps): JSX.Element | null {
  const [label, setLabel] = useState('')
  const [configDir, setConfigDir] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setLabel('')
      setConfigDir('')
      setApiKey('')
      setError(null)
      setSubmitting(false)
      setTimeout(() => firstFieldRef.current?.focus(), 0)
    }
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    const trimmedLabel = label.trim()
    const trimmedConfigDir = configDir.trim()
    const trimmedKey = apiKey.trim()
    if (!trimmedLabel) {
      setError('Label is required.')
      return
    }
    setSubmitting(true)
    try {
      await onCreate({ label: trimmedLabel, configDir: trimmedConfigDir, apiKey: trimmedKey })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-account-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="create-account-title" className="modal__title">Add account</h2>
        <form onSubmit={handleSubmit} className="modal__form">
          <label className="modal__field">
            <span className="modal__label">Label</span>
            <input
              ref={firstFieldRef}
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Personal"
              autoComplete="off"
            />
          </label>
          <label className="modal__field">
            <span className="modal__label">Claude config dir (optional)</span>
            <input
              type="text"
              value={configDir}
              onChange={(e) => setConfigDir(e.target.value)}
              placeholder="C:/Users/you/.claude-personal"
              autoComplete="off"
            />
          </label>
          <label className="modal__field">
            <span className="modal__label">Anthropic API key (optional)</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              autoComplete="off"
            />
            <span className="modal__field-hint">
              Stored in the local DB (see ADR-034). Required for gearing — without it, Gear shows an auth modal.
            </span>
          </label>
          {error && <p className="modal__error">{error}</p>}
          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
