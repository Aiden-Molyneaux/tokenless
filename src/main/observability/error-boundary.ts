import type { Category } from './types'
import type { Logger } from './logger'

// errorBoundary wraps a sync function: if it throws, the throw is caught,
// logged, and undefined is returned. The caller decides whether to surface
// the failure or fall back to a default.
//
// asyncErrorBoundary is the same for async functions.
//
// Returning undefined (instead of rethrowing) is a deliberate choice: every
// call site is forced to handle the absence-of-result case explicitly, which
// in practice catches the "I forgot the error path existed" bug class.

export function errorBoundary<T>(
  logger: Logger,
  category: Category,
  event: string,
  fn: () => T
): T | undefined {
  try {
    return fn()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    logger.error(category, event, message, { errorString: String(err) }, stack)
    return undefined
  }
}

export async function asyncErrorBoundary<T>(
  logger: Logger,
  category: Category,
  event: string,
  fn: () => Promise<T>
): Promise<T | undefined> {
  try {
    return await fn()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    logger.error(category, event, message, { errorString: String(err) }, stack)
    return undefined
  }
}
