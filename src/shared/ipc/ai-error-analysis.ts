import type { IpcResult } from './envelope'

export const IPC_AI_ANALYZE_ERROR = 'ai:analyze-error'

export interface AiAnalyzeErrorRequest {
  // The LogRecord.id of the error row the user clicked Analyze on.
  readonly errorRecordId: string
  // Optional: account to use for the Haiku call. If omitted, the handler
  // resolves the "active" account by listing all accounts and picking the
  // first with a non-null apiKey. (Phase 8A keeps this simple; Phase 8B
  // could accept activeAccountId from the renderer state.)
  readonly accountId?: number | null
}

export interface AiAnalyzeErrorResponse {
  // Plain-text analysis from Haiku (≤200 words).
  readonly analysis: string
}

export type AiAnalyzeErrorResult = IpcResult<AiAnalyzeErrorResponse>
