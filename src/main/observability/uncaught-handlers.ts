import type { Logger } from './logger'

// Installs process-level handlers for uncaught exceptions and unhandled
// promise rejections. Both route through the Logger.
//
// uncaughtException is treated as 'fatal' because the process is in an
// unknown state. unhandledRejection is 'error' because Node's behavior
// preserves the process for now (though that's changing in newer Node).
//
// This function should be called once, early in the main process startup,
// AFTER the Logger has been constructed but BEFORE any other code that
// might throw asynchronously.

export function installUncaughtHandlers(logger: Logger): void {
  process.on('uncaughtException', (err) => {
    logger.fatal(
      'observability',
      'uncaught-exception',
      err.message,
      { name: err.name },
      err.stack
    )
  })

  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : undefined
    logger.error(
      'observability',
      'unhandled-rejection',
      message,
      { reasonString: String(reason) },
      stack
    )
  })
}
