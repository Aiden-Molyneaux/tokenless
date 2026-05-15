// AnthropicClient — wraps @anthropic-ai/sdk with transparent retry for
// 429/5xx + typed-error classification. Returns Result<MessageResponse, ApiError>
// so callers don't see raw SDK throws.
//
// Retry policy: exponential backoff with jitter. Base 500ms, factor 2, max 3
// attempts. Network/auth/unknown errors are not retried.
//
// Optional Logger injection (Phase 5B): emits api-retry-attempt per retry
// attempt and api-retry-exhausted when all retries are exhausted.

import Anthropic from '@anthropic-ai/sdk'

import type { Logger } from '../observability/logger'
import type { AnthropicClientLike, ApiError, MessageRequest, MessageResponse, Result } from './types'

interface AnthropicClientOptions {
  readonly apiKey: string
  readonly maxRetries?: number    // default 3
  readonly baseBackoffMs?: number // default 500
  readonly timeoutMs?: number     // default 30_000
  // Test seam — production omits this; tests inject a fake delay function.
  readonly delay?: (ms: number) => Promise<void>
  readonly logger?: Logger
}

const DEFAULT_OPTS = {
  maxRetries: 3,
  baseBackoffMs: 500,
  timeoutMs: 30_000
}

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class AnthropicClient implements AnthropicClientLike {
  private readonly sdk: Anthropic
  private readonly maxRetries: number
  private readonly baseBackoffMs: number
  private readonly delay: (ms: number) => Promise<void>
  private readonly logger: Logger | null

  constructor(opts: AnthropicClientOptions) {
    this.sdk = new Anthropic({ apiKey: opts.apiKey, timeout: opts.timeoutMs ?? DEFAULT_OPTS.timeoutMs })
    this.maxRetries = opts.maxRetries ?? DEFAULT_OPTS.maxRetries
    this.baseBackoffMs = opts.baseBackoffMs ?? DEFAULT_OPTS.baseBackoffMs
    this.delay = opts.delay ?? defaultDelay
    this.logger = opts.logger ?? null
  }

  async complete(request: MessageRequest): Promise<Result<MessageResponse, ApiError>> {
    let lastError: ApiError | null = null
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.sdk.messages.create({
          model: request.model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: [{ role: 'user', content: request.userPrompt }]
        })
        const text = response.content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
        return {
          ok: true,
          data: {
            text,
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            stopReason: response.stop_reason ?? null,
            model: response.model
          }
        }
      } catch (err) {
        lastError = classifyError(err)
        const isRetryable = lastError.code === 'API_RATE_LIMITED' || lastError.code === 'API_SERVER_ERROR'
        // Retryable only if it's a server / rate-limit AND we have attempts left
        if (isRetryable && attempt < this.maxRetries) {
          const backoff = this.baseBackoffMs * Math.pow(2, attempt - 1)
          const jitter = Math.random() * backoff * 0.3
          const sleepMs = backoff + jitter
          this.logger?.warn('api', 'api-retry-attempt', 'Anthropic API retry', {
            attempt,
            maxRetries: this.maxRetries,
            code: lastError.code,
            backoffMs: Math.round(sleepMs),
            model: request.model
          })
          await this.delay(sleepMs)
          continue
        }
        // Retryable error but attempts exhausted — emit the exhaustion record
        if (isRetryable) {
          this.logger?.error('api', 'api-retry-exhausted', 'Anthropic API retries exhausted', {
            finalCode: lastError.code,
            attempts: this.maxRetries,
            model: request.model
          })
        }
        return { ok: false, error: lastError }
      }
    }
    return { ok: false, error: lastError ?? { code: 'API_UNKNOWN', message: 'no attempts made' } }
  }
}

export function classifyError(err: unknown): ApiError {
  const e = err as { status?: number; message?: string; name?: string }
  const status = e?.status
  const message = e?.message ?? String(err)

  if (status === 401) return { code: 'API_AUTH_FAILED', message, cause: err }
  if (status === 429) return { code: 'API_RATE_LIMITED', message, cause: err }
  if (typeof status === 'number' && status >= 500 && status < 600) {
    return { code: 'API_SERVER_ERROR', message, cause: err }
  }
  // Anthropic SDK wraps fetch errors in APIConnectionError / APIConnectionTimeoutError
  if (e?.name === 'APIConnectionTimeoutError') return { code: 'API_TIMEOUT', message, cause: err }
  if (e?.name === 'APIConnectionError') return { code: 'API_NETWORK_DOWN', message, cause: err }
  // Fallback for anything unrecognized
  return { code: 'API_UNKNOWN', message, cause: err }
}
