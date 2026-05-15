import { join } from 'node:path'

function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}

// Returns absolute paths (POSIX separators) for the skill discovery roots.
// The plugins entry is a container — the scanner expands /<plugin>/skills.
export function resolveSkillsRoots(homeDir: string, activeProjectPath: string | null): readonly string[] {
  const home = toPosix(homeDir)
  const roots: string[] = [
    toPosix(join(home, '.claude', 'skills')),
    toPosix(join(home, '.claude', 'plugins'))
  ]
  if (activeProjectPath) {
    roots.push(toPosix(join(activeProjectPath, '.claude', 'skills')))
  }
  return roots
}
