import { useState } from 'react'
import { rendererLogger } from '../../observability/logger-bridge'
import { MOCK_ACCOUNTS } from '../../mocks/accounts'
import { MOCK_CONVERSATIONS } from '../../mocks/conversations'
import { MOCK_PROJECTS } from '../../mocks/projects'
import { ConversationSidebar } from './ConversationSidebar'
import { MainPane } from './MainPane'
import { TopBar } from './TopBar'
import './styles.css'

// AppShell orchestrates the visual layout. Phase 2A holds active project /
// account / conversation IDs locally + sidebar collapsed state. Phase 3
// replaces the mock data with IPC-backed hooks; Phase 6 wires real
// account switching; Phase 8 wires the Settings button to a real view.

export function AppShell(): JSX.Element {
  const [activeProjectId, setActiveProjectId] = useState<string>(MOCK_PROJECTS[0].id)
  const [activeAccountId, setActiveAccountId] = useState<string>(MOCK_ACCOUNTS[0].id)
  const conversationsForActiveProject = MOCK_CONVERSATIONS.filter(
    (c) => c.projectId === activeProjectId
  )
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    conversationsForActiveProject[0]?.id ?? null
  )
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const handleSelectProject = (id: string): void => {
    setActiveProjectId(id)
    // Reset active conversation to the first one in the new project
    const firstInProject = MOCK_CONVERSATIONS.find((c) => c.projectId === id)
    setActiveConversationId(firstInProject?.id ?? null)
    rendererLogger.info('ui', 'project-switch', `Switched project (stub)`, { projectId: id })
  }

  const handleSelectAccount = (id: string): void => {
    setActiveAccountId(id)
    rendererLogger.info('ui', 'account-switch', `Switched account (stub)`, { accountId: id })
  }

  const handleSelectConversation = (id: string): void => {
    setActiveConversationId(id)
    rendererLogger.info('ui', 'conversation-select', `Selected conversation (stub)`, { conversationId: id })
  }

  const handleNewConversation = (): void => {
    rendererLogger.info('ui', 'new-conversation-clicked', 'New Conversation button clicked (stub)')
  }

  const handleOpenSettings = (): void => {
    rendererLogger.info('ui', 'settings-clicked', 'Settings button clicked (stub)')
  }

  const handleToggleSidebar = (): void => {
    setSidebarCollapsed((c) => !c)
  }

  return (
    <div className="app-shell">
      <TopBar
        projects={MOCK_PROJECTS}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        accounts={MOCK_ACCOUNTS}
        activeAccountId={activeAccountId}
        onSelectAccount={handleSelectAccount}
        onOpenSettings={handleOpenSettings}
      />
      <div className="app-shell__body">
        <ConversationSidebar
          conversations={conversationsForActiveProject}
          activeId={activeConversationId}
          onSelect={handleSelectConversation}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={handleToggleSidebar}
          onNewConversation={handleNewConversation}
        />
        <MainPane />
      </div>
    </div>
  )
}
