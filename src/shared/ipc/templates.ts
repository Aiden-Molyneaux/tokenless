import type { Template, CreateTemplateInput, UpdateTemplateInput } from '../types/templates'
import type { IpcResult } from './envelope'

export const IPC_TEMPLATES_LIST = 'templates:list'
export const IPC_TEMPLATES_CREATE = 'templates:create'
export const IPC_TEMPLATES_UPDATE = 'templates:update'
export const IPC_TEMPLATES_DELETE = 'templates:delete'
export const IPC_TEMPLATES_CHANGED = 'templates:changed'

export interface TemplatesListResponse {
  readonly templates: readonly Template[]
}

export interface TemplatesCreateRequest {
  readonly input: CreateTemplateInput
}
export interface TemplatesCreateResponse {
  readonly template: Template
}

export interface TemplatesUpdateRequest {
  readonly input: UpdateTemplateInput
}
export interface TemplatesUpdateResponse {
  readonly template: Template
}

export interface TemplatesDeleteRequest {
  readonly id: number
}
export interface TemplatesDeleteResponse {
  readonly id: number
  readonly deleted: boolean
}

export type TemplatesListResult = IpcResult<TemplatesListResponse>
export type TemplatesCreateResult = IpcResult<TemplatesCreateResponse>
export type TemplatesUpdateResult = IpcResult<TemplatesUpdateResponse>
export type TemplatesDeleteResult = IpcResult<TemplatesDeleteResponse>
