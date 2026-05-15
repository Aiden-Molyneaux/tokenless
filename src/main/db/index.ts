// Public surface of the db module. Importers go through this barrel; nothing
// reaches into db/dao/* or db/migrations/* directly outside the db module.

export { openDatabase, closeDatabase, type Database } from './connection'
export { runMigrations } from './migrations/runner'
export { MIGRATIONS } from './migrations'
export { seedDefaultAccount } from './seed'

export * as AccountsDao from './dao/accounts'
export * as ProjectsDao from './dao/projects'
export * as ConversationsDao from './dao/conversations'
export * as DraftsDao from './dao/drafts'
export * as SettingsDao from './dao/settings'
export * as SkillsDao from './dao/skills'
