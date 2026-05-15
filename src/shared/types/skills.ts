export type SkillSource = 'user' | 'plugin' | 'project'

export interface Skill {
  readonly id: number
  readonly source: SkillSource
  readonly name: string
  readonly description: string | null
  readonly path: string
  readonly favorited: boolean
  readonly hidden: boolean
  readonly lastSeenAt: number
}

export interface DiscoveredSkill {
  readonly source: SkillSource
  readonly name: string
  readonly description: string | null
  readonly path: string
}
