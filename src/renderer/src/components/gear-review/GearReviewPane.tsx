import { useState } from 'react'
import type { CritiqueFlag, CostPreview } from '@shared/types/gearing'
import { CritiqueFlags } from './CritiqueFlags'
import { GearedPane } from './GearedPane'
import { OriginalPane } from './OriginalPane'
import './styles.css'

interface GearReviewPaneProps {
  original: string
  geared: string
  critiqueFlags: readonly CritiqueFlag[]
  costPreview: CostPreview
  /** When true, both Send buttons are disabled (no active claude PTY conversation). */
  sendDisabled?: boolean
  onSendOriginal: () => void
  onSendGeared: (editedGeared: string) => void
  onReGear: () => void
  onCancel: () => void
}

// Replaces Composer's main view after the user clicks Gear. Shows the
// original (read-only) next to the geared (editable). Critique flags
// surface above. The user can re-gear, cancel back to compose, send
// the original (un-geared), or send the (possibly edited) geared version.

// Rough token estimate (4 chars per token average — close enough for UI).
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function GearReviewPane({
  original,
  geared,
  critiqueFlags,
  costPreview,
  sendDisabled = false,
  onSendOriginal,
  onSendGeared,
  onReGear,
  onCancel
}: GearReviewPaneProps): JSX.Element {
  const [editedGeared, setEditedGeared] = useState(geared)

  const originalTokens = estimateTokens(original)
  const gearedTokens = estimateTokens(editedGeared)
  const saved = originalTokens - gearedTokens
  const savings = saved > 0 ? `saves ~${saved.toLocaleString()} tok` : ''

  return (
    <div className="gear-review-pane">
      <div className="gear-review-pane__header">
        <h2 className="gear-review-pane__title">Review geared prompt</h2>
        <button
          type="button"
          className="gear-review-pane__cancel"
          onClick={onCancel}
          aria-label="Cancel and return to composer"
        >
          ✕
        </button>
      </div>
      <CritiqueFlags flags={critiqueFlags} />
      <div className="gear-review-pane__panes">
        <OriginalPane text={original} tokenCount={originalTokens} />
        <GearedPane
          value={editedGeared}
          onChange={setEditedGeared}
          tokenCount={gearedTokens}
          savings={savings}
        />
      </div>
      <div className="gear-review-pane__cost-preview">
        <span className="gear-review-pane__cost-expected">
          Expected: ${costPreview.expectedDollars.toFixed(4)}
          {' '}
          <span className="gear-review-pane__cost-tokens">
            ({costPreview.expectedInputTokens.toLocaleString()} in / {costPreview.expectedOutputTokens.toLocaleString()} out)
          </span>
        </span>
        {costPreview.haikuMetaDollars > 0 && (
          <span className="gear-review-pane__cost-meta">
            Gearing meta: ${costPreview.haikuMetaDollars.toFixed(4)}
          </span>
        )}
      </div>
      {sendDisabled && (
        <p className="gear-review-pane__send-hint">
          Click <strong>New Conversation</strong> in the sidebar to start a Claude session before sending.
        </p>
      )}
      <div className="gear-review-pane__actions">
        <button
          type="button"
          className="gear-review-pane__button gear-review-pane__button--secondary"
          onClick={onReGear}
        >
          ↻ Re-gear
        </button>
        <button
          type="button"
          className="gear-review-pane__button"
          onClick={onSendOriginal}
          disabled={sendDisabled}
          title={sendDisabled ? 'No active conversation — start one first' : undefined}
        >
          Send original
        </button>
        <button
          type="button"
          className="gear-review-pane__button gear-review-pane__button--primary"
          onClick={() => onSendGeared(editedGeared)}
          disabled={sendDisabled}
          title={sendDisabled ? 'No active conversation — start one first' : undefined}
        >
          Send geared
        </button>
      </div>
    </div>
  )
}
