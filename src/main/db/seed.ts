// First-run seed data. Idempotent — safe to call on every boot.

import type { Database } from 'better-sqlite3'

import { createAccount, listAccounts } from './dao/accounts'
import { seedBuiltinTemplates } from './seed-templates'

export function seedDefaultAccount(db: Database): void {
  const existing = listAccounts(db)
  if (existing.length > 0) return
  createAccount(db, {
    label: 'Personal',
    configDir: '',
    apiKey: null
  })
}

export function seedBuiltinData(db: Database): void {
  seedDefaultAccount(db)
  seedBuiltinTemplates(db)
}
