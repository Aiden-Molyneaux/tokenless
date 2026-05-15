import { describe, it, expect } from 'vitest'

import { GearingEngine } from '../../gearing/engine'
import { MockAnthropicClient } from '../../../../test/doubles/mock-anthropic-client'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function loadFixture(name: string): { response?: unknown; error?: unknown } {
  const raw = readFileSync(join(process.cwd(), 'test/fixtures/api', name), 'utf8')
  return JSON.parse(raw)
}

describe('gearing/engine', () => {
  it('happy path: builds request, calls client, parses response, computes cost', async () => {
    const fx = loadFixture('gear-simple.json') as { response: { text: string; inputTokens: number; outputTokens: number; stopReason: string; model: string } }
    const client = new MockAnthropicClient({
      '*': { response: fx.response }
    })
    const engine = new GearingEngine(client)
    const result = await engine.gear({
      originalPrompt: 'Could you please take a look at the auth middleware...',
      configs: { model: 'sonnet', breadth: 'normal', format: 'prose', skill: null }
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.gearedPrompt).toContain('Refactor src/auth/middleware.ts')
    expect(result.data.critiqueFlags.length).toBeGreaterThan(0)
    expect(result.data.tokenBreakdown.haikuInputTokens).toBe(fx.response.inputTokens)
    expect(result.data.tokenBreakdown.haikuOutputTokens).toBe(fx.response.outputTokens)
    expect(result.data.costPreview.expectedDollars).toBeGreaterThan(0)
    expect(result.data.costPreview.haikuMetaDollars).toBeGreaterThan(0)
  })

  it('propagates API errors as IpcResult-shaped failures', async () => {
    const client = new MockAnthropicClient({
      '*': { error: { code: 'API_AUTH_FAILED', message: 'bad key' } }
    })
    const engine = new GearingEngine(client)
    const result = await engine.gear({
      originalPrompt: 'foo',
      configs: { model: 'haiku', breadth: 'normal', format: 'prose', skill: null }
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('API_AUTH_FAILED')
  })

  it('returns GEAR_PARSE_FAILED when Haiku returns junk', async () => {
    const client = new MockAnthropicClient({
      '*': {
        response: {
          text: 'sorry I cannot help with that',
          inputTokens: 100,
          outputTokens: 10,
          stopReason: 'end_turn',
          model: 'claude-3-5-haiku-latest'
        }
      }
    })
    const engine = new GearingEngine(client)
    const result = await engine.gear({
      originalPrompt: 'foo',
      configs: { model: 'haiku', breadth: 'normal', format: 'prose', skill: null }
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('GEAR_PARSE_FAILED')
  })
})
