// Single registration point for all IPC handlers. The DB-backed handlers
// receive the live Database connection from main/index.ts.

import { homedir } from 'node:os'

import type { IpcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import type { Logger } from '@main/observability'

import { IPC_API_RETRY_ATTEMPT, type ApiRetryAttemptPayload } from '@shared/ipc/api-events'
import { LogBridge, type Broadcast } from './log-bridge'
import { AccountsHandler } from './accounts-handler'
import { ProjectsHandler } from './projects-handler'
import { ConversationsHandler } from './conversations-handler'
import { DraftsHandler } from './drafts-handler'
import { SettingsHandler } from './settings-handler'
import { PathsHandler } from './paths-handler'
import { AnthropicClientRegistry } from '@main/api'
import { GearingHandler } from './gearing-handler'
import { reconcile, type ReconcileResult } from '@main/skills/reconciler'
import { scanSkillsRoots } from '@main/skills/scanner'
import { resolveSkillsRoots } from '@main/skills/roots'
import { SkillsWatcher } from '@main/skills/watcher'
import { SkillsHandler } from './skills-handler'
import { TemplatesHandler } from './templates-handler'
import { TurnsHandler } from './turns-handler'
import { TelemetrySummaryHandler } from './telemetry-summary-handler'
import { pricingFor, PRICING } from '@main/api/pricing'
import { PricingHandler } from './pricing-handler'
import type { PricingEntry } from '@shared/ipc/pricing'
import { ErrorAnalysisHandler } from './error-analysis-handler'
import { CrashHandler } from './crash-handler'

export interface IpcRegistration {
  logBridge: LogBridge
  accountsHandler: AccountsHandler
  projectsHandler: ProjectsHandler
  conversationsHandler: ConversationsHandler
  gearingHandler: GearingHandler
  draftsHandler: DraftsHandler
  settingsHandler: SettingsHandler
  pathsHandler: PathsHandler
  skillsHandler: SkillsHandler
  templatesHandler: TemplatesHandler
  turnsHandler: TurnsHandler
  telemetrySummaryHandler: TelemetrySummaryHandler
  pricingHandler: PricingHandler
  errorAnalysisHandler: ErrorAnalysisHandler
  crashHandler: CrashHandler
  skillsWatcher: SkillsWatcher
  uninstallAll: () => void
}

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

  const gearingHandler = new GearingHandler(db, logger, clientRegistry)
  gearingHandler.install(ipcMain)

  const draftsHandler = new DraftsHandler(db, logger)
  draftsHandler.install(ipcMain)

  const settingsHandler = new SettingsHandler(db, logger)
  settingsHandler.install(ipcMain)

  const pathsHandler = new PathsHandler(logger)
  pathsHandler.install(ipcMain)

  const turnsHandler = new TurnsHandler(db, logger, broadcast)
  turnsHandler.install(ipcMain)

  const templatesHandler = new TemplatesHandler(db, logger, broadcast)
  templatesHandler.install(ipcMain)

  const telemetrySummaryHandler = new TelemetrySummaryHandler(
    db, logger,
    (model) => pricingFor(model) ?? null,
    'haiku'
  )
  telemetrySummaryHandler.install(ipcMain)

  const pricingProvider = (): readonly PricingEntry[] =>
    Object.entries(PRICING).map(([key, p]) => ({
      key,
      apiModel: p.apiModel,
      displayName: p.displayName,
      description: p.description,
      inputPerMillion: p.inputPerMillion,
      outputPerMillion: p.outputPerMillion
    }))

  const pricingHandler = new PricingHandler(logger, pricingProvider)
  pricingHandler.install(ipcMain)

  const errorAnalysisHandler = new ErrorAnalysisHandler(db, logger, clientRegistry)
  errorAnalysisHandler.install(ipcMain)

  const crashHandler = new CrashHandler(logger, broadcast)
  crashHandler.install(ipcMain)
  crashHandler.installUncaughtHandlers()

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
    gearingHandler,
    draftsHandler,
    settingsHandler,
    pathsHandler,
    turnsHandler,
    templatesHandler,
    telemetrySummaryHandler,
    pricingHandler,
    errorAnalysisHandler,
    crashHandler,
    skillsHandler,
    skillsWatcher,
    uninstallAll: () => {
      logBridge.uninstall()
      accountsHandler.uninstall(ipcMain)
      projectsHandler.uninstall(ipcMain)
      conversationsHandler.uninstall(ipcMain)
      gearingHandler.uninstall(ipcMain)
      draftsHandler.uninstall(ipcMain)
      settingsHandler.uninstall(ipcMain)
      pathsHandler.uninstall(ipcMain)
      turnsHandler.uninstall(ipcMain)
      templatesHandler.uninstall(ipcMain)
      telemetrySummaryHandler.uninstall(ipcMain)
      pricingHandler.uninstall(ipcMain)
      errorAnalysisHandler.uninstall(ipcMain)
      crashHandler.uninstall(ipcMain)
      void skillsWatcher.stop().then(() => {
        logger.info('skill', 'skills-watcher-stopped', 'Skills filesystem watcher stopped')
      })
      skillsHandler.uninstall(ipcMain)
      unsubscribeRetryBroadcast()
    }
  }
}
