// IPC channels for the v2 clipboard-based capture / send-back flow.
// Phase 3 ships the READ direction (capture). Phase 4 added WRITE (send).
//
// Design note: ClipboardReadPromptResult and ClipboardWriteGearedResult both
// use a custom union shape ({ ok: true, ... } | { ok: false, code: '...' })
// instead of the project's canonical IpcResult<T> = IpcOk<T> | IpcError
// pattern. The reason: failures here (EMPTY, TOO_LARGE, EMPTY_INPUT) are
// expected business outcomes (the user clicked Capture with nothing on the
// clipboard, etc.), not exceptions. The canonical IpcError shape carries
// { message, code, logId } meant for exception-style failures with full
// diagnostic context; that's overkill for "the clipboard happened to be
// empty." The custom-union pattern is intentional for the clipboard
// namespace and should be preserved if Phase 7+ adds more clipboard
// channels. See ADR-051 in docs/decisions.md for the full rationale.

export const IPC_CLIPBOARD_READ_PROMPT = 'clipboard:read-prompt'

export type ClipboardReadFailureCode = 'EMPTY' | 'TOO_LARGE' | 'READ_FAILED'

export interface ClipboardReadPromptResponse {
  readonly text: string
  // Byte length of the sanitized text — used for logging and future UI hints.
  readonly sanitizedLength: number
}

export type ClipboardReadPromptResult =
  | { readonly ok: true; readonly data: ClipboardReadPromptResponse }
  | { readonly ok: false; readonly code: ClipboardReadFailureCode }

export const IPC_CLIPBOARD_WRITE_GEARED = 'clipboard:write-geared'

export interface ClipboardWriteGearedRequest {
  readonly text: string
}

export type ClipboardWriteFailureCode = 'WRITE_FAILED' | 'EMPTY_INPUT'

export type ClipboardWriteGearedResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: ClipboardWriteFailureCode }
