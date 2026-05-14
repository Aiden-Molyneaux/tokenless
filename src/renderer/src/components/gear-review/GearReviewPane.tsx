import type { MockCritiqueFlag } from '../../mocks/geared-prompt'

interface GearReviewPaneProps {
  original: string
  geared: string
  critiqueFlags: readonly MockCritiqueFlag[]
  onSendOriginal: () => void
  onSendGeared: (editedGeared: string) => void
  onReGear: () => void
  onCancel: () => void
}

// Phase 2B stub — replaced in Tasks 17-20.
export function GearReviewPane(_props: GearReviewPaneProps): JSX.Element {
  return <div>GearReviewPane stub — Task 20 replaces this.</div>
}
