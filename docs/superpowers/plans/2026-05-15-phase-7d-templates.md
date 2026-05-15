# Phase 7D: Templates Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land prompt templates per spec §2 — a `templates` table with built-in seeded entries and user-creatable rows, surfaced via a new "Templates" button in the Composer's ActionsRow that opens a popover listing templates by category. Clicking inserts the template's body into the composer textarea. The full `/templates` page CRUD UI is deferred to Phase 8; v1 ships the picker + seeded built-ins.

**Architecture:** A new `TemplatesDao` is the only writer to the `templates` table (Phase 3 schema). On app boot, `seedBuiltinTemplates(db)` inserts ~8 built-ins idempotently (skip if a builtin row with the same name already exists). `TemplatesHandler` exposes `list`, `create`, `update`, `delete` IPC channels with a `templates:changed` broadcast for live UI refresh. The Composer's ActionsRow gains a "Templates ▾" button (alongside Commit/Push) that opens `TemplatePickerPopover` — a small listbox grouped by category. Clicking a row calls `onInsert(template.body)` which appends the body to the composer prompt (with a newline separator if the existing prompt is non-empty). Built-in templates are read-only this phase; user-created templates would be editable in the Phase 8 settings view (not in v1's picker).

**Seeded built-ins (8):**
1. **Refactor for clarity** — `refactor` — "Refactor the highlighted code for clarity. Preserve behavior. Don't add new features. Output only the diff."
2. **Add JSDoc** — `docs` — "Add JSDoc comments to every public export in this file. Focus on parameter contracts + return types. Don't change behavior."
3. **Write tests** — `tests` — "Write tests for this function. Cover happy path + 2-3 edge cases. Use the project's existing test framework. Output only the test file."
4. **Code review** — `review` — "Review the pending changes. Flag: bugs, missed edge cases, naming inconsistencies, dead code. Skip nits."
5. **Explain this code** — `explain` — "Explain what this code does, why it's structured this way, and which inputs/outputs to watch. ≤200 words."
6. **Debug this error** — `debug` — "Diagnose this error. Cite the line in the stack trace, the most likely cause, and the smallest fix."
7. **Commit message** — `git` — "Write a commit message for these staged changes. Focus on the *why*, not the *what*. ≤72 chars subject, blank line, ≤2 paragraphs body."
8. **Pull request description** — `git` — "Write a PR description for these changes. Summary (3-5 bullets), screenshots if UI, test plan (checkbox list)."

**Out of scope for Phase 7D (→ Phase 8):**
- Full `/templates` route with create/edit/delete UI for user templates
- Importing/exporting template sets
- Per-project template scoping (`templates.project_id` column — not in v1 schema)
- Built-in templates editing (read-only — user creates copies if they want to customize)
- Template variables/placeholders (e.g., `{{file}}`)

---

## File Structure

**New files (main):**
- `src/main/db/dao/templates.ts` — `TemplatesDao` (create/list/getById/update/delete)
- `src/main/__tests__/db/dao-templates.integration.test.ts`
- `src/main/db/seed-templates.ts` — `seedBuiltinTemplates(db)` idempotent
- `src/main/__tests__/db/seed-templates.unit.test.ts`
- `src/main/ipc/templates-handler.ts`
- `src/main/__tests__/ipc/templates-handler.integration.test.ts`

**New files (shared):**
- `src/shared/types/templates.ts` — `Template`, `CreateTemplateInput`, `UpdateTemplateInput`
- `src/shared/ipc/templates.ts` — channels + payloads

**New files (renderer):**
- `src/renderer/src/hooks/use-templates.ts`
- `src/renderer/src/components/composer/TemplatePickerPopover.tsx`

**Modified files:**
- `src/main/db/index.ts` — barrel TemplatesDao
- `src/main/db/seed.ts` — call seedBuiltinTemplates alongside seedDefaultAccount
- `src/shared/ipc.ts` — re-export + extend `IpcChannelName`
- `src/main/ipc/index.ts` — register TemplatesHandler
- `src/preload/index.ts` + `index.d.ts` — expose `templates.{list, create, update, delete, onChanged}`
- `src/renderer/src/components/composer/ActionsRow.tsx` — add "Templates ▾" button + receive onTemplatesClick prop
- `src/renderer/src/components/composer/Composer.tsx` — mount TemplatePickerPopover state + onInsert handler
- `src/renderer/src/components/composer/styles.css` — `.template-picker-popover*` rules
- `docs/decisions.md` — ADR-039
- `docs/observability.md` — extend `db` row events
- `docs/test-scenarios.md` — Phase 7D scenarios

---

## Task 1: TemplatesDao + types

**Files:**
- Create: `src/shared/types/templates.ts`
- Create: `src/main/db/dao/templates.ts`
- Create: `src/main/__tests__/db/dao-templates.integration.test.ts`
- Modify: `src/main/db/index.ts` — barrel

- [ ] **Step 1: Shared type**

Create `src/shared/types/templates.ts`:
```ts
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
  readonly builtin?: boolean  // default false
}

export interface UpdateTemplateInput {
  readonly id: number
  readonly name?: string
  readonly body?: string
  readonly description?: string | null
  readonly category?: string | null
}
```

- [ ] **Step 2: Failing DAO test**

Create `src/main/__tests__/db/dao-templates.integration.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import {
  createTemplate,
  listTemplates,
  getTemplateById,
  updateTemplate,
  deleteTemplate
} from '../../db/dao/templates'

describe('db/dao/templates', () => {
  let db: Database
  beforeEach(() => { db = createTestDb() })

  it('createTemplate inserts a row and returns the Template', () => {
    const t = createTemplate(db, { name: 'Foo', body: 'do foo', description: 'desc', category: 'refactor' })
    expect(t.id).toBeGreaterThan(0)
    expect(t.name).toBe('Foo')
    expect(t.body).toBe('do foo')
    expect(t.description).toBe('desc')
    expect(t.category).toBe('refactor')
    expect(t.builtin).toBe(false)
    expect(t.createdAt).toBeGreaterThan(0)
  })

  it('createTemplate flags builtin=true when requested', () => {
    const t = createTemplate(db, { name: 'B', body: 'x', builtin: true })
    expect(t.builtin).toBe(true)
  })

  it('listTemplates returns rows sorted builtin DESC, category ASC, name ASC', () => {
    createTemplate(db, { name: 'Zeta', body: 'z', category: 'refactor', builtin: true })
    createTemplate(db, { name: 'Alpha', body: 'a', category: 'docs', builtin: false })
    createTemplate(db, { name: 'Beta', body: 'b', category: 'refactor', builtin: true })
    const list = listTemplates(db)
    expect(list.map((t) => t.name)).toEqual(['Beta', 'Zeta', 'Alpha'])
  })

  it('getTemplateById returns null for unknown id', () => {
    expect(getTemplateById(db, 99999)).toBeNull()
  })

  it('updateTemplate patches fields and bumps updated_at', async () => {
    const t = createTemplate(db, { name: 'Old', body: 'o' })
    await new Promise((r) => setTimeout(r, 5)) // ensure updated_at changes
    const updated = updateTemplate(db, { id: t.id, name: 'New' })
    expect(updated?.name).toBe('New')
    expect(updated?.body).toBe('o')
    expect(updated?.updatedAt).toBeGreaterThan(t.updatedAt)
  })

  it('updateTemplate returns null for unknown id', () => {
    expect(updateTemplate(db, { id: 99999, name: 'X' })).toBeNull()
  })

  it('deleteTemplate removes the row', () => {
    const t = createTemplate(db, { name: 'X', body: 'x' })
    expect(deleteTemplate(db, t.id)).toBe(true)
    expect(getTemplateById(db, t.id)).toBeNull()
  })

  it('deleteTemplate returns false for unknown id', () => {
    expect(deleteTemplate(db, 99999)).toBe(false)
  })
})
```

- [ ] **Step 3: Implement DAO**

Create `src/main/db/dao/templates.ts`:
```ts
import type { Database } from 'better-sqlite3'

import type {
  Template,
  CreateTemplateInput,
  UpdateTemplateInput
} from '@shared/types/templates'

interface TemplateRow {
  id: number
  name: string
  body: string
  description: string | null
  category: string | null
  builtin: number
  created_at: number
  updated_at: number
}

function rowToTemplate(r: TemplateRow): Template {
  return {
    id: r.id,
    name: r.name,
    body: r.body,
    description: r.description,
    category: r.category,
    builtin: r.builtin === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export function createTemplate(db: Database, input: CreateTemplateInput): Template {
  const now = Date.now()
  const result = db.prepare(`
    INSERT INTO templates (name, body, description, category, builtin, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.name,
    input.body,
    input.description ?? null,
    input.category ?? null,
    input.builtin ? 1 : 0,
    now,
    now
  )
  const created = getTemplateById(db, Number(result.lastInsertRowid))
  if (!created) throw new Error('createTemplate: SELECT after INSERT returned no row')
  return created
}

export function getTemplateById(db: Database, id: number): Template | null {
  const row = db.prepare<[number], TemplateRow>('SELECT * FROM templates WHERE id = ?').get(id)
  return row ? rowToTemplate(row) : null
}

export function listTemplates(db: Database): readonly Template[] {
  const rows = db
    .prepare<[], TemplateRow>(
      'SELECT * FROM templates ORDER BY builtin DESC, category COLLATE NOCASE ASC, name COLLATE NOCASE ASC'
    )
    .all()
  return rows.map(rowToTemplate)
}

export function updateTemplate(db: Database, input: UpdateTemplateInput): Template | null {
  const current = getTemplateById(db, input.id)
  if (!current) return null
  const next = {
    name: input.name ?? current.name,
    body: input.body ?? current.body,
    description: input.description !== undefined ? input.description : current.description,
    category: input.category !== undefined ? input.category : current.category
  }
  const now = Date.now()
  db.prepare(`
    UPDATE templates
    SET name = ?, body = ?, description = ?, category = ?, updated_at = ?
    WHERE id = ?
  `).run(next.name, next.body, next.description, next.category, now, input.id)
  return getTemplateById(db, input.id)
}

export function deleteTemplate(db: Database, id: number): boolean {
  const result = db.prepare('DELETE FROM templates WHERE id = ?').run(id)
  return result.changes > 0
}
```

- [ ] **Step 4: Barrel + commit**

Edit `src/main/db/index.ts`. Add (alphabetical):
```ts
export * as TemplatesDao from './dao/templates'
```

```
npm run test:run -- src/main/__tests__/db/dao-templates.integration.test.ts
npm run typecheck
git add src/shared/types/templates.ts src/main/db/dao/templates.ts src/main/db/index.ts \
        src/main/__tests__/db/dao-templates.integration.test.ts
git commit -m "feat(phase-7d): TemplatesDao — CRUD with builtin flag + builtin-first sort order"
```

Expected: 8 new DAO tests; full suite +8.

---

## Task 2: Built-in template seeding

**Files:**
- Create: `src/main/db/seed-templates.ts`
- Create: `src/main/__tests__/db/seed-templates.unit.test.ts`
- Modify: `src/main/db/seed.ts` — call from existing seed entry-point

Idempotency: a built-in is identified by `(builtin=1, name=<name>)`. Re-running seed should NOT duplicate.

- [ ] **Step 1: Failing test**

Create `src/main/__tests__/db/seed-templates.unit.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { seedBuiltinTemplates } from '../../db/seed-templates'
import { listTemplates } from '../../db/dao/templates'

describe('db/seed-templates', () => {
  let db: Database
  beforeEach(() => { db = createTestDb() })

  it('inserts the 8 built-in templates on first run', () => {
    seedBuiltinTemplates(db)
    const all = listTemplates(db).filter((t) => t.builtin)
    expect(all.length).toBe(8)
  })

  it('is idempotent — re-running does not duplicate rows', () => {
    seedBuiltinTemplates(db)
    seedBuiltinTemplates(db)
    seedBuiltinTemplates(db)
    const builtins = listTemplates(db).filter((t) => t.builtin)
    expect(builtins.length).toBe(8)
  })

  it('does not affect user-created rows', () => {
    seedBuiltinTemplates(db)
    const before = listTemplates(db).filter((t) => t.builtin).length
    // Simulate a user creating their own row.
    db.prepare(
      "INSERT INTO templates (name, body, description, category, builtin, created_at, updated_at) VALUES ('My', 'my body', NULL, NULL, 0, ?, ?)"
    ).run(Date.now(), Date.now())
    seedBuiltinTemplates(db)
    const all = listTemplates(db)
    expect(all.filter((t) => t.builtin).length).toBe(before)
    expect(all.filter((t) => !t.builtin)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Implement**

Create `src/main/db/seed-templates.ts`:
```ts
import type { Database } from 'better-sqlite3'

import { createTemplate, listTemplates } from './dao/templates'

interface BuiltinDefinition {
  readonly name: string
  readonly body: string
  readonly description: string
  readonly category: string
}

const BUILTINS: readonly BuiltinDefinition[] = [
  {
    name: 'Refactor for clarity',
    body: 'Refactor the highlighted code for clarity. Preserve behavior. Don\'t add new features. Output only the diff.',
    description: 'Clean up code style/structure without changing behavior',
    category: 'refactor'
  },
  {
    name: 'Add JSDoc',
    body: 'Add JSDoc comments to every public export in this file. Focus on parameter contracts + return types. Don\'t change behavior.',
    description: 'Document public API surface',
    category: 'docs'
  },
  {
    name: 'Write tests',
    body: 'Write tests for this function. Cover happy path + 2-3 edge cases. Use the project\'s existing test framework. Output only the test file.',
    description: 'Generate test coverage',
    category: 'tests'
  },
  {
    name: 'Code review',
    body: 'Review the pending changes. Flag: bugs, missed edge cases, naming inconsistencies, dead code. Skip nits.',
    description: 'Pre-merge review pass',
    category: 'review'
  },
  {
    name: 'Explain this code',
    body: 'Explain what this code does, why it\'s structured this way, and which inputs/outputs to watch. ≤200 words.',
    description: 'Get a concise walkthrough',
    category: 'explain'
  },
  {
    name: 'Debug this error',
    body: 'Diagnose this error. Cite the line in the stack trace, the most likely cause, and the smallest fix.',
    description: 'Focused error diagnosis',
    category: 'debug'
  },
  {
    name: 'Commit message',
    body: 'Write a commit message for these staged changes. Focus on the *why*, not the *what*. ≤72 chars subject, blank line, ≤2 paragraphs body.',
    description: 'Why-focused commit message',
    category: 'git'
  },
  {
    name: 'Pull request description',
    body: 'Write a PR description for these changes. Summary (3-5 bullets), screenshots if UI, test plan (checkbox list).',
    description: 'Reviewer-focused PR body',
    category: 'git'
  }
]

// Idempotent: a built-in is keyed by (builtin=1, name=<name>). Re-running
// seed inserts only the missing rows.
export function seedBuiltinTemplates(db: Database): void {
  const existing = listTemplates(db)
  const existingBuiltinNames = new Set(
    existing.filter((t) => t.builtin).map((t) => t.name)
  )
  for (const def of BUILTINS) {
    if (existingBuiltinNames.has(def.name)) continue
    createTemplate(db, {
      name: def.name,
      body: def.body,
      description: def.description,
      category: def.category,
      builtin: true
    })
  }
}
```

- [ ] **Step 3: Wire into existing seed**

Edit `src/main/db/seed.ts`. Add the import + call (after seedDefaultAccount). Rename the existing function or add a new `seedAll(db)` if cleaner:
```ts
import { seedBuiltinTemplates } from './seed-templates'

// existing seedDefaultAccount unchanged

export function seedBuiltinData(db: Database): void {
  seedDefaultAccount(db)
  seedBuiltinTemplates(db)
}
```

Find the caller of `seedDefaultAccount` (likely `src/main/index.ts`). Replace with `seedBuiltinData(db)`. If the caller is elsewhere, adjust.

- [ ] **Step 4: Verify + commit**

```
npm run test:run -- src/main/__tests__/db/seed-templates.unit.test.ts
npm run typecheck
git add src/main/db/seed-templates.ts src/main/db/seed.ts \
        src/main/__tests__/db/seed-templates.unit.test.ts \
        src/main/index.ts  # only if it changed
git commit -m "feat(phase-7d): seed 8 built-in templates idempotently on app boot"
```

---

## Task 3: Shared IPC types

**Files:**
- Create: `src/shared/ipc/templates.ts`
- Modify: `src/shared/ipc.ts` (re-export + union)

- [ ] **Step 1: IPC types**

Create `src/shared/ipc/templates.ts`:
```ts
import type { Template, CreateTemplateInput, UpdateTemplateInput } from '../types/templates'
import type { IpcResult } from './envelope'

export const IPC_TEMPLATES_LIST = 'templates:list'
export const IPC_TEMPLATES_CREATE = 'templates:create'
export const IPC_TEMPLATES_UPDATE = 'templates:update'
export const IPC_TEMPLATES_DELETE = 'templates:delete'
export const IPC_TEMPLATES_CHANGED = 'templates:changed'

export interface TemplatesListResponse { readonly templates: readonly Template[] }
export interface TemplatesCreateRequest { readonly input: CreateTemplateInput }
export interface TemplatesCreateResponse { readonly template: Template }
export interface TemplatesUpdateRequest { readonly input: UpdateTemplateInput }
export interface TemplatesUpdateResponse { readonly template: Template }
export interface TemplatesDeleteRequest { readonly id: number }
export interface TemplatesDeleteResponse { readonly id: number }

export type TemplatesListResult = IpcResult<TemplatesListResponse>
export type TemplatesCreateResult = IpcResult<TemplatesCreateResponse>
export type TemplatesUpdateResult = IpcResult<TemplatesUpdateResponse>
export type TemplatesDeleteResult = IpcResult<TemplatesDeleteResponse>
```

- [ ] **Step 2: Re-export from `src/shared/ipc.ts`** + add the 5 channel names to `IpcChannelName` union.

- [ ] **Step 3: Commit**

```
npm run typecheck
git add src/shared/ipc/templates.ts src/shared/ipc.ts
git commit -m "feat(phase-7d): shared IPC types for templates:list/create/update/delete/changed"
```

---

## Task 4: TemplatesHandler IPC

**Files:**
- Create: `src/main/ipc/templates-handler.ts`
- Create: `src/main/__tests__/ipc/templates-handler.integration.test.ts`
- Modify: `src/main/ipc/index.ts` — register

Mirror SkillsHandler structure. NOT_FOUND for unknown ids on update/delete. Broadcasts `templates:changed` after create/update/delete.

Reject delete on built-in templates — return a business error code `BUILTIN_PROTECTED`. (Phase 8 can lift this if users want to disable specific built-ins; v1 keeps them safe.)

- [ ] **Step 1: Failing test**

Create `src/main/__tests__/ipc/templates-handler.integration.test.ts`. Cover:
- `list` returns ok with templates including the 8 builtins after seeding
- `create` inserts + broadcasts
- `update` patches + broadcasts, returns NOT_FOUND for unknown id
- `delete` removes user-created, broadcasts
- `delete` returns BUILTIN_PROTECTED for a builtin row

Use the established withIpcResult + Logger mock pattern.

- [ ] **Step 2: Implement handler**

Create `src/main/ipc/templates-handler.ts`. Mirror SkillsHandler but with `category: 'db'`. Add the BUILTIN_PROTECTED guard:
```ts
delete = async (req: TemplatesDeleteRequest): Promise<TemplatesDeleteResult> =>
  withIpcResult(this.logger, 'db', 'templates-delete', async () => {
    const t = TemplatesDao.getTemplateById(this.db, req.id)
    if (!t) {
      const e = new Error('Template not found') as Error & { code?: string }
      e.code = 'NOT_FOUND'
      throw e
    }
    if (t.builtin) {
      const e = new Error('Built-in templates cannot be deleted') as Error & { code?: string }
      e.code = 'BUILTIN_PROTECTED'
      throw e
    }
    TemplatesDao.deleteTemplate(this.db, req.id)
    this.broadcast(IPC_TEMPLATES_CHANGED, undefined)
    return { id: req.id }
  })
```

Similar protection for `update` on builtins. (Built-ins are read-only — both update and delete reject.)

- [ ] **Step 3: Register in `src/main/ipc/index.ts`**

Add to IpcRegistration + instantiate + install + uninstall. Standard pattern.

- [ ] **Step 4: Verify + commit**

```
npm run test:run
npm run typecheck
git add src/main/ipc/templates-handler.ts \
        src/main/__tests__/ipc/templates-handler.integration.test.ts \
        src/main/ipc/index.ts
git commit -m "feat(phase-7d): TemplatesHandler IPC — list/create/update/delete with builtin protection"
```

---

## Task 5: Preload + useTemplates hook

**Files:**
- Modify: `src/preload/index.ts` + `index.d.ts`
- Create: `src/renderer/src/hooks/use-templates.ts`

Mirror useSkills pattern: list + live subscription via `templates:changed`. Exposes `create`, `update`, `remove`.

- [ ] **Step 1: Preload runtime + .d.ts**

Standard pattern (mirror skills namespace shape).

- [ ] **Step 2: Hook**

```ts
import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  Template, CreateTemplateInput, UpdateTemplateInput
} from '@shared/types/templates'

interface UseTemplatesReturn {
  readonly templates: readonly Template[]
  readonly loading: boolean
  readonly error: string | null
  readonly refetch: () => Promise<void>
  readonly create: (input: CreateTemplateInput) => Promise<Template | null>
  readonly update: (input: UpdateTemplateInput) => Promise<Template | null>
  readonly remove: (id: number) => Promise<boolean>
}

export function useTemplates(): UseTemplatesReturn {
  // ... mirror useSkills ...
}
```

- [ ] **Step 3: Commit**

```
git add src/preload/index.ts src/preload/index.d.ts src/renderer/src/hooks/use-templates.ts
git commit -m "feat(phase-7d): preload exposes templates namespace + useTemplates hook"
```

---

## Task 6: TemplatePickerPopover

**Files:**
- Create: `src/renderer/src/components/composer/TemplatePickerPopover.tsx`
- Modify: `src/renderer/src/components/composer/styles.css`

A small popover that lists templates grouped by category. Each entry: `<button>` showing `{name}` + (optional) `{description}` in muted text. Click → `onInsert(template.body)`. Popover has its own close button (×) in the header.

- [ ] **Step 1: Component**

```tsx
import type { Template } from '@shared/types/templates'

import { useTemplates } from '../../hooks/use-templates'

interface TemplatePickerPopoverProps {
  onInsert: (body: string) => void
  onClose: () => void
}

function groupByCategory(templates: readonly Template[]): readonly { category: string; items: readonly Template[] }[] {
  const map = new Map<string, Template[]>()
  for (const t of templates) {
    const cat = t.category ?? 'Other'
    const arr = map.get(cat) ?? []
    arr.push(t)
    map.set(cat, arr)
  }
  return Array.from(map.entries()).map(([category, items]) => ({ category, items }))
}

export function TemplatePickerPopover({ onInsert, onClose }: TemplatePickerPopoverProps): JSX.Element {
  const { templates, loading } = useTemplates()
  const groups = groupByCategory(templates)

  return (
    <div className="template-picker-popover" role="dialog" aria-label="Insert a template">
      <div className="template-picker-popover__header">
        <h3 className="template-picker-popover__title">Templates</h3>
        <button
          type="button"
          aria-label="Close templates"
          className="template-picker-popover__close"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="template-picker-popover__body">
        {loading ? (
          <p className="template-picker-popover__empty">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="template-picker-popover__empty">No templates available.</p>
        ) : (
          groups.map((g) => (
            <div key={g.category} className="template-picker-popover__group">
              <h4 className="template-picker-popover__group-title">{g.category}</h4>
              <ul className="template-picker-popover__list">
                {g.items.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="template-picker-popover__item"
                      onClick={() => onInsert(t.body)}
                    >
                      <span className="template-picker-popover__item-name">{t.name}</span>
                      {t.description && (
                        <span className="template-picker-popover__item-description">{t.description}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: CSS**

Append to `src/renderer/src/components/composer/styles.css`:
```css
/* ===== TemplatePickerPopover ===== */

.template-picker-popover {
  position: absolute;
  bottom: calc(100% + 4px);
  right: 0;
  width: 360px;
  max-height: 400px;
  overflow-y: auto;
  background: var(--tl-bg);
  border: 1px solid var(--tl-rule);
  border-radius: var(--tl-radius-md);
  box-shadow: var(--tl-shadow-md);
  z-index: var(--tl-z-dropdown);
}
.template-picker-popover__header {
  display: flex;
  align-items: center;
  padding: var(--tl-space-2) var(--tl-space-3);
  border-bottom: 1px solid var(--tl-rule);
}
.template-picker-popover__title { margin: 0; font-size: var(--tl-text-md); font-weight: var(--tl-weight-medium); flex: 1; }
.template-picker-popover__close { background: transparent; border: none; cursor: pointer; color: var(--tl-mute); font-size: 16px; }
.template-picker-popover__body { padding: var(--tl-space-2); }
.template-picker-popover__group { margin-bottom: var(--tl-space-3); }
.template-picker-popover__group-title {
  margin: 0 0 var(--tl-space-1) 0;
  font-size: var(--tl-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--tl-mute);
}
.template-picker-popover__list { list-style: none; margin: 0; padding: 0; }
.template-picker-popover__item {
  display: flex; flex-direction: column; gap: 2px;
  width: 100%; text-align: left;
  background: transparent; border: none;
  padding: var(--tl-space-2) var(--tl-space-3);
  cursor: pointer; border-radius: var(--tl-radius-sm);
  font-family: var(--tl-font-sans); font-size: var(--tl-text-sm);
}
.template-picker-popover__item:hover { background: var(--tl-hover); }
.template-picker-popover__item-name { font-weight: var(--tl-weight-medium); color: var(--tl-fg); }
.template-picker-popover__item-description { font-size: var(--tl-text-xs); color: var(--tl-mute); }
.template-picker-popover__empty { margin: 0; padding: var(--tl-space-3); color: var(--tl-mute); font-size: var(--tl-text-sm); text-align: center; }
```

- [ ] **Step 3: Commit**

```
git add src/renderer/src/components/composer/TemplatePickerPopover.tsx \
        src/renderer/src/components/composer/styles.css
git commit -m "feat(phase-7d): TemplatePickerPopover — category-grouped list of templates"
```

---

## Task 7: ActionsRow gets "Templates ▾" button; Composer mounts popover

**Files:**
- Modify: `src/renderer/src/components/composer/ActionsRow.tsx` — add `onTemplates: () => void` prop + button
- Modify: `src/renderer/src/components/composer/Composer.tsx` — state for popover + onInsert handler

- [ ] **Step 1: ActionsRow extension**

Add `onTemplates: () => void` to props. Insert a "Templates ▾" button BEFORE Commit/Push in the secondary group:
```tsx
<div className="actions-row__secondary">
  <InfoTooltip helperText="Insert a saved template into the composer.">
    <button
      type="button"
      className="actions-row__button actions-row__button--secondary"
      onClick={onTemplates}
    >
      Templates ▾
    </button>
  </InfoTooltip>
  {/* existing Commit + Push */}
</div>
```

- [ ] **Step 2: Composer state + popover mount**

```ts
const [templatesOpen, setTemplatesOpen] = useState(false)

const handleInsertTemplate = (body: string): void => {
  setPrompt((prev) => prev.trim().length === 0 ? body : `${prev.trimEnd()}\n${body}`)
  setTemplatesOpen(false)
  rendererLogger.info('ui', 'template-inserted', 'Template inserted into composer', { bodyLength: body.length })
}
```

Pass `onTemplates={() => setTemplatesOpen((v) => !v)}` to `<ActionsRow>`.

Mount the popover at the bottom of `.composer` (or as a sibling, positioned absolutely). The popover needs a positioning ancestor — wrap it in a relative div near the ActionsRow:
```tsx
<div className="actions-row-host">
  <ActionsRow ... />
  {templatesOpen && (
    <TemplatePickerPopover
      onInsert={handleInsertTemplate}
      onClose={() => setTemplatesOpen(false)}
    />
  )}
</div>
```

Add `.actions-row-host { position: relative }` to styles.

Add `import { TemplatePickerPopover } from './TemplatePickerPopover'`.

- [ ] **Step 3: Verify + commit**

```
npm run typecheck
npm run test:run
git add src/renderer/src/components/composer/ActionsRow.tsx \
        src/renderer/src/components/composer/Composer.tsx \
        src/renderer/src/components/composer/styles.css
git commit -m "feat(phase-7d): ActionsRow Templates button + Composer mounts TemplatePickerPopover"
```

---

## Task 8: ADR-039

**Files:**
- Modify: `docs/decisions.md`

```markdown

## ADR-039 (2026-05-15) — Templates: seeded built-ins are read-only; picker inserts body at the bottom of the composer with a single newline separator

**Context:** Phase 7D ships the templates feature per spec §2. v1 surface is a picker; the full `/templates` CRUD route is Phase 8.

**Decisions:**

1. **Built-ins are read-only.** Update + delete on a `builtin=1` row return business error code `BUILTIN_PROTECTED`. Rationale: built-ins are documentation of "the way TokenLess intends gearing to be used"; users can copy a built-in and edit the copy (Phase 8). Hiding the original would be reasonable v1.5 feature.

2. **Seeding is idempotent by (builtin=1, name).** Re-running on every boot is safe. Adding a NEW built-in in a future release just adds it (existing rows by other names are unaffected). RENAMING a built-in would orphan the old row; if that becomes necessary, the seed function should grow a "deprecations" list. Not yet.

3. **Insert behavior: append, don't replace.** Clicking a template appends the body to the existing prompt with `\n` if non-empty, or replaces the empty composer with the body. Rationale: users may have already started typing context ("for the auth module, ..."); a template should COMPLEMENT, not stomp it. Power users can always select-all + delete first.

4. **Popover anchored to ActionsRow, opens upward.** The Templates button sits in `actions-row__secondary`; the popover renders above (bottom-up). Avoids collisions with the textarea above.

5. **No template variables (`{{file}}` etc.) in v1.** Templates are plain-text bodies. Phase 8 may add a templating language; YAGNI for v1.

**Trade-offs:**
- Built-in-protected returns an error code, not a UI guard. The picker UI doesn't render edit/delete affordances on built-ins (Phase 8 view will). For v1 the picker is read-only — only the insert action; users can't even SEE the protected state without trying to delete via IPC directly. Acceptable.
- The 8 chosen built-ins are opinionated. Easy to extend in `seed-templates.ts`.

**Discovered:** Phase 7D implementation.

```

Commit:
```
git add docs/decisions.md
git commit -m "docs(phase-7d): ADR-039 — templates seeding + insert behavior + builtin-protection"
```

---

## Task 9: Docs sweep — observability + scenarios

**Files:**
- Modify: `docs/observability.md`
- Modify: `docs/test-scenarios.md`

- [ ] **Step 1: observability.md**

Extend `db` row with: `templates-list`, `templates-create`, `templates-update`, `templates-delete`.
Extend `ui` row with: `template-inserted`.

- [ ] **Step 2: test-scenarios.md**

Append Phase 7D scenarios (S-7D.1 through S-7D.6). Cover: pill button visible, popover opens, 8 built-ins listed grouped by category, click inserts body, append behavior with non-empty prompt, BUILTIN_PROTECTED prevents delete.

Commit:
```
git add docs/observability.md docs/test-scenarios.md
git commit -m "docs(phase-7d): observability events + Phase 7D manual scenarios"
```

---

## Task 10: Verification + tag v0.18.0-phase-7d

- [ ] **Step 1: Four-gate verification**

```
npm run rebuild:node
npm run typecheck
npm run test:run

npm run rebuild:electron
npm run build
npm run test:e2e
npm run rebuild:node
```

Expected: 327 (Phase 6D) + 8 DAO + 3 seed + 5 handler = ~343 tests.

- [ ] **Step 2: Tag**

```
git tag -s -a v0.18.0-phase-7d -m "Phase 7D complete — templates picker in Composer + 8 seeded built-ins"
git rev-parse v0.18.0-phase-7d^{commit}
```

---

## Self-Review Checklist

- [ ] **Plan exit-state vs spec:**
  - Templates table populated with 8 builtins on boot ✓
  - Composer Templates button + popover with category grouping ✓
  - Click inserts body, appending with newline if existing prompt non-empty ✓
  - Built-ins protected from update/delete ✓
- [ ] **CLAUDE.md cornerstones:**
  - All new error paths through Logger
  - No silent catches
  - No new categories needed
- [ ] **TypeScript strict clean**
- [ ] **No console.*** outside tests

---

## Exit State

**Visible to user:**
- New "Templates ▾" button in the ActionsRow next to Commit/Push
- Clicking opens a popover with 8 built-in templates grouped by category (refactor, docs, tests, review, explain, debug, git)
- Clicking a template inserts its body into the composer (appending with newline if already has content)

**Under the hood:**
- `TemplatesDao` is the single writer; built-ins flagged `builtin=1`
- `seedBuiltinTemplates(db)` runs idempotently on each app boot
- `TemplatesHandler` IPC + `templates:changed` broadcast + `useTemplates` hook
- Built-in update/delete returns `BUILTIN_PROTECTED` error code (UI doesn't expose those actions yet)

**Phase 8 will deliver:**
- Full `/templates` CRUD view (create/edit/delete user templates)
- Per-project template scoping (column addition)
- Template variables (placeholders)
- Hide-builtin option

**Tag:** `v0.18.0-phase-7d`
