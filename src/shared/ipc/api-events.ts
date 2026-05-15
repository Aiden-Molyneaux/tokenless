// Broadcast main → renderer for api-retry-attempt visibility (Phase 5B).
// Phase 5C wires a renderer banner to this so the user sees "Retrying… (2/3)"
// during a 429/5xx storm.

export const IPC_API_RETRY_ATTEMPT = 'api:retry-attempt'

export interface ApiRetryAttemptPayload {
  readonly attempt: number
  readonly maxRetries: number
  readonly code: 'API_RATE_LIMITED' | 'API_SERVER_ERROR'
  readonly backoffMs: number
  readonly model: string
}
