import { describe, it, expect } from 'vitest'

import { buildGearRequest } from '../../gearing/builder'

describe('gearing/builder', () => {
  const baseConfigs = { model: 'sonnet', breadth: 'normal', format: 'prose', skill: null }

  it('uses the haiku model identifier for the gearing call (not the user-selected model)', () => {
    const req = buildGearRequest({
      originalPrompt: 'Refactor X',
      configs: { ...baseConfigs, model: 'opus' }
    })
    // The user's selected model (opus) goes INTO the prompt context, not as the
    // gearing-call model. The gearing call itself is always Haiku.
    expect(req.model).toBe('claude-haiku-4-5-20251001')
  })

  it('embeds the user prompt as the user message', () => {
    const req = buildGearRequest({
      originalPrompt: 'Refactor src/x.ts',
      configs: baseConfigs
    })
    expect(req.userPrompt).toContain('Refactor src/x.ts')
  })

  it('includes the configs in the user message so the system prompt knows breadth/format', () => {
    const req = buildGearRequest({
      originalPrompt: 'foo',
      configs: { model: 'sonnet', breadth: 'terse', format: 'bullets', skill: null }
    })
    expect(req.userPrompt).toMatch(/breadth.*terse/i)
    expect(req.userPrompt).toMatch(/format.*bullets/i)
  })

  it('sets a reasonable maxTokens for the Haiku response', () => {
    const req = buildGearRequest({ originalPrompt: 'foo', configs: baseConfigs })
    // Haiku response is JSON containing geared prompt + flags — typically
    // 200-600 tokens. Cap at 2000 to leave headroom for verbose gearings.
    expect(req.maxTokens).toBeGreaterThanOrEqual(1000)
    expect(req.maxTokens).toBeLessThanOrEqual(4000)
  })

  it('includes the system prompt template in the request', () => {
    const req = buildGearRequest({ originalPrompt: 'foo', configs: baseConfigs })
    expect(req.system).toContain('TokenLess')
    expect(req.system).toContain('JSON')
  })
})
