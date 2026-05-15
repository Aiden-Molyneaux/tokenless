import { Dropdown, type DropdownItem } from '../common/Dropdown'
import type { Project } from '@shared/types/projects'

interface ProjectSwitcherProps {
  projects: readonly Project[]
  activeProjectId: number | null
  onSelect: (id: number) => void
  onCreate: () => void
  onEdit: () => void
}

export function ProjectSwitcher({
  projects,
  activeProjectId,
  onSelect,
  onCreate,
  onEdit
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
      {activeProjectId !== null && (
        <button
          type="button"
          className="project-switcher__edit"
          onClick={onEdit}
          aria-label="Edit active project"
        >
          ✎
        </button>
      )}
    </div>
  )
}
