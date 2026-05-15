import { describe, it, expect, beforeEach } from 'vitest'

import { parseSkillContent, scanSkillsRoots } from '../../skills/scanner'

describe('skills/scanner.parseSkillContent', () => {
  it('extracts name + description from frontmatter', () => {
    const md = [
      '---',
      'name: simplify',
      'description: review changed code for reuse + quality',
      '---',
      '',
      'Body.'
    ].join('\n')
    const r = parseSkillContent(md)
    expect(r).toEqual({ name: 'simplify', description: 'review changed code for reuse + quality' })
  })

  it('falls back to body first paragraph when frontmatter has no description', () => {
    const md = [
      '---',
      'name: review',
      '---',
      '',
      'Review a pull request thoroughly.',
      '',
      'More body.'
    ].join('\n')
    const r = parseSkillContent(md)
    expect(r).toEqual({ name: 'review', description: 'Review a pull request thoroughly.' })
  })

  it('returns null when frontmatter is missing or name is absent', () => {
    expect(parseSkillContent('# Just a heading')).toBeNull()
    expect(parseSkillContent('---\ndescription: nope\n---\nbody')).toBeNull()
  })

  it('handles CRLF line endings (Windows)', () => {
    const md = ['---', 'name: x', 'description: y', '---', 'body'].join('\r\n')
    expect(parseSkillContent(md)).toEqual({ name: 'x', description: 'y' })
  })

  it('strips quotes from values', () => {
    const md = `---\nname: "quoted"\ndescription: 'also quoted'\n---\n`
    expect(parseSkillContent(md)).toEqual({ name: 'quoted', description: 'also quoted' })
  })
})

describe('skills/scanner.scanSkillsRoots', () => {
  const fs = new Map<string, string>()
  const dirs = new Map<string, string[]>()

  function readFileImpl(path: string): Promise<string> {
    const c = fs.get(path)
    if (c === undefined) return Promise.reject(new Error(`ENOENT ${path}`))
    return Promise.resolve(c)
  }
  function readdirImpl(path: string): Promise<readonly string[]> {
    const d = dirs.get(path)
    if (!d) return Promise.reject(new Error(`ENOENT ${path}`))
    return Promise.resolve(d)
  }
  function statImpl(path: string): Promise<{ isDirectory(): boolean; isFile(): boolean }> {
    const inDir = dirs.has(path)
    const inFile = fs.has(path)
    if (!inDir && !inFile) return Promise.reject(new Error(`ENOENT ${path}`))
    return Promise.resolve({ isDirectory: () => inDir, isFile: () => inFile })
  }

  beforeEach(() => {
    fs.clear(); dirs.clear()
  })

  it('discovers user skills', async () => {
    dirs.set('/u/.claude/skills', ['simplify', 'review'])
    dirs.set('/u/.claude/skills/simplify', ['SKILL.md'])
    dirs.set('/u/.claude/skills/review', ['SKILL.md'])
    fs.set('/u/.claude/skills/simplify/SKILL.md',
      '---\nname: simplify\ndescription: review for reuse\n---\n')
    fs.set('/u/.claude/skills/review/SKILL.md',
      '---\nname: review\ndescription: review a PR\n---\n')
    const result = await scanSkillsRoots(
      ['/u/.claude/skills', '/u/.claude/plugins'],
      null,
      { readFileImpl, readdirImpl, statImpl }
    )
    expect(result).toHaveLength(2)
    const names = result.map((r) => r.name).sort()
    expect(names).toEqual(['review', 'simplify'])
    expect(result.every((r) => r.source === 'user')).toBe(true)
  })

  it('discovers plugin skills under .../plugins/<plugin>/skills/<name>', async () => {
    dirs.set('/u/.claude/plugins', ['acme-pack'])
    dirs.set('/u/.claude/plugins/acme-pack', ['skills'])
    dirs.set('/u/.claude/plugins/acme-pack/skills', ['security'])
    dirs.set('/u/.claude/plugins/acme-pack/skills/security', ['SKILL.md'])
    fs.set('/u/.claude/plugins/acme-pack/skills/security/SKILL.md',
      '---\nname: security\n---\nSecurity audit skill.')
    const result = await scanSkillsRoots(
      ['/u/.claude/skills', '/u/.claude/plugins'],
      null,
      { readFileImpl, readdirImpl, statImpl }
    )
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('plugin')
    expect(result[0].name).toBe('security')
    expect(result[0].description).toBe('Security audit skill.')
  })

  it('discovers project skills when project path provided', async () => {
    dirs.set('/proj/.claude/skills', ['deploy'])
    dirs.set('/proj/.claude/skills/deploy', ['SKILL.md'])
    fs.set('/proj/.claude/skills/deploy/SKILL.md', '---\nname: deploy\n---\n')
    const result = await scanSkillsRoots(
      ['/u/.claude/skills', '/u/.claude/plugins', '/proj/.claude/skills'],
      '/proj',
      { readFileImpl, readdirImpl, statImpl }
    )
    expect(result[0].source).toBe('project')
  })

  it('skips directories without SKILL.md and missing roots silently', async () => {
    dirs.set('/u/.claude/skills', ['empty', 'good'])
    dirs.set('/u/.claude/skills/empty', [])
    dirs.set('/u/.claude/skills/good', ['SKILL.md'])
    fs.set('/u/.claude/skills/good/SKILL.md', '---\nname: good\n---\n')
    const result = await scanSkillsRoots(
      ['/u/.claude/skills', '/u/.claude/plugins'],
      null,
      { readFileImpl, readdirImpl, statImpl }
    )
    expect(result.map((r) => r.name)).toEqual(['good'])
  })

  it('skips SKILL.md files with invalid frontmatter', async () => {
    dirs.set('/u/.claude/skills', ['bad'])
    dirs.set('/u/.claude/skills/bad', ['SKILL.md'])
    fs.set('/u/.claude/skills/bad/SKILL.md', '# no frontmatter at all')
    const result = await scanSkillsRoots(
      ['/u/.claude/skills', '/u/.claude/plugins'],
      null,
      { readFileImpl, readdirImpl, statImpl }
    )
    expect(result).toHaveLength(0)
  })
})
