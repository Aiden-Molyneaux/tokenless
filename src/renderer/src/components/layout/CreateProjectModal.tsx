import { useEffect, useRef, useState } from 'react'

interface CreateProjectModalProps {
  open: boolean
  onClose: () => void
  onCreate: (input: { name: string; rootPath: string }) => Promise<void>
}

export function CreateProjectModal({ open, onClose, onCreate }: CreateProjectModalProps): JSX.Element | null {
  const [name, setName] = useState('')
  const [rootPath, setRootPath] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pathError, setPathError] = useState<string | null>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setRootPath('')
      setError(null)
      setPathError(null)
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

  useEffect(() => {
    const trimmed = rootPath.trim()
    if (!trimmed) {
      setPathError(null)
      return undefined
    }
    const timer = setTimeout(async () => {
      const result = await window.tokenless.paths.checkDir({ path: trimmed })
      if (!result.ok) {
        setPathError(null)
        return
      }
      if (!result.data.exists) setPathError("Directory doesn't exist on disk.")
      else if (!result.data.isDirectory) setPathError('Path points to a file, not a directory.')
      else setPathError(null)
    }, 400)
    return () => clearTimeout(timer)
  }, [rootPath])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedPath = rootPath.trim()
    if (!trimmedName || !trimmedPath) {
      setError('Name and root path are both required.')
      return
    }
    if (pathError) {
      setError(pathError)
      return
    }
    setSubmitting(true)
    try {
      await onCreate({ name: trimmedName, rootPath: trimmedPath })
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
        aria-labelledby="create-project-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="create-project-title" className="modal__title">Create project</h2>
        <form onSubmit={handleSubmit} className="modal__form">
          <label className="modal__field">
            <span className="modal__label">Name</span>
            <input
              ref={firstFieldRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
              autoComplete="off"
            />
          </label>
          <label className="modal__field">
            <span className="modal__label">Root path</span>
            <input
              type="text"
              value={rootPath}
              onChange={(e) => setRootPath(e.target.value)}
              placeholder="C:/path/to/project"
              autoComplete="off"
            />
            {pathError && <span className="modal__field-error">{pathError}</span>}
          </label>
          {error && <p className="modal__error">{error}</p>}
          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
