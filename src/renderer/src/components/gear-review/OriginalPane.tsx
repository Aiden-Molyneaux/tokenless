interface OriginalPaneProps {
  text: string
  tokenCount?: number
}

// The left half of GearReviewPane. Read-only, visually dimmed. Shows the
// user's original prompt so they can compare against the geared version
// before sending.

export function OriginalPane({ text, tokenCount }: OriginalPaneProps): JSX.Element {
  return (
    <div className="original-pane">
      <div className="original-pane__header">
        <span className="original-pane__label">Original</span>
        {tokenCount !== undefined && (
          <span className="original-pane__tokens">{tokenCount.toLocaleString()} tok</span>
        )}
      </div>
      <pre className="original-pane__text">{text}</pre>
    </div>
  )
}
