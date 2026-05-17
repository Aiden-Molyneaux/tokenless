import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { IpcMain } from 'electron'
import { ClipboardHandler } from '@main/ipc/clipboard-handler'
import { IPC_CLIPBOARD_READ_PROMPT, IPC_CLIPBOARD_WRITE_GEARED } from '@shared/ipc/clipboard'
import { Logger } from '@main/observability/logger'

// Purpose: ClipboardHandler reads the clipboard, sanitizes the text, validates
// length, and returns an IpcResult envelope on every path (ok / EMPTY /
// TOO_LARGE / READ_FAILED). Also writes the geared prompt back to the clipboard
// on the send-back path (ok / EMPTY_INPUT / WRITE_FAILED).

// Minimal fake of Electron's clipboard module — supports readText() returning
// whatever the test seeded, and writeText() tracking the last written value.
interface FakeClipboard {
  readText(): string
  writeText(text: string): void
  __seed(text: string): void
  __throw(err: Error): void
  __seedWriteThrow(err: Error): void
  __lastWritten(): string | null
}

function makeFakeClipboard(): FakeClipboard {
  let value = ''
  let readError: Error | null = null
  let writeError: Error | null = null
  let lastWritten: string | null = null
  return {
    readText: () => {
      if (readError) throw readError
      return value
    },
    writeText: (text: string) => {
      if (writeError) throw writeError
      lastWritten = text
    },
    __seed: (text: string) => {
      value = text
      readError = null
    },
    __throw: (err: Error) => {
      readError = err
    },
    __seedWriteThrow: (err: Error) => {
      writeError = err
    },
    __lastWritten: () => lastWritten
  }
}

// Minimal fake ipcMain that records handle callbacks by channel so tests can
// invoke them with an optional payload.
function makeFakeIpcMain(): {
  ipcMain: IpcMain
  invoke(channel: string, payload?: unknown): Promise<unknown>
} {
  const registeredHandlers = new Map<string, (event: unknown, payload?: unknown) => unknown>()

  const ipcMain = {
    handle: vi.fn((channel: string, handler: (event: unknown, payload?: unknown) => unknown) => {
      registeredHandlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => {
      registeredHandlers.delete(channel)
    })
  } as unknown as IpcMain

  return {
    ipcMain,
    invoke: (channel: string, payload: unknown = {}) => {
      const handler = registeredHandlers.get(channel)
      if (!handler) throw new Error(`No handler registered for channel: ${channel}`)
      return Promise.resolve(handler({}, payload))
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
    const result = await fakeIpc.invoke(IPC_CLIPBOARD_READ_PROMPT)
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
    const result = await fakeIpc.invoke(IPC_CLIPBOARD_READ_PROMPT)
    expect(result).toEqual({
      ok: true,
      data: { text: 'hello world', sanitizedLength: 11 }
    })
  })

  it('strips a lone trailing terminal prompt prefix', async () => {
    fakeClipboard.__seed('Do the thing\n$ ')
    const result = await fakeIpc.invoke(IPC_CLIPBOARD_READ_PROMPT) as { ok: true; data: { text: string } }
    expect(result.ok).toBe(true)
    expect(result.data.text).toBe('Do the thing')
  })

  it('normalizes Unicode to NFC', async () => {
    // 'é' as two code points (e + combining acute) -> one composed code point
    fakeClipboard.__seed('é') // NFD form of e-acute
    const result = await fakeIpc.invoke(IPC_CLIPBOARD_READ_PROMPT) as { ok: true; data: { text: string } }
    expect(result.data.text).toBe('é') // NFC form of e-acute
  })

  it('returns EMPTY when the clipboard is empty or whitespace-only', async () => {
    fakeClipboard.__seed('   \n  ')
    const result = await fakeIpc.invoke(IPC_CLIPBOARD_READ_PROMPT)
    expect(result).toEqual({ ok: false, code: 'EMPTY' })
  })

  it('returns TOO_LARGE when the sanitized text exceeds 32KB', async () => {
    fakeClipboard.__seed('x'.repeat(33 * 1024))
    const result = await fakeIpc.invoke(IPC_CLIPBOARD_READ_PROMPT)
    expect(result).toEqual({ ok: false, code: 'TOO_LARGE' })
  })

  it('returns READ_FAILED when readText() throws', async () => {
    fakeClipboard.__throw(new Error('clipboard access denied'))
    const result = await fakeIpc.invoke(IPC_CLIPBOARD_READ_PROMPT)
    expect(result).toEqual({ ok: false, code: 'READ_FAILED' })
  })
})

describe('ClipboardHandler integration / write-geared', () => {
  // Purpose: handleWriteGeared validates input, writes to clipboard, and logs
  // structured events on each path (success / empty-input / write-failed).

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

  it('writes the text to the system clipboard on success', async () => {
    const result = await fakeIpc.invoke(IPC_CLIPBOARD_WRITE_GEARED, { text: 'Refactor src/auth.ts' })
    expect(result).toEqual({ ok: true })
    expect(fakeClipboard.__lastWritten()).toBe('Refactor src/auth.ts')
  })

  it('returns EMPTY_INPUT when the text is empty or whitespace-only', async () => {
    const result = await fakeIpc.invoke(IPC_CLIPBOARD_WRITE_GEARED, { text: '   \n  ' })
    expect(result).toEqual({ ok: false, code: 'EMPTY_INPUT' })
    expect(fakeClipboard.__lastWritten()).toBeNull()
  })

  it('returns WRITE_FAILED when writeText() throws', async () => {
    fakeClipboard.__seedWriteThrow(new Error('clipboard locked'))
    const result = await fakeIpc.invoke(IPC_CLIPBOARD_WRITE_GEARED, { text: 'anything' })
    expect(result).toEqual({ ok: false, code: 'WRITE_FAILED' })
  })

  it('logs send-copied on success with textLength context', async () => {
    await fakeIpc.invoke(IPC_CLIPBOARD_WRITE_GEARED, { text: 'hello' })
    const records = logger.getRecent()
    const entry = records.find((r) => r.event === 'send-copied')
    expect(entry).toBeDefined()
    expect(entry!.context.textLength).toBe(5)
  })
})
