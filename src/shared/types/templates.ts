export interface Template {
  readonly id: number
  readonly name: string
  readonly body: string
  readonly description: string | null
  readonly category: string | null
  readonly builtin: boolean
  readonly createdAt: number
  readonly updatedAt: number
}

export interface CreateTemplateInput {
  readonly name: string
  readonly body: string
  readonly description?: string | null
  readonly category?: string | null
  readonly builtin?: boolean
}

export interface UpdateTemplateInput {
  readonly id: number
  readonly name?: string
  readonly body?: string
  readonly description?: string | null
  readonly category?: string | null
}
