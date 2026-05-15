// DevModeToggle — controlled mirror of the floating dev-mode toggle in App.tsx.
// State lives in App.tsx; this component is purely presentational.

interface DevModeToggleProps {
  devMode: boolean
  onDevModeChange: (next: boolean) => void
}

export function DevModeToggle({ devMode, onDevModeChange }: DevModeToggleProps): JSX.Element {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    onDevModeChange(e.target.checked)
  }

  return (
    <section className="settings-section">
      <h3 className="settings-section__heading">Developer Mode</h3>
      <div className="settings-toggle-row">
        <div className="settings-toggle-row__label">
          <span className="settings-toggle-row__name">Show Dev Mode panel</span>
          <span className="settings-toggle-row__description">
            Displays the live log stream and feedback summary panel at the bottom of the screen.
          </span>
        </div>
        <input
          type="checkbox"
          className="settings-toggle-row__checkbox"
          checked={devMode}
          onChange={handleChange}
          aria-label="Show Dev Mode panel"
        />
      </div>
    </section>
  )
}
