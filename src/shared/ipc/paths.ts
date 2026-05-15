import type { IpcResult } from './envelope'

export const IPC_PATHS_CHECK_DIR = 'paths:check-dir'

export interface PathsCheckDirRequest { readonly path: string }
export interface PathsCheckDirResponse {
  readonly exists: boolean
  readonly isDirectory: boolean
}

export type PathsCheckDirResult = IpcResult<PathsCheckDirResponse>
