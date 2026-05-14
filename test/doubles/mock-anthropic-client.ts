// MockAnthropicClient — implements AnthropicClientLike using a static
// fixture map. Tests construct it with the fixtures they need; calls that
// don't match a fixture throw an explicit "no fixture" error so test gaps
// are loud.

import type { AnthropicClientLike, ApiError, MessageRequest, MessageResponse, Result } from '../../src/main/api/types'

export interface MockFixture {
  readonly response?: MessageResponse
  readonly error?: ApiError
}

export class MockAnthropicClient implements AnthropicClientLike {
  private readonly fixtures: Map<string, MockFixture>
  readonly calls: MessageRequest[] = []

  constructor(fixtures: Record<string, MockFixture> = {}) {
    this.fixtures = new Map(Object.entries(fixtures))
  }

  async complete(request: MessageRequest): Promise<Result<MessageResponse, ApiError>> {
    this.calls.push(request)
    const key = this.keyFor(request)
    const fx = this.fixtures.get(key) ?? this.fixtures.get('*')
    if (!fx) {
      throw new Error(`MockAnthropicClient: no fixture for key="${key}". Available keys: ${[...this.fixtures.keys()].join(', ')}`)
    }
    if (fx.error) return { ok: false, error: fx.error }
    if (fx.response) return { ok: true, data: fx.response }
    throw new Error('MockAnthropicClient fixture must have response or error')
  }

  private keyFor(request: MessageRequest): string {
    // Lightweight signature: model + first 60 chars of system + first 60 chars of user.
    // Adjust if collisions become a problem.
    const sysPrefix = request.system.slice(0, 60).replace(/\s+/g, ' ')
    const usrPrefix = request.userPrompt.slice(0, 60).replace(/\s+/g, ' ')
    return `${request.model}|${sysPrefix}|${usrPrefix}`
  }
}
