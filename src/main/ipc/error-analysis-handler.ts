import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Database } from 'better-sqlite3'

import { AccountsDao } from '../db'
import type { AnthropicClientRegistry } from '../api/client-registry'
import { PRICING } from '../api/pricing'
import { Logger } from '../observability/logger'
import type { LogRecord } from '@shared/observability'
import { withIpcResult } from './with-ipc-result'

import {
  IPC_AI_ANALYZE_ERROR,
  type AiAnalyzeErrorRequest,
  type AiAnalyzeErrorResult
} from '@shared/ipc/ai-error-analysis'

// How many records before the target error to include as context.
const CONTEXT_WINDOW = 20

const SYSTEM_PROMPT = [
  'You are debugging a TokenLess error.',
  'Given the log record + the most recent records before it, identify:',
  '  1. The most likely root cause',
  '  2. The smallest fix that would resolve it',
  '  3. Any related issues to watch for',
  'Respond in ≤200 words, plain text (no markdown headings or code fences).',
  'Be specific — cite log fields (event names, context keys) where useful.'
].join('\n')

interface ErrWithCode extends Error { code?: string }
function tagged(message: string, code: string): ErrWithCode {
  const e = new Error(message) as ErrWithCode
  e.code = code
  return e
}

export class ErrorAnalysisHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
    private readonly clientRegistry: AnthropicClientRegistry
  ) {}

  analyzeError = async (req: AiAnalyzeErrorRequest): Promise<AiAnalyzeErrorResult> =>
    withIpcResult(this.logger, 'api', 'error-analysis', async () => {
      // Resolve account: explicit ID, else first account with an apiKey.
      let account = req.accountId != null
        ? AccountsDao.getAccountById(this.db, req.accountId)
        : null
      if (!account) {
        const all = AccountsDao.listAccounts(this.db)
        account = all.find((a) => a.apiKey !== null) ?? null
      }
      if (!account || !account.apiKey) {
        throw tagged('No account with an API key configured', 'API_AUTH_FAILED')
      }

      // Resolve the error record + context from the ring buffer.
      const recent = this.logger.getRecent(5000)
      const targetIdx = recent.findIndex((r) => r.id === req.errorRecordId)
      const target = targetIdx >= 0 ? recent[targetIdx] : null
      if (!target) {
        throw tagged(`No log record with id ${req.errorRecordId}`, 'NOT_FOUND')
      }
      const contextStart = Math.max(0, targetIdx - CONTEXT_WINDOW)
      const contextRecords = recent.slice(contextStart, targetIdx)

      // Build the user prompt: error JSON + context JSON.
      const userPrompt = [
        '## Target error',
        JSON.stringify(redactRecord(target), null, 2),
        '',
        '## Recent records (most recent first; up to 20 records before the error)',
        JSON.stringify(contextRecords.slice().reverse().map(redactRecord), null, 2)
      ].join('\n')

      const client = this.clientRegistry.getClient(account)
      if (!client) {
        throw tagged('Could not initialize Haiku client', 'API_AUTH_FAILED')
      }

      const haikuModel = PRICING.haiku.apiModel
      const result = await client.complete({
        model: haikuModel,
        maxTokens: 600,
        system: SYSTEM_PROMPT,
        userPrompt
      })
      if (!result.ok) {
        throw tagged(result.error.message, result.error.code)
      }
      return { analysis: result.data.text }
    })

  install(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_AI_ANALYZE_ERROR, async (_e: IpcMainInvokeEvent, req: AiAnalyzeErrorRequest) =>
      this.analyzeError(req)
    )
    this.installedHandlers.push(IPC_AI_ANALYZE_ERROR)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}

// Strip fields that shouldn't be shipped to the API: stack traces (often
// contain absolute paths), apiKey-like strings if any leaked into context,
// log IDs that don't add diagnostic value.
function redactRecord(r: LogRecord): Partial<LogRecord> {
  return {
    ts: r.ts,
    severity: r.severity,
    category: r.category,
    event: r.event,
    message: r.message,
    context: r.context,
    source: r.source
  }
}
