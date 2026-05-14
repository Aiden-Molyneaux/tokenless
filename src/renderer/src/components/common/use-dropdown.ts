import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseDropdownReturn {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  rootRef: React.RefObject<HTMLDivElement>
}

// Shared dropdown state hook: open/close + outside-click + escape close +
// stable rootRef for click-outside detection. Used by the generic <Dropdown>
// component (Task 2); call sites get this behavior for free.

export function useDropdown(): UseDropdownReturn {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

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

  const toggle = useCallback(() => setOpen((o) => !o), [])

  return { open, setOpen, toggle, rootRef }
}
