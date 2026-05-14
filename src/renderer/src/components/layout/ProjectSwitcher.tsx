import { Dropdown, type DropdownItem } from '../common/Dropdown'
import type { Project } from '@shared/types/projects'

interface ProjectSwitcherProps {
  projects: readonly Project[]
  activeProjectId: number | null
  onSelect: (id: number) => void
}

// Thin wrapper around <Dropdown>. Converts number IDs to strings for Dropdown's
// value prop and back to number in the onSelect callback.

export function ProjectSwitcher({ projects, activeProjectId, onSelect }: ProjectSwitcherProps): JSX.Element {
  const items: readonly DropdownItem[] = projects.map((p) => ({
    value: String(p.id),
    label: p.name,
    description: p.rootPath
  }))
  return (
    <Dropdown
      label="Project:"
      items={items}
      activeValue={activeProjectId !== null ? String(activeProjectId) : ''}
      onSelect={(v) => onSelect(Number(v))}
      fallbackLabel="No project"
    />
  )
}
