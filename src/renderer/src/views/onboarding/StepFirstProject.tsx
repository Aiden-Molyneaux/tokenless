import { useEffect, useState } from 'react'
import { useProjects } from '../../hooks/use-projects'

interface StepFirstProjectProps {
  projectName: string
  onProjectNameChange: (name: string) => void
  projectRootPath: string
  onProjectRootPathChange: (path: string) => void
  createdAccountId: number | null
  onNext: (projectId: number) => void
  onBack: () => void
}

export function StepFirstProject({
  projectName,
  onProjectNameChange,
  projectRootPath,
  onProjectRootPathChange,
  createdAccountId,
  onNext,
  onBack
}: StepFirstProjectProps): JSX.Element {
  const { create: createProject } = useProjects()
  const [pathError, setPathError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounced path validation — 400 ms after the user stops typing.
  useEffect(() => {
    const trimmed = projectRootPath.trim()
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
  }, [projectRootPath])

  const trimmedName = projectName.trim()
  const trimmedPath = projectRootPath.trim()
  const canSubmit = trimmedName.length > 0 && trimmedPath.length > 0 && pathError === null && !busy

  const handleNext = async (): Promise<void> => {
    if (!canSubmit) return
    if (pathError !== null) {
      setError(pathError)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const created = await createProject({
        name: trimmedName,
        rootPath: trimmedPath,
        defaultAccountId: createdAccountId
      })
      if (created === null) {
        setError('Failed to create the project. Please try again.')
        return
      }
      onNext(created.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="onboarding-step">
      <h2 className="onboarding-step__title">Your first project</h2>
      <div className="onboarding-step__body">
        <p>
          A project is a working directory where claude code runs. Pick a folder on your machine
          — this is where any commands claude executes will run.
        </p>
      </div>
      <div className="onboarding-step__field">
        <label className="onboarding-step__field-label" htmlFor="ob-project-name">
          Project name
        </label>
        <input
          id="ob-project-name"
          type="text"
          value={projectName}
          onChange={(e) => onProjectNameChange(e.target.value)}
          placeholder="My Project"
          autoComplete="off"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
      </div>
      <div className="onboarding-step__field">
        <label className="onboarding-step__field-label" htmlFor="ob-root-path">
          Root path
        </label>
        <input
          id="ob-root-path"
          type="text"
          value={projectRootPath}
          onChange={(e) => onProjectRootPathChange(e.target.value)}
          placeholder="C:/path/to/project"
          autoComplete="off"
        />
        {pathError !== null && (
          <span className="onboarding-step__field-error">{pathError}</span>
        )}
      </div>
      {error !== null && (
        <p className="onboarding-step__field-error">{error}</p>
      )}
      <div className="onboarding-step__actions">
        <button type="button" className="btn btn--ghost" onClick={onBack} disabled={busy}>
          &larr; Back
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void handleNext()}
          disabled={!canSubmit}
        >
          {busy ? 'Creating…' : 'Next →'}
        </button>
      </div>
    </div>
  )
}
