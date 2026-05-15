import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { SummaryRefresher } from '../../gearing/summary-refresher'
import { MockAnthropicClient } from '../../../../test/doubles/mock-anthropic-client'
import { createTestDb } from '../../../../test/doubles/test-db'
import { Logger } from '../../observability/logger'
import { AccountsDao, ProjectsDao, ConversationsDao } from '../../db'

import type { Database } from 'better-sqlite3'

function makeLogger(): Logger {
  return new Logger(
    { write: vi.fn(), append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100,
    'main'
  )
}

describe('gearing/summary-refresher', () => {
  // Purpose: verify SummaryRefresher debounces rapid events, writes summaries on
  // success, silently logs on failure, and maintains independent timers per conversation.
  let db: Database
  let conversationId: number

  beforeEach(() => {
    vi.useFakeTimers()
    db = createTestDb()
    const accountId = AccountsDao.createAccount(db, { label: 'P', configDir: '/p' }).id
    const projectId = ProjectsDao.createProject(db, { name: 'P', rootPath: '/x', defaultAccountId: accountId }).id
    conversationId = ConversationsDao.createConversation(db, { projectId, accountId }).id
    // Seed a couple of turns for the summary call
    db.prepare(
      `INSERT INTO turns (conversation_id, role, original_prompt, response_text, status, sent_at)
       VALUES (?, 'user', 'do something', NULL, 'complete', ?)`
    ).run(conversationId, Date.now() - 1000)
    db.prepare(
      `INSERT INTO turns (conversation_id, role, response_text, status, sent_at)
       VALUES (?, 'assistant', 'done.', 'complete', ?)`
    ).run(conversationId, Date.now())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces rapid response-complete events into a single Haiku call', async () => {
    const client = new MockAnthropicClient({
      '*': {
        response: {
          text: 'A summary line.',
          inputTokens: 50,
          outputTokens: 20,
          stopReason: 'end_turn',
          model: 'claude-3-5-haiku-latest'
        }
      }
    })
    const refresher = new SummaryRefresher({
      db, client, logger: makeLogger(), debounceMs: 500, recentTurnsCount: 6
    })
    refresher.onResponseComplete(conversationId)
    refresher.onResponseComplete(conversationId)
    refresher.onResponseComplete(conversationId)
    await vi.advanceTimersByTimeAsync(500)
    // Allow the async flush to complete
    await vi.runAllTimersAsync()
    expect(client.calls).toHaveLength(1)
  })

  it('writes the new summary to conversations.summary on success', async () => {
    const client = new MockAnthropicClient({
      '*': {
        response: {
          text: 'User refactoring auth. Claude flattened conditionals.',
          inputTokens: 80,
          outputTokens: 12,
          stopReason: 'end_turn',
          model: 'claude-3-5-haiku-latest'
        }
      }
    })
    const refresher = new SummaryRefresher({
      db, client, logger: makeLogger(), debounceMs: 500, recentTurnsCount: 6
    })
    refresher.onResponseComplete(conversationId)
    await vi.advanceTimersByTimeAsync(500)
    await vi.runAllTimersAsync()

    const conv = ConversationsDao.getConversationById(db, conversationId)
    expect(conv?.summary).toBe('User refactoring auth. Claude flattened conditionals.')
    expect(conv?.summaryUpdatedAt).not.toBeNull()
  })

  it('silently logs and does not throw when the API call fails', async () => {
    const client = new MockAnthropicClient({
      '*': { error: { code: 'API_AUTH_FAILED', message: 'bad key' } }
    })
    const logger = makeLogger()
    const warnSpy = vi.spyOn(logger, 'warn')
    const refresher = new SummaryRefresher({
      db, client, logger, debounceMs: 500, recentTurnsCount: 6
    })
    refresher.onResponseComplete(conversationId)
    await vi.advanceTimersByTimeAsync(500)
    await vi.runAllTimersAsync()

    expect(warnSpy).toHaveBeenCalledWith('gearing', 'summary-refresh-failed', expect.any(String), expect.any(Object))
    // The conversation's summary should still be null (untouched)
    const conv = ConversationsDao.getConversationById(db, conversationId)
    expect(conv?.summary).toBeNull()
  })

  it('multiple conversations get independent debounce timers', async () => {
    const client = new MockAnthropicClient({
      '*': {
        response: {
          text: 'summary',
          inputTokens: 10,
          outputTokens: 5,
          stopReason: 'end_turn',
          model: 'claude-3-5-haiku-latest'
        }
      }
    })
    const refresher = new SummaryRefresher({
      db, client, logger: makeLogger(), debounceMs: 500, recentTurnsCount: 6
    })
    const accountId = AccountsDao.createAccount(db, { label: 'Q', configDir: '/q' }).id
    const projectId2 = ProjectsDao.createProject(db, { name: 'P2', rootPath: '/y', defaultAccountId: accountId }).id
    const conv2 = ConversationsDao.createConversation(db, { projectId: projectId2, accountId }).id

    refresher.onResponseComplete(conversationId)
    refresher.onResponseComplete(conv2)
    await vi.advanceTimersByTimeAsync(500)
    await vi.runAllTimersAsync()

    expect(client.calls).toHaveLength(2)
  })
})
