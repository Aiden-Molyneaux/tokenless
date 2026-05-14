import { useState } from 'react'
import type { LogRecord } from '@shared/observability'
import { LogDetail } from './LogDetail'

interface LogTableRowProps {
  record: LogRecord
}

function formatTs(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number, w: number = 2): string => String(n).padStart(w, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

function summarizeContext(ctx: Record<string, unknown>): string {
  const entries = Object.entries(ctx)
  if (entries.length === 0) return ''
  const parts: string[] = []
  for (const [k, v] of entries) {
    parts.push(`${k}: ${typeof v === 'string' ? `"${v}"` : JSON.stringify(v)}`)
    if (parts.join(', ').length > 80) break
  }
  return `{ ${parts.join(', ')}${entries.length > parts.length ? ', …' : ''} }`
}

export function LogTableRow({ record }: LogTableRowProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  return (
    <>
      <tr
        className={`log-row log-row--${record.severity} log-row--source-${record.source}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="log-row__ts">{formatTs(record.ts)}</td>
        <td className="log-row__severity">{record.severity}</td>
        <td className="log-row__category">{record.category}</td>
        <td className="log-row__event">{record.event}</td>
        <td className="log-row__source">{record.source}</td>
        <td className="log-row__message">{record.message}</td>
        <td className="log-row__context">{summarizeContext(record.context)}</td>
      </tr>
      {expanded && (
        <tr className="log-row-detail">
          <td colSpan={7}>
            <LogDetail record={record} />
          </td>
        </tr>
      )}
    </>
  )
}
