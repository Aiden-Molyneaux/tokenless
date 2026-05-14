import type { MockConversation } from '../../mocks/conversations'
import { ConversationListItem } from './ConversationListItem'

interface ConversationListProps {
  conversations: readonly MockConversation[]
  activeId: string | null
  onSelect: (id: string) => void
}

export function ConversationList({ conversations, activeId, onSelect }: ConversationListProps): JSX.Element {
  if (conversations.length === 0) {
    return (
      <p className="conversation-list__empty">
        No conversations yet. Click "+ New Conversation" to start one.
      </p>
    )
  }
  return (
    <ul className="conversation-list">
      {conversations.map((c) => (
        <ConversationListItem
          key={c.id}
          conversation={c}
          isActive={c.id === activeId}
          onSelect={onSelect}
        />
      ))}
    </ul>
  )
}
