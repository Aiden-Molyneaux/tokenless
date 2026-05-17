import { InfoTooltip } from '../common/InfoTooltip'

interface ActionsRowProps {
  promptEmpty: boolean
  /** True when a gearing IPC call is in flight — disables Gear to prevent re-entrancy. */
  disableGear?: boolean
  /** Disables Copy Geared when no gear result is available (gearState === null). */
  copyDisabled?: boolean
  onCapture: () => void
  captureDisabled?: boolean
  onGear: () => void
  onCopyGeared: () => void
  onDiscard: () => void
  onTemplates: () => void
}

// The button row beneath ConfigsRow. Gear is primary (orange). Copy Geared is
// enabled once a gear result is present. Discard clears the prompt + gear state.
// Final shape (v2): Capture, Gear, Copy Geared, Discard (primary) + Templates (secondary).

export function ActionsRow({ promptEmpty, disableGear = false, copyDisabled = false, onCapture, captureDisabled = false, onGear, onCopyGeared, onDiscard, onTemplates }: ActionsRowProps): JSX.Element {
  return (
    <div className="actions-row">
      <div className="actions-row__primary">
        <button
          type="button"
          className="actions-row__button actions-row__button--capture"
          onClick={onCapture}
          disabled={captureDisabled}
          aria-label="Capture prompt from clipboard"
        >
          Capture
        </button>
        <InfoTooltip helperText="Rewrite your prompt for token efficiency. Haiku optimizes for the selected configs.">
          <button
            type="button"
            className="actions-row__button actions-row__button--gear"
            disabled={promptEmpty || disableGear}
            onClick={onGear}
          >
            Gear
          </button>
        </InfoTooltip>
        <InfoTooltip helperText="Copy the geared prompt to the clipboard. Disabled until you've run Gear.">
          <button
            type="button"
            className="actions-row__button actions-row__button--copy-geared"
            disabled={copyDisabled}
            onClick={onCopyGeared}
            aria-label="Copy geared prompt to clipboard"
          >
            Copy Geared
          </button>
        </InfoTooltip>
        <InfoTooltip helperText="Clear the composer + close the gear review.">
          <button
            type="button"
            className="actions-row__button actions-row__button--discard"
            onClick={onDiscard}
            aria-label="Discard composer + gear review"
          >
            Discard
          </button>
        </InfoTooltip>
      </div>
      <div className="actions-row__secondary">
        <InfoTooltip helperText="Insert a saved template into the composer.">
          <button
            type="button"
            className="actions-row__button actions-row__button--secondary"
            onClick={onTemplates}
          >
            Templates ▾
          </button>
        </InfoTooltip>
      </div>
    </div>
  )
}
