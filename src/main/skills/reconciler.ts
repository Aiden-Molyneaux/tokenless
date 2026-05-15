import type { Database } from 'better-sqlite3'

import { SkillsDao } from '../db'
import type { DiscoveredSkill } from '@shared/types/skills'

export interface ReconcileResult {
  readonly inserted: number
  readonly updated: number
  readonly markedStale: number
}

export function reconcile(
  db: Database,
  discovered: readonly DiscoveredSkill[],
  scanTimestamp: number
): ReconcileResult {
  const before = SkillsDao.listSkills(db)
  const beforePaths = new Set(before.map((s) => s.path))
  let inserted = 0
  let updated = 0

  for (const d of discovered) {
    const wasPresent = beforePaths.has(d.path)
    SkillsDao.upsertSkill(db, d, scanTimestamp)
    if (wasPresent) updated++
    else inserted++
  }

  const discoveredPaths = new Set(discovered.map((d) => d.path))
  let markedStale = 0
  for (const s of before) {
    if (!discoveredPaths.has(s.path)) {
      // Preserve favorited/hidden; lower last_seen_at below the current scan
      // timestamp so a "stale = last_seen_at < scanTimestamp" filter works.
      SkillsDao.markStale(db, s.id, scanTimestamp - 1)
      markedStale++
    }
  }

  return { inserted, updated, markedStale }
}
