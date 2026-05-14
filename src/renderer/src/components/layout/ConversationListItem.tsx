import type { MockConversation } from '../../mocks/conversations'

interface ConversationListItemProps {
  conversation: MockConversation
  isActive: boolean
  onSelect: (id: string) => void
}

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < MIN) return 'just now'
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`
  return `${Math.floor(diff / DAY)}d ago`
}

export function ConversationListItem({ conversation, isActive, onSelect }: ConversationListItemProps): JSX.Element {
  return (
    <li className={`conversation-item ${isActive ? 'is-active' : ''}`}>
      <button
        type="button"
        className="conversation-item__button"
        onClick={() => onSelect(conversation.id)}
      >
        <span className="conversation-item__title">{conversation.title}</span>
        <span className="conversation-item__meta">
          <span className={`conversation-item__model conversation-item__model--${conversation.model}`}>
            {conversation.model}
          </span>
          <span className="conversation-item__time">{relativeTime(conversation.updatedAt)}</span>
        </span>
      </button>
    </li>
  )
}
