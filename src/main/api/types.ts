import type { GearErrorCode } from '@shared/types/gearing'

export interface MessageRequest {
  readonly model: string       // API model identifier (e.g. 'claude-3-5-haiku-latest')
  readonly maxTokens: number
  readonly system: string
  readonly userPrompt: string
  // Future: tools, stop sequences, etc. Phase 5A keeps it minimal.
}

export interface MessageResponse {
  readonly text: string                    // Joined text from content blocks
  readonly inputTokens: number             // From response.usage.input_tokens
  readonly outputTokens: number            // From response.usage.output_tokens
  readonly stopReason: string | null       // 'end_turn' | 'max_tokens' | etc.
  readonly model: string                   // Echoed back; may differ from request if claude picked a fallback
}

export interface ApiError {
  readonly code: GearErrorCode
  readonly message: string
  readonly cause?: unknown
}

export type Result<T, E> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: E }

// Test seam — production wires Anthropic SDK; tests wire MockAnthropicClient.
export interface AnthropicClientLike {
  complete(request: MessageRequest): Promise<Result<MessageResponse, ApiError>>
}
