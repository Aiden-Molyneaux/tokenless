import { useEffect, useState } from 'react'
import { AppErrorBoundary } from './observability/error-boundary'
import { AppShell } from './components/layout/AppShell'
import { DevModePanel } from './views/dev-mode/DevModePanel'
import { SettingsView } from './views/settings/SettingsView'
import { rendererLogger } from './observability/logger-bridge'
import { ToastProvider } from './hooks/use-toast'

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
  const [view, setView] = useState<'shell' | 'settings'>('shell')

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

  const handleDevModeChange = (next: boolean): void => {
    setDevMode(next)
    writeDevModeToStorage(next)
    rendererLogger.info('ui', 'dev-mode-toggle', `Dev Mode ${next ? 'enabled' : 'disabled'} via settings`, { devMode: next })
  }

  return (
    <>
      {view === 'shell'
        ? <AppShell onOpenSettings={() => setView('settings')} />
        : <SettingsView onBack={() => setView('shell')} devMode={devMode} onDevModeChange={handleDevModeChange} />
      }
      <button
        type="button"
        className={`app__dev-toggle ${devMode ? 'is-active' : ''}`}
        onClick={toggleDevMode}
      >
        {devMode ? 'Hide Dev Mode' : 'Show Dev Mode'}
      </button>
      {devMode && <DevModePanel />}
    </>
  )
}

export default function App(): JSX.Element {
  return (
    <AppErrorBoundary>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AppErrorBoundary>
  )
}
