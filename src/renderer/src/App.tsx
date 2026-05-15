import { useEffect, useState } from 'react'
import { AppErrorBoundary } from './observability/error-boundary'
import { AppShell } from './components/layout/AppShell'
import { DevModePanel } from './views/dev-mode/DevModePanel'
import { SettingsView } from './views/settings/SettingsView'
import { OnboardingWizard } from './views/onboarding/OnboardingWizard'
import { rendererLogger } from './observability/logger-bridge'
import { ToastProvider } from './hooks/use-toast'
import { readSetting, writeSetting } from './hooks/use-settings'
import { SETTING_ONBOARDING_COMPLETE } from '@shared/types/settings-keys'

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
  // null = not yet read from DB; false = onboarding not done; true = done
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null)

  useEffect(() => {
    rendererLogger.info('ui', 'mount', 'App mounted', { devMode })
    // Intentionally not re-firing on devMode change; this is a one-shot startup log
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void readSetting(SETTING_ONBOARDING_COMPLETE).then((v) => {
      setOnboardingDone(v === '1')
    })
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

  const handleRerunOnboarding = async (): Promise<void> => {
    await writeSetting(SETTING_ONBOARDING_COMPLETE, '0')
    setOnboardingDone(false)
    setView('shell') // wizard only shows when view === 'shell'
  }

  // Show wizard overlay when the setting is explicitly false (not null = loading) and we're on the shell.
  const showOnboarding = onboardingDone === false && view === 'shell'

  return (
    <>
      {view === 'shell'
        ? <AppShell onOpenSettings={() => setView('settings')} />
        : <SettingsView onBack={() => setView('shell')} devMode={devMode} onDevModeChange={handleDevModeChange} onRerunOnboarding={() => void handleRerunOnboarding()} />
      }
      <button
        type="button"
        className={`app__dev-toggle ${devMode ? 'is-active' : ''}`}
        onClick={toggleDevMode}
      >
        {devMode ? 'Hide Dev Mode' : 'Show Dev Mode'}
      </button>
      {devMode && <DevModePanel />}
      {showOnboarding && (
        <OnboardingWizard onClose={() => setOnboardingDone(true)} />
      )}
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
