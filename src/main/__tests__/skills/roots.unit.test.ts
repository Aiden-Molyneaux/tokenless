import { describe, it, expect } from 'vitest'
import { join } from 'node:path'

import { resolveSkillsRoots } from '../../skills/roots'

describe('skills/roots', () => {
  const home = 'C:/Users/test'

  it('returns user + plugin glob for no project', () => {
    const roots = resolveSkillsRoots(home, null)
    expect(roots).toContain(join(home, '.claude', 'skills').replace(/\\/g, '/'))
    expect(roots.some((r) => r.includes('plugins'))).toBe(true)
  })

  it('appends project-local .claude/skills when project path provided', () => {
    const roots = resolveSkillsRoots(home, 'D:/repos/myproj')
    expect(roots.some((r) => r.includes('myproj') && r.includes('skills'))).toBe(true)
  })

  it('returns POSIX-style separators only', () => {
    const roots = resolveSkillsRoots(home, 'D:\\repos\\myproj')
    roots.forEach((r) => expect(r).not.toMatch(/\\/))
  })
})
