// ClipboardHandler — Phase 3 of the v2 headless refactor. Reads the user's
// system clipboard, sanitizes the text, validates length, and returns an
// IpcResult. The clipboard interface is injected so tests can pass a fake.

import { clipboard as electronClipboard, type IpcMain } from 'electron'

import { IPC_CLIPBOARD_READ_PROMPT } from '@shared/ipc/clipboard'
import type { ClipboardReadPromptResult } from '@shared/ipc/clipboard'
import type { Logger } from '../observability/logger'

const MAX_LENGTH_BYTES = 32 * 1024

// Minimal interface so tests can inject a fake.
export interface ClipboardSurface {
  readText(): string
}

const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*[A-Za-z]/g
const TRAILING_PROMPT_PREFIX_RE = /\n\s*(?:PS\s*>|\$|>|#)\s*$/

function sanitize(raw: string): string {
  return raw
    .replace(ANSI_ESCAPE_RE, '')
    .normalize('NFC')
    .replace(TRAILING_PROMPT_PREFIX_RE, '')
}

export class ClipboardHandler {
  constructor(
    private readonly logger: Logger,
    private readonly clipboard: ClipboardSurface = electronClipboard
  ) {}

  install(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_CLIPBOARD_READ_PROMPT, () => this.handleReadPrompt())
  }

  uninstall(ipcMain: IpcMain): void {
    ipcMain.removeHandler(IPC_CLIPBOARD_READ_PROMPT)
  }

  private handleReadPrompt(): ClipboardReadPromptResult {
    let raw: string
    try {
      raw = this.clipboard.readText()
    } catch (err) {
      this.logger.error('clipboard', 'capture-read-failed', 'clipboard.readText() threw', {
        errorString: err instanceof Error ? err.message : String(err)
      })
      return { ok: false, code: 'READ_FAILED' }
    }

    const text = sanitize(raw)

    if (text.trim().length === 0) {
      this.logger.info('clipboard', 'capture-empty', 'clipboard returned empty/whitespace text', {
        rawLength: raw.length
      })
      return { ok: false, code: 'EMPTY' }
    }

    if (Buffer.byteLength(text, 'utf-8') > MAX_LENGTH_BYTES) {
      this.logger.warn('clipboard', 'capture-too-large', `clipboard text exceeds ${MAX_LENGTH_BYTES} bytes`, {
        sanitizedLength: text.length,
        sanitizedByteLength: Buffer.byteLength(text, 'utf-8')
      })
      return { ok: false, code: 'TOO_LARGE' }
    }

    this.logger.info('clipboard', 'capture-read', 'clipboard captured', {
      sanitizedLength: text.length,
      rawLength: raw.length
    })

    return { ok: true, data: { text, sanitizedLength: text.length } }
  }
}
