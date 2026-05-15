import { describe, it, expect, vi } from 'vitest'

import { AnthropicClient, classifyError } from '../../api/client'
import { Logger } from '../../observability/logger'

// classifyError unit tests — the retry loop itself is tested via integration
// (engine.integration.test.ts uses a MockAnthropicClient that DOESN'T inherit
// AnthropicClient's retry behavior, so the retry loop is tested implicitly
// only here). Phase 5B adds explicit retry-loop tests via fake SDK injection.

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

function makeSpyLogger(): Logger {
  return new Logger(
    { write: vi.fn(), append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100,
    'main'
  )
}

describe('api/client retry loop', () => {
  function makeClient(opts: { sdk: { messages: { create: ReturnType<typeof vi.fn> } } }): AnthropicClient {
    const c = new AnthropicClient({
      apiKey: 'sk-test',
      maxRetries: 3,
      baseBackoffMs: 1,
      delay: async () => undefined,
      logger: makeSpyLogger()
    })
    // Inject a fake SDK to exercise the retry loop without hitting the real API
    ;(c as unknown as { sdk: typeof opts.sdk }).sdk = opts.sdk
    return c
  }

  it('retries on 429 then succeeds', async () => {
    const create = vi.fn()
      .mockRejectedValueOnce({ status: 429, message: 'rate' })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn',
        model: 'haiku'
      })
    const c = makeClient({ sdk: { messages: { create } } })
    const result = await c.complete({ model: 'haiku', maxTokens: 100, system: 's', userPrompt: 'u' })
    expect(result.ok).toBe(true)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('retries on 5xx then surfaces the final error after exhausting attempts', async () => {
    const create = vi.fn().mockRejectedValue({ status: 503, message: 'unavail' })
    const c = makeClient({ sdk: { messages: { create } } })
    const result = await c.complete({ model: 'haiku', maxTokens: 100, system: 's', userPrompt: 'u' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('API_SERVER_ERROR')
    expect(create).toHaveBeenCalledTimes(3)
  })

  it('does NOT retry on 401', async () => {
    const create = vi.fn().mockRejectedValue({ status: 401, message: 'bad' })
    const c = makeClient({ sdk: { messages: { create } } })
    const result = await c.complete({ model: 'haiku', maxTokens: 100, system: 's', userPrompt: 'u' })
    expect(result.ok).toBe(false)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry on network errors', async () => {
    const create = vi.fn().mockRejectedValue({ name: 'APIConnectionError', message: 'enotfound' })
    const c = makeClient({ sdk: { messages: { create } } })
    const result = await c.complete({ model: 'haiku', maxTokens: 100, system: 's', userPrompt: 'u' })
    expect(result.ok).toBe(false)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('emits api-retry-attempt log entry per retry', async () => {
    const create = vi.fn()
      .mockRejectedValueOnce({ status: 429, message: 'rate' })
      .mockRejectedValueOnce({ status: 429, message: 'rate' })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 5, output_tokens: 5 },
        stop_reason: 'end_turn',
        model: 'haiku'
      })
    const spyLogger = makeSpyLogger()
    const warnSpy = vi.spyOn(spyLogger, 'warn')
    const c = new AnthropicClient({
      apiKey: 'sk-test',
      maxRetries: 3,
      baseBackoffMs: 1,
      delay: async () => undefined,
      logger: spyLogger
    })
    ;(c as unknown as { sdk: { messages: { create: typeof create } } }).sdk = { messages: { create } }
    await c.complete({ model: 'haiku', maxTokens: 100, system: 's', userPrompt: 'u' })
    expect(warnSpy).toHaveBeenCalledWith(
      'api',
      'api-retry-attempt',
      expect.any(String),
      expect.objectContaining({ attempt: expect.any(Number), code: 'API_RATE_LIMITED' })
    )
    expect(warnSpy).toHaveBeenCalledTimes(2) // 2 retries before success
  })
})
