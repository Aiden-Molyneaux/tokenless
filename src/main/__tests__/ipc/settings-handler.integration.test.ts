import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { SettingsHandler } from '../../ipc/settings-handler'
import { Logger } from '../../observability/logger'

function makeLogger(): Logger {
  return new Logger(
    { write: vi.fn(), append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100, 'main'
  )
}

describe('ipc/settings-handler', () => {
  let db: Database
  let handler: SettingsHandler

  beforeEach(() => {
    db = createTestDb()
    handler = new SettingsHandler(db, makeLogger())
  })

  it('get returns null for unknown key', async () => {
    const r = await handler.get({ key: 'nope' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.value).toBeNull()
  })

  it('set persists; get reads it back', async () => {
    await handler.set({ key: 'theme', value: 'dark' })
    const r = await handler.get({ key: 'theme' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.value).toBe('dark')
  })
})
