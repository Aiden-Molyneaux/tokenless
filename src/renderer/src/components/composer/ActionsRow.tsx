import { InfoTooltip } from '../common/InfoTooltip'

interface ActionsRowProps {
  promptEmpty: boolean
  /** When true, both Gear and Send are disabled (in-flight send or no active conversation). */
  disabled?: boolean
  onGear: () => void
  onSend: () => void
  onCommit: () => void
  onPush: () => void
}

// The button row beneath ConfigsRow. Gear is primary (orange). Send is
// neutral but enabled when a prompt is present. Commit + Push pre-fill
// the composer with canned git prompts (Phase 7 wires that; Phase 2B
// stubs the callbacks).

export function ActionsRow({ promptEmpty, disabled = false, onGear, onSend, onCommit, onPush }: ActionsRowProps): JSX.Element {
  return (
    <div className="actions-row">
      <div className="actions-row__primary">
        <InfoTooltip helperText="Rewrite your prompt for token efficiency. Haiku optimizes for the selected configs.">
          <button
            type="button"
            className="actions-row__button actions-row__button--gear"
            disabled={promptEmpty || disabled}
            onClick={onGear}
          >
            Gear
          </button>
        </InfoTooltip>
        <InfoTooltip helperText="Send the prompt without gearing first. Original tokens preserved.">
          <button
            type="button"
            className="actions-row__button"
            disabled={promptEmpty || disabled}
            onClick={onSend}
          >
            Send
          </button>
        </InfoTooltip>
      </div>
      <div className="actions-row__secondary">
        <InfoTooltip helperText="Pre-fills the composer with this project's commit prompt (editable in Settings).">
          <button
            type="button"
            className="actions-row__button actions-row__button--secondary"
            onClick={onCommit}
          >
            Commit
          </button>
        </InfoTooltip>
        <InfoTooltip helperText="Pre-fills the composer with this project's push prompt.">
          <button
            type="button"
            className="actions-row__button actions-row__button--secondary"
            onClick={onPush}
          >
            Push
          </button>
        </InfoTooltip>
      </div>
    </div>
  )
}
