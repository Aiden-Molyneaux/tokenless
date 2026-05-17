import { useEffect, useState } from 'react'
import { rendererLogger } from '../../observability/logger-bridge'
import type { UpdateAccountInput } from '@shared/types/accounts'
import type { UpdateProjectInput } from '@shared/types/projects'
import { useAccounts } from '../../hooks/use-accounts'
import { useConversations } from '../../hooks/use-conversations'
import { useProjects } from '../../hooks/use-projects'
import {
  readSetting,
  writeSetting,
  SETTING_LAST_ACTIVE_ACCOUNT_ID,
  SETTING_LAST_ACTIVE_PROJECT_ID
} from '../../hooks/use-settings'
import { SETTING_LAYOUT_SIDEBAR_COLLAPSED } from '@shared/types/settings-keys'
import { ConversationSidebar } from './ConversationSidebar'
import { CreateAccountModal } from './CreateAccountModal'
import { EditAccountModal } from './EditAccountModal'
import { CreateProjectModal } from './CreateProjectModal'
import { EditProjectModal } from './EditProjectModal'
import { EmptyProjectsState } from './EmptyProjectsState'
import { MainPane } from './MainPane'
import { TopBar } from './TopBar'
import { ToastHost } from '../notifications/ToastHost'
import './styles.css'


export function AppShell({ onOpenSettings }: { onOpenSettings: () => void }): JSX.Element {
  const { projects, loading: projectsLoading, create: createProject, update: updateProject, remove: removeProject } = useProjects()
  const { accounts, create: createAccount, update: updateAccount, remove: removeAccount } = useAccounts()
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null)
  const [activeAccountId, setActiveAccountId] = useState<number | null>(null)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [createAccountOpen, setCreateAccountOpen] = useState(false)
  const [editAccountOpen, setEditAccountOpen] = useState(false)
  const [editProjectOpen, setEditProjectOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Hydrate sidebar-collapsed state from persisted setting; fall back to width-aware default.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const value = await readSetting(SETTING_LAYOUT_SIDEBAR_COLLAPSED)
      if (cancelled) return
      if (value !== null) {
        setSidebarCollapsed(value === 'true')
      } else {
        setSidebarCollapsed(window.innerWidth < 900)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // On-mount restore: read last-active ids from settings and pre-select them if
  // they still exist in the current lists. Uses functional setter form so we
  // never clobber a value the user has already chosen since mount.
  useEffect(() => {
    let cancelled = false
    void Promise.all([
      readSetting(SETTING_LAST_ACTIVE_ACCOUNT_ID),
      readSetting(SETTING_LAST_ACTIVE_PROJECT_ID)
    ]).then(([accStr, projStr]) => {
      if (cancelled) return
      const accId = accStr !== null ? Number(accStr) : null
      const projId = projStr !== null ? Number(projStr) : null
      if (accId !== null && accounts.some((a) => a.id === accId)) {
        setActiveAccountId((current) => current ?? accId)
      }
      if (projId !== null && projects.some((p) => p.id === projId)) {
        setActiveProjectId((current) => current ?? projId)
      }
    })
    return () => {
      cancelled = true
    }
  }, [accounts, projects])

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

  // Persist active account/project to settings so they can be restored on next launch.
  useEffect(() => {
    if (activeAccountId !== null) {
      void writeSetting(SETTING_LAST_ACTIVE_ACCOUNT_ID, String(activeAccountId)).catch((err) => {
        rendererLogger.warn('ui', 'settings-write-failed', 'Failed to persist lastActiveAccountId', {
          accountId: activeAccountId,
          errorString: err instanceof Error ? err.message : String(err)
        })
      })
    }
  }, [activeAccountId])

  useEffect(() => {
    if (activeProjectId !== null) {
      void writeSetting(SETTING_LAST_ACTIVE_PROJECT_ID, String(activeProjectId)).catch((err) => {
        rendererLogger.warn('ui', 'settings-write-failed', 'Failed to persist lastActiveProjectId', {
          projectId: activeProjectId,
          errorString: err instanceof Error ? err.message : String(err)
        })
      })
    }
  }, [activeProjectId])

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
    // v2-phase-4 will route the geared prompt to the clipboard; no PTY to start.
    // 2. Activate the conversation in the sidebar
    setActiveConversationId(created.data.conversation.id)
    rendererLogger.info('ui', 'new-conversation', 'New conversation created', {
      conversationId: created.data.conversation.id
    })
  }

  const handleToggleSidebar = (): void => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      void writeSetting(SETTING_LAYOUT_SIDEBAR_COLLAPSED, next ? 'true' : 'false').catch((err) => {
        rendererLogger.warn('ui', 'settings-write-failed', 'Failed to persist sidebarCollapsed', {
          errorString: err instanceof Error ? err.message : String(err)
        })
      })
      return next
    })
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

  const handleCreateAccount = async (input: { label: string; configDir: string; apiKey: string }): Promise<void> => {
    const created = await createAccount({
      label: input.label,
      configDir: input.configDir,
      apiKey: input.apiKey || null
    })
    if (created) {
      setActiveAccountId(created.id)
      rendererLogger.info('ui', 'account-create', 'Account created', { accountId: created.id, label: created.label })
    }
  }

  const handleEditAccount = (): void => {
    setEditAccountOpen(true)
  }

  const handleEditProject = (): void => {
    setEditProjectOpen(true)
  }

  const handleUpdateProject = async (input: UpdateProjectInput): Promise<void> => {
    const updated = await updateProject(input)
    if (updated) {
      rendererLogger.info('ui', 'project-update', 'Project updated', { projectId: updated.id })
    }
  }

  const handleDeleteProject = async (id: number): Promise<void> => {
    const removed = await removeProject(id)
    if (removed) {
      rendererLogger.info('ui', 'project-delete', 'Project deleted', { projectId: id })
      if (activeProjectId === id) {
        const fallback = projects.find((p) => p.id !== id)?.id ?? null
        setActiveProjectId(fallback)
      }
    }
  }

  const handleUpdateAccount = async (input: UpdateAccountInput): Promise<void> => {
    const updated = await updateAccount(input)
    if (updated) {
      rendererLogger.info('ui', 'account-update', 'Account updated', { accountId: updated.id })
    }
  }

  const handleDeleteAccount = async (id: number): Promise<void> => {
    const removed = await removeAccount(id)
    if (removed) {
      rendererLogger.info('ui', 'account-delete', 'Account deleted', { accountId: id })
      if (activeAccountId === id) {
        const fallback = accounts.find((a) => a.id !== id)?.id ?? null
        setActiveAccountId(fallback)
      }
    }
  }

  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null

  const showEmptyState = projects.length === 0 && !projectsLoading

  return (
    <div className="app-shell">
      <TopBar
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        onCreateProject={handleOpenCreateProject}
        onEditProject={handleEditProject}
        accounts={accounts}
        activeAccountId={activeAccountId}
        onSelectAccount={handleSelectAccount}
        onCreateAccount={() => setCreateAccountOpen(true)}
        onEditAccount={handleEditAccount}
        onOpenSettings={onOpenSettings}
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
          <MainPane conversationId={activeConversationId} accountId={activeAccountId} accountLabel={accounts.find((a) => a.id === activeAccountId)?.label ?? null} />
        )}
      </div>
      <CreateProjectModal
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        onCreate={handleCreateProject}
      />
      <CreateAccountModal
        open={createAccountOpen}
        onClose={() => setCreateAccountOpen(false)}
        onCreate={handleCreateAccount}
      />
      <EditAccountModal
        open={editAccountOpen}
        account={activeAccount}
        onClose={() => setEditAccountOpen(false)}
        onUpdate={handleUpdateAccount}
        onDelete={handleDeleteAccount}
      />
      <EditProjectModal
        open={editProjectOpen}
        project={activeProject}
        onClose={() => setEditProjectOpen(false)}
        onUpdate={handleUpdateProject}
        onDelete={handleDeleteProject}
      />
      <ToastHost />
    </div>
  )
}
