import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { IpcMain } from 'electron'
import { ClipboardHandler } from '@main/ipc/clipboard-handler'
import { IPC_CLIPBOARD_READ_PROMPT } from '@shared/ipc/clipboard'
import { Logger } from '@main/observability/logger'

// Purpose: ClipboardHandler reads the clipboard, sanitizes the text, validates
// length, and returns an IpcResult envelope on every path (ok / EMPTY /
// TOO_LARGE / READ_FAILED).

// Minimal fake of Electron's clipboard module — supports readText() returning
// whatever the test seeded.
interface FakeClipboard {
  readText(): string
  __seed(text: string): void
  __throw(err: Error): void
}

function makeFakeClipboard(): FakeClipboard {
  let value = ''
  let error: Error | null = null
  return {
    readText: () => {
      if (error) throw error
      return value
    },
    __seed: (text: string) => {
      value = text
      error = null
    },
    __throw: (err: Error) => {
      error = err
    }
  }
}

// Minimal fake ipcMain that records the handle callback so tests can invoke it.
function makeFakeIpcMain(): {
  ipcMain: IpcMain
  invokeHandler(): Promise<unknown>
} {
  let storedHandler: ((event: unknown) => unknown) | null = null

  const ipcMain = {
    handle: vi.fn((_channel: string, handler: (event: unknown) => unknown) => {
      storedHandler = handler
    }),
    removeHandler: vi.fn(() => {
      storedHandler = null
    })
  } as unknown as IpcMain

  return {
    ipcMain,
    invokeHandler: () => {
      if (!storedHandler) throw new Error('No handler registered')
      return Promise.resolve(storedHandler({}))
    }
  }
}

function makeLogger(): Logger {
  // Phase 1B Logger constructor: (fileSink, bufferCapacity, source)
  return new Logger(
    { append: vi.fn(), close: vi.fn(), flush: vi.fn(), write: vi.fn() } as never,
    100,
    'main'
  )
}

describe('ClipboardHandler integration', () => {
  let logger: Logger
  let fakeClipboard: FakeClipboard
  let handler: ClipboardHandler
  let fakeIpc: ReturnType<typeof makeFakeIpcMain>

  beforeEach(() => {
    logger = makeLogger()
    fakeClipboard = makeFakeClipboard()
    fakeIpc = makeFakeIpcMain()
    handler = new ClipboardHandler(logger, fakeClipboard)
    handler.install(fakeIpc.ipcMain)
  })

  afterEach(() => {
    handler.uninstall(fakeIpc.ipcMain)
  })

  it('registers a handle on IPC_CLIPBOARD_READ_PROMPT', () => {
    expect(fakeIpc.ipcMain.handle).toHaveBeenCalledWith(
      IPC_CLIPBOARD_READ_PROMPT,
      expect.any(Function)
    )
  })

  it('returns the clipboard text on success', async () => {
    fakeClipboard.__seed('Refactor my auth middleware')
    const result = await fakeIpc.invokeHandler()
    expect(result).toEqual({
      ok: true,
      data: {
        text: 'Refactor my auth middleware',
        sanitizedLength: 'Refactor my auth middleware'.length
      }
    })
  })

  it('strips ANSI escape sequences from the captured text', async () => {
    fakeClipboard.__seed('\x1b[31mhello\x1b[0m world')
    const result = await fakeIpc.invokeHandler()
    expect(result).toEqual({
      ok: true,
      data: { text: 'hello world', sanitizedLength: 11 }
    })
  })

  it('strips a lone trailing terminal prompt prefix', async () => {
    fakeClipboard.__seed('Do the thing\n$ ')
    const result = await fakeIpc.invokeHandler() as { ok: true; data: { text: string } }
    expect(result.ok).toBe(true)
    expect(result.data.text).toBe('Do the thing')
  })

  it('normalizes Unicode to NFC', async () => {
    // 'é' as two code points (e + combining acute) → one composed code point
    fakeClipboard.__seed('é') // NFD form of 'é'
    const result = await fakeIpc.invokeHandler() as { ok: true; data: { text: string } }
    expect(result.data.text).toBe('é') // NFC form of 'é'
  })

  it('returns EMPTY when the clipboard is empty or whitespace-only', async () => {
    fakeClipboard.__seed('   \n  ')
    const result = await fakeIpc.invokeHandler()
    expect(result).toEqual({ ok: false, code: 'EMPTY' })
  })

  it('returns TOO_LARGE when the sanitized text exceeds 32KB', async () => {
    fakeClipboard.__seed('x'.repeat(33 * 1024))
    const result = await fakeIpc.invokeHandler()
    expect(result).toEqual({ ok: false, code: 'TOO_LARGE' })
  })

  it('returns READ_FAILED when readText() throws', async () => {
    fakeClipboard.__throw(new Error('clipboard access denied'))
    const result = await fakeIpc.invokeHandler()
    expect(result).toEqual({ ok: false, code: 'READ_FAILED' })
  })
})
