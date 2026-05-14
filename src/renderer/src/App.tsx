import { useEffect, useState } from 'react'
import { AppErrorBoundary } from './observability/error-boundary'
import { DevModePanel } from './views/dev-mode/DevModePanel'
import { rendererLogger } from './observability/logger-bridge'

const LS_KEY = 'tokenless.devMode'

function readDevModeFromStorage(): boolean {
  try {
    return window.localStorage.getItem(LS_KEY) === '1'
  } catch {
    return false
  }
}

function writeDevModeToStorage(on: boolean): void {
  try {
    window.localStorage.setItem(LS_KEY, on ? '1' : '0')
  } catch {
    // localStorage unavailable; silently ignore
  }
}

function AppContent(): JSX.Element {
  const [devMode, setDevMode] = useState<boolean>(readDevModeFromStorage)

  useEffect(() => {
    rendererLogger.info('ui', 'mount', 'App mounted', { devMode })
    // Intentionally not re-firing on devMode change; this is a one-shot startup log
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleDevMode = (): void => {
    setDevMode((cur) => {
      const next = !cur
      writeDevModeToStorage(next)
      rendererLogger.info('ui', 'dev-mode-toggle', `Dev Mode ${next ? 'enabled' : 'disabled'}`, { devMode: next })
      return next
    })
  }

  return (
    <>
      <main className="app">
        <header className="app__header">
          <h1 className="app__title">TokenLess</h1>
          <p className="app__subtitle">Phase 1B — Logger + Dev Mode</p>
          <button
            type="button"
            className={`app__dev-toggle ${devMode ? 'is-active' : ''}`}
            onClick={toggleDevMode}
          >
            {devMode ? 'Hide Dev Mode' : 'Show Dev Mode'}
          </button>
        </header>
        <section className="app__body">
          <p>
            The Logger is online and the IPC bridge ships records from renderer to main.
            Toggle Dev Mode to inspect the live log stream.
          </p>
          <p className="app__version">
            preload.version = <code>{window.tokenless?.version ?? 'not loaded'}</code>
          </p>
        </section>
      </main>
      {devMode && <DevModePanel />}
    </>
  )
}

export default function App(): JSX.Element {
  return (
    <AppErrorBoundary>
      <AppContent />
    </AppErrorBoundary>
  )
}
