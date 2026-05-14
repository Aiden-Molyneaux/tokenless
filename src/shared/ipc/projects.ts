// IPC channels for projects CRUD + a change broadcast (main -> renderer) that
// lets hooks invalidate cached lists across windows.

import type { Project, CreateProjectInput, UpdateProjectInput } from '../types/projects'
import type { IpcResult } from './envelope'

export const IPC_PROJECTS_LIST = 'projects:list'
export const IPC_PROJECTS_CREATE = 'projects:create'
export const IPC_PROJECTS_UPDATE = 'projects:update'
export const IPC_PROJECTS_DELETE = 'projects:delete'
export const IPC_PROJECTS_CHANGED = 'projects:changed' // main -> renderer broadcast

export interface ProjectsListResponse {
  readonly projects: readonly Project[]
}
export interface ProjectsCreateRequest {
  readonly input: CreateProjectInput
}
export interface ProjectsCreateResponse {
  readonly project: Project
}
export interface ProjectsUpdateRequest {
  readonly input: UpdateProjectInput
}
export interface ProjectsUpdateResponse {
  readonly project: Project
}
export interface ProjectsDeleteRequest {
  readonly id: number
}
export interface ProjectsDeleteResponse {
  readonly id: number
}

export type ProjectsListResult = IpcResult<ProjectsListResponse>
export type ProjectsCreateResult = IpcResult<ProjectsCreateResponse>
export type ProjectsUpdateResult = IpcResult<ProjectsUpdateResponse>
export type ProjectsDeleteResult = IpcResult<ProjectsDeleteResponse>
