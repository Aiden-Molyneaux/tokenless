import type { MockAccount } from '../../mocks/accounts'
import type { MockProject } from '../../mocks/projects'
import { AccountSwitcher } from './AccountSwitcher'
import { ProjectSwitcher } from './ProjectSwitcher'
import { SettingsButton } from './SettingsButton'

interface TopBarProps {
  projects: readonly MockProject[]
  activeProjectId: string
  onSelectProject: (id: string) => void
  accounts: readonly MockAccount[]
  activeAccountId: string
  onSelectAccount: (id: string) => void
  onOpenSettings: () => void
}

// Top bar: brand + project/account switchers + settings button.

export function TopBar(props: TopBarProps): JSX.Element {
  return (
    <header className="top-bar">
      <div className="top-bar__brand">TokenLess</div>
      <nav className="top-bar__nav">
        <ProjectSwitcher
          projects={props.projects}
          activeProjectId={props.activeProjectId}
          onSelect={props.onSelectProject}
        />
        <AccountSwitcher
          accounts={props.accounts}
          activeAccountId={props.activeAccountId}
          onSelect={props.onSelectAccount}
        />
        <SettingsButton onClick={props.onOpenSettings} />
      </nav>
    </header>
  )
}
