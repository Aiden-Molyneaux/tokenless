import { useState } from 'react'
import type { LogRecord } from '@shared/observability'
import { Filters, applyFilters, emptyFilterState } from './Filters'
import { LogTable } from './LogTable'
import { useLogRecords } from './use-log-records'
import { MOCK_RECORDS } from './mock-records'
import { useFeedbackSummary } from '../../hooks/use-turns'
import './styles.css'

interface DevModePanelProps {
  // If true, seed the panel with MOCK_RECORDS instead of (or in addition to)
  // the live stream. Phase 1B uses this for visual development; E2E tests pass
  // mockOnly when they want to drive the panel purely with mocks.
  useMockRecords?: boolean
  mockOnly?: boolean
}

export function DevModePanel({ useMockRecords = false, mockOnly = false }: DevModePanelProps): JSX.Element {
  const records = useLogRecords({
    mockRecords: useMockRecords ? MOCK_RECORDS : [],
    mockOnly
  })
  const [filters, setFilters] = useState(emptyFilterState)
  const visible = applyFilters(records, filters) as readonly LogRecord[]
  const feedbackSummary = useFeedbackSummary()

  return (
    <div className="dev-mode-panel">
      <div className="dev-mode-panel__header">
        <h2 className="dev-mode-panel__title">Developer Mode</h2>
        <span className="dev-mode-panel__count">
          {visible.length} / {records.length} records
        </span>
      </div>
      <Filters state={filters} onChange={setFilters} />
      <LogTable records={visible} />
      {feedbackSummary && (
        <div className="dev-mode-panel__feedback-summary">
          <span>Feedback:</span>
          <span>👍 {feedbackSummary.up}</span>
          <span>·</span>
          <span>👎 {feedbackSummary.down}</span>
          <span>·</span>
          <span>🤷 {feedbackSummary.shrug}</span>
          <span>·</span>
          <span>❓ {feedbackSummary.unrated} unrated</span>
        </div>
      )}
    </div>
  )
}
