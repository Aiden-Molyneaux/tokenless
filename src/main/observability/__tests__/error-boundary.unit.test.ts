import { describe, expect, it, vi } from 'vitest'
import { asyncErrorBoundary, errorBoundary } from '../error-boundary'
import type { Logger } from '../logger'

function fakeLogger() {
  const calls: Array<{ category: string; event: string; message: string; stack?: string }> = []
  const logger = {
    error: vi.fn((category: string, event: string, message: string, _context: object, stack?: string) => {
      calls.push({ category, event, message, stack })
    })
  } as unknown as Logger
  return { logger, calls }
}

describe('errorBoundary', () => {
  it('returns the function result when no throw', () => {
    const { logger } = fakeLogger()
    const result = errorBoundary(logger, 'observability', 'safe-op', () => 42)
    expect(result).toBe(42)
  })

  it('does not call logger.error when no throw', () => {
    const { logger, calls } = fakeLogger()
    errorBoundary(logger, 'observability', 'safe-op', () => 'ok')
    expect(calls.length).toBe(0)
  })

  it('returns undefined and logs when the function throws an Error', () => {
    const { logger, calls } = fakeLogger()
    const result = errorBoundary(logger, 'fs', 'read-file', () => {
      throw new Error('ENOENT: no such file')
    })
    expect(result).toBeUndefined()
    expect(calls.length).toBe(1)
    expect(calls[0].category).toBe('fs')
    expect(calls[0].event).toBe('read-file')
    expect(calls[0].message).toBe('ENOENT: no such file')
    expect(calls[0].stack).toBeDefined()
  })

  it('returns undefined and logs when the function throws a non-Error', () => {
    const { logger, calls } = fakeLogger()
    const result = errorBoundary(logger, 'api', 'parse-response', () => {
      throw 'string thrown directly'
    })
    expect(result).toBeUndefined()
    expect(calls.length).toBe(1)
    expect(calls[0].message).toBe('string thrown directly')
  })
})

describe('asyncErrorBoundary', () => {
  it('awaits and returns the resolved value', async () => {
    const { logger } = fakeLogger()
    const result = await asyncErrorBoundary(logger, 'api', 'fetch', async () => 'data')
    expect(result).toBe('data')
  })

  it('returns undefined and logs when the promise rejects with an Error', async () => {
    const { logger, calls } = fakeLogger()
    const result = await asyncErrorBoundary(logger, 'api', 'fetch', async () => {
      throw new Error('network down')
    })
    expect(result).toBeUndefined()
    expect(calls.length).toBe(1)
    expect(calls[0].message).toBe('network down')
    expect(calls[0].stack).toBeDefined()
  })

  it('returns undefined and logs when the promise rejects with a non-Error', async () => {
    const { logger, calls } = fakeLogger()
    const result = await asyncErrorBoundary(logger, 'api', 'fetch', async () => {
      throw { code: 500 }
    })
    expect(result).toBeUndefined()
    expect(calls[0].message).toBe('[object Object]')
  })
})
