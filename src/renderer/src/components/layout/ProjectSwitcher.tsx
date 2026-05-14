import { useEffect, useRef, useState } from 'react'
import type { MockProject } from '../../mocks/projects'

interface ProjectSwitcherProps {
  projects: readonly MockProject[]
  activeProjectId: string
  onSelect: (id: string) => void
}

// Dropdown trigger + menu. Phase 2A is a visual stub — no real project
// switching yet (Phase 3 adds project CRUD + persistence). Click outside
// closes the menu. Escape closes.

export function ProjectSwitcher({ projects, activeProjectId, onSelect }: ProjectSwitcherProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const active = projects.find((p) => p.id === activeProjectId)

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
    <div className="project-switcher" ref={rootRef}>
      <button
        type="button"
        className="project-switcher__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="project-switcher__label">Project:</span>
        <span className="project-switcher__name">{active?.name ?? 'No project'}</span>
        <span className="project-switcher__caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="project-switcher__menu" role="menu">
          {projects.map((p) => (
            <li key={p.id} role="none">
              <button
                type="button"
                role="menuitem"
                className={`project-switcher__item ${p.id === activeProjectId ? 'is-active' : ''}`}
                onClick={() => handleSelect(p.id)}
              >
                <span className="project-switcher__item-name">{p.name}</span>
                <span className="project-switcher__item-path">{p.rootPath}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
