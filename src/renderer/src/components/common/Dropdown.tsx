import type { ReactNode } from 'react'
import { useDropdown } from './use-dropdown'
import './styles.css'

export interface DropdownItem {
  value: string
  label: string
  description?: string
}

interface DropdownProps {
  label: string                                  // "Project:", "Model:", etc.
  items: readonly DropdownItem[]
  activeValue: string
  onSelect: (value: string) => void
  renderItem?: (item: DropdownItem, isActive: boolean) => ReactNode
  className?: string                             // extra root class for trigger styling variants
  fallbackLabel?: string                         // shown when no item matches activeValue (default: 'None')
}

// Generic dropdown. Used by ProjectSwitcher, AccountSwitcher, and Composer's
// ConfigsRow. The trigger displays "{label} {active.label}"; the menu lists
// items with optional descriptions (one line each).
//
// If renderItem is provided, it controls the item body rendering; otherwise
// items render as label + optional description.

export function Dropdown({
  label,
  items,
  activeValue,
  onSelect,
  renderItem,
  className,
  fallbackLabel = 'None'
}: DropdownProps): JSX.Element {
  const { open, toggle, setOpen, rootRef } = useDropdown()
  const active = items.find((i) => i.value === activeValue)

  const handleSelect = (value: string): void => {
    onSelect(value)
    setOpen(false)
  }

  return (
    <div className={`dropdown ${className ?? ''}`} ref={rootRef}>
      <button
        type="button"
        className="dropdown__trigger"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="dropdown__label">{label}</span>
        <span className="dropdown__name">{active?.label ?? fallbackLabel}</span>
        <span className="dropdown__caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="dropdown__menu" role="menu">
          {items.map((item) => (
            <li key={item.value} role="none">
              <button
                type="button"
                role="menuitem"
                className={`dropdown__item ${item.value === activeValue ? 'is-active' : ''}`}
                onClick={() => handleSelect(item.value)}
              >
                {renderItem ? renderItem(item, item.value === activeValue) : (
                  <>
                    <span className="dropdown__item-label">{item.label}</span>
                    {item.description && (
                      <span className="dropdown__item-description">{item.description}</span>
                    )}
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
