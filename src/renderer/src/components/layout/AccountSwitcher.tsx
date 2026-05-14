import { useEffect, useRef, useState } from 'react'
import type { MockAccount } from '../../mocks/accounts'

interface AccountSwitcherProps {
  accounts: readonly MockAccount[]
  activeAccountId: string
  onSelect: (id: string) => void
}

// Account switcher dropdown — same UX shape as ProjectSwitcher. Phase 2A
// is a visual stub; Phase 6 wires real account auth + CLAUDE_CONFIG_DIR
// + ANTHROPIC_API_KEY injection per ADR-018.

export function AccountSwitcher({ accounts, activeAccountId, onSelect }: AccountSwitcherProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const active = accounts.find((a) => a.id === activeAccountId)

  useEffect(() => {
    if (!open) return undefined
    const handleClickOutside = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const handleSelect = (id: string): void => {
    onSelect(id)
    setOpen(false)
  }

  return (
    <div className="account-switcher" ref={rootRef}>
      <button
        type="button"
        className="account-switcher__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="account-switcher__label">Account:</span>
        <span className="account-switcher__name">{active?.label ?? 'No account'}</span>
        <span className="account-switcher__caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="account-switcher__menu" role="menu">
          {accounts.map((a) => (
            <li key={a.id} role="none">
              <button
                type="button"
                role="menuitem"
                className={`account-switcher__item ${a.id === activeAccountId ? 'is-active' : ''}`}
                onClick={() => handleSelect(a.id)}
              >
                <span className="account-switcher__item-name">{a.label}</span>
                <span className="account-switcher__item-email">{a.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
