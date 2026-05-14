import { describe, it, expect } from 'vitest'

import { classifyError } from '../../api/client'

// classifyError unit tests — the retry loop itself is tested via integration
// (engine.integration.test.ts uses a MockAnthropicClient that DOESN'T inherit
// AnthropicClient's retry behavior, so the retry loop is tested implicitly
// only here). For Phase 5A this is acceptable; Phase 5B may add a retry
// integration test against a stubbed SDK if flakes arise.

describe('api/client classifyError', () => {
  it('maps HTTP 401 to API_AUTH_FAILED', () => {
    const err = { status: 401, message: 'invalid x-api-key' }
    expect(classifyError(err).code).toBe('API_AUTH_FAILED')
  })

  it('maps HTTP 429 to API_RATE_LIMITED', () => {
    expect(classifyError({ status: 429, message: 'rate limit' }).code).toBe('API_RATE_LIMITED')
  })

  it('maps HTTP 500-599 to API_SERVER_ERROR', () => {
    expect(classifyError({ status: 500, message: 'oops' }).code).toBe('API_SERVER_ERROR')
    expect(classifyError({ status: 503, message: 'unavail' }).code).toBe('API_SERVER_ERROR')
    expect(classifyError({ status: 599, message: 'edge' }).code).toBe('API_SERVER_ERROR')
  })

  it('maps APIConnectionTimeoutError to API_TIMEOUT', () => {
    expect(classifyError({ name: 'APIConnectionTimeoutError', message: 't/o' }).code).toBe('API_TIMEOUT')
  })

  it('maps APIConnectionError to API_NETWORK_DOWN', () => {
    expect(classifyError({ name: 'APIConnectionError', message: 'enotfound' }).code).toBe('API_NETWORK_DOWN')
  })

  it('falls back to API_UNKNOWN for anything else', () => {
    expect(classifyError(new Error('weird')).code).toBe('API_UNKNOWN')
    expect(classifyError({ status: 418, message: "I'm a teapot" }).code).toBe('API_UNKNOWN')
  })
})
