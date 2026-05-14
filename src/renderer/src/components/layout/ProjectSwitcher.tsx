import { Dropdown, type DropdownItem } from '../common/Dropdown'
import type { MockProject } from '../../mocks/projects'

interface ProjectSwitcherProps {
  projects: readonly MockProject[]
  activeProjectId: string
  onSelect: (id: string) => void
}

// Thin wrapper around <Dropdown>. Phase 2A's standalone implementation was
// extracted in Phase 2B (Task 4) per ADR-021.

export function ProjectSwitcher({ projects, activeProjectId, onSelect }: ProjectSwitcherProps): JSX.Element {
  const items: readonly DropdownItem[] = projects.map((p) => ({
    value: p.id,
    label: p.name,
    description: p.rootPath
  }))
  return (
    <Dropdown
      label="Project:"
      items={items}
      activeValue={activeProjectId}
      onSelect={onSelect}
      fallbackLabel="No project"
    />
  )
}
