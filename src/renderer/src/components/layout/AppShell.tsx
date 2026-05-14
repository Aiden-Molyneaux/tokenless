import { useEffect, useState } from 'react'
import { rendererLogger } from '../../observability/logger-bridge'
import { useAccounts } from '../../hooks/use-accounts'
import { useConversations } from '../../hooks/use-conversations'
import { useProjects } from '../../hooks/use-projects'
import { ConversationSidebar } from './ConversationSidebar'
import { CreateProjectModal } from './CreateProjectModal'
import { EmptyProjectsState } from './EmptyProjectsState'
import { MainPane } from './MainPane'
import { TopBar } from './TopBar'
import { OnboardingBanner } from '../onboarding/OnboardingBanner'
import './styles.css'

const ONBOARDING_DISMISSED_KEY = 'tokenless.onboardingDismissed'

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

function writeDismissed(v: boolean): void {
  try {
    window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, v ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function AppShell(): JSX.Element {
  const { projects, loading: projectsLoading, create: createProject } = useProjects()
  const { accounts } = useAccounts()
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null)
  const [activeAccountId, setActiveAccountId] = useState<number | null>(null)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [onboardingDismissed, setOnboardingDismissed] = useState<boolean>(readDismissed)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Pick a sensible active project + account once data lands.
  useEffect(() => {
    if (activeProjectId === null && projects.length > 0) {
      setActiveProjectId(projects[0].id)
    }
  }, [projects, activeProjectId])

  useEffect(() => {
    if (activeAccountId === null && accounts.length > 0) {
      setActiveAccountId(accounts[0].id)
    }
  }, [accounts, activeAccountId])

  const { conversations } = useConversations(activeProjectId)
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null)

  // Reset active conversation when project changes.
  useEffect(() => {
    setActiveConversationId(conversations[0]?.id ?? null)
  }, [activeProjectId, conversations])

  const handleSelectProject = (id: number): void => {
    setActiveProjectId(id)
    rendererLogger.info('ui', 'project-switch', 'Switched project', { projectId: id })
  }

  const handleSelectAccount = (id: number): void => {
    setActiveAccountId(id)
    rendererLogger.info('ui', 'account-switch', 'Switched account', { accountId: id })
  }

  const handleSelectConversation = (id: number): void => {
    setActiveConversationId(id)
    rendererLogger.info('ui', 'conversation-select', 'Selected conversation', { conversationId: id })
  }

  const handleNewConversation = async (): Promise<void> => {
    if (activeProjectId === null || activeAccountId === null) {
      rendererLogger.warn('ui', 'new-conversation-blocked', 'No active project or account', {
        projectId: activeProjectId,
        accountId: activeAccountId
      })
      return
    }
    const activeProject = projects.find((p) => p.id === activeProjectId)
    if (!activeProject) {
      rendererLogger.warn('ui', 'new-conversation-blocked', 'Active project not found in list')
      return
    }
    // 1. Create the conversation row
    const created = await window.tokenless.conversations.create({
      input: { projectId: activeProjectId, accountId: activeAccountId }
    })
    if (!created.ok) {
      rendererLogger.error('ui', 'new-conversation-create-failed', created.error.message, {
        code: created.error.code,
        logId: created.error.logId
      })
      return
    }
    // 2. Start the cc subprocess
    const started = await window.tokenless.cc.start({
      conversationId: created.data.conversation.id,
      cwd: activeProject.rootPath,
      cols: 100, // xterm will resize on mount
      rows: 30,
      accountId: activeAccountId
    })
    if (!started.ok) {
      rendererLogger.error('ui', 'new-conversation-start-failed', started.error.message, {
        code: started.error.code,
        logId: started.error.logId,
        conversationId: created.data.conversation.id
      })
      return
    }
    // 3. Activate the conversation in the sidebar
    setActiveConversationId(created.data.conversation.id)
    rendererLogger.info('ui', 'new-conversation', 'New conversation started', {
      conversationId: created.data.conversation.id,
      sessionId: started.data.sessionId,
      pid: started.data.pid
    })
  }

  const handleOpenSettings = (): void => {
    rendererLogger.info('ui', 'settings-clicked', 'Settings button clicked (stub)')
  }

  const handleToggleSidebar = (): void => {
    setSidebarCollapsed((c) => !c)
  }

  const handleOpenCreateProject = (): void => {
    setCreateProjectOpen(true)
  }

  const handleCreateProject = async ({
    name,
    rootPath
  }: {
    name: string
    rootPath: string
  }): Promise<void> => {
    const created = await createProject({ name, rootPath, defaultAccountId: activeAccountId })
    if (created) {
      setActiveProjectId(created.id)
      rendererLogger.info('ui', 'project-create', 'Created project', { projectId: created.id, name })
    }
  }

  const handleDismissOnboarding = (): void => {
    setOnboardingDismissed(true)
    writeDismissed(true)
  }

  const showOnboarding = projects.length === 0 && !onboardingDismissed && !projectsLoading
  const showEmptyState = projects.length === 0 && !projectsLoading

  return (
    <div className="app-shell">
      <TopBar
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        accounts={accounts}
        activeAccountId={activeAccountId}
        onSelectAccount={handleSelectAccount}
        onOpenSettings={handleOpenSettings}
      />
      <OnboardingBanner
        visible={showOnboarding}
        onCreateProject={handleOpenCreateProject}
        onDismiss={handleDismissOnboarding}
      />
      <div className="app-shell__body">
        <ConversationSidebar
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={handleSelectConversation}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={handleToggleSidebar}
          onNewConversation={() => void handleNewConversation()}
        />
        {showEmptyState ? (
          <EmptyProjectsState onCreate={handleOpenCreateProject} />
        ) : (
          <MainPane conversationId={activeConversationId} />
        )}
      </div>
      <CreateProjectModal
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        onCreate={handleCreateProject}
      />
    </div>
  )
}
