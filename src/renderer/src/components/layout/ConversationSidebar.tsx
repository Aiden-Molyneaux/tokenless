import type { Conversation } from '@shared/types/conversations'
import { ConversationList } from './ConversationList'

interface ConversationSidebarProps {
  conversations: readonly Conversation[]
  activeId: number | null
  onSelect: (id: number) => void
  onRenameConversation: (id: number, newTitle: string) => void
  onRequestDeleteConversation: (id: number) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  onNewConversation: () => void
  activeProjectName: string | null
  onOpenSettings: () => void
  onOpenDevMode: () => void
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onRenameConversation,
  onRequestDeleteConversation,
  collapsed,
  onToggleCollapsed,
  onNewConversation,
  activeProjectName,
  onOpenSettings,
  onOpenDevMode
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
            onRename={onRenameConversation}
            onRequestDelete={onRequestDeleteConversation}
          />
        </>
      )}
      {/* Icon strip shown when collapsed (48px wide).
          v2.0 simplification: clicking the project and conversation icons just
          expands the full sidebar via onToggleCollapsed rather than showing a
          popover. Proper popovers are deferred to Phase 6+. */}
      {collapsed && (
        <div className="conversation-sidebar__icons">
          <button
            type="button"
            className="conversation-sidebar__icon-button"
            onClick={onToggleCollapsed}
            aria-label="Expand sidebar to see projects"
            title={activeProjectName ?? 'No project'}
          >
            <span className="conversation-sidebar__icon-letter">
              {activeProjectName ? activeProjectName[0].toUpperCase() : '·'}
            </span>
          </button>
          <button
            type="button"
            className="conversation-sidebar__icon-button"
            onClick={onToggleCollapsed}
            aria-label="Expand sidebar to see conversations"
            title={`${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`}
          >
            💬
            {conversations.length > 0 && (
              <span className="conversation-sidebar__icon-badge">{conversations.length}</span>
            )}
          </button>
          <button
            type="button"
            className="conversation-sidebar__icon-button"
            onClick={onOpenSettings}
            aria-label="Open settings"
            title="Settings"
          >
            ⚙
          </button>
          <button
            type="button"
            className="conversation-sidebar__icon-button"
            onClick={onOpenDevMode}
            aria-label="Open Dev Mode"
            title="Dev Mode"
          >
            🐛
          </button>
        </div>
      )}
    </aside>
  )
}
