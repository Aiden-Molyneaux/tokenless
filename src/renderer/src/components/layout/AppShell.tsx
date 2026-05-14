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

  const handleNewConversation = (): void => {
    rendererLogger.info('ui', 'new-conversation-clicked', 'New conversation button clicked (Phase 4 wires this)')
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
          onNewConversation={handleNewConversation}
        />
        {showEmptyState ? (
          <EmptyProjectsState onCreate={handleOpenCreateProject} />
        ) : (
          <MainPane />
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
