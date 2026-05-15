import { Dropdown, type DropdownItem } from '../common/Dropdown'
import type { Project } from '@shared/types/projects'

interface ProjectSwitcherProps {
  projects: readonly Project[]
  activeProjectId: number | null
  onSelect: (id: number) => void
  onCreate: () => void
}

// Thin wrapper around <Dropdown> with a "+" affordance for adding additional
// projects. Phase 3 only allowed the first project via the empty-state CTA;
// the "+" button is the missing path for creating subsequent projects.
// Converts number IDs to strings for Dropdown's value prop and back to number
// in the onSelect callback.

export function ProjectSwitcher({
  projects,
  activeProjectId,
  onSelect,
  onCreate
}: ProjectSwitcherProps): JSX.Element {
  const items: readonly DropdownItem[] = projects.map((p) => ({
    value: String(p.id),
    label: p.name,
    description: p.rootPath
  }))
  return (
    <div className="project-switcher">
      <Dropdown
        label="Project:"
        items={items}
        activeValue={activeProjectId !== null ? String(activeProjectId) : ''}
        onSelect={(v) => onSelect(Number(v))}
        fallbackLabel="No project"
      />
      <button
        type="button"
        className="project-switcher__add"
        onClick={onCreate}
        aria-label="Add project"
      >
        +
      </button>
    </div>
  )
}
