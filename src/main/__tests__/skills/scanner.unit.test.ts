import { describe, it, expect } from 'vitest'

import { parseSkillContent } from '../../skills/scanner'

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
