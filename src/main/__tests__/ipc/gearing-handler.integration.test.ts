import { describe, it, expect, beforeEach, vi } from 'vitest'

import { GearingHandler } from '../../ipc/gearing-handler'
import { GearingEngine } from '../../gearing/engine'
import { MockAnthropicClient } from '../../../../test/doubles/mock-anthropic-client'
import { Logger } from '../../observability/logger'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function loadFixture(name: string): { response: { text: string; inputTokens: number; outputTokens: number; stopReason: string; model: string } } {
  return JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/api', name), 'utf8'))
}

function makeLogger(): Logger {
  return new Logger(
    { write: vi.fn(), append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100,
    'main'
  )
}

describe('ipc/gearing-handler', () => {
  let engine: GearingEngine
  let handler: GearingHandler

  beforeEach(() => {
    const fx = loadFixture('gear-simple.json')
    const client = new MockAnthropicClient({ '*': { response: fx.response } })
    engine = new GearingEngine(client)
    handler = new GearingHandler(engine, makeLogger())
  })

  it('gear returns the GearResult envelope', async () => {
    const result = await handler.gear({
      conversationId: 1,
      originalPrompt: 'Refactor the auth middleware',
      configs: { model: 'sonnet', breadth: 'normal', format: 'prose', skill: null }
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.result.gearedPrompt).toContain('Refactor')
      expect(result.data.result.costPreview.expectedDollars).toBeGreaterThan(0)
    }
  })

  it('propagates API errors through the IpcResult envelope', async () => {
    const errClient = new MockAnthropicClient({
      '*': { error: { code: 'API_AUTH_FAILED', message: 'bad key' } }
    })
    const errEngine = new GearingEngine(errClient)
    const errHandler = new GearingHandler(errEngine, makeLogger())
    const result = await errHandler.gear({
      conversationId: 1,
      originalPrompt: 'x',
      configs: { model: 'haiku', breadth: 'normal', format: 'prose', skill: null }
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('API_AUTH_FAILED')
  })
})
