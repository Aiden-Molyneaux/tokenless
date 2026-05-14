interface GearedPaneProps {
  value: string
  onChange: (next: string) => void
  tokenCount?: number
  savings?: string
}

// The right half of GearReviewPane. Editable textarea showing the geared
// prompt. The user can tweak before sending. Save indicator shows tokens
// saved vs original.

export function GearedPane({ value, onChange, tokenCount, savings }: GearedPaneProps): JSX.Element {
  return (
    <div className="geared-pane">
      <div className="geared-pane__header">
        <span className="geared-pane__label">Geared (editable)</span>
        <span className="geared-pane__meta">
          {tokenCount !== undefined && (
            <span className="geared-pane__tokens">{tokenCount.toLocaleString()} tok</span>
          )}
          {savings && (
            <span className="geared-pane__savings">{savings}</span>
          )}
        </span>
      </div>
      <textarea
        className="geared-pane__textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    </div>
  )
}
