// AnthropicClientRegistry — resolves an AnthropicClient per Account. Caches
// instances by (accountId, apiKey) so that key rotation produces a fresh
// client. Phase 6A: one Logger shared across all clients (per-account loggers
// could come in Phase 8 polish if observability per account becomes useful).

import type { Account } from '@shared/types/accounts'

import { AnthropicClient } from './client'
import type { AnthropicClientLike } from './types'
import { Logger } from '../observability/logger'

type ClientFactory = (apiKey: string, logger: Logger) => AnthropicClientLike

export class AnthropicClientRegistry {
  private readonly cache = new Map<string, AnthropicClientLike>()
  private readonly factory: ClientFactory

  constructor(private readonly logger: Logger, factory?: ClientFactory) {
    this.factory = factory ?? ((apiKey, logger) => new AnthropicClient({ apiKey, logger }))
  }

  getClient(account: Account): AnthropicClientLike | null {
    if (!account.apiKey) return null
    const key = `${account.id}|${account.apiKey}`
    const cached = this.cache.get(key)
    if (cached) return cached
    const client = this.factory(account.apiKey, this.logger)
    this.cache.set(key, client)
    return client
  }

  // Clear cache entries for an accountId — call when an account is deleted or
  // its key changes (Phase 6B may use this when account edit lands).
  invalidate(accountId: number): void {
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(`${accountId}|`)) {
        this.cache.delete(key)
      }
    }
  }
}
