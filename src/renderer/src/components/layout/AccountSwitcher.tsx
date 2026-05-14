import { Dropdown, type DropdownItem } from '../common/Dropdown'
import type { MockAccount } from '../../mocks/accounts'

interface AccountSwitcherProps {
  accounts: readonly MockAccount[]
  activeAccountId: string
  onSelect: (id: string) => void
}

// Thin wrapper around <Dropdown>. Phase 2A's standalone implementation was
// extracted in Phase 2B (Task 4) per ADR-021. Phase 6 wires real account
// auth + CLAUDE_CONFIG_DIR + ANTHROPIC_API_KEY injection per ADR-018.

export function AccountSwitcher({ accounts, activeAccountId, onSelect }: AccountSwitcherProps): JSX.Element {
  const items: readonly DropdownItem[] = accounts.map((a) => ({
    value: a.id,
    label: a.label,
    description: a.email
  }))
  return (
    <Dropdown
      label="Account:"
      items={items}
      activeValue={activeAccountId}
      onSelect={onSelect}
      fallbackLabel="No account"
    />
  )
}
