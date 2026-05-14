import { useMemo, useState } from 'react'
import type { LogRecord } from '@shared/observability'
import { LogTableRow } from './LogTableRow'

interface LogTableProps {
  records: readonly LogRecord[]
}

type SortKey = 'ts' | 'severity' | 'category' | 'event' | 'source'
type SortDir = 'asc' | 'desc'

const SEVERITY_RANK: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4
}

function compare(a: LogRecord, b: LogRecord, key: SortKey, dir: SortDir): number {
  let cmp = 0
  if (key === 'ts') cmp = a.ts - b.ts
  else if (key === 'severity') cmp = (SEVERITY_RANK[a.severity] ?? 0) - (SEVERITY_RANK[b.severity] ?? 0)
  else cmp = String(a[key]).localeCompare(String(b[key]))
  return dir === 'asc' ? cmp : -cmp
}

export function LogTable({ records }: LogTableProps): JSX.Element {
  const [sortKey, setSortKey] = useState<SortKey>('ts')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const sorted = useMemo(() => {
    return [...records].sort((a, b) => compare(a, b, sortKey, sortDir))
  }, [records, sortKey, sortDir])

  const handleHeader = (key: SortKey): void => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const arrow = (key: SortKey): string => {
    if (key !== sortKey) return ''
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  return (
    <div className="log-table-wrap">
      <table className="log-table">
        <thead>
          <tr>
            <th onClick={() => handleHeader('ts')}>TS{arrow('ts')}</th>
            <th onClick={() => handleHeader('severity')}>Severity{arrow('severity')}</th>
            <th onClick={() => handleHeader('category')}>Category{arrow('category')}</th>
            <th onClick={() => handleHeader('event')}>Event{arrow('event')}</th>
            <th onClick={() => handleHeader('source')}>Source{arrow('source')}</th>
            <th>Message</th>
            <th>Context</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <LogTableRow key={r.id} record={r} />
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <p className="log-table__empty">No records match the current filters.</p>
      )}
    </div>
  )
}
