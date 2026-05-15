// AccountsDao — Account CRUD. All functions take a Database connection as
// their first argument (no module-level state) so tests can use :memory: and
// production uses the singleton from connection.ts.

import type { Database } from 'better-sqlite3'

import type { Account, CreateAccountInput, UpdateAccountInput } from '@shared/types/accounts'

interface AccountRow {
  id: number
  label: string
  config_dir: string
  api_key_ref: string | null
  created_at: number
}

function rowToAccount(r: AccountRow): Account {
  return {
    id: r.id,
    label: r.label,
    configDir: r.config_dir,
    apiKey: r.api_key_ref,
    createdAt: r.created_at
  }
}

export function createAccount(db: Database, input: CreateAccountInput): Account {
  const now = Date.now()
  const stmt = db.prepare(
    'INSERT INTO accounts (label, config_dir, api_key_ref, created_at) VALUES (?, ?, ?, ?)'
  )
  const result = stmt.run(input.label, input.configDir, input.apiKey ?? null, now)
  const id = Number(result.lastInsertRowid)
  return getAccountById(db, id) as Account
}

export function getAccountById(db: Database, id: number): Account | null {
  const row = db.prepare<[number], AccountRow>('SELECT * FROM accounts WHERE id = ?').get(id)
  return row ? rowToAccount(row) : null
}

export function listAccounts(db: Database): readonly Account[] {
  const rows = db
    .prepare<[], AccountRow>('SELECT * FROM accounts ORDER BY id ASC')
    .all()
  return rows.map(rowToAccount)
}

export function updateAccount(db: Database, input: UpdateAccountInput): Account | null {
  const current = getAccountById(db, input.id)
  if (!current) return null
  const next = {
    label: input.label ?? current.label,
    configDir: input.configDir ?? current.configDir,
    apiKey: input.apiKey !== undefined ? input.apiKey : current.apiKey
  }
  db.prepare(
    'UPDATE accounts SET label = ?, config_dir = ?, api_key_ref = ? WHERE id = ?'
  ).run(next.label, next.configDir, next.apiKey, input.id)
  return getAccountById(db, input.id)
}

export function deleteAccount(db: Database, id: number): boolean {
  const result = db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
  return result.changes > 0
}
