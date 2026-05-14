import type { Conversation } from '@shared/types/conversations'
import { ConversationListItem } from './ConversationListItem'

interface ConversationListProps {
  conversations: readonly Conversation[]
  activeId: number | null
  onSelect: (id: number) => void
}

export function ConversationList({ conversations, activeId, onSelect }: ConversationListProps): JSX.Element {
  if (conversations.length === 0) {
    return <p className="conversation-list__empty">No conversations yet.</p>
  }
  return (
    <ul className="conversation-list" role="list">
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
