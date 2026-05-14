import { randomUUID } from 'node:crypto'
import type { Logger } from '../observability/logger'
import type { Category } from '@shared/observability'
import type { IpcResult } from '@shared/ipc/envelope'

/**
 * Adapter that wraps async functions to convert success/failure into IpcResult envelopes.
 *
 * Success: { ok: true, data: T }
 * Failure (business code): { ok: false, error: { message, code: '<UPPER_SNAKE_CASE>', logId } }
 * Failure (unknown):       { ok: false, error: { message, code: 'INTERNAL_ERROR', logId } }
 *
 * Any error whose `.code` property matches /^[A-Z][A-Z0-9_]*$/ is treated as a
 * business-level error (logged at warn). Everything else is INTERNAL_ERROR (logged at error).
 *
 * Examples:
 *   const e = new Error('Project not found') as Error & { code?: string }
 *   e.code = 'NOT_FOUND'        // → business warn
 *   e.code = 'CLAUDE_NOT_FOUND' // → business warn
 */
const BUSINESS_CODE_RE = /^[A-Z][A-Z0-9_]*$/

export async function withIpcResult<T>(
  logger: Logger,
  category: Category,
  event: string,
  fn: () => Promise<T> | T
): Promise<IpcResult<T>> {
  try {
    const data = await fn()
    return { ok: true, data }
  } catch (err) {
    const logId = randomUUID()
    const message = err instanceof Error ? err.message : String(err)
    const rawCode = (err as { code?: string }).code
    const isBusinessCode = typeof rawCode === 'string' && BUSINESS_CODE_RE.test(rawCode)
    const code = isBusinessCode ? rawCode : 'INTERNAL_ERROR'
    const stack = err instanceof Error ? err.stack : undefined

    // Business codes are warn, INTERNAL_ERROR is error
    if (isBusinessCode) {
      logger.warn(category, event, message, { logId })
    } else {
      logger.error(category, event, message, { errorString: String(err), logId }, stack)
    }

    return { ok: false, error: { message, code, logId } }
  }
}
