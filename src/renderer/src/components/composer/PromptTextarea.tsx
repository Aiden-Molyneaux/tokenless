interface PromptTextareaProps {
  value: string
  onChange: (next: string) => void
  placeholder?: string
}

// Controlled textarea for the composer. No special behavior in Phase 2B —
// just value + onChange. Phase 7 adds draft auto-save (debounced) via
// the IPC bridge to SQLite.

export function PromptTextarea({ value, onChange, placeholder }: PromptTextareaProps): JSX.Element {
  return (
    <textarea
      className="prompt-textarea"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? 'Type your prompt here...'}
      spellCheck={false}
    />
  )
}
