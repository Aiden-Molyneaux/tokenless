import { useEffect, useState } from 'react'
import { rendererLogger } from '../../observability/logger-bridge'

interface AppPaths {
  userData: string
  logs: string
  db: string
}

// PathsSection — displays read-only userData / logs / db paths + Open folder buttons.
// Uses paths:get-app-paths and paths:open-folder IPCs (Phase 8A).

export function PathsSection(): JSX.Element {
  const [paths, setPaths] = useState<AppPaths | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.tokenless.paths.getAppPaths().then((result) => {
      if (result.ok) {
        setPaths(result.data)
        setError(null)
      } else {
        setError(result.error.message)
        rendererLogger.error('ui', 'paths-get-app-paths-failed', result.error.message, {
          code: result.error.code,
          logId: result.error.logId
        })
      }
      setLoading(false)
    })
  }, [])

  const handleOpenFolder = (path: string): void => {
    void window.tokenless.paths.openFolder({ path }).then((result) => {
      if (!result.ok) {
        rendererLogger.warn('ui', 'paths-open-folder-failed', result.error.message, {
          path,
          code: result.error.code,
          logId: result.error.logId
        })
      }
    })
  }

  return (
    <section className="settings-section">
      <h3 className="settings-section__heading">Paths</h3>
      {loading && <p className="paths-section__loading">Loading…</p>}
      {!loading && error && <p className="paths-section__error">{error}</p>}
      {!loading && !error && paths && (
        <div className="paths-section__list">
          <PathRow label="User data" value={paths.userData} onOpen={() => handleOpenFolder(paths.userData)} />
          <PathRow label="Logs" value={paths.logs} onOpen={() => handleOpenFolder(paths.logs)} />
          <PathRow label="DB" value={paths.db} onOpen={() => handleOpenFolder(paths.userData)} />
        </div>
      )}
    </section>
  )
}

interface PathRowProps {
  label: string
  value: string
  onOpen: () => void
}

function PathRow({ label, value, onOpen }: PathRowProps): JSX.Element {
  return (
    <div className="paths-section__row">
      <span className="paths-section__path-label">{label}</span>
      <span className="paths-section__path-value" title={value}>{value}</span>
      <button
        type="button"
        className="paths-section__open"
        onClick={onOpen}
      >
        Open folder
      </button>
    </div>
  )
}
