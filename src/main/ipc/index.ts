// Single registration point for all IPC handlers. The DB-backed handlers
// receive the live Database connection from main/index.ts.

import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'

import type { IpcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import type { Logger } from '@main/observability'
import * as pty from 'node-pty'

import { TurnsDao } from '@main/db'

import { IPC_CC_EVENT, IPC_CC_CRASHED, IPC_CC_HUNG } from '@shared/ipc/cc'
import { IPC_TELEMETRY_TICK } from '@shared/ipc/telemetry'
import { IPC_API_RETRY_ATTEMPT, type ApiRetryAttemptPayload } from '@shared/ipc/api-events'
import { TelemetryEmitter } from '@main/cc/telemetry-emitter'
import { LogBridge, type Broadcast } from './log-bridge'
import { AccountsHandler } from './accounts-handler'
import { ProjectsHandler } from './projects-handler'
import { ConversationsHandler } from './conversations-handler'
import { CcHandler } from './cc-handler'
import { DraftsHandler } from './drafts-handler'
import { SettingsHandler } from './settings-handler'
import { PathsHandler } from './paths-handler'
import { CcLifecycle } from '@main/cc'
import type { PtySpawnFn, PtyHandle } from '@main/cc'
import { AnthropicClientRegistry } from '@main/api'
import { SummaryRefresher } from '@main/gearing/summary-refresher'
import { GearingHandler } from './gearing-handler'
import { reconcile, type ReconcileResult } from '@main/skills/reconciler'
import { scanSkillsRoots } from '@main/skills/scanner'
import { resolveSkillsRoots } from '@main/skills/roots'
import { SkillsWatcher } from '@main/skills/watcher'
import { SkillsHandler } from './skills-handler'

export interface IpcRegistration {
  logBridge: LogBridge
  accountsHandler: AccountsHandler
  projectsHandler: ProjectsHandler
  conversationsHandler: ConversationsHandler
  ccHandler: CcHandler
  ccLifecycle: CcLifecycle
  gearingHandler: GearingHandler
  draftsHandler: DraftsHandler
  settingsHandler: SettingsHandler
  pathsHandler: PathsHandler
  skillsHandler: SkillsHandler
  skillsWatcher: SkillsWatcher
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
  clientRegistry: AnthropicClientRegistry
): IpcRegistration {
  const logBridge = new LogBridge(logger, ipcMain, broadcast)
  logBridge.install()

  const accountsHandler = new AccountsHandler(db, logger, broadcast, clientRegistry)
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
    db, registry: clientRegistry, logger
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
    },
    onAssistantTurn: ({ conversationId, text, responseTokens }) => {
      try {
        TurnsDao.createAssistantTurn(db, {
          conversationId,
          responseText: text,
          responseTokens,
          modelUsed: null  // model not tracked per response yet — Phase 8 may add
        })
      } catch (err) {
        logger.error('db', 'assistant-turn-write-failed', err instanceof Error ? err.message : String(err), {
          conversationId,
          errorString: String(err)
        })
      }
    }
  })
  const ccHandler = new CcHandler(db, logger, ccLifecycle)
  ccHandler.install(ipcMain)

  const gearingHandler = new GearingHandler(db, logger, clientRegistry)
  gearingHandler.install(ipcMain)

  const draftsHandler = new DraftsHandler(db, logger)
  draftsHandler.install(ipcMain)

  const settingsHandler = new SettingsHandler(db, logger)
  settingsHandler.install(ipcMain)

  const pathsHandler = new PathsHandler(logger)
  pathsHandler.install(ipcMain)

  // Skills subsystem — user + plugin roots only this phase; project-local
  // scanning lands when Phase 7 wires active-project tracking through here.
  const skillsRoots = resolveSkillsRoots(homedir(), null)

  const skillsRescan = async (): Promise<ReconcileResult> => {
    try {
      const discovered = await scanSkillsRoots(skillsRoots, null)
      return reconcile(db, discovered, Date.now())
    } catch (err) {
      logger.error('skill', 'skills-rescan-failed', err instanceof Error ? err.message : String(err), {
        errorString: String(err)
      })
      throw err
    }
  }

  const skillsHandler = new SkillsHandler(db, logger, broadcast, skillsRescan)
  skillsHandler.install(ipcMain)

  const skillsBroadcast: (event: 'skills:changed', payload?: undefined) => void =
    (event) => broadcast(event, undefined)

  const skillsWatcher = new SkillsWatcher({
    roots: skillsRoots,
    scan: async () => {
      try {
        await skillsRescan()
      } catch {
        // Already logged inside skillsRescan; swallow so the watcher keeps running.
      }
    },
    broadcast: skillsBroadcast
  })
  skillsWatcher.start()
  logger.info('skill', 'skills-watcher-started', 'Skills filesystem watcher started', {
    roots: skillsRoots
  })

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
    draftsHandler,
    settingsHandler,
    pathsHandler,
    skillsHandler,
    skillsWatcher,
    uninstallAll: () => {
      logBridge.uninstall()
      accountsHandler.uninstall(ipcMain)
      projectsHandler.uninstall(ipcMain)
      conversationsHandler.uninstall(ipcMain)
      ccHandler.uninstall(ipcMain)
      ccLifecycle.closeAll()
      telemetryEmitter.stop()
      gearingHandler.uninstall(ipcMain)
      draftsHandler.uninstall(ipcMain)
      settingsHandler.uninstall(ipcMain)
      pathsHandler.uninstall(ipcMain)
      void skillsWatcher.stop().then(() => {
        logger.info('skill', 'skills-watcher-stopped', 'Skills filesystem watcher stopped')
      })
      skillsHandler.uninstall(ipcMain)
      summaryRefresher.stop()
      unsubscribeRetryBroadcast()
    }
  }
}
