import { useState } from 'react'
import { AccountsSection } from './AccountsSection'
import { GearingDefaultsSection } from './GearingDefaultsSection'
import { DevModeToggle } from './DevModeToggle'
import { TelemetrySection } from './TelemetrySection'
import { PathsSection } from './PathsSection'
import { AboutDialog } from '../../components/notifications/AboutDialog'
import './styles.css'

interface SettingsViewProps {
  onBack: () => void
  devMode: boolean
  onDevModeChange: (next: boolean) => void
  onRerunOnboarding: () => void
}

// SettingsView — top-level settings route. Contains five sections:
// Accounts, GearingDefaults, DevMode, Telemetry, Paths.
// Rendered by App.tsx when view === 'settings'.

export function SettingsView({ onBack, devMode, onDevModeChange, onRerunOnboarding }: SettingsViewProps): JSX.Element {
  const [aboutOpen, setAboutOpen] = useState(false)
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
          <button
            type="button"
            className="settings-view__about-link"
            onClick={() => setAboutOpen(true)}
          >
            About TokenLess
          </button>
        </div>
      </div>
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  )
}
