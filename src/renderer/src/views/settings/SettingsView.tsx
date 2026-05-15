import { AccountsSection } from './AccountsSection'
import { GearingDefaultsSection } from './GearingDefaultsSection'
import { SendConfirmToggle } from './SendConfirmToggle'
import { DevModeToggle } from './DevModeToggle'
import { TelemetrySection } from './TelemetrySection'
import { PathsSection } from './PathsSection'
import './styles.css'

interface SettingsViewProps {
  onBack: () => void
  devMode: boolean
  onDevModeChange: (next: boolean) => void
  onRerunOnboarding: () => void
}

// SettingsView — top-level settings route. Contains six sections:
// Accounts, GearingDefaults, SendConfirm, DevMode, Telemetry, Paths.
// Rendered by App.tsx when view === 'settings'.

export function SettingsView({ onBack, devMode, onDevModeChange, onRerunOnboarding }: SettingsViewProps): JSX.Element {
  return (
    <div className="settings-view">
      <header className="settings-view__header">
        <button type="button" className="settings-view__back" onClick={onBack}>
          ← Back
        </button>
        <h1 className="settings-view__title">Settings</h1>
      </header>
      <div className="settings-view__body">
        <AccountsSection />
        <GearingDefaultsSection />
        <SendConfirmToggle />
        <DevModeToggle devMode={devMode} onDevModeChange={onDevModeChange} />
        <TelemetrySection />
        <PathsSection />
        <div className="settings-section">
          <button
            type="button"
            className="settings-view__rerun-onboarding"
            onClick={onRerunOnboarding}
          >
            Run onboarding again
          </button>
        </div>
      </div>
    </div>
  )
}
