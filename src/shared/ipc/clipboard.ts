// IPC channels for the v2 clipboard-based capture / send-back flow.
// Phase 3 ships the READ direction (capture). Phase 4 adds WRITE (send).

export const IPC_CLIPBOARD_READ_PROMPT = 'clipboard:read-prompt'

export type ClipboardReadFailureCode = 'EMPTY' | 'TOO_LARGE' | 'READ_FAILED'

export interface ClipboardReadPromptResponse {
  readonly text: string
  // Byte length of the sanitized text — used for logging and future UI hints.
  readonly sanitizedLength: number
}

// Clipboard uses a specialized result shape so callers can discriminate on the
// typed `code` without the generic IpcError wrapper (which requires logId etc.).
export type ClipboardReadPromptResult =
  | { readonly ok: true; readonly data: ClipboardReadPromptResponse }
  | { readonly ok: false; readonly code: ClipboardReadFailureCode }

export const IPC_CLIPBOARD_WRITE_GEARED = 'clipboard:write-geared'

export interface ClipboardWriteGearedRequest {
  readonly text: string
}

export type ClipboardWriteFailureCode = 'WRITE_FAILED' | 'EMPTY_INPUT'

// Plain-code union, matching the read-prompt pattern (Phase 3 deviation
// from IpcError shape — Phase 6 may unify).
export type ClipboardWriteGearedResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: ClipboardWriteFailureCode }
