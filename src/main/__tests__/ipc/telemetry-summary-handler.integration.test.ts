import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { TelemetrySummaryHandler } from '../../ipc/telemetry-summary-handler'
import { TurnsDao, AccountsDao, ProjectsDao, ConversationsDao } from '../../db'
import { Logger } from '../../observability/logger'

function makeLogger(): Logger {
  return new Logger(
    { write: vi.fn(), append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100,
    'main'
  )
}

const FAKE_PRICING = (model: string): { inputPerMillion: number; outputPerMillion: number } | null => {
  if (model === 'sonnet') return { inputPerMillion: 1, outputPerMillion: 5 }
  if (model === 'haiku') return { inputPerMillion: 0.5, outputPerMillion: 2.5 }
  return null
}

describe('ipc/telemetry-summary-handler', () => {
  let db: Database
  let handler: TelemetrySummaryHandler

  beforeEach(() => {
    db = createTestDb()
    handler = new TelemetrySummaryHandler(db, makeLogger(), FAKE_PRICING, 'haiku')
  })

  it('getSummary returns all-zero summary for an empty table', async () => {
    const r = await handler.getSummary({ sinceMs: null })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.summary.haikuCostDollars).toBe(0)
      expect(r.data.summary.spendDollars).toBe(0)
      expect(r.data.summary.netSavingsDollars).toBe(0)
      expect(r.data.summary.byModel).toEqual([])
    }
  })

  it('getSummary returns non-zero numbers after seeding turns', async () => {
    const acc = AccountsDao.createAccount(db, { label: 'P', configDir: '/p', apiKey: 'sk-test' })
    const pr = ProjectsDao.createProject(db, { name: 'X', rootPath: '/x', defaultAccountId: acc.id })
    const conv = ConversationsDao.createConversation(db, { projectId: pr.id, accountId: acc.id })
    // v2: only user turns exist (assistant turns are gone). Telemetry captures
    // gearing cost (haiku meta tokens) + input savings (original vs geared tokens).
    TurnsDao.createUserTurn(db, {
      conversationId: conv.id,
      originalPrompt: 'q',
      modelUsed: 'sonnet',
      gearMeta: {
        originalPrompt: 'q',
        gearedPrompt: 'g',
        originalTokens: 200_000,
        gearedTokens: 100_000,
        haikuMetaTokens: 1_000_000,
        critiqueFlags: []
      }
    })
    const r = await handler.getSummary({ sinceMs: null })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const s = r.data.summary
      // haikuCostDollars = 1_000_000 * (0.5 / 1_000_000) = 0.5
      expect(s.haikuCostDollars).toBeCloseTo(0.5, 5)
      // spendDollars: geared input = 100_000 tokens at sonnet input rate (1 / 1M) = 0.1
      expect(s.spendDollars).toBeCloseTo(0.1, 5)
      // grossSavingsDollars: (200_000 - 100_000) * (1 / 1M) = 0.1
      expect(s.grossSavingsDollars).toBeCloseTo(0.1, 5)
      // netSavingsDollars: grossSavings - haikuCost = 0.1 - 0.5 = -0.4
      expect(s.netSavingsDollars).toBeCloseTo(-0.4, 5)
      expect(s.byModel).toHaveLength(1)
      expect(s.byModel[0].model).toBe('sonnet')
    }
  })
})
