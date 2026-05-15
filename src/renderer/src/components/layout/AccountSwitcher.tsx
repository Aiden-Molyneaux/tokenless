import { Dropdown, type DropdownItem } from '../common/Dropdown'
import type { Account } from '@shared/types/accounts'

interface AccountSwitcherProps {
  accounts: readonly Account[]
  activeAccountId: number | null
  onSelect: (id: number) => void
  onCreate: () => void
  onEdit: () => void
}

export function AccountSwitcher({ accounts, activeAccountId, onSelect, onCreate, onEdit }: AccountSwitcherProps): JSX.Element {
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
      {activeAccountId !== null && (
        <button
          type="button"
          className="account-switcher__edit"
          onClick={onEdit}
          aria-label="Edit active account"
        >
          ✎
        </button>
      )}
    </div>
  )
}
