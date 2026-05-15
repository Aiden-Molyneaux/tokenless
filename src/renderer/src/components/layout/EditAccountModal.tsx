import { useEffect, useRef, useState } from 'react'

import type { Account, UpdateAccountInput } from '@shared/types/accounts'

interface EditAccountModalProps {
  open: boolean
  account: Account | null
  onClose: () => void
  onUpdate: (input: UpdateAccountInput) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

export function EditAccountModal({
  open,
  account,
  onClose,
  onUpdate,
  onDelete
}: EditAccountModalProps): JSX.Element | null {
  const [label, setLabel] = useState('')
  const [configDir, setConfigDir] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && account) {
      setLabel(account.label)
      setConfigDir(account.configDir)
      setApiKey(account.apiKey ?? '')
      setError(null)
      setSubmitting(false)
      setTimeout(() => firstFieldRef.current?.focus(), 0)
    }
  }, [open, account])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !account) return null

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
      await onUpdate({
        id: account.id,
        label: trimmedLabel,
        configDir: trimmedConfigDir,
        apiKey: trimmedKey === '' ? null : trimmedKey
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!window.confirm(`Delete account "${account.label}"? This cannot be undone.`)) return
    setSubmitting(true)
    try {
      await onDelete(account.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-account-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="edit-account-title" className="modal__title">Edit account</h2>
        <form onSubmit={handleSubmit} className="modal__form">
          <label className="modal__field">
            <span className="modal__label">Label</span>
            <input
              ref={firstFieldRef}
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="modal__field">
            <span className="modal__label">Claude config dir</span>
            <input
              type="text"
              value={configDir}
              onChange={(e) => setConfigDir(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="modal__field">
            <span className="modal__label">Anthropic API key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              autoComplete="off"
            />
            <span className="modal__field-hint">
              Clear this field to remove the stored key for this account.
            </span>
          </label>
          {error && <p className="modal__error">{error}</p>}
          <div className="modal__actions">
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => void handleDelete()}
              disabled={submitting}
            >
              Delete
            </button>
            <div className="modal__actions-spacer" />
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
