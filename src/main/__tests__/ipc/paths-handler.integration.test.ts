import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PathsHandler } from '../../ipc/paths-handler'
import { Logger } from '../../observability/logger'

function makeLogger(): Logger {
  return new Logger(
    { write: vi.fn(), append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100, 'main'
  )
}

describe('ipc/paths-handler', () => {
  const handler = new PathsHandler(makeLogger())

  it('checkDir returns exists=true + isDirectory=true for a real directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tl-paths-'))
    try {
      const result = await handler.checkDir({ path: dir })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.exists).toBe(true)
        expect(result.data.isDirectory).toBe(true)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('checkDir returns exists=false for non-existent path', async () => {
    const result = await handler.checkDir({ path: 'C:/this/path/does/not/exist/12345' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.exists).toBe(false)
      expect(result.data.isDirectory).toBe(false)
    }
  })

  it('checkDir returns exists=true + isDirectory=false for a file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tl-paths-'))
    const file = join(dir, 'a.txt')
    writeFileSync(file, 'x')
    try {
      const result = await handler.checkDir({ path: file })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.exists).toBe(true)
        expect(result.data.isDirectory).toBe(false)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
