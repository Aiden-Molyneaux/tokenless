import { randomUUID } from 'node:crypto'
import type { Logger } from '../observability/logger'
import type { Category } from '@shared/observability'
import type { IpcResult } from '@shared/ipc/envelope'

/**
 * Adapter that wraps async functions to convert success/failure into IpcResult envelopes.
 *
 * Success: { ok: true, data: T }
 * Failure (INTERNAL_ERROR): { ok: false, error: { message, code: 'INTERNAL_ERROR', logId } }
 * Failure (NOT_FOUND): { ok: false, error: { message, code: 'NOT_FOUND', logId } }
 *
 * To signal NOT_FOUND, throw an Error with a `.code` property set to 'NOT_FOUND':
 *   const e = new Error('Project not found') as Error & { code?: string }
 *   e.code = 'NOT_FOUND'
 *   throw e
 */
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
    const code = (err as { code?: string }).code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_ERROR'
    const stack = err instanceof Error ? err.stack : undefined

    // NOT_FOUND is a warn, INTERNAL_ERROR is an error
    if (code === 'NOT_FOUND') {
      logger.warn(category, event, message, { logId })
    } else {
      logger.error(category, event, message, { errorString: String(err), logId }, stack)
    }

    return { ok: false, error: { message, code, logId } }
  }
}
