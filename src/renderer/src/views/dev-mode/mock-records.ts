import type { Category, LogRecord, Severity, Source } from '@shared/observability'

// Mock log records for visual development and E2E testing of the Dev Mode panel.
// Not used in production — the live IPC stream provides real records.

function makeMockRecord(
  severity: Severity,
  category: Category,
  event: string,
  message: string,
  context: Record<string, unknown> = {},
  source: Source = 'main',
  tsOffsetSec = 0
): LogRecord {
  return {
    id: `mock-${event}-${tsOffsetSec}`,
    ts: Date.now() - tsOffsetSec * 1000,
    severity,
    category,
    event,
    message,
    context,
    fingerprint: `mock${event.slice(0, 8)}`,
    source
  }
}

export const MOCK_RECORDS: readonly LogRecord[] = [
  makeMockRecord('info', 'observability', 'logger-online', 'Logger initialized', { logDir: '~/.tokenless/logs' }, 'main', 30),
  makeMockRecord('info', 'observability', 'app-ready', 'Electron ready, creating window', {}, 'main', 28),
  makeMockRecord('debug', 'ipc', 'handler-registered', 'log:event-from-renderer registered', {}, 'main', 27),
  makeMockRecord('info', 'ui', 'mount', 'App mounted', { version: '0.0.1' }, 'renderer', 26),
  makeMockRecord('warn', 'api', 'retry', '429 from Anthropic — retrying', { attempt: 1 }, 'main', 18),
  makeMockRecord('warn', 'api', 'retry', '429 from Anthropic — retrying', { attempt: 2 }, 'main', 17),
  makeMockRecord('error', 'api', 'retry-exhausted', 'Anthropic 429 after 3 attempts', { model: 'haiku-4-5', conversation_id: 7 }, 'main', 16),
  makeMockRecord('info', 'gearing', 'gear-start', 'Gearing turn 42', { breadth: 'terse', model: 'opus' }, 'main', 12),
  makeMockRecord('info', 'gearing', 'gear-complete', 'Geared in 412ms', { savedTokens: 1200 }, 'main', 8),
  makeMockRecord('error', 'fs', 'permission-denied', 'EACCES reading ~/.claude/skills/', { path: '~/.claude/skills/' }, 'main', 4)
]
