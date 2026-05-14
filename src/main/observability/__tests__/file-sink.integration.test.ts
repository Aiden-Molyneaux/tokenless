import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileSink } from '../file-sink'
import type { LogRecord } from '@shared/observability'

function makeRecord(overrides: Partial<LogRecord> = {}): LogRecord {
  return {
    id: 'test-id',
    ts: Date.now(),
    severity: 'info',
    category: 'observability',
    event: 'test-event',
    message: 'test message',
    context: {},
    fingerprint: 'abc123',
    source: 'main',
    ...overrides
  }
}

describe('FileSink', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tl-filesink-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates the log dir if missing', () => {
    const subDir = join(tmpDir, 'logs', 'nested')
    new FileSink(subDir)
    expect(readdirSync(join(tmpDir, 'logs')).length).toBeGreaterThanOrEqual(1)
  })

  it('writes a JSONL line per record to the current-day file', () => {
    const fixedDate = new Date('2026-05-14T10:00:00Z')
    const sink = new FileSink(tmpDir, 30, () => fixedDate)
    sink.write(makeRecord({ event: 'first' }))
    sink.write(makeRecord({ event: 'second' }))

    const files = readdirSync(tmpDir)
    expect(files).toEqual(['tokenless-2026-05-14.jsonl'])

    const contents = readFileSync(join(tmpDir, 'tokenless-2026-05-14.jsonl'), 'utf8')
    const lines = contents.trim().split('\n')
    expect(lines.length).toBe(2)
    const parsed = lines.map((l) => JSON.parse(l))
    expect(parsed[0].event).toBe('first')
    expect(parsed[1].event).toBe('second')
  })

  it('rotates to a new file when the date changes', () => {
    let now = new Date('2026-05-14T23:00:00Z')
    const sink = new FileSink(tmpDir, 30, () => now)
    sink.write(makeRecord({ event: 'late-on-14' }))

    now = new Date('2026-05-15T01:00:00Z')
    sink.write(makeRecord({ event: 'early-on-15' }))

    const files = readdirSync(tmpDir).sort()
    expect(files).toEqual([
      'tokenless-2026-05-14.jsonl',
      'tokenless-2026-05-15.jsonl'
    ])
  })

  it('prunes files older than retentionDays at rotation time', () => {
    // Seed with an old file
    const oldFile = join(tmpDir, 'tokenless-2026-04-01.jsonl')
    writeFileSync(oldFile, '{"event":"old"}\n')
    // Backdate its mtime to ~60 days ago
    const sixtyDaysAgo = new Date('2026-03-15T00:00:00Z')
    const fs = require('node:fs') as typeof import('node:fs')
    fs.utimesSync(oldFile, sixtyDaysAgo, sixtyDaysAgo)

    let now = new Date('2026-05-14T23:00:00Z')
    const sink = new FileSink(tmpDir, 30, () => now)
    sink.write(makeRecord({ event: 'still-on-14' }))

    // Cross a date boundary to trigger pruning
    now = new Date('2026-05-15T00:30:00Z')
    sink.write(makeRecord({ event: 'on-15' }))

    const files = readdirSync(tmpDir)
    expect(files).not.toContain('tokenless-2026-04-01.jsonl')
    expect(files).toContain('tokenless-2026-05-14.jsonl')
    expect(files).toContain('tokenless-2026-05-15.jsonl')
  })
})
