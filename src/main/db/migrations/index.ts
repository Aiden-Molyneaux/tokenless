// Registered, ordered migrations. SQL files are inlined via Vite's ?raw
// import so they're present in the bundled main process.
// Append-only: never edit an existing migration; add a new one.

import type { Migration } from './runner'

// eslint-disable-next-line import/no-unresolved
import init001 from './001_init.sql?raw'
// eslint-disable-next-line import/no-unresolved
import skillsPathUnique002 from './002_skills_path_unique.sql?raw'
// eslint-disable-next-line import/no-unresolved
import v2Headless003 from './003_v2_headless.sql?raw'
// eslint-disable-next-line import/no-unresolved
import removeCommitPushPrompts004 from './004_remove_commit_push_prompts.sql?raw'

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'init', sql: init001 },
  { version: 2, name: 'skills_path_unique', sql: skillsPathUnique002 },
  { version: 3, name: 'v2_headless', sql: v2Headless003 },
  { version: 4, name: 'remove_commit_push_prompts', sql: removeCommitPushPrompts004 }
]
