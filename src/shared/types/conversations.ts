// Public Conversation shape that crosses the IPC boundary.

import type { ModelHint, BreadthHint, FormatHint } from './projects'

export type ConversationStatus = 'active' | 'ended'

export interface Conversation {
  readonly id: number
  readonly projectId: number
  readonly accountId: number | null
  readonly title: string | null
  readonly model: ModelHint | null
  readonly breadth: BreadthHint | null
  readonly format: FormatHint | null
  readonly status: ConversationStatus
  readonly createdAt: number
  readonly updatedAt: number
  readonly endedAt: number | null
  readonly archivedAt: number | null
}

export interface CreateConversationInput {
  readonly projectId: number
  readonly accountId?: number | null
  readonly title?: string | null
  readonly model?: ModelHint | null
  readonly breadth?: BreadthHint | null
  readonly format?: FormatHint | null
}

export interface UpdateConversationInput {
  readonly id: number
  readonly title?: string | null
  readonly status?: ConversationStatus
}
