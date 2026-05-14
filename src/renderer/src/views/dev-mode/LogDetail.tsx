import type { LogRecord } from '@shared/observability'

interface LogDetailProps {
  record: LogRecord
}

// Renders a single log record as pretty-printed JSON for the expanded row view.
// Includes a "Copy as JSONL" button for sharing.

export function LogDetail({ record }: LogDetailProps): JSX.Element {
  const json = JSON.stringify(record, null, 2)
  const jsonl = JSON.stringify(record)

  const handleCopyJsonl = (): void => {
    void navigator.clipboard.writeText(jsonl)
  }

  return (
    <div className="log-detail">
      <div className="log-detail__actions">
        <button className="log-detail__copy" type="button" onClick={handleCopyJsonl}>
          Copy as JSONL
        </button>
      </div>
      <pre className="log-detail__json">{json}</pre>
    </div>
  )
}
