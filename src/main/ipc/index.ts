// Single registration point for all IPC handlers. The DB-backed handlers
// receive the live Database connection from main/index.ts.

import { randomUUID } from 'node:crypto'

import type { IpcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import type { Logger } from '@main/observability'
import * as pty from 'node-pty'

import { IPC_CC_EVENT, IPC_CC_CRASHED, IPC_CC_HUNG } from '@shared/ipc/cc'
import { IPC_TELEMETRY_TICK } from '@shared/ipc/telemetry'
import { IPC_API_RETRY_ATTEMPT, type ApiRetryAttemptPayload } from '@shared/ipc/api-events'
import { TelemetryEmitter } from '@main/cc/telemetry-emitter'
import { LogBridge, type Broadcast } from './log-bridge'
import { AccountsHandler } from './accounts-handler'
import { ProjectsHandler } from './projects-handler'
import { ConversationsHandler } from './conversations-handler'
import { CcHandler } from './cc-handler'
import { CcLifecycle } from '@main/cc'
import type { PtySpawnFn, PtyHandle } from '@main/cc'
import type { AnthropicClientLike } from '@main/api'
import { GearingEngine } from '@main/gearing'
import { SummaryRefresher } from '@main/gearing/summary-refresher'
import { GearingHandler } from './gearing-handler'

export interface IpcRegistration {
  logBridge: LogBridge
  accountsHandler: AccountsHandler
  projectsHandler: ProjectsHandler
  conversationsHandler: ConversationsHandler
  ccHandler: CcHandler
  ccLifecycle: CcLifecycle
  gearingHandler: GearingHandler
  uninstallAll: () => void
}

// Production PtySpawnFn — adapter from our PtyHandle shape to node-pty's IPty.
// node-pty's IPty is structurally compatible; we just type-narrow.
const productionPtyFactory: PtySpawnFn = (binary, args, opts) =>
  pty.spawn(binary, args.slice(), opts) as PtyHandle

export function registerIpcHandlers(
  ipcMain: IpcMain,
  logger: Logger,
  broadcast: Broadcast,
  db: Database,
  anthropicClient: AnthropicClientLike
): IpcRegistration {
  const logBridge = new LogBridge(logger, ipcMain, broadcast)
  logBridge.install()

  const accountsHandler = new AccountsHandler(db, logger, broadcast)
  accountsHandler.install(ipcMain)

  const projectsHandler = new ProjectsHandler(db, logger, broadcast)
  projectsHandler.install(ipcMain)

  const conversationsHandler = new ConversationsHandler(db, logger, broadcast)
  conversationsHandler.install(ipcMain)

  const telemetryEmitter = new TelemetryEmitter({
    intervalMs: 3000,
    emit: (tick) => broadcast(IPC_TELEMETRY_TICK, { tick })
  })
  telemetryEmitter.start()

  const summaryRefresher = new SummaryRefresher({
    db, client: anthropicClient, logger
  })

  const ccLifecycle = new CcLifecycle(productionPtyFactory, {
    onChunk: (e) => broadcast('cc:output-chunk', e),
    onExit: (e) => {
      telemetryEmitter.removeConversation(e.conversationId)
      broadcast('cc:exit', e)
    },
    onEvent: (e) => {
      telemetryEmitter.handle(e)
      if (e.event.kind === 'response-complete') {
        summaryRefresher.onResponseComplete(e.conversationId)
      }
      broadcast(IPC_CC_EVENT, e)
    },
    onCrashed: (e) => {
      const logId = randomUUID()
      logger.error('cc', 'cc-crashed', `claude exited non-zero (code=${e.exitCode})`, {
        conversationId: e.conversationId,
        exitCode: e.exitCode,
        signal: e.signal,
        logId
      })
      broadcast(IPC_CC_CRASHED, { ...e, logId })
    },
    onHung: (e) => {
      logger.warn('cc', 'cc-hung', `claude idle for ${e.idleMs}ms (${e.severity})`, {
        conversationId: e.conversationId,
        idleMs: e.idleMs,
        severity: e.severity
      })
      broadcast(IPC_CC_HUNG, e)
    }
  })
  const ccHandler = new CcHandler(db, logger, ccLifecycle)
  ccHandler.install(ipcMain)

  const gearingEngine = new GearingEngine(anthropicClient)
  const gearingHandler = new GearingHandler(gearingEngine, logger)
  gearingHandler.install(ipcMain)

  // Subscribe to the Logger ring and re-broadcast api-retry-attempt records on
  // the dedicated IPC channel. This is ORTHOGONAL to LogBridge — same Logger,
  // different filter, different destination (Phase 5C's retry banner consumes it).
  const unsubscribeRetryBroadcast = logger.subscribe((record) => {
    if (record.category === 'api' && record.event === 'api-retry-attempt') {
      const ctx = record.context as {
        attempt: number
        maxRetries: number
        code: string
        backoffMs: number
        model: string
      }
      const payload: ApiRetryAttemptPayload = {
        attempt: ctx.attempt,
        maxRetries: ctx.maxRetries,
        code: ctx.code as 'API_RATE_LIMITED' | 'API_SERVER_ERROR',
        backoffMs: ctx.backoffMs,
        model: ctx.model
      }
      broadcast(IPC_API_RETRY_ATTEMPT, payload)
    }
  })

  return {
    logBridge,
    accountsHandler,
    projectsHandler,
    conversationsHandler,
    ccHandler,
    ccLifecycle,
    gearingHandler,
    uninstallAll: () => {
      logBridge.uninstall()
      accountsHandler.uninstall(ipcMain)
      projectsHandler.uninstall(ipcMain)
      conversationsHandler.uninstall(ipcMain)
      ccHandler.uninstall(ipcMain)
      ccLifecycle.closeAll()
      telemetryEmitter.stop()
      gearingHandler.uninstall(ipcMain)
      summaryRefresher.stop()
      unsubscribeRetryBroadcast()
    }
  }
}
