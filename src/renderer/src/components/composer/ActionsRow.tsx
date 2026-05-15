import { InfoTooltip } from '../common/InfoTooltip'

interface ActionsRowProps {
  promptEmpty: boolean
  /** True when an IPC send is in flight — disables Gear AND Send to prevent re-entrancy. */
  disableGear?: boolean
  /** Additionally disables Send when there's no active conversation. Gearing
   *  is an Anthropic-API operation that does NOT need a live PTY (Phase 5
   *  may want conversationId for rolling-summary context but can handle null). */
  disableSend?: boolean
  onGear: () => void
  onSend: () => void
  onTemplates: () => void
  onBranch: () => void
  onCommit: () => void
  onPush: () => void
}

// The button row beneath ConfigsRow. Gear is primary (orange). Send is
// neutral but enabled when a prompt is present + a conversation is active.
// Commit + Push pre-fill the composer with canned git prompts (Phase 7
// wires that; Phase 2B stubs the callbacks).

export function ActionsRow({ promptEmpty, disableGear = false, disableSend = false, onGear, onSend, onTemplates, onBranch, onCommit, onPush }: ActionsRowProps): JSX.Element {
  return (
    <div className="actions-row">
      <div className="actions-row__primary">
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
        <InfoTooltip helperText="Send the prompt without gearing first. Original tokens preserved.">
          <button
            type="button"
            className="actions-row__button"
            disabled={promptEmpty || disableSend}
            onClick={onSend}
          >
            Send
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
        <InfoTooltip helperText="Create a new conversation that branches off from the latest turn here. Inherits the rolling summary for context.">
          <button
            type="button"
            className="actions-row__button actions-row__button--secondary"
            onClick={onBranch}
          >
            Branch
          </button>
        </InfoTooltip>
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
