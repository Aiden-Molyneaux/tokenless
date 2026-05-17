import type { Account } from '@shared/types/accounts'
import { useDropdown } from '../common/use-dropdown'
import '../common/styles.css'

interface AccountSwitcherProps {
  accounts: readonly Account[]
  activeAccountId: number | null
  onSelect: (id: number) => void
  onCreate: () => void
  onEdit: () => void
}

// AccountSwitcher — compact form: [initial] ▾ trigger with full dropdown menu.
// The dropdown panel lists all accounts with full labels; + / edit buttons are
// preserved beside the trigger for quick actions.

export function AccountSwitcher({ accounts, activeAccountId, onSelect, onCreate, onEdit }: AccountSwitcherProps): JSX.Element {
  const { open, toggle, setOpen, rootRef } = useDropdown()
  const active = accounts.find((a) => a.id === activeAccountId)
  const initial = active?.label?.[0]?.toUpperCase() ?? '·'

  const handleSelect = (id: number): void => {
    onSelect(id)
    setOpen(false)
  }

  return (
    <div className="account-switcher" ref={rootRef}>
      <button
        type="button"
        className="account-switcher__trigger--compact"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${active?.label ?? 'None'}`}
        title={active?.label ?? 'No account'}
      >
        <span className="account-switcher__initial">{initial}</span>
        <span className="account-switcher__chevron">▾</span>
      </button>
      {open && (
        <ul className="dropdown__menu account-switcher__menu" role="menu">
          {accounts.map((a) => (
            <li key={a.id} role="none">
              <button
                type="button"
                role="menuitem"
                className={`dropdown__item ${a.id === activeAccountId ? 'is-active' : ''}`}
                onClick={() => handleSelect(a.id)}
              >
                <span className="dropdown__item-label">{a.label}</span>
                {a.configDir && (
                  <span className="dropdown__item-description">{a.configDir}</span>
                )}
              </button>
            </li>
          ))}
          {accounts.length === 0 && (
            <li role="none">
              <span className="dropdown__item" style={{ cursor: 'default', color: 'var(--tl-mute)' }}>
                No accounts
              </span>
            </li>
          )}
        </ul>
      )}
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
