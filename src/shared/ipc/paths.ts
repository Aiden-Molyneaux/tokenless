import type { IpcResult } from './envelope'

export const IPC_PATHS_CHECK_DIR = 'paths:check-dir'

export interface PathsCheckDirRequest { readonly path: string }
export interface PathsCheckDirResponse {
  readonly exists: boolean
  readonly isDirectory: boolean
}

export type PathsCheckDirResult = IpcResult<PathsCheckDirResponse>

export const IPC_PATHS_GET_APP_PATHS = 'paths:get-app-paths'
export const IPC_PATHS_OPEN_FOLDER = 'paths:open-folder'

export interface PathsGetAppPathsResponse {
  readonly userData: string
  readonly logs: string
  readonly db: string
}

export interface PathsOpenFolderRequest { readonly path: string }
export interface PathsOpenFolderResponse { readonly ok: true }

export type PathsGetAppPathsResult = IpcResult<PathsGetAppPathsResponse>
export type PathsOpenFolderResult = IpcResult<PathsOpenFolderResponse>
