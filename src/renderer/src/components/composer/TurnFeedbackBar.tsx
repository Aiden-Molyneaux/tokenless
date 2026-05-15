import type { Feedback } from '@shared/types/turns'

interface TurnFeedbackBarProps {
  turnId: number
  onSubmit: (turnId: number, feedback: Feedback) => void
}

// Presentational: stateless trio of feedback buttons. The parent decides
// when to mount/unmount (typically: after assistant turn arrives, until
// the user has rated it).
export function TurnFeedbackBar({ turnId, onSubmit }: TurnFeedbackBarProps): JSX.Element {
  return (
    <div className="turn-feedback-bar" role="group" aria-label="Rate this response">
      <button type="button" className="turn-feedback-bar__button" aria-label="Thumbs up" onClick={() => onSubmit(turnId, 'up')}>👍</button>
      <button type="button" className="turn-feedback-bar__button" aria-label="Thumbs down" onClick={() => onSubmit(turnId, 'down')}>👎</button>
      <button type="button" className="turn-feedback-bar__button" aria-label="Shrug" onClick={() => onSubmit(turnId, 'shrug')}>🤷</button>
    </div>
  )
}
