// IPC channels for the v2 clipboard-based capture / send-back flow.
// Phase 3 ships the READ direction (capture). Phase 4 adds WRITE (send).

import type { IpcResult } from './envelope'

export const IPC_CLIPBOARD_READ_PROMPT = 'clipboard:read-prompt'

export type ClipboardReadFailureCode = 'EMPTY' | 'TOO_LARGE' | 'READ_FAILED'

export interface ClipboardReadPromptResponse {
  readonly text: string
  // Optional: report how many characters were stripped by the sanitizer.
  // Useful for the renderer to show "captured (N chars trimmed)" hints
  // later if we want. Phase 3 doesn't surface this in UI; it's logged.
  readonly sanitizedLength: number
}

export type ClipboardReadPromptResult = IpcResult<ClipboardReadPromptResponse>
