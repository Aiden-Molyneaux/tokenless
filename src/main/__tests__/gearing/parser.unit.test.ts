import { describe, it, expect } from 'vitest'

import { parseGearResponse } from '../../gearing/parser'

describe('gearing/parser', () => {
  it('parses a well-formed JSON response', () => {
    const text = JSON.stringify({
      geared_prompt: 'Refactor X.',
      critique_flags: [{ severity: 'info', message: 'compact' }],
      rationale: 'trimmed filler'
    })
    const result = parseGearResponse(text)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.gearedPrompt).toBe('Refactor X.')
      expect(result.data.critiqueFlags).toEqual([{ severity: 'info', message: 'compact' }])
    }
  })

  it('strips surrounding code fences if the LLM adds them', () => {
    const text =
      '```json\n' +
      JSON.stringify({ geared_prompt: 'p', critique_flags: [], rationale: 'r' }) +
      '\n```'
    const result = parseGearResponse(text)
    expect(result.ok).toBe(true)
  })

  it('accepts an empty critique_flags array', () => {
    const text = JSON.stringify({ geared_prompt: 'p', critique_flags: [], rationale: 'r' })
    const result = parseGearResponse(text)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.critiqueFlags).toEqual([])
  })

  it('returns GEAR_PARSE_FAILED on invalid JSON', () => {
    const result = parseGearResponse('not json at all')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('GEAR_PARSE_FAILED')
  })

  it('returns GEAR_PARSE_FAILED on missing required keys', () => {
    const text = JSON.stringify({ geared_prompt: 'p' /* missing critique_flags, rationale */ })
    const result = parseGearResponse(text)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('GEAR_PARSE_FAILED')
  })

  it('returns GEAR_PARSE_FAILED on invalid critique_flag severity', () => {
    const text = JSON.stringify({
      geared_prompt: 'p',
      critique_flags: [{ severity: 'fatal', message: 'oops' }], // invalid severity
      rationale: 'r'
    })
    const result = parseGearResponse(text)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('GEAR_PARSE_FAILED')
  })
})
