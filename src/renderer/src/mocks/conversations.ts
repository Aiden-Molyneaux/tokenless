// Mock conversations for visual development of the ConversationSidebar.
// Phase 3 replaces with real conversations from SQLite via IPC.

export type MockConversationModel = 'opus' | 'sonnet' | 'haiku'

export interface MockConversation {
  id: string
  projectId: string
  title: string
  model: MockConversationModel
  updatedAt: number
}

const now = Date.now()
const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export const MOCK_CONVERSATIONS: readonly MockConversation[] = [
  { id: 'conv-1', projectId: 'proj-tokenless', title: 'Refactor auth middleware', model: 'opus', updatedAt: now - 30 * MIN },
  { id: 'conv-2', projectId: 'proj-tokenless', title: 'Add Dev Mode keyboard a11y', model: 'sonnet', updatedAt: now - 2 * HOUR },
  { id: 'conv-3', projectId: 'proj-tokenless', title: 'Scaffold E2E tests', model: 'haiku', updatedAt: now - 1 * DAY },
  { id: 'conv-4', projectId: 'proj-website', title: 'Hero copy variations', model: 'opus', updatedAt: now - 3 * DAY },
  { id: 'conv-5', projectId: 'proj-website', title: 'Footer redesign', model: 'sonnet', updatedAt: now - 5 * DAY },
  { id: 'conv-6', projectId: 'proj-cad', title: 'Investigate map rendering bug', model: 'opus', updatedAt: now - 10 * DAY }
]
