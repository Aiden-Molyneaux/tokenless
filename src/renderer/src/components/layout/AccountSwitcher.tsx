import { Dropdown, type DropdownItem } from '../common/Dropdown'
import type { Account } from '@shared/types/accounts'

interface AccountSwitcherProps {
  accounts: readonly Account[]
  activeAccountId: number | null
  onSelect: (id: number) => void
  onCreate: () => void
}

// Thin wrapper around <Dropdown>. Phase 6 wires real account auth +
// CLAUDE_CONFIG_DIR + ANTHROPIC_API_KEY injection per ADR-018. Converts
// number IDs to strings for Dropdown's value prop and back to number in
// the onSelect callback. Phase 6A adds a "+" button to open the create
// account modal.

export function AccountSwitcher({ accounts, activeAccountId, onSelect, onCreate }: AccountSwitcherProps): JSX.Element {
  const items: readonly DropdownItem[] = accounts.map((a) => ({
    value: String(a.id),
    label: a.label,
    description: a.configDir || '(no config dir)'
  }))
  return (
    <div className="account-switcher">
      <Dropdown
        label="Account:"
        items={items}
        activeValue={activeAccountId !== null ? String(activeAccountId) : ''}
        onSelect={(v) => onSelect(Number(v))}
        fallbackLabel="No account"
      />
      <button
        type="button"
        className="account-switcher__add"
        onClick={onCreate}
        aria-label="Add account"
      >
        +
      </button>
    </div>
  )
}
