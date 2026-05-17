// Public Project shape that crosses the IPC boundary.

export type ModelHint = 'haiku' | 'sonnet' | 'opus'
export type BreadthHint = 'terse' | 'normal' | 'thorough'
export type FormatHint = 'prose' | 'bullets' | 'code' | 'json'

export interface Project {
  readonly id: number
  readonly name: string
  readonly rootPath: string
  readonly defaultAccountId: number | null
  readonly defaultModel: ModelHint | null
  readonly defaultBreadth: BreadthHint | null
  readonly defaultFormat: FormatHint | null
  readonly notes: string | null
  readonly alwaysIncludeFiles: readonly string[]
  readonly relevantSkillIds: readonly number[]
  readonly createdAt: number
  readonly updatedAt: number
}

export interface CreateProjectInput {
  readonly name: string
  readonly rootPath: string
  readonly defaultAccountId?: number | null
  readonly defaultModel?: ModelHint | null
  readonly defaultBreadth?: BreadthHint | null
  readonly defaultFormat?: FormatHint | null
  readonly notes?: string | null
}

export interface UpdateProjectInput {
  readonly id: number
  readonly name?: string
  readonly rootPath?: string
  readonly defaultAccountId?: number | null
  readonly defaultModel?: ModelHint | null
  readonly defaultBreadth?: BreadthHint | null
  readonly defaultFormat?: FormatHint | null
  readonly notes?: string | null
  readonly alwaysIncludeFiles?: readonly string[]
  readonly relevantSkillIds?: readonly number[]
}
