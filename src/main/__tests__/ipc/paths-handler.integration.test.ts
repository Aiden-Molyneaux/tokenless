import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Mock the parts of electron used by PathsHandler so tests run outside a real
// Electron process. shell.openPath is not tested (it opens the OS file manager).
vi.mock('electron', () => ({
  app: {
    getPath: (name: string): string => {
      if (name === 'userData') return join(tmpdir(), 'tokenless-test-userdata')
      return tmpdir()
    }
  },
  shell: {
    openPath: vi.fn().mockResolvedValue('')
  }
}))

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

  it('getAppPaths returns an object with userData, logs, and db as strings', async () => {
    const result = await handler.getAppPaths()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(typeof result.data.userData).toBe('string')
      expect(typeof result.data.logs).toBe('string')
      expect(typeof result.data.db).toBe('string')
      // logs and db should be nested under userData
      expect(result.data.logs).toContain(result.data.userData)
      expect(result.data.db).toContain(result.data.userData)
    }
  })
})
