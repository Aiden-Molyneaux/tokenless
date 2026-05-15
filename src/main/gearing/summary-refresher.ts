// SummaryRefresher — per-conversation debounced Haiku call to update
// conversations.summary after a response-complete event fires. Silent on
// failure per spec §7.2 row 6 (stale summary is OK).

import type { Database } from 'better-sqlite3'

import { AnthropicClientRegistry } from '../api'
import { PRICING, GEARING_MODEL } from '../api/pricing'
import { AccountsDao, ConversationsDao } from '../db'
import { Logger } from '../observability/logger'

// eslint-disable-next-line import/no-unresolved
import SUMMARY_PROMPT from './summary-prompt.md?raw'

export interface SummaryRefresherOptions {
  readonly db: Database
  readonly registry: AnthropicClientRegistry
  readonly logger: Logger
  readonly debounceMs?: number       // default 500
  readonly recentTurnsCount?: number // default 6
}

const DEFAULT_DEBOUNCE_MS = 500
const DEFAULT_RECENT_TURNS = 6
const SUMMARY_MAX_TOKENS = 250

interface TurnRow {
  role: string
  original_prompt: string | null
  response_text: string | null
}

export class SummaryRefresher {
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>()
  private readonly debounceMs: number
  private readonly recentTurnsCount: number

  constructor(private readonly opts: SummaryRefresherOptions) {
    this.debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS
    this.recentTurnsCount = opts.recentTurnsCount ?? DEFAULT_RECENT_TURNS
  }

  onResponseComplete(conversationId: number): void {
    const existing = this.timers.get(conversationId)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      this.timers.delete(conversationId)
      void this.refresh(conversationId)
    }, this.debounceMs)
    this.timers.set(conversationId, timer)
  }

  // Cancel all pending refreshes — called from uninstallAll on app shutdown.
  stop(): void {
    for (const t of this.timers.values()) clearTimeout(t)
    this.timers.clear()
  }

  private async refresh(conversationId: number): Promise<void> {
    const conv = ConversationsDao.getConversationById(this.opts.db, conversationId)
    if (!conv) return
    if (!conv.accountId) {
      this.opts.logger.warn('gearing', 'summary-refresh-no-account',
        'Conversation has no account — skipping summary refresh', { conversationId })
      return
    }
    const account = AccountsDao.getAccountById(this.opts.db, conv.accountId)
    if (!account) return
    const client = this.opts.registry.getClient(account)
    if (!client) {
      this.opts.logger.warn('gearing', 'summary-refresh-no-key',
        'Account has no API key — skipping summary refresh', { conversationId, accountLabel: account.label })
      return
    }

    const turns = this.opts.db
      .prepare<[number, number], TurnRow>(
        `SELECT role, original_prompt, response_text FROM turns
         WHERE conversation_id = ? ORDER BY id DESC LIMIT ?`
      )
      .all(conversationId, this.recentTurnsCount)
      .reverse() // chronological

    const turnsText = turns
      .map((t) => `### ${t.role}\n${t.role === 'user' ? t.original_prompt ?? '' : t.response_text ?? ''}`)
      .join('\n\n')
    const userPrompt =
      (conv.summary ? `## Prior summary\n\n${conv.summary}\n\n` : '') +
      `## Recent turns\n\n${turnsText}`

    const result = await client.complete({
      model: PRICING[GEARING_MODEL].apiModel,
      maxTokens: SUMMARY_MAX_TOKENS,
      system: SUMMARY_PROMPT,
      userPrompt
    })

    if (!result.ok) {
      this.opts.logger.warn('gearing', 'summary-refresh-failed', 'Background summary refresh failed', {
        conversationId,
        code: result.error.code
      })
      return
    }

    const newSummary = result.data.text.trim()
    ConversationsDao.updateConversation(this.opts.db, {
      id: conversationId,
      summary: newSummary
    })
    // Also bump summary_updated_at — the DAO's update doesn't touch that
    // column directly, so do it via raw SQL.
    this.opts.db
      .prepare('UPDATE conversations SET summary_updated_at = ? WHERE id = ?')
      .run(Date.now(), conversationId)

    this.opts.logger.info('gearing', 'summary-refresh-ok', 'Summary refreshed', {
      conversationId,
      summaryLength: newSummary.length,
      haikuInputTokens: result.data.inputTokens,
      haikuOutputTokens: result.data.outputTokens
    })
  }
}
