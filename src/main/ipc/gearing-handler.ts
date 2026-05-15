import type { Database } from 'better-sqlite3'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'

import { GearingEngine } from '../gearing'
import { AnthropicClientRegistry } from '../api'
import { AccountsDao, ConversationsDao } from '../db'
import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'

import {
  IPC_GEARING_GEAR,
  type GearingGearRequest,
  type GearingGearResult
} from '@shared/ipc/gearing'

interface ErrWithCode extends Error { code?: string }
function tagged(message: string, code: string): ErrWithCode {
  const e = new Error(message) as ErrWithCode
  e.code = code
  return e
}

export class GearingHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
    private readonly registry: AnthropicClientRegistry
  ) {}

  gear = async (req: GearingGearRequest): Promise<GearingGearResult> =>
    withIpcResult(this.logger, 'gearing', 'gearing-gear', async () => {
      // Resolve the account: prefer conversation.accountId; fall back to
      // request.accountId; fail if neither.
      let accountId: number | null = null
      if (req.conversationId !== null) {
        const conv = ConversationsDao.getConversationById(this.db, req.conversationId)
        accountId = conv?.accountId ?? null
      }
      if (accountId === null) accountId = req.accountId ?? null
      if (accountId === null) {
        throw tagged('No account specified for gearing call', 'API_AUTH_FAILED')
      }
      const account = AccountsDao.getAccountById(this.db, accountId)
      if (!account) {
        throw tagged(`Account ${accountId} not found`, 'NOT_FOUND')
      }
      const client = this.registry.getClient(account)
      if (!client) {
        throw tagged(
          `Account "${account.label}" has no API key configured`,
          'API_AUTH_FAILED'
        )
      }

      const engine = new GearingEngine(client)
      const result = await engine.gear({
        originalPrompt: req.originalPrompt,
        configs: req.configs
      })
      if (!result.ok) {
        throw tagged(result.error.message, result.error.code)
      }
      this.logger.info('gearing', 'gearing-gear-ok', 'Gearing succeeded', {
        accountLabel: account.label,
        conversationId: req.conversationId,
        haikuInputTokens: result.data.tokenBreakdown.haikuInputTokens,
        haikuOutputTokens: result.data.tokenBreakdown.haikuOutputTokens,
        gearedInputEstimate: result.data.tokenBreakdown.gearedInputEstimate,
        expectedDollars: result.data.costPreview.expectedDollars
      })
      return { result: result.data }
    })

  install(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_GEARING_GEAR, async (_e: IpcMainInvokeEvent, req: GearingGearRequest) =>
      this.gear(req)
    )
    this.installedHandlers.push(IPC_GEARING_GEAR)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
