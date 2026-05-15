import type { Skill } from '../types/skills'
import type { IpcResult } from './envelope'

export const IPC_SKILLS_LIST = 'skills:list'
export const IPC_SKILLS_TOGGLE_FAVORITE = 'skills:toggle-favorite'
export const IPC_SKILLS_TOGGLE_HIDDEN = 'skills:toggle-hidden'
export const IPC_SKILLS_RESCAN = 'skills:rescan'
export const IPC_SKILLS_CHANGED = 'skills:changed'

export interface SkillsListResponse {
  readonly skills: readonly Skill[]
}

export interface SkillsToggleFavoriteRequest {
  readonly id: number
  readonly favorited: boolean
}
export interface SkillsToggleFavoriteResponse {
  readonly id: number
  readonly favorited: boolean
}

export interface SkillsToggleHiddenRequest {
  readonly id: number
  readonly hidden: boolean
}
export interface SkillsToggleHiddenResponse {
  readonly id: number
  readonly hidden: boolean
}

export interface SkillsRescanResponse {
  readonly inserted: number
  readonly updated: number
  readonly markedStale: number
  readonly total: number
}

export type SkillsListResult = IpcResult<SkillsListResponse>
export type SkillsToggleFavoriteResult = IpcResult<SkillsToggleFavoriteResponse>
export type SkillsToggleHiddenResult = IpcResult<SkillsToggleHiddenResponse>
export type SkillsRescanResult = IpcResult<SkillsRescanResponse>
