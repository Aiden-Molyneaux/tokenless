// Public Draft shape that crosses the IPC boundary.

export interface Draft {
  readonly id: number
  readonly conversationId: number   // Phase 7A only persists drafts for active conversations
  readonly body: string
  readonly updatedAt: number
}
