import { describe, expect, it } from 'vitest'
import { CATEGORIES, isCategory } from '../categories'

describe('categories', () => {
  it('exposes the canonical 12-category list', () => {
    expect(CATEGORIES).toEqual([
      'cc',
      'pty',
      'api',
      'db',
      'ipc',
      'ui',
      'skill',
      'auth',
      'gearing',
      'clipboard',
      'fs',
      'observability'
    ])
  })

  it('isCategory accepts every entry in CATEGORIES', () => {
    for (const c of CATEGORIES) {
      expect(isCategory(c)).toBe(true)
    }
  })

  it('isCategory rejects unknown strings', () => {
    expect(isCategory('unknown')).toBe(false)
    expect(isCategory('')).toBe(false)
    expect(isCategory('CC')).toBe(false) // case-sensitive
  })
})
