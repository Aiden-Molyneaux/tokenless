// Registered, ordered migrations. Numeric prefix in the file name determines
// version. Append-only: never edit an existing migration; add a new one.

import type { Migration } from './runner'

// Will be populated by Task 6 with the initial schema migration.
export const MIGRATIONS: readonly Migration[] = []
