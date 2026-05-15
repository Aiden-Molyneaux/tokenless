import type { LogRecord } from '@shared/observability'
import { useErrorAnalysis } from '../../hooks/use-error-analysis'

interface LogDetailProps {
  record: LogRecord
}

// Renders a single log record as pretty-printed JSON for the expanded row view.
// Includes a "Copy as JSONL" button for sharing.
// For error/fatal rows, also shows an "Analyze with AI" button that calls
// Haiku with the record + recent context and displays the response inline.

export function LogDetail({ record }: LogDetailProps): JSX.Element {
  const json = JSON.stringify(record, null, 2)
  const jsonl = JSON.stringify(record)
  const { analysis, loading, error: analysisError, analyze } = useErrorAnalysis()

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
      {(record.severity === 'error' || record.severity === 'fatal') && (
        <div className="log-detail__analyze">
          <button
            type="button"
            className="log-detail__analyze-button"
            disabled={loading}
            onClick={() => void analyze(record.id)}
          >
            {loading ? 'Analyzing…' : 'Analyze with AI'}
          </button>
          {analysisError && <p className="log-detail__analyze-error">{analysisError}</p>}
          {analysis && (
            <div className="log-detail__analyze-result">
              <h4>AI analysis</h4>
              <p>{analysis}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
