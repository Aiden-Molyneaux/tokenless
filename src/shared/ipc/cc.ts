// IPC channels for the claude subprocess. Phase 4A:
//   cc:start                — start a new PTY for a conversation
//   cc:send                 — write a prompt to the PTY's stdin
//   cc:resize               — resize the PTY (renderer term -> main)
//   cc:output-chunk         — main -> renderer broadcast, raw bytes
//   cc:exit                 — main -> renderer broadcast, conversation closed
//
// Phase 4B adds: cc:stop, cc:resume, cc:event (parsed), cc:error.

import type { IpcResult } from './envelope'

export const IPC_CC_START = 'cc:start'
export const IPC_CC_SEND = 'cc:send'
export const IPC_CC_RESIZE = 'cc:resize'
export const IPC_CC_OUTPUT_CHUNK = 'cc:output-chunk'
export const IPC_CC_EXIT = 'cc:exit'

export interface CcStartRequest {
  readonly conversationId: number
  readonly cwd: string
  readonly cols: number
  readonly rows: number
  // Renderer doesn't know about CLAUDE_CONFIG_DIR — main looks it up from the
  // active account. The renderer passes accountId here.
  readonly accountId: number
}

export interface CcStartResponse {
  readonly sessionId: string
  readonly pid: number
}

export interface CcSendRequest {
  readonly conversationId: number
  readonly prompt: string
  // Snapshot of composer state at send time — used for the turn row.
  readonly model: string | null
  readonly breadth: string | null
  readonly format: string | null
}

export interface CcSendResponse {
  readonly turnId: number
}

export interface CcResizeRequest {
  readonly conversationId: number
  readonly cols: number
  readonly rows: number
}

export interface CcOutputChunkPayload {
  readonly conversationId: number
  readonly chunk: string
}

export interface CcExitPayload {
  readonly conversationId: number
  readonly exitCode: number
  readonly signal?: number
}

export type CcStartResult = IpcResult<CcStartResponse>
export type CcSendResult = IpcResult<CcSendResponse>
export type CcResizeResult = IpcResult<{ ok: true }>
