import type { MockConversation } from '../../mocks/conversations'
import { ConversationList } from './ConversationList'

interface ConversationSidebarProps {
  conversations: readonly MockConversation[]
  activeId: string | null
  onSelect: (id: string) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  onNewConversation: () => void
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  collapsed,
  onToggleCollapsed,
  onNewConversation
}: ConversationSidebarProps): JSX.Element {
  return (
    <aside className={`conversation-sidebar ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="conversation-sidebar__header">
        {!collapsed && <span className="conversation-sidebar__title">Conversations</span>}
        <button
          type="button"
          className="conversation-sidebar__collapse"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '▶' : '◀'}
        </button>
      </div>
      {!collapsed && (
        <>
          <button
            type="button"
            className="conversation-sidebar__new"
            onClick={onNewConversation}
          >
            + New Conversation
          </button>
          <ConversationList
            conversations={conversations}
            activeId={activeId}
            onSelect={onSelect}
          />
        </>
      )}
    </aside>
  )
}
