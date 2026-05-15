import type { Account } from '@shared/types/accounts'
import type { Project } from '@shared/types/projects'
import { AccountSwitcher } from './AccountSwitcher'
import { ProjectSwitcher } from './ProjectSwitcher'
import { SettingsButton } from './SettingsButton'

interface TopBarProps {
  projects: readonly Project[]
  activeProjectId: number | null
  onSelectProject: (id: number) => void
  onCreateProject: () => void
  accounts: readonly Account[]
  activeAccountId: number | null
  onSelectAccount: (id: number) => void
  onCreateAccount: () => void
  onEditAccount: () => void
  onOpenSettings: () => void
}

// Top bar: brand + project/account switchers + settings button.

export function TopBar({
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  accounts,
  activeAccountId,
  onSelectAccount,
  onCreateAccount,
  onEditAccount,
  onOpenSettings
}: TopBarProps): JSX.Element {
  return (
    <header className="top-bar">
      <div className="top-bar__brand">TokenLess</div>
      <nav className="top-bar__nav">
        <ProjectSwitcher projects={projects} activeProjectId={activeProjectId} onSelect={onSelectProject} onCreate={onCreateProject} />
        <AccountSwitcher accounts={accounts} activeAccountId={activeAccountId} onSelect={onSelectAccount} onCreate={onCreateAccount} onEdit={onEditAccount} />
        <SettingsButton onClick={onOpenSettings} />
      </nav>
    </header>
  )
}
