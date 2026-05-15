# Phase 6C: Skills Discovery + ConfirmModal Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the skills subsystem from spec §5.3 — scan `~/.claude/skills/`, `~/.claude/plugins/*/skills/`, and `<project_root>/.claude/skills/` on app boot, reconcile against the existing `skills` table (preserving favorited/hidden state), watch with chokidar for live updates, and replace the Composer's `MOCK_SKILLS` dropdown with real data. Also upgrade the two `window.confirm()` call-sites added in Phase 6B (EditAccountModal / EditProjectModal) to a styled `ConfirmModal` component so destructive actions get proper focus management + a consistent look.

**Architecture:** A new `main/skills/` module owns scanning, parsing, watching, and DB reconciliation. The scanner reads SKILL.md files (frontmatter + body's first paragraph as description), produces `DiscoveredSkill` records keyed by absolute path. The reconciler diffs against the DB: new paths → INSERT, changed name/description → UPDATE, paths missing from the scan → mark `last_seen_at` stale (never delete; preserves favorited/hidden across uninstall+reinstall). A `SkillsWatcher` uses chokidar with a 1s debounce across all three roots; on filesystem change it re-scans + reconciles + broadcasts `skills:changed`. The renderer's `useSkills` hook subscribes to that event and refetches. The Composer's Skill dropdown sorts `favorited DESC, hidden ASC, name ASC` (per the index in spec §3) and filters out hidden by default. Favorite/hide toggle lives as a small action button inside each dropdown item; renamed `Dropdown` slot to accept an optional `renderItem` (already supported — verified). The active-project's `relevantSkillIds` field stays unused this phase; Phase 7 wires project-level skill association.

`ConfirmModal` is a small generic dialog component (mirrors the modal pattern: backdrop, escape closes, focus on Confirm button). `EditAccountModal` and `EditProjectModal` keep their existing Delete buttons but route the confirmation through this modal instead of `window.confirm`.

**Out of scope for Phase 6C (→ later):**
- Telemetry summary view (cost-over-time, savings dashboard) — separate subsystem; Phase 6D or roll into Phase 8 polish
- `claude login` PTY wrapping for new accounts — spec §5.3 says Phase 6 covers it but Phase 6A's plaintext-key path is sufficient until Phase 8 Security view
- Project-level "always include" skill selection (the `projects.relevantSkillIds` column) — Phase 7B with the branching/templates work
- Editing SKILL.md files in-app — out-of-scope for v1
- Onboarding wizard, Settings page — Phase 8

---

## File Structure

**New files (main):**
- `src/main/skills/scanner.ts` — pure functions: `scanSkillsRoots(roots: readonly string[]): Promise<readonly DiscoveredSkill[]>`, `parseSkillFile(path): Promise<DiscoveredSkill | null>`
- `src/main/skills/reconciler.ts` — `reconcile(db, discovered): { inserted: number; updated: number; markedStale: number }`
- `src/main/skills/watcher.ts` — `SkillsWatcher` class wrapping chokidar with 1s debounce + scan+reconcile+broadcast on change
- `src/main/skills/roots.ts` — helper: `resolveSkillsRoots(homeDir, activeProjectPath: string | null): readonly string[]`
- `src/main/db/dao/skills.ts` — SkillsDao (listSkills, upsertSkill, toggleFavorite, toggleHidden, markStale)
- `src/main/ipc/skills-handler.ts` — IPC handler
- `src/main/__tests__/skills/scanner.unit.test.ts`
- `src/main/__tests__/skills/reconciler.integration.test.ts`
- `src/main/__tests__/db/dao-skills.integration.test.ts`
- `src/main/__tests__/ipc/skills-handler.integration.test.ts`

**New files (shared):**
- `src/shared/types/skills.ts` — `Skill`, `DiscoveredSkill`, `SkillSource` types
- `src/shared/ipc/skills.ts` — channels + payloads

**New files (renderer):**
- `src/renderer/src/hooks/use-skills.ts`
- `src/renderer/src/components/common/ConfirmModal.tsx`
- `src/renderer/src/components/common/__tests__/confirm-modal.unit.test.tsx`

**Modified files:**
- `src/main/db/index.ts` — barrel SkillsDao
- `src/shared/ipc.ts` — re-export + union extension
- `src/main/ipc/index.ts` — register SkillsHandler, instantiate SkillsWatcher
- `src/main/index.ts` — kick off initial scan on app ready
- `src/preload/index.ts` + `index.d.ts` — expose `skills.{list,toggleFavorite,toggleHidden,rescan,onChanged}`
- `src/renderer/src/components/composer/ConfigsRow.tsx` — accept dynamic skills items, render custom item with favorite/hide actions
- `src/renderer/src/components/composer/Composer.tsx` — call `useSkills`, pass items to ConfigsRow
- `src/renderer/src/mocks/dropdown-options.ts` — delete `MOCK_SKILLS` (replaced by real data)
- `src/renderer/src/components/layout/EditAccountModal.tsx` — replace `window.confirm` with `<ConfirmModal>`
- `src/renderer/src/components/layout/EditProjectModal.tsx` — same
- `src/renderer/src/components/common/styles.css` — `.confirm-modal*` + `.dropdown__item-action` styles
- `docs/decisions.md` — ADR-036 (skills scanning + reconciliation choices)
- `docs/observability.md` — extend `skill` row with concrete events; extend `db` row with skills DAO events
- `docs/test-scenarios.md` — Phase 6C scenarios

---

## Task 1: SkillsDao + skills type

**Files:**
- Create: `src/shared/types/skills.ts`
- Create: `src/main/db/dao/skills.ts`
- Create: `src/main/__tests__/db/dao-skills.integration.test.ts`
- Modify: `src/main/db/index.ts` (barrel)

The `skills` table already exists from Phase 3 migrations (spec §3 lines 230-239):
```sql
skills(id, source, name, description, path, favorited, hidden, last_seen_at)
```

- [ ] **Step 1: Shared type**

Create `src/shared/types/skills.ts`:
```ts
export type SkillSource = 'user' | 'plugin' | 'project'

// Persisted skill row (after DB reconciliation).
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

// Scanner output before DB reconciliation. No id yet; favorited/hidden are
// owned by the DB (preserved across rescans), so the scanner doesn't surface
// them.
export interface DiscoveredSkill {
  readonly source: SkillSource
  readonly name: string
  readonly description: string | null
  readonly path: string
}
```

- [ ] **Step 2: Failing DAO test**

Create `src/main/__tests__/db/dao-skills.integration.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import {
  upsertSkill,
  listSkills,
  toggleFavorite,
  toggleHidden,
  markStale
} from '../../db/dao/skills'

describe('db/dao/skills', () => {
  let db: Database
  beforeEach(() => { db = createTestDb() })

  it('upsertSkill INSERTs new row and returns the Skill', () => {
    const now = Date.now()
    const s = upsertSkill(db, {
      source: 'user', name: 'simplify',
      description: 'review code for reuse', path: '/u/.claude/skills/simplify'
    }, now)
    expect(s.id).toBeGreaterThan(0)
    expect(s.name).toBe('simplify')
    expect(s.favorited).toBe(false)
    expect(s.hidden).toBe(false)
    expect(s.lastSeenAt).toBe(now)
  })

  it('upsertSkill UPDATEs name/description on conflict but preserves favorited/hidden', () => {
    const t1 = Date.now()
    const s1 = upsertSkill(db, {
      source: 'user', name: 'old-name',
      description: 'old', path: '/u/.claude/skills/x'
    }, t1)
    toggleFavorite(db, s1.id, true)
    const t2 = t1 + 1000
    const s2 = upsertSkill(db, {
      source: 'user', name: 'new-name',
      description: 'new', path: '/u/.claude/skills/x'
    }, t2)
    expect(s2.id).toBe(s1.id)
    expect(s2.name).toBe('new-name')
    expect(s2.description).toBe('new')
    expect(s2.favorited).toBe(true)
    expect(s2.lastSeenAt).toBe(t2)
  })

  it('toggleFavorite flips the bit; toggleHidden flips independently', () => {
    const s = upsertSkill(db, {
      source: 'user', name: 'x', description: null, path: '/x'
    }, Date.now())
    toggleFavorite(db, s.id, true)
    toggleHidden(db, s.id, true)
    const all = listSkills(db)
    expect(all[0].favorited).toBe(true)
    expect(all[0].hidden).toBe(true)
  })

  it('listSkills returns rows sorted favorited DESC, hidden ASC, name COLLATE NOCASE ASC', () => {
    const t = Date.now()
    upsertSkill(db, { source: 'user', name: 'beta', description: null, path: '/b' }, t)
    const alpha = upsertSkill(db, { source: 'user', name: 'alpha', description: null, path: '/a' }, t)
    const charlie = upsertSkill(db, { source: 'user', name: 'charlie', description: null, path: '/c' }, t)
    toggleFavorite(db, charlie.id, true)
    toggleHidden(db, alpha.id, true)
    const sorted = listSkills(db).map((s) => s.name)
    // charlie (favorited) first, then beta (visible), then alpha (hidden)
    expect(sorted).toEqual(['charlie', 'beta', 'alpha'])
  })

  it('markStale updates last_seen_at to before a cutoff', () => {
    const t1 = Date.now()
    const s = upsertSkill(db, { source: 'user', name: 'x', description: null, path: '/x' }, t1)
    const cutoff = t1 + 5000
    markStale(db, s.id, cutoff - 1)
    const rows = listSkills(db)
    expect(rows[0].lastSeenAt).toBe(cutoff - 1)
  })
})
```

- [ ] **Step 3: Implement DAO**

Create `src/main/db/dao/skills.ts`:
```ts
import type { Database } from 'better-sqlite3'

import type { Skill, SkillSource } from '@shared/types/skills'

interface SkillRow {
  id: number
  source: string
  name: string
  description: string | null
  path: string
  favorited: number
  hidden: number
  last_seen_at: number
}

function rowToSkill(r: SkillRow): Skill {
  return {
    id: r.id,
    source: r.source as SkillSource,
    name: r.name,
    description: r.description,
    path: r.path,
    favorited: r.favorited === 1,
    hidden: r.hidden === 1,
    lastSeenAt: r.last_seen_at
  }
}

export interface UpsertSkillInput {
  readonly source: SkillSource
  readonly name: string
  readonly description: string | null
  readonly path: string
}

export function upsertSkill(db: Database, input: UpsertSkillInput, seenAt: number): Skill {
  db.prepare(`
    INSERT INTO skills (source, name, description, path, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      source = excluded.source,
      name = excluded.name,
      description = excluded.description,
      last_seen_at = excluded.last_seen_at
  `).run(input.source, input.name, input.description, input.path, seenAt)
  const row = db
    .prepare<[string], SkillRow>('SELECT * FROM skills WHERE path = ?')
    .get(input.path)
  if (!row) throw new Error(`upsertSkill returned no row for path ${input.path}`)
  return rowToSkill(row)
}

export function listSkills(db: Database): readonly Skill[] {
  const rows = db
    .prepare<[], SkillRow>(
      'SELECT * FROM skills ORDER BY favorited DESC, hidden ASC, name COLLATE NOCASE ASC'
    )
    .all()
  return rows.map(rowToSkill)
}

export function toggleFavorite(db: Database, id: number, favorited: boolean): boolean {
  const r = db.prepare('UPDATE skills SET favorited = ? WHERE id = ?').run(favorited ? 1 : 0, id)
  return r.changes > 0
}

export function toggleHidden(db: Database, id: number, hidden: boolean): boolean {
  const r = db.prepare('UPDATE skills SET hidden = ? WHERE id = ?').run(hidden ? 1 : 0, id)
  return r.changes > 0
}

export function markStale(db: Database, id: number, lastSeenAt: number): boolean {
  const r = db.prepare('UPDATE skills SET last_seen_at = ? WHERE id = ?').run(lastSeenAt, id)
  return r.changes > 0
}
```

The `ON CONFLICT(path)` clause requires `path` to be UNIQUE. Phase 3's migration declared `path TEXT NOT NULL` but **not** UNIQUE. **Check the migration: if `skills.path` is not UNIQUE, add a migration in Step 4 that adds the UNIQUE constraint.** If it's already UNIQUE, skip Step 4.

- [ ] **Step 4: Migration (only if needed)**

Read `src/main/db/migrations/` and find the skills-table migration. If `path` is not UNIQUE, add a new migration file `00X-skills-path-unique.ts` (number = next in sequence) that runs:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_path ON skills(path)
```

Register it in `src/main/db/migrations/index.ts`. Add a test that the migration creates the index (or simply that the DAO's UPSERT works on a migrated DB — the DAO integration test above will exercise this).

- [ ] **Step 5: Barrel + commit**

Edit `src/main/db/index.ts`. Add:
```ts
export * as SkillsDao from './dao/skills'
```

```
npm run test:run -- src/main/__tests__/db/dao-skills.integration.test.ts
npm run typecheck
git add src/shared/types/skills.ts src/main/db/dao/skills.ts \
        src/main/db/index.ts src/main/__tests__/db/dao-skills.integration.test.ts \
        src/main/db/migrations  # only if you added one
git commit -m "feat(phase-6c): SkillsDao with upsert + favorite/hidden toggle + favorited-first ordering"
```

---

## Task 2: Roots resolver

**Files:**
- Create: `src/main/skills/roots.ts`
- Create: `src/main/__tests__/skills/roots.unit.test.ts`

- [ ] **Step 1: Failing test**

Create `src/main/__tests__/skills/roots.unit.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'

import { resolveSkillsRoots } from '../../skills/roots'

describe('skills/roots', () => {
  const home = 'C:/Users/test'

  it('returns user + plugin glob for no project', () => {
    const roots = resolveSkillsRoots(home, null)
    expect(roots).toContain(join(home, '.claude', 'skills').replace(/\\/g, '/'))
    expect(roots.some((r) => r.includes('plugins'))).toBe(true)
  })

  it('appends project-local .claude/skills when project path provided', () => {
    const roots = resolveSkillsRoots(home, 'D:/repos/myproj')
    expect(roots.some((r) => r.includes('myproj') && r.includes('skills'))).toBe(true)
  })

  it('returns POSIX-style separators only', () => {
    const roots = resolveSkillsRoots(home, 'D:\\repos\\myproj')
    roots.forEach((r) => expect(r).not.toMatch(/\\/))
  })
})
```

- [ ] **Step 2: Implement**

Create `src/main/skills/roots.ts`:
```ts
import { join } from 'node:path'

// Spec §5.3: scan ~/.claude/skills/, ~/.claude/plugins/*/skills/,
// <project_root>/.claude/skills/. The plugin path uses a glob — the scanner
// expands it via chokidar's pattern matching OR by listing ~/.claude/plugins
// and joining "skills" onto each entry. We return absolute paths with
// forward slashes; chokidar handles Windows backslash conversion but our
// tests + reconciler keep paths consistent.

function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}

export function resolveSkillsRoots(homeDir: string, activeProjectPath: string | null): readonly string[] {
  const home = toPosix(homeDir)
  const roots: string[] = [
    toPosix(join(home, '.claude', 'skills')),
    toPosix(join(home, '.claude', 'plugins')) // scanner expands /*/skills
  ]
  if (activeProjectPath) {
    roots.push(toPosix(join(activeProjectPath, '.claude', 'skills')))
  }
  return roots
}
```

- [ ] **Step 3: Verify + commit**

```
npm run test:run -- src/main/__tests__/skills/roots.unit.test.ts
git add src/main/skills/roots.ts src/main/__tests__/skills/roots.unit.test.ts
git commit -m "feat(phase-6c): skills root resolver — user + plugin + project-local paths normalized to POSIX"
```

---

## Task 3: SKILL.md parser

**Files:**
- Create: `src/main/skills/scanner.ts` (parser portion only this task)
- Create: `src/main/__tests__/skills/scanner.unit.test.ts`

SKILL.md files have the shape:
```
---
name: simplify
description: review changed code for reuse + quality
---

Body content.
First paragraph used as fallback description if frontmatter has none.
```

We support: frontmatter `name` (required), frontmatter `description` (optional), body's first paragraph as fallback description.

- [ ] **Step 1: Failing test for parseSkillContent**

Create `src/main/__tests__/skills/scanner.unit.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

import { parseSkillContent } from '../../skills/scanner'

describe('skills/scanner.parseSkillContent', () => {
  it('extracts name + description from frontmatter', () => {
    const md = [
      '---',
      'name: simplify',
      'description: review changed code for reuse + quality',
      '---',
      '',
      'Body.'
    ].join('\n')
    const r = parseSkillContent(md)
    expect(r).toEqual({ name: 'simplify', description: 'review changed code for reuse + quality' })
  })

  it('falls back to body first paragraph when frontmatter has no description', () => {
    const md = [
      '---',
      'name: review',
      '---',
      '',
      'Review a pull request thoroughly.',
      '',
      'More body.'
    ].join('\n')
    const r = parseSkillContent(md)
    expect(r).toEqual({ name: 'review', description: 'Review a pull request thoroughly.' })
  })

  it('returns null when frontmatter is missing or name is absent', () => {
    expect(parseSkillContent('# Just a heading')).toBeNull()
    expect(parseSkillContent('---\ndescription: nope\n---\nbody')).toBeNull()
  })

  it('handles CRLF line endings (Windows)', () => {
    const md = ['---', 'name: x', 'description: y', '---', 'body'].join('\r\n')
    expect(parseSkillContent(md)).toEqual({ name: 'x', description: 'y' })
  })

  it('strips quotes from values', () => {
    const md = `---\nname: "quoted"\ndescription: 'also quoted'\n---\n`
    expect(parseSkillContent(md)).toEqual({ name: 'quoted', description: 'also quoted' })
  })
})
```

- [ ] **Step 2: Implement parser**

Create `src/main/skills/scanner.ts`:
```ts
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import type { DiscoveredSkill, SkillSource } from '@shared/types/skills'

interface ParsedContent {
  readonly name: string
  readonly description: string | null
}

// Minimal SKILL.md frontmatter parser. Frontmatter is a fenced block between
// `---` delimiters at file start; we only read `name` and `description`. Any
// YAML beyond that is ignored (forward-compatible). Body's first paragraph
// is the fallback description.
export function parseSkillContent(content: string): ParsedContent | null {
  const normalized = content.replace(/\r\n/g, '\n')
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return null
  const front = match[1]
  const body = match[2] ?? ''
  const fields: Record<string, string> = {}
  for (const line of front.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/)
    if (!m) continue
    let value = m[2].trim()
    // Strip matched surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    fields[m[1]] = value
  }
  const name = fields.name
  if (!name) return null
  let description: string | null = fields.description || null
  if (!description) {
    // First paragraph of the body
    const para = body.trim().split(/\n\s*\n/)[0]?.trim() || null
    description = para
  }
  return { name, description }
}

export interface ScannerOptions {
  // Override fs operations for tests
  readonly readFileImpl?: (path: string) => Promise<string>
  readonly readdirImpl?: (path: string) => Promise<readonly string[]>
  readonly statImpl?: (path: string) => Promise<{ isDirectory(): boolean; isFile(): boolean }>
}

// Implementation of full scanner — Task 4 fills these in.
```

- [ ] **Step 3: Verify + commit**

```
npm run test:run -- src/main/__tests__/skills/scanner.unit.test.ts
git add src/main/skills/scanner.ts src/main/__tests__/skills/scanner.unit.test.ts
git commit -m "feat(phase-6c): parseSkillContent — minimal YAML frontmatter parser for SKILL.md files"
```

---

## Task 4: Full scanner (filesystem traversal)

**Files:**
- Modify: `src/main/skills/scanner.ts` (add `scanSkillsRoots`)
- Modify: `src/main/__tests__/skills/scanner.unit.test.ts` (add traversal tests)

Each skill is a directory containing `SKILL.md`. Conventions:
- `~/.claude/skills/<skill-name>/SKILL.md` → `source: 'user'`
- `~/.claude/plugins/<plugin>/skills/<skill-name>/SKILL.md` → `source: 'plugin'`
- `<project>/.claude/skills/<skill-name>/SKILL.md` → `source: 'project'`

Distinguish source by which root produced the skill. Skip non-directory entries, skip dirs without SKILL.md, log + skip dirs with invalid SKILL.md.

- [ ] **Step 1: Failing test using injected fs doubles**

Append to `src/main/__tests__/skills/scanner.unit.test.ts`:
```ts
import { scanSkillsRoots } from '../../skills/scanner'

describe('skills/scanner.scanSkillsRoots', () => {
  // Use a tiny in-memory fs facade.
  const fs = new Map<string, string>()
  const dirs = new Map<string, string[]>()

  function readFileImpl(path: string): Promise<string> {
    const c = fs.get(path)
    if (c === undefined) return Promise.reject(new Error(`ENOENT ${path}`))
    return Promise.resolve(c)
  }
  function readdirImpl(path: string): Promise<readonly string[]> {
    const d = dirs.get(path)
    if (!d) return Promise.reject(new Error(`ENOENT ${path}`))
    return Promise.resolve(d)
  }
  function statImpl(path: string): Promise<{ isDirectory(): boolean; isFile(): boolean }> {
    const inDir = dirs.has(path)
    const inFile = fs.has(path)
    if (!inDir && !inFile) return Promise.reject(new Error(`ENOENT ${path}`))
    return Promise.resolve({ isDirectory: () => inDir, isFile: () => inFile })
  }

  beforeEach(() => {
    fs.clear(); dirs.clear()
  })

  it('discovers user skills', async () => {
    dirs.set('/u/.claude/skills', ['simplify', 'review'])
    dirs.set('/u/.claude/skills/simplify', ['SKILL.md'])
    dirs.set('/u/.claude/skills/review', ['SKILL.md'])
    fs.set('/u/.claude/skills/simplify/SKILL.md',
      '---\nname: simplify\ndescription: review for reuse\n---\n')
    fs.set('/u/.claude/skills/review/SKILL.md',
      '---\nname: review\ndescription: review a PR\n---\n')
    const result = await scanSkillsRoots(
      ['/u/.claude/skills', '/u/.claude/plugins'],
      null,
      { readFileImpl, readdirImpl, statImpl }
    )
    expect(result).toHaveLength(2)
    const names = result.map((r) => r.name).sort()
    expect(names).toEqual(['review', 'simplify'])
    expect(result.every((r) => r.source === 'user')).toBe(true)
  })

  it('discovers plugin skills under .../plugins/<plugin>/skills/<name>', async () => {
    dirs.set('/u/.claude/plugins', ['acme-pack'])
    dirs.set('/u/.claude/plugins/acme-pack', ['skills'])
    dirs.set('/u/.claude/plugins/acme-pack/skills', ['security'])
    dirs.set('/u/.claude/plugins/acme-pack/skills/security', ['SKILL.md'])
    fs.set('/u/.claude/plugins/acme-pack/skills/security/SKILL.md',
      '---\nname: security\n---\nSecurity audit skill.')
    const result = await scanSkillsRoots(
      ['/u/.claude/skills', '/u/.claude/plugins'],
      null,
      { readFileImpl, readdirImpl, statImpl }
    )
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('plugin')
    expect(result[0].name).toBe('security')
    expect(result[0].description).toBe('Security audit skill.')
  })

  it('discovers project skills when project path provided', async () => {
    dirs.set('/proj/.claude/skills', ['deploy'])
    dirs.set('/proj/.claude/skills/deploy', ['SKILL.md'])
    fs.set('/proj/.claude/skills/deploy/SKILL.md', '---\nname: deploy\n---\n')
    const result = await scanSkillsRoots(
      ['/u/.claude/skills', '/u/.claude/plugins', '/proj/.claude/skills'],
      '/proj',
      { readFileImpl, readdirImpl, statImpl }
    )
    expect(result[0].source).toBe('project')
  })

  it('skips directories without SKILL.md and missing roots silently', async () => {
    dirs.set('/u/.claude/skills', ['empty', 'good'])
    dirs.set('/u/.claude/skills/empty', [])  // no SKILL.md
    dirs.set('/u/.claude/skills/good', ['SKILL.md'])
    fs.set('/u/.claude/skills/good/SKILL.md', '---\nname: good\n---\n')
    // No /u/.claude/plugins dir exists (ENOENT) — should not throw
    const result = await scanSkillsRoots(
      ['/u/.claude/skills', '/u/.claude/plugins'],
      null,
      { readFileImpl, readdirImpl, statImpl }
    )
    expect(result.map((r) => r.name)).toEqual(['good'])
  })

  it('skips SKILL.md files with invalid frontmatter', async () => {
    dirs.set('/u/.claude/skills', ['bad'])
    dirs.set('/u/.claude/skills/bad', ['SKILL.md'])
    fs.set('/u/.claude/skills/bad/SKILL.md', '# no frontmatter at all')
    const result = await scanSkillsRoots(
      ['/u/.claude/skills', '/u/.claude/plugins'],
      null,
      { readFileImpl, readdirImpl, statImpl }
    )
    expect(result).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Implement scanner**

Append to `src/main/skills/scanner.ts`:
```ts
function sourceFor(path: string, projectPath: string | null): SkillSource {
  if (projectPath && path.startsWith(projectPath)) return 'project'
  if (path.includes('/plugins/')) return 'plugin'
  return 'user'
}

async function safeReaddir(
  path: string,
  readdir: (p: string) => Promise<readonly string[]>
): Promise<readonly string[]> {
  try { return await readdir(path) } catch { return [] }
}

async function safeStat(
  path: string,
  statImpl: (p: string) => Promise<{ isDirectory(): boolean; isFile(): boolean }>
): Promise<{ isDirectory(): boolean; isFile(): boolean } | null> {
  try { return await statImpl(path) } catch { return null }
}

// Scan a single "skills container" directory for skill subdirectories.
async function scanContainer(
  containerPath: string,
  source: SkillSource,
  readdirImpl: NonNullable<ScannerOptions['readdirImpl']>,
  statImpl: NonNullable<ScannerOptions['statImpl']>,
  readFileImpl: NonNullable<ScannerOptions['readFileImpl']>
): Promise<readonly DiscoveredSkill[]> {
  const entries = await safeReaddir(containerPath, readdirImpl)
  const found: DiscoveredSkill[] = []
  for (const entry of entries) {
    const dirPath = join(containerPath, entry).replace(/\\/g, '/')
    const s = await safeStat(dirPath, statImpl)
    if (!s?.isDirectory()) continue
    const skillFile = `${dirPath}/SKILL.md`
    const f = await safeStat(skillFile, statImpl)
    if (!f?.isFile()) continue
    try {
      const content = await readFileImpl(skillFile)
      const parsed = parseSkillContent(content)
      if (!parsed) continue
      found.push({ source, name: parsed.name, description: parsed.description, path: dirPath })
    } catch {
      // Unreadable SKILL.md — skip. (The reconciler does not log here;
      // the caller decides when to surface.)
    }
  }
  return found
}

export async function scanSkillsRoots(
  roots: readonly string[],
  activeProjectPath: string | null,
  opts: ScannerOptions = {}
): Promise<readonly DiscoveredSkill[]> {
  const readFileImpl = opts.readFileImpl ?? ((p: string) => readFile(p, 'utf-8'))
  const readdirImpl = opts.readdirImpl ?? ((p: string) => readdir(p))
  const statImpl = opts.statImpl ?? ((p: string) => stat(p))

  const projectPathNormalized = activeProjectPath ? activeProjectPath.replace(/\\/g, '/') : null
  const found: DiscoveredSkill[] = []

  for (const root of roots) {
    if (root.endsWith('/plugins')) {
      // Plugin layout: iterate each plugin dir, then look for "skills"
      const plugins = await safeReaddir(root, readdirImpl)
      for (const plugin of plugins) {
        const pluginSkillsPath = `${root}/${plugin}/skills`
        const s = await safeStat(pluginSkillsPath, statImpl)
        if (!s?.isDirectory()) continue
        const items = await scanContainer(pluginSkillsPath, 'plugin', readdirImpl, statImpl, readFileImpl)
        found.push(...items)
      }
    } else {
      const source = sourceFor(root, projectPathNormalized)
      const items = await scanContainer(root, source, readdirImpl, statImpl, readFileImpl)
      found.push(...items)
    }
  }
  // Deduplicate by path (last wins) — defensive in case overlapping roots
  // produce duplicates.
  const byPath = new Map<string, DiscoveredSkill>()
  for (const s of found) byPath.set(s.path, s)
  return Array.from(byPath.values())
}
```

- [ ] **Step 3: Verify + commit**

```
npm run test:run -- src/main/__tests__/skills/scanner.unit.test.ts
npm run typecheck
git add src/main/skills/scanner.ts src/main/__tests__/skills/scanner.unit.test.ts
git commit -m "feat(phase-6c): skills scanner — traverses user/plugin/project roots, parses SKILL.md, dedup by path"
```

---

## Task 5: Reconciler

**Files:**
- Create: `src/main/skills/reconciler.ts`
- Create: `src/main/__tests__/skills/reconciler.integration.test.ts`

The reconciler diffs the scanner output against the `skills` table. For each discovered skill: upsert (name/description/last_seen_at). For each DB row whose path is NOT in the latest scan: mark stale (lower `last_seen_at`, but never delete — preserves favorited/hidden across uninstall+reinstall).

- [ ] **Step 1: Failing test**

Create `src/main/__tests__/skills/reconciler.integration.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { reconcile } from '../../skills/reconciler'
import { listSkills, upsertSkill, toggleFavorite } from '../../db/dao/skills'

describe('skills/reconciler', () => {
  let db: Database
  beforeEach(() => { db = createTestDb() })

  it('inserts new skills', () => {
    const r = reconcile(db, [
      { source: 'user', name: 'simplify', description: 'd', path: '/u/.claude/skills/simplify' }
    ], Date.now())
    expect(r.inserted).toBe(1)
    expect(r.updated).toBe(0)
    expect(r.markedStale).toBe(0)
    expect(listSkills(db)).toHaveLength(1)
  })

  it('updates description on subsequent scan, preserves favorited', () => {
    const t1 = Date.now()
    upsertSkill(db, { source: 'user', name: 'x', description: 'old', path: '/x' }, t1)
    const created = listSkills(db)[0]
    toggleFavorite(db, created.id, true)
    const t2 = t1 + 1000
    const r = reconcile(db, [
      { source: 'user', name: 'x', description: 'new', path: '/x' }
    ], t2)
    expect(r.inserted).toBe(0)
    expect(r.updated).toBe(1)
    const rows = listSkills(db)
    expect(rows[0].description).toBe('new')
    expect(rows[0].favorited).toBe(true)
  })

  it('marks rows stale when path is not in the latest scan; preserves the row', () => {
    const t1 = Date.now()
    upsertSkill(db, { source: 'user', name: 'gone', description: null, path: '/gone' }, t1)
    upsertSkill(db, { source: 'user', name: 'stays', description: null, path: '/stays' }, t1)
    toggleFavorite(db, listSkills(db).find((s) => s.name === 'gone')!.id, true)
    const t2 = t1 + 1000
    const r = reconcile(db, [
      { source: 'user', name: 'stays', description: null, path: '/stays' }
    ], t2)
    expect(r.updated).toBe(1)
    expect(r.markedStale).toBe(1)
    const rows = listSkills(db)
    expect(rows).toHaveLength(2)              // still 2 rows
    const gone = rows.find((s) => s.name === 'gone')!
    expect(gone.favorited).toBe(true)         // preserved
    expect(gone.lastSeenAt).toBeLessThan(t2)  // older than current scan
  })
})
```

- [ ] **Step 2: Implement reconciler**

Create `src/main/skills/reconciler.ts`:
```ts
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
      // Preserve favorited/hidden; just lower last_seen_at by 1ms below the
      // scan timestamp so any "is stale" query can use `< scanTimestamp` as
      // its filter.
      SkillsDao.markStale(db, s.id, scanTimestamp - 1)
      markedStale++
    }
  }

  return { inserted, updated, markedStale }
}
```

- [ ] **Step 3: Verify + commit**

```
npm run test:run -- src/main/__tests__/skills/
git add src/main/skills/reconciler.ts src/main/__tests__/skills/reconciler.integration.test.ts
git commit -m "feat(phase-6c): skills reconciler — upsert + mark-stale (never delete; preserves favorited/hidden)"
```

---

## Task 6: Shared IPC types

**Files:**
- Create: `src/shared/ipc/skills.ts`
- Modify: `src/shared/ipc.ts`

- [ ] **Step 1: Types**

Create `src/shared/ipc/skills.ts`:
```ts
import type { Skill } from '../types/skills'
import type { IpcResult } from './envelope'

export const IPC_SKILLS_LIST = 'skills:list'
export const IPC_SKILLS_TOGGLE_FAVORITE = 'skills:toggle-favorite'
export const IPC_SKILLS_TOGGLE_HIDDEN = 'skills:toggle-hidden'
export const IPC_SKILLS_RESCAN = 'skills:rescan'
export const IPC_SKILLS_CHANGED = 'skills:changed'

export interface SkillsListResponse { readonly skills: readonly Skill[] }
export interface SkillsToggleFavoriteRequest { readonly id: number; readonly favorited: boolean }
export interface SkillsToggleFavoriteResponse { readonly id: number; readonly favorited: boolean }
export interface SkillsToggleHiddenRequest { readonly id: number; readonly hidden: boolean }
export interface SkillsToggleHiddenResponse { readonly id: number; readonly hidden: boolean }
export interface SkillsRescanResponse {
  readonly inserted: number
  readonly updated: number
  readonly markedStale: number
  readonly total: number
}

export type SkillsListResult = IpcResult<SkillsListResponse>
export type SkillsToggleFavoriteResult = IpcResult<SkillsToggleFavoriteResponse>
export type SkillsToggleHiddenResult = IpcResult<SkillsToggleHiddenResponse>
export type SkillsRescanResult = IpcResult<SkillsRescanResponse>
```

- [ ] **Step 2: Extend `src/shared/ipc.ts`**

Re-export the new constants + types. Add `'skills:list' | 'skills:toggle-favorite' | 'skills:toggle-hidden' | 'skills:rescan' | 'skills:changed'` to `IpcChannelName`.

- [ ] **Step 3: Commit**

```
npm run typecheck
git add src/shared/ipc/skills.ts src/shared/ipc.ts
git commit -m "feat(phase-6c): shared IPC types for skills:list / toggle-favorite / toggle-hidden / rescan / changed"
```

---

## Task 7: SkillsHandler IPC + tests

**Files:**
- Create: `src/main/ipc/skills-handler.ts`
- Create: `src/main/__tests__/ipc/skills-handler.integration.test.ts`

Handler constructor takes `(db, logger, broadcast, rescan: () => Promise<ReconcileResult>)`. The rescan function is injected so the handler doesn't directly own the scanner — Task 8's watcher wires it. The handler exposes: list, toggleFavorite, toggleHidden, rescan. After favorite/hidden toggles, broadcasts `skills:changed` (the dropdown re-fetches). After rescan, same.

- [ ] **Step 1: Failing test**

Create `src/main/__tests__/ipc/skills-handler.integration.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { SkillsHandler } from '../../ipc/skills-handler'
import { SkillsDao } from '../../db'
import { Logger } from '../../observability/logger'

function makeLogger(): Logger {
  return new Logger(
    { write: vi.fn(), append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100, 'main'
  )
}

describe('ipc/skills-handler', () => {
  let db: Database
  let broadcast: ReturnType<typeof vi.fn>
  let rescan: ReturnType<typeof vi.fn>
  let handler: SkillsHandler

  beforeEach(() => {
    db = createTestDb()
    broadcast = vi.fn()
    rescan = vi.fn().mockResolvedValue({ inserted: 0, updated: 0, markedStale: 0 })
    handler = new SkillsHandler(db, makeLogger(), broadcast, rescan)
    SkillsDao.upsertSkill(db, {
      source: 'user', name: 's1', description: null, path: '/s1'
    }, Date.now())
  })

  it('list returns ok with current skills', async () => {
    const r = await handler.list()
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.skills).toHaveLength(1)
  })

  it('toggleFavorite flips the bit + broadcasts skills:changed', async () => {
    const s = SkillsDao.listSkills(db)[0]
    const r = await handler.toggleFavorite({ id: s.id, favorited: true })
    expect(r.ok).toBe(true)
    expect(broadcast).toHaveBeenCalledWith('skills:changed', undefined)
    expect(SkillsDao.listSkills(db)[0].favorited).toBe(true)
  })

  it('toggleFavorite returns NOT_FOUND for unknown id', async () => {
    const r = await handler.toggleFavorite({ id: 99999, favorited: true })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND')
  })

  it('rescan calls injected rescan fn, broadcasts, returns counts + total', async () => {
    rescan.mockResolvedValueOnce({ inserted: 2, updated: 1, markedStale: 0 })
    const r = await handler.rescan()
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.inserted).toBe(2)
      expect(r.data.total).toBe(1) // the one s1 we seeded in beforeEach
    }
    expect(broadcast).toHaveBeenCalledWith('skills:changed', undefined)
  })

  it('toggleHidden works analogously', async () => {
    const s = SkillsDao.listSkills(db)[0]
    const r = await handler.toggleHidden({ id: s.id, hidden: true })
    expect(r.ok).toBe(true)
    expect(SkillsDao.listSkills(db)[0].hidden).toBe(true)
  })
})
```

- [ ] **Step 2: Implement handler**

Create `src/main/ipc/skills-handler.ts`. Follow `DraftsHandler` structure. Constructor:
```ts
constructor(
  private readonly db: Database,
  private readonly logger: Logger,
  private readonly broadcast: Broadcast,
  private readonly rescanFn: () => Promise<{ inserted: number; updated: number; markedStale: number }>
) {}
```

Methods:
- `list = async (): Promise<SkillsListResult> => withIpcResult(logger, 'skill', 'skills-list', async () => ({ skills: SkillsDao.listSkills(this.db) }))`
- `toggleFavorite = async (req): Promise<SkillsToggleFavoriteResult>` — checks the row exists (NOT_FOUND error otherwise), calls SkillsDao.toggleFavorite, broadcasts `skills:changed`, returns `{ id, favorited }`
- `toggleHidden` — same pattern
- `rescan = async (): Promise<SkillsRescanResult>` — calls `this.rescanFn()`, broadcasts, returns `{ ...result, total: SkillsDao.listSkills(this.db).length }`

Install all 4 channels in `install(ipcMain)`. Mirror SettingsHandler.

- [ ] **Step 3: Verify + commit**

```
npm run test:run -- src/main/__tests__/ipc/skills-handler.integration.test.ts
npm run typecheck
git add src/main/ipc/skills-handler.ts src/main/__tests__/ipc/skills-handler.integration.test.ts
git commit -m "feat(phase-6c): SkillsHandler — list/toggleFavorite/toggleHidden/rescan with skills:changed broadcast"
```

---

## Task 8: SkillsWatcher (chokidar)

**Files:**
- Create: `src/main/skills/watcher.ts`
- Create: `src/main/__tests__/skills/watcher.unit.test.ts`

The watcher wraps chokidar with a 1s debounce. On any change in any watched root, it triggers a single rescan+reconcile and broadcasts `skills:changed`. The watcher exposes `start()` (begins watching, kicks an initial scan), `stop()` (disposes chokidar), and `triggerRescan()` (manual rescan + broadcast).

The injected `scan` and `broadcast` functions keep the watcher testable without real chokidar in tests (we mock chokidar's `watch` factory).

- [ ] **Step 1: Test using a fake chokidar**

Create `src/main/__tests__/skills/watcher.unit.test.ts`. The watcher test should:
- Inject a fake chokidar that exposes `on(event, fn)` + `close()`.
- Verify start() registers a `add` / `change` / `unlink` handler.
- Verify the 1s debounce: rapidly fire 3 events, only ONE rescan callback invocation occurs after ~1s.
- Verify stop() calls chokidar's close.

Use `vi.useFakeTimers()` for the debounce assertion.

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SkillsWatcher } from '../../skills/watcher'

interface FakeWatcher {
  handlers: Map<string, (path: string) => void>
  on: (event: string, fn: (path: string) => void) => FakeWatcher
  close: () => Promise<void>
  fire: (event: string, path: string) => void
}

function makeFakeWatcher(): FakeWatcher {
  const handlers = new Map<string, (path: string) => void>()
  const w: FakeWatcher = {
    handlers,
    on(event, fn) { handlers.set(event, fn); return w },
    close: vi.fn().mockResolvedValue(undefined) as never,
    fire(event, path) { handlers.get(event)?.(path) }
  }
  return w
}

describe('skills/watcher', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('debounces rescans: 3 rapid fs events trigger 1 rescan after 1s', async () => {
    const fake = makeFakeWatcher()
    const scan = vi.fn().mockResolvedValue(undefined)
    const broadcast = vi.fn()
    const watcher = new SkillsWatcher({
      roots: ['/a'],
      scan,
      broadcast,
      chokidarFactory: () => fake as never
    })
    watcher.start()
    expect(scan).toHaveBeenCalledTimes(1)              // initial scan on start
    fake.fire('add', '/a/x/SKILL.md')
    fake.fire('change', '/a/x/SKILL.md')
    fake.fire('unlink', '/a/x/SKILL.md')
    expect(scan).toHaveBeenCalledTimes(1)              // still 1; debounce pending
    await vi.advanceTimersByTimeAsync(1100)
    expect(scan).toHaveBeenCalledTimes(2)              // debounced scan ran
  })

  it('stop() closes the underlying chokidar watcher', async () => {
    const fake = makeFakeWatcher()
    const watcher = new SkillsWatcher({
      roots: ['/a'], scan: vi.fn(), broadcast: vi.fn(),
      chokidarFactory: () => fake as never
    })
    watcher.start()
    await watcher.stop()
    expect(fake.close).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Implement watcher**

Create `src/main/skills/watcher.ts`:
```ts
import { FSWatcher } from 'chokidar'

export interface SkillsWatcherOptions {
  readonly roots: readonly string[]
  readonly scan: () => Promise<void>
  readonly broadcast: (event: 'skills:changed', payload?: undefined) => void
  // Injectable for tests
  readonly chokidarFactory?: (roots: readonly string[]) => FSWatcher
}

const DEBOUNCE_MS = 1000

export class SkillsWatcher {
  private watcher: FSWatcher | null = null
  private debounceTimer: NodeJS.Timeout | null = null

  constructor(private readonly opts: SkillsWatcherOptions) {}

  start(): void {
    const factory = this.opts.chokidarFactory ?? defaultChokidarFactory
    this.watcher = factory(this.opts.roots)
    const onAny = (): void => this.scheduleRescan()
    this.watcher.on('add', onAny).on('change', onAny).on('unlink', onAny)
    // Initial scan on start
    void this.opts.scan()
  }

  async stop(): Promise<void> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    if (this.watcher) await this.watcher.close()
    this.watcher = null
  }

  triggerRescan(): void { this.scheduleRescan() }

  private scheduleRescan(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      void this.opts.scan().then(() => this.opts.broadcast('skills:changed', undefined))
    }, DEBOUNCE_MS)
  }
}

function defaultChokidarFactory(roots: readonly string[]): FSWatcher {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const chokidar = require('chokidar') as typeof import('chokidar')
  return chokidar.watch(roots as string[], {
    ignored: /(^|[\\/])\.(?!claude)/,  // ignore hidden except .claude
    persistent: true,
    ignoreInitial: true,                // initial scan is explicit, not via chokidar
    depth: 5
  })
}
```

- [ ] **Step 3: Verify + commit**

```
npm run test:run -- src/main/__tests__/skills/watcher.unit.test.ts
npm run typecheck
git add src/main/skills/watcher.ts src/main/__tests__/skills/watcher.unit.test.ts
git commit -m "feat(phase-6c): SkillsWatcher — chokidar with 1s debounce + injectable factory for tests"
```

---

## Task 9: Wire skills subsystem into main process

**Files:**
- Modify: `src/main/ipc/index.ts` — instantiate watcher + handler, kick off initial scan, wire active-project tracking
- Modify: `src/main/index.ts` — pass active-project-path resolver (or `null` for now; full project association is Phase 7)

The watcher needs the current active project path so it can include `<project>/.claude/skills/`. Phase 6C punts on tracking that — pass `null` from main, document as a Phase 7 follow-up. The skills system still works for user + plugin roots, which is the bulk of skills.

- [ ] **Step 1: Wire in `src/main/ipc/index.ts`**

```ts
import { homedir } from 'node:os'

import { reconcile } from '@main/skills/reconciler'
import { scanSkillsRoots } from '@main/skills/scanner'
import { resolveSkillsRoots } from '@main/skills/roots'
import { SkillsWatcher } from '@main/skills/watcher'
import { SkillsHandler } from './skills-handler'

// Inside registerIpcHandlers, after settingsHandler/pathsHandler:
const skillsBroadcast = (event: 'skills:changed'): void => broadcast(event, undefined)

const skillsRoots = resolveSkillsRoots(homedir(), null) // Phase 7 wires active project
const skillsRescan = async (): Promise<ReconcileResult> => {
  const discovered = await scanSkillsRoots(skillsRoots, null)
  return reconcile(db, discovered, Date.now())
}

const skillsHandler = new SkillsHandler(db, logger, broadcast, skillsRescan)
skillsHandler.install(ipcMain)

const skillsWatcher = new SkillsWatcher({
  roots: skillsRoots,
  scan: async () => { await skillsRescan() },
  broadcast: skillsBroadcast
})
skillsWatcher.start()

// Add to IpcRegistration interface + return object
// Add to uninstallAll: void skillsWatcher.stop(); skillsHandler.uninstall(ipcMain)
```

- [ ] **Step 2: Verify**

```
npm run typecheck
npm run test:run
```

All tests still pass. The watcher won't actually run in vitest (chokidar isn't mocked), but registerIpcHandlers isn't called from vitest tests directly — they construct handlers in isolation. Verify by reading the test list to confirm.

- [ ] **Step 3: Commit**

```
git add src/main/ipc/index.ts
git commit -m "feat(phase-6c): wire SkillsHandler + SkillsWatcher into main; user/plugin roots scanned at boot"
```

---

## Task 10: Preload exposure

**Files:**
- Modify: `src/preload/index.ts` + `index.d.ts`

Mirror the `accounts` namespace pattern: expose `list`, `toggleFavorite`, `toggleHidden`, `rescan`, `onChanged`.

- [ ] **Step 1: Edit preload runtime**

```ts
// Add imports
import {
  IPC_SKILLS_LIST, IPC_SKILLS_TOGGLE_FAVORITE, IPC_SKILLS_TOGGLE_HIDDEN,
  IPC_SKILLS_RESCAN, IPC_SKILLS_CHANGED,
  type SkillsListResult,
  type SkillsToggleFavoriteRequest, type SkillsToggleFavoriteResult,
  type SkillsToggleHiddenRequest, type SkillsToggleHiddenResult,
  type SkillsRescanResult
} from '@shared/ipc'

// Add to api object:
skills: {
  list(): Promise<SkillsListResult> {
    return ipcRenderer.invoke(IPC_SKILLS_LIST) as Promise<SkillsListResult>
  },
  toggleFavorite(req: SkillsToggleFavoriteRequest): Promise<SkillsToggleFavoriteResult> {
    return ipcRenderer.invoke(IPC_SKILLS_TOGGLE_FAVORITE, req) as Promise<SkillsToggleFavoriteResult>
  },
  toggleHidden(req: SkillsToggleHiddenRequest): Promise<SkillsToggleHiddenResult> {
    return ipcRenderer.invoke(IPC_SKILLS_TOGGLE_HIDDEN, req) as Promise<SkillsToggleHiddenResult>
  },
  rescan(): Promise<SkillsRescanResult> {
    return ipcRenderer.invoke(IPC_SKILLS_RESCAN) as Promise<SkillsRescanResult>
  },
  onChanged(fn: () => void): () => void {
    const listener = (): void => fn()
    ipcRenderer.on(IPC_SKILLS_CHANGED, listener as never)
    return () => ipcRenderer.removeListener(IPC_SKILLS_CHANGED, listener as never)
  }
}
```

- [ ] **Step 2: Mirror in `index.d.ts`**

Update the declared `tokenless.skills` namespace shape.

- [ ] **Step 3: Commit**

```
npm run typecheck
git add src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(phase-6c): preload exposes skills.{list,toggleFavorite,toggleHidden,rescan,onChanged}"
```

---

## Task 11: useSkills hook

**Files:**
- Create: `src/renderer/src/hooks/use-skills.ts`

Mirror useAccounts: list state + auto-fetch + subscribes to `skills:changed`. Adds: `toggleFavorite(id, favorited)`, `toggleHidden(id, hidden)`, `rescan()`.

- [ ] **Step 1: Write the hook**

```ts
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Skill } from '@shared/types/skills'

interface UseSkillsReturn {
  readonly skills: readonly Skill[]
  readonly loading: boolean
  readonly error: string | null
  readonly refetch: () => Promise<void>
  readonly toggleFavorite: (id: number, favorited: boolean) => Promise<boolean>
  readonly toggleHidden: (id: number, hidden: boolean) => Promise<boolean>
  readonly rescan: () => Promise<void>
}

export function useSkills(): UseSkillsReturn {
  const [skills, setSkills] = useState<readonly Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetchSkills = useCallback(async (): Promise<void> => {
    try {
      const result = await window.tokenless.skills.list()
      if (!mountedRef.current) return
      if (result.ok) {
        setSkills(result.data.skills)
        setError(null)
      } else {
        setError(result.error.message)
      }
    } catch (e) {
      if (!mountedRef.current) return
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void fetchSkills()
    const unsubscribe = window.tokenless.skills.onChanged(() => { void fetchSkills() })
    return () => { mountedRef.current = false; unsubscribe() }
  }, [fetchSkills])

  const toggleFavorite = useCallback(async (id: number, favorited: boolean): Promise<boolean> => {
    const r = await window.tokenless.skills.toggleFavorite({ id, favorited })
    return r.ok
  }, [])
  const toggleHidden = useCallback(async (id: number, hidden: boolean): Promise<boolean> => {
    const r = await window.tokenless.skills.toggleHidden({ id, hidden })
    return r.ok
  }, [])
  const rescan = useCallback(async (): Promise<void> => {
    await window.tokenless.skills.rescan()
  }, [])

  return { skills, loading, error, refetch: fetchSkills, toggleFavorite, toggleHidden, rescan }
}
```

- [ ] **Step 2: Commit**

```
npm run typecheck
git add src/renderer/src/hooks/use-skills.ts
git commit -m "feat(phase-6c): useSkills hook — live-subscribed skills list with toggleFavorite/toggleHidden/rescan"
```

---

## Task 12: Replace MOCK_SKILLS in Composer

**Files:**
- Modify: `src/renderer/src/components/composer/Composer.tsx`
- Modify: `src/renderer/src/components/composer/ConfigsRow.tsx`
- Modify: `src/renderer/src/mocks/dropdown-options.ts` (delete `MOCK_SKILLS`)

The Composer's Skill dropdown currently uses `MOCK_SKILLS` for items. Phase 6C wires it to `useSkills()`. The dropdown items are: a synthetic "None" entry at index 0 (value `''`), then each non-hidden skill (sorted favorited-first by the DAO). For the chosen value: store the skill's `path` (stable, unique) — NOT the name (names can collide across user/plugin/project sources). The builder.ts already accepts `configs.skill` as a string and embeds it; just verify the path-as-value works.

The favorite/hide toggles are deferred to a small overflow menu in the dropdown item (Task 13).

- [ ] **Step 1: Composer uses useSkills**

In `src/renderer/src/components/composer/Composer.tsx`:
- Remove `import { MOCK_SKILLS } from '../../mocks/dropdown-options'`
- Add `import { useSkills } from '../../hooks/use-skills'`
- Inside the component: `const { skills } = useSkills()`
- Compute `skillItems`:
  ```ts
  const skillItems: readonly DropdownItem[] = [
    { value: '', label: 'None', description: 'no skill requested' },
    ...skills.filter((s) => !s.hidden).map((s) => ({
      value: s.path,
      label: s.favorited ? `★ ${s.name}` : s.name,
      description: s.description ?? `${s.source} skill`
    }))
  ]
  ```
- Initialize `skill` state with `''` (None) and pass `skillItems` to ConfigsRow.

- [ ] **Step 2: ConfigsRow accepts dynamic items**

Currently ConfigsRow probably hardcodes `MOCK_SKILLS`. Change its props to accept `skillItems: readonly DropdownItem[]` instead. Composer passes the computed items.

- [ ] **Step 3: Delete MOCK_SKILLS**

Edit `src/renderer/src/mocks/dropdown-options.ts`: remove the `MOCK_SKILLS` export. Update the file-top comment to mention only models/breadths/formats are still mocked.

- [ ] **Step 4: Verify + commit**

```
npm run typecheck
npm run test:run
git add src/renderer/src/components/composer/Composer.tsx \
        src/renderer/src/components/composer/ConfigsRow.tsx \
        src/renderer/src/mocks/dropdown-options.ts
git commit -m "feat(phase-6c): Composer Skill dropdown uses real skills via useSkills (replaces MOCK_SKILLS)"
```

---

## Task 13: Favorite + hide actions in the skills dropdown

**Files:**
- Modify: `src/renderer/src/components/composer/Composer.tsx`
- Modify: `src/renderer/src/components/common/Dropdown.tsx` — verify renderItem prop works
- Modify: `src/renderer/src/components/common/styles.css` — add action button styles

Use Dropdown's existing `renderItem` slot. For each skill row, render: `label + description` (as today) PLUS two tiny right-aligned buttons: `★` (favorite toggle) and `✕` (hide toggle). Stop event propagation so clicking the action doesn't ALSO select that skill.

- [ ] **Step 1: Compose with renderItem**

In Composer's `skillItems` consumer (pass to Dropdown via `renderItem`):
```tsx
<Dropdown
  // ... existing props
  renderItem={(item, isActive) => {
    if (item.value === '') {
      return (
        <>
          <span className="dropdown__item-label">{item.label}</span>
          <span className="dropdown__item-description">{item.description}</span>
        </>
      )
    }
    const skill = skills.find((s) => s.path === item.value)
    if (!skill) return null
    return (
      <>
        <span className="dropdown__item-label">{item.label}</span>
        <span className="dropdown__item-description">{item.description}</span>
        <span className="dropdown__item-actions">
          <button
            type="button"
            className="dropdown__item-action"
            aria-label={skill.favorited ? 'Unfavorite' : 'Favorite'}
            onClick={(e) => {
              e.stopPropagation()
              void toggleFavorite(skill.id, !skill.favorited)
            }}
          >
            {skill.favorited ? '★' : '☆'}
          </button>
          <button
            type="button"
            className="dropdown__item-action"
            aria-label="Hide"
            onClick={(e) => {
              e.stopPropagation()
              void toggleHidden(skill.id, true)
            }}
          >
            ✕
          </button>
        </span>
      </>
    )
  }}
/>
```

Pull `toggleFavorite` and `toggleHidden` from `useSkills()` in Composer.

- [ ] **Step 2: CSS**

Add to `src/renderer/src/components/common/styles.css`:
```css
.dropdown__item-actions {
  display: inline-flex;
  gap: 4px;
  margin-left: auto;
}
.dropdown__item-action {
  background: transparent;
  border: none;
  color: var(--tl-mute);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  border-radius: 3px;
}
.dropdown__item-action:hover {
  background: var(--tl-active);
  color: var(--tl-fg);
}
```

Also make `.dropdown__item` use `flex-direction: row` + `align-items: baseline` so the actions can right-align, OR keep column layout and put actions in their own row. Pick whichever flows visually; column layout with `.dropdown__item-actions { margin-top: 4px; align-self: flex-end }` is simpler.

- [ ] **Step 3: Verify visually + commit**

Launch `npm run dev`, create a SKILL.md in `~/.claude/skills/test/SKILL.md`, click the Skill dropdown, verify the favorite + hide buttons work without selecting the row.

```
git add src/renderer/src/components/composer/Composer.tsx src/renderer/src/components/common/styles.css
git commit -m "feat(phase-6c): skill dropdown items expose favorite + hide action buttons"
```

---

## Task 14: ConfirmModal component

**Files:**
- Create: `src/renderer/src/components/common/ConfirmModal.tsx`
- Create: `src/renderer/src/components/common/__tests__/confirm-modal.unit.test.tsx`
- Modify: `src/renderer/src/components/common/styles.css`

A small, generic confirm dialog. Replaces the two `window.confirm` calls in Phase 6B's Edit modals. Props: `{ open, title, message, confirmLabel, cancelLabel, variant: 'default' | 'danger', onConfirm, onCancel }`.

- [ ] **Step 1: Failing component test**

Create `src/renderer/src/components/common/__tests__/confirm-modal.unit.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { ConfirmModal } from '../ConfirmModal'

describe('ConfirmModal', () => {
  it('renders title, message, and confirm/cancel buttons when open', () => {
    render(
      <ConfirmModal
        open
        title="Delete account?"
        message="Are you sure?"
        confirmLabel="Delete"
        variant="danger"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByText('Delete account?')).toBeInTheDocument()
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('returns null when not open', () => {
    const { container } = render(
      <ConfirmModal
        open={false}
        title="t" message="m"
        onConfirm={vi.fn()} onCancel={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('calls onConfirm when confirm clicked', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmModal open title="t" message="m"
        onConfirm={onConfirm} onCancel={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('calls onCancel on Escape key', () => {
    const onCancel = vi.fn()
    render(
      <ConfirmModal open title="t" message="m"
        onConfirm={vi.fn()} onCancel={onCancel} />
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Implement**

Create `src/renderer/src/components/common/ConfirmModal.tsx`:
```tsx
import { useEffect, useRef } from 'react'

interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open, title, message,
  confirmLabel = 'OK', cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm, onCancel
}: ConfirmModalProps): JSX.Element | null {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => confirmRef.current?.focus(), 0)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const confirmClass = variant === 'danger' ? 'btn btn--danger' : 'btn btn--primary'

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-modal-title" className="modal__title">{title}</h2>
        <p className="confirm-modal__message">{message}</p>
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={confirmClass}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Styles**

Add to `src/renderer/src/components/common/styles.css`:
```css
.confirm-modal { max-width: 420px; }
.confirm-modal__message { margin: 0 0 var(--tl-space-3) 0; color: var(--tl-fg); line-height: var(--tl-leading-normal); }
```

- [ ] **Step 4: Verify + commit**

```
npm run test:run -- src/renderer/src/components/common/__tests__/confirm-modal.unit.test.tsx
npm run typecheck
git add src/renderer/src/components/common/ConfirmModal.tsx \
        src/renderer/src/components/common/__tests__/confirm-modal.unit.test.tsx \
        src/renderer/src/components/common/styles.css
git commit -m "feat(phase-6c): ConfirmModal — styled component with Escape/Enter handling + danger variant"
```

---

## Task 15: Replace `window.confirm` in Edit modals

**Files:**
- Modify: `src/renderer/src/components/layout/EditAccountModal.tsx`
- Modify: `src/renderer/src/components/layout/EditProjectModal.tsx`

Both modals call `window.confirm(...)` inside their `handleDelete`. Replace with state-driven `<ConfirmModal>` mounting.

- [ ] **Step 1: EditAccountModal**

Add state:
```ts
const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
```

Replace `handleDelete`'s `window.confirm` check with:
```ts
const handleDelete = (): void => {
  setConfirmDeleteOpen(true)
}

const handleConfirmDelete = async (): Promise<void> => {
  setConfirmDeleteOpen(false)
  if (!account) return
  setSubmitting(true)
  try {
    await onDelete(account.id)
    onClose()
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err))
    setSubmitting(false)
  }
}
```

Mount the ConfirmModal in the JSX (sibling of the form, OUTSIDE the modal-backdrop so its z-index isn't trapped):
```tsx
<ConfirmModal
  open={confirmDeleteOpen}
  title="Delete account?"
  message={`Are you sure you want to delete "${account?.label ?? ''}"? This cannot be undone.`}
  confirmLabel="Delete"
  variant="danger"
  onConfirm={() => void handleConfirmDelete()}
  onCancel={() => setConfirmDeleteOpen(false)}
/>
```

Wait — the ConfirmModal renders a `.modal-backdrop` which is also `position: fixed; inset: 0`. Stacking two modal backdrops simultaneously WILL work because both use `var(--tl-z-modal): 2000` (the later-mounted DOM node paints above). But click-through-to-cancel logic could fight. Test manually after the change.

- [ ] **Step 2: EditProjectModal** — same change, with project name.

- [ ] **Step 3: Verify + commit**

```
npm run typecheck
npm run test:run
git add src/renderer/src/components/layout/EditAccountModal.tsx \
        src/renderer/src/components/layout/EditProjectModal.tsx
git commit -m "feat(phase-6c): EditAccountModal + EditProjectModal use styled ConfirmModal instead of window.confirm"
```

---

## Task 16: ADR-036

**Files:**
- Modify: `docs/decisions.md`

- [ ] **Step 1: Append**

```markdown

## ADR-036 (2026-05-15) — Skills discovery: scan-on-boot + chokidar watcher; never delete rows, mark stale instead

**Context:** Phase 6C lands the skills subsystem per spec §5.3.

**Options considered for missing skills:**
- A) DELETE rows whose paths are no longer on disk. Simple, but loses the user's favorited/hidden state if they uninstall+reinstall a skill.
- B) Mark `last_seen_at` stale (older than the current scan timestamp). Preserves all state; downstream queries can filter `last_seen_at < cutoff` if they need "currently installed only".
- C) Soft-delete flag (separate column). Same effect as B with more schema.

**Choice:** B.

**Reasoning:**
- The user's favorited/hidden state is the only durable per-skill data we own. Losing it on a transient filesystem change (e.g., a plugin update temporarily renames a directory) is bad UX.
- `last_seen_at` is already in the schema (Phase 3); using it as the staleness marker is the lowest-impact path.
- The dropdown in Composer can still filter out skills with `last_seen_at < (now - 7days)` if "currently installed only" becomes a feature — defer that until a user complains.

**Scanner architecture:**
- `scanner.ts` is pure (returns `DiscoveredSkill[]` from filesystem reads). All `fs` calls go through an injectable `ScannerOptions` interface so unit tests can use an in-memory fs.
- `reconciler.ts` is pure relative to the DB. Owns the upsert + mark-stale logic.
- `watcher.ts` wraps chokidar with a 1s debounce. `chokidarFactory` is injectable for tests.
- The three are wired in `main/ipc/index.ts` at boot. Initial scan kicks off explicitly (not via chokidar's `add` events on startup, which would fire one event per existing skill file).

**Frontmatter parser:**
- Inline minimal YAML parser (key: value lines between `---` fences). Supports quoted strings. Does NOT support nested objects, arrays, or multiline strings — none of which the SKILL.md format requires.
- Falls back to the body's first paragraph as description if frontmatter has no `description` key.

**Project-local skills:** Phase 6C resolves `~/.claude/skills/` + `~/.claude/plugins/*/skills/` only. The `<project>/.claude/skills/` root is supported by `resolveSkillsRoots` but not wired in main (active project tracking is Phase 7).

**Discovered:** Phase 6C implementation.

```

- [ ] **Step 2: Commit**

```
git add docs/decisions.md
git commit -m "docs(phase-6c): ADR-036 — skills discovery (scan + mark-stale, never delete; chokidar 1s debounce)"
```

---

## Task 17: Docs sweep — observability + scenarios

**Files:**
- Modify: `docs/observability.md`
- Modify: `docs/test-scenarios.md`

- [ ] **Step 1: observability.md**

Extend the `skill` row to enumerate concrete events:
```
| `skill` | Skill discovery and watching — `~/.claude/skills/`, plugin dirs, project-local. Phase 6C events: `skills-list`, `skills-rescan-ok`, `skills-rescan-failed`, `skills-toggle-favorite`, `skills-toggle-hidden`, `skills-watcher-started`, `skills-watcher-stopped`. |
```

Extend `db`: append `skills-upsert`, `skills-toggle-favorite`, `skills-toggle-hidden`, `skills-mark-stale` to its event list.

- [ ] **Step 2: test-scenarios.md**

Append:
```markdown

## Phase 6C — Skills discovery + ConfirmModal

### S-6C.1 User skill discovered on app boot
1. Create `~/.claude/skills/test-skill/SKILL.md` with frontmatter `name: test-skill\ndescription: a test`.
2. Launch the app.
3. Open the Skill: dropdown in Composer.
4. **Expect:** "test-skill" appears in the list with description "a test". Dev Mode shows `skills-rescan-ok` event.

### S-6C.2 Skill add/remove reflected without restart
1. With the app running, add a new SKILL.md file under `~/.claude/skills/another/`.
2. **Expect:** within 1-2s, dropdown reflects the new skill (chokidar event → debounced rescan → `skills:changed` broadcast → useSkills refetch).
3. Delete the file. The skill remains in the dropdown but goes into "stale" state. Phase 6C MVP keeps showing it (Phase 8 may filter); user can manually hide it.

### S-6C.3 Favorite + hide actions
1. Open Skill: dropdown.
2. Click the ☆ next to "test-skill". The button becomes ★. Close + reopen dropdown — test-skill now sorts to the top (with a leading ★).
3. Click the ✕ next to another skill. The skill disappears from the dropdown but the row stays in DB (run `select * from skills where hidden = 1` to verify).

### S-6C.4 Plugin skills discovered
1. Create `~/.claude/plugins/my-pack/skills/my-skill/SKILL.md`.
2. Launch (or rescan via Dev Mode → `skills:rescan` IPC).
3. **Expect:** my-skill appears with source 'plugin' (visible in the skill description fallback "plugin skill" when frontmatter has no description).

### S-6C.5 Invalid SKILL.md silently skipped
1. Create `~/.claude/skills/broken/SKILL.md` with no frontmatter (just `# heading\nbody`).
2. Rescan.
3. **Expect:** "broken" does not appear in the dropdown. Logger does not emit `error` (silent skip per scanner contract). Other valid skills are unaffected.

### S-6C.6 Favorited skill preserved across uninstall
1. Favorite a skill.
2. Delete the skill's directory.
3. Wait for chokidar debounce + rescan.
4. **Expect:** the row is still in DB with `favorited = 1` and a stale `last_seen_at`. Re-creating the directory in step 5 below restores the skill, with favorite preserved.
5. Re-create the SKILL.md file.
6. **Expect:** the skill shows up again (still favorited).

### S-6C.7 ConfirmModal replaces window.confirm in delete flows
1. Click ✎ next to an account, click Delete in the EditAccountModal.
2. **Expect:** a styled ConfirmModal appears (NOT the OS `window.confirm` dialog). Escape closes it. Cancel button works. Delete (red) actually deletes the account.
3. Same scenario for EditProjectModal.
```

- [ ] **Step 3: Commit**

```
git add docs/observability.md docs/test-scenarios.md
git commit -m "docs(phase-6c): observability events + Phase 6C manual scenarios"
```

---

## Task 18: Verification + tag v0.15.0-phase-6c

- [ ] **Step 1: Four-gate verification**

```
npm run rebuild:node
npm run typecheck
npm run test:run
```

Expected baseline: 253 (Phase 6B) + ~15 DAO + ~10 scanner + ~3 reconciler + ~5 handler + ~4 ConfirmModal + ~2 watcher + ~3 roots = ~295 tests.

```
npm run rebuild:electron
npm run build
npm run test:e2e
npm run rebuild:node
```

E2E should remain 18 passing (no new E2E added this phase — manual scenarios cover the new behavior).

- [ ] **Step 2: Tag**

```
git tag -s -a v0.15.0-phase-6c -m "Phase 6C complete — skills discovery + reconciler + watcher + ConfirmModal upgrade"
git rev-parse v0.15.0-phase-6c^{commit}
```

---

## Self-Review Checklist

- [ ] **Exit state vs plan:**
  - SkillsDao + scanner + reconciler + watcher all wired
  - Composer Skill dropdown shows real skills, favorited-first sorted
  - Favorite + hide buttons work without selecting the row
  - ConfirmModal replaces window.confirm in EditAccountModal + EditProjectModal
- [ ] **CLAUDE.md cornerstones:**
  - Every new error path through Logger (handler + scanner failures)
  - `skill` category used for all skills events (was already registered)
  - `db` category for the new DAO events
- [ ] **No silent catches** except inside `safeReaddir` / `safeStat` (those are scanner-internal "missing path → empty result" patterns and ARE documented in code)
- [ ] **TypeScript strict clean**
- [ ] **No console.*** outside tests

---

## Exit State

**Visible to user:**
- Skill dropdown in Composer lists real SKILL.md files from `~/.claude/skills/` + `~/.claude/plugins/*/skills/`
- Favoriting a skill (☆ → ★) moves it to the top of the list
- Hiding a skill (✕) removes it from the dropdown but the row persists
- Adding or removing a SKILL.md file shows up in the dropdown within ~1-2 seconds without restart
- Delete confirmation in EditAccountModal + EditProjectModal uses a styled in-app dialog (with Escape support, focus on Delete) instead of the OS-native window.confirm

**Under the hood:**
- `main/skills/scanner.ts` — pure SKILL.md frontmatter parser + filesystem traversal
- `main/skills/reconciler.ts` — DAO-aware upsert + mark-stale (never delete)
- `main/skills/watcher.ts` — chokidar with 1s debounce
- `SkillsHandler` IPC + preload + `useSkills` hook complete the renderer wiring
- ADR-036 documents the "never delete, mark stale" choice
- Skill events documented in `docs/observability.md` under the `skill` row

**Phase 6D / 7 / 8 will deliver:**
- Telemetry summary view (cost-over-time queries) — deferred to a separate phase
- Project-local skill discovery wired (`<project>/.claude/skills/`) — needs active-project tracking from Phase 7
- Project-level "always include" skill selection (`projects.relevantSkillIds`) — Phase 7B with branching/templates work
- Onboarding wizard, Settings page — Phase 8

**Tag:** `v0.15.0-phase-6c`
