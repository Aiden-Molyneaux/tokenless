// Typed IPC contract between main and renderer.
// Phase 1 populates this with the Logger bridge channels.
// Subsequent phases add cc:*, gear:*, projects:*, etc.

export type IpcChannelName = 'phase-0:ping'

export type IpcRequest = {
  'phase-0:ping': void
}

export type IpcResponse = {
  'phase-0:ping': { ok: true; data: { ts: number } }
}
