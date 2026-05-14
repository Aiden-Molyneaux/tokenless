import type { Conversation } from '@shared/types/conversations'

interface ConversationListItemProps {
  conversation: Conversation
  isActive: boolean
  onSelect: (id: number) => void
}

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

function relativeTime(ts: number | null): string {
  if (ts === null) return ''
  const diff = Date.now() - ts
  if (diff < MIN) return 'just now'
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`
  return `${Math.floor(diff / DAY)}d ago`
}

export function ConversationListItem({ conversation, isActive, onSelect }: ConversationListItemProps): JSX.Element {
  const model = conversation.model ?? 'sonnet'
  return (
    <li className={`conversation-item ${isActive ? 'is-active' : ''}`}>
      <button
        type="button"
        className="conversation-item__button"
        onClick={() => onSelect(conversation.id)}
      >
        <span className="conversation-item__title">{conversation.title ?? 'Untitled'}</span>
        <span className="conversation-item__meta">
          <span className={`conversation-item__model conversation-item__model--${model}`}>{model}</span>
          <span className="conversation-item__time">{relativeTime(conversation.updatedAt)}</span>
        </span>
      </button>
    </li>
  )
}
