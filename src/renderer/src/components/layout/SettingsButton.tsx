interface SettingsButtonProps {
  onClick?: () => void
}

// Settings icon button in the TopBar. Phase 2A: stub that just calls onClick;
// Phase 8 wires a real Settings view.

export function SettingsButton({ onClick }: SettingsButtonProps): JSX.Element {
  return (
    <button
      type="button"
      className="settings-button"
      onClick={onClick}
      aria-label="Open settings"
      title="Settings"
    >
      ⚙
    </button>
  )
}
