// Registered, ordered migrations. SQL files are inlined via Vite's ?raw
// import so they're present in the bundled main process.
// Append-only: never edit an existing migration; add a new one.

import type { Migration } from './runner'

// eslint-disable-next-line import/no-unresolved
import init001 from './001_init.sql?raw'

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'init', sql: init001 }
]
