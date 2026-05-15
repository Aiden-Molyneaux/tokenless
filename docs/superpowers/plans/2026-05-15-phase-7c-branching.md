# Phase 7C: Branching MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Branch from latest turn" — create a new conversation that points back at its parent (via `parent_conversation_id` + `branched_at_turn_id` schema columns that have existed since Phase 3 but never been written). The new conversation inherits the parent's account, model/breadth/format defaults, and rolling summary so the user can continue the topic in a fresh PTY without losing context. The sidebar shows branched conversations indented with a "↳" prefix. Per-turn picker UI (pick a SPECIFIC older turn to branch from) is deferred to Phase 8 — v1 always branches from the latest turn since the renderer has no turn-level interaction surface yet (xterm.js is opaque text).

**Architecture:** A new `ConversationsDao.createBranchConversation(db, input)` reads the parent conversation + latest turn, then writes a new row with: same project + account, same model/breadth/format, `parent_conversation_id` + `branched_at_turn_id` set, title prefixed "↳ {parent.title ?? 'Untitled'}", and `summary` copied from parent (so the gearing engine has context on the first send). The branch IPC `conversations:branch` accepts `{ parentConversationId }` (resolves the latest turn on the main side) and returns the new conversation. AppShell's "Branch" handler chains the branch IPC + `cc:start` to spawn a fresh PTY + sets the new conversation as active. The sidebar's `ConversationListItem` checks `conversation.parentConversationId !== null` and renders a `↳` prefix + indent CSS class. The flat list ordering (by `updated_at DESC`) is unchanged — true tree-rendered branches are Phase 8.

**Out of scope for Phase 7C (→ Phase 8):**
- Per-turn picker (pick a SPECIFIC turn ≠ the latest)
- Transcript / replay view showing user+assistant rows
- Tree-rendered sidebar (currently flat with indent indicator)
- Branching from a turn that was streamed but not yet `response-complete` (the latest-turn lookup requires `getLastByConversation` to return SOMETHING; if the conversation has zero turns we return BRANCH_EMPTY_CONVERSATION)
- Resuming the parent's claude session (branches start a fresh PTY; the inherited summary gives Haiku gearing the context)
- Re-parenting / un-branching (delete + recreate is the workaround)

---

## File Structure

**New files (main):**
- `src/main/__tests__/db/dao-conversations-branch.integration.test.ts` — focused tests for the new method (existing dao-conversations test file stays simple)

**New files (renderer):**
- (none — Phase 7C reuses existing components with new props)

**Modified files (main):**
- `src/main/db/dao/conversations.ts` — add `createBranchConversation`
- `src/main/__tests__/db/dao-conversations.integration.test.ts` — verify the new fields show up in existing queries when set
- `src/main/ipc/conversations-handler.ts` — add `branch` method + IPC channel
- `src/main/__tests__/ipc/conversations-handler.integration.test.ts` — branch IPC tests
- `src/main/ipc/index.ts` — no change (handler already registered; new method picked up automatically)

**Modified files (shared):**
- `src/shared/types/conversations.ts` — add `BranchConversationInput`
- `src/shared/ipc/conversations.ts` — add `IPC_CONVERSATIONS_BRANCH` + types
- `src/shared/ipc.ts` — re-export + extend `IpcChannelName`

**Modified files (renderer):**
- `src/preload/index.ts` + `index.d.ts` — expose `conversations.branch(req)`
- `src/renderer/src/hooks/use-conversations.ts` — add `branch(parentConversationId): Promise<Conversation | null>`
- `src/renderer/src/components/composer/ActionsRow.tsx` — new `onBranch` prop + "Branch" button in secondary group
- `src/renderer/src/components/composer/Composer.tsx` — wire `onBranch` to AppShell
- `src/renderer/src/components/layout/AppShell.tsx` — `handleBranchConversation` (branch IPC → cc:start → setActiveConversationId)
- `src/renderer/src/components/layout/MainPane.tsx` — pass `onBranch` through if Composer is its child; otherwise the prop comes via AppShell directly
- `src/renderer/src/components/layout/ConversationListItem.tsx` — render `↳` prefix + indent CSS when `parentConversationId !== null`
- `src/renderer/src/components/layout/styles.css` — `.conversation-item.is-branch` rule
- `docs/decisions.md` — ADR-040
- `docs/observability.md` — extend rows
- `docs/test-scenarios.md` — Phase 7C scenarios

---

## Task 1: ConversationsDao.createBranchConversation

**Files:**
- Modify: `src/main/db/dao/conversations.ts` — add the new function
- Create: `src/main/__tests__/db/dao-conversations-branch.integration.test.ts`
- Modify: `src/shared/types/conversations.ts` — add `BranchConversationInput`

Behavior:
- Input: `{ parentConversationId: number, branchedAtTurnId: number }`
- Reads the parent conversation; throws `Error & { code: 'PARENT_NOT_FOUND' }` if parent doesn't exist.
- Inserts a new row with:
  - `project_id, account_id, model, breadth, format` copied from parent
  - `title = ↳ {parent.title ?? 'Untitled'}`
  - `summary` copied from parent (Phase 5B rolling summary)
  - `parent_conversation_id = parentConversationId`
  - `branched_at_turn_id = branchedAtTurnId`
  - `status = 'active'`, `cc_session_id = null` (fresh PTY)
  - `created_at = updated_at = Date.now()`
- Returns the new `Conversation`.

- [ ] **Step 1: Add type**

Edit `src/shared/types/conversations.ts`. Append:
```ts
export interface BranchConversationInput {
  readonly parentConversationId: number
  readonly branchedAtTurnId: number
}
```

- [ ] **Step 2: Failing DAO test**

Create `src/main/__tests__/db/dao-conversations-branch.integration.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { createAccount } from '../../db/dao/accounts'
import { createProject } from '../../db/dao/projects'
import {
  createConversation,
  createBranchConversation,
  getConversationById,
  updateConversation
} from '../../db/dao/conversations'
import { createUserTurn } from '../../db/dao/turns'

describe('db/dao/conversations.createBranchConversation', () => {
  let db: Database
  let projectId: number
  let accountId: number
  let parentId: number
  let parentTurnId: number

  beforeEach(() => {
    db = createTestDb()
    const a = createAccount(db, { label: 'P', configDir: '/p' })
    accountId = a.id
    const p = createProject(db, { name: 'X', rootPath: '/x', defaultAccountId: accountId })
    projectId = p.id
    const parent = createConversation(db, {
      projectId, accountId, title: 'Parent topic', model: 'sonnet', breadth: 'normal', format: 'prose'
    })
    parentId = parent.id
    updateConversation(db, { id: parentId, summary: 'Parent rolling summary text.' })
    const turn = createUserTurn(db, {
      conversationId: parentId, originalPrompt: 'q', modelUsed: 'sonnet', gearMeta: null
    })
    parentTurnId = turn.id
  })

  it('inserts a new conversation with parent + branched-at fields set', () => {
    const branch = createBranchConversation(db, {
      parentConversationId: parentId, branchedAtTurnId: parentTurnId
    })
    expect(branch.id).not.toBe(parentId)
    expect(branch.parentConversationId).toBe(parentId)
    expect(branch.branchedAtTurnId).toBe(parentTurnId)
    expect(branch.status).toBe('active')
    expect(branch.ccSessionId).toBeNull()
  })

  it('inherits projectId + accountId + model/breadth/format from the parent', () => {
    const branch = createBranchConversation(db, {
      parentConversationId: parentId, branchedAtTurnId: parentTurnId
    })
    expect(branch.projectId).toBe(projectId)
    expect(branch.accountId).toBe(accountId)
    expect(branch.model).toBe('sonnet')
    expect(branch.breadth).toBe('normal')
    expect(branch.format).toBe('prose')
  })

  it('inherits the parent summary so gearing has context on the first send', () => {
    const branch = createBranchConversation(db, {
      parentConversationId: parentId, branchedAtTurnId: parentTurnId
    })
    expect(branch.summary).toBe('Parent rolling summary text.')
  })

  it('prefixes the title with ↳', () => {
    const branch = createBranchConversation(db, {
      parentConversationId: parentId, branchedAtTurnId: parentTurnId
    })
    expect(branch.title).toBe('↳ Parent topic')
  })

  it('handles parent with null title', () => {
    const parentless = createConversation(db, { projectId, accountId })
    const branch = createBranchConversation(db, {
      parentConversationId: parentless.id, branchedAtTurnId: parentTurnId
    })
    expect(branch.title).toBe('↳ Untitled')
  })

  it('throws PARENT_NOT_FOUND when parent does not exist', () => {
    expect(() => createBranchConversation(db, {
      parentConversationId: 99999, branchedAtTurnId: parentTurnId
    })).toThrow(/PARENT_NOT_FOUND|not found/i)
  })

  it('the branch row is independently retrievable via getConversationById', () => {
    const branch = createBranchConversation(db, {
      parentConversationId: parentId, branchedAtTurnId: parentTurnId
    })
    const fresh = getConversationById(db, branch.id)
    expect(fresh?.parentConversationId).toBe(parentId)
    expect(fresh?.branchedAtTurnId).toBe(parentTurnId)
  })
})
```

- [ ] **Step 3: Implement**

Edit `src/main/db/dao/conversations.ts`. Add import for `BranchConversationInput` if needed. Append the function at the end:
```ts
export function createBranchConversation(db: Database, input: BranchConversationInput): Conversation {
  const parent = getConversationById(db, input.parentConversationId)
  if (!parent) {
    const e = new Error(`PARENT_NOT_FOUND: parent conversation ${input.parentConversationId} does not exist`) as Error & { code?: string }
    e.code = 'PARENT_NOT_FOUND'
    throw e
  }
  const now = Date.now()
  const title = `↳ ${parent.title ?? 'Untitled'}`
  const result = db.prepare(`
    INSERT INTO conversations (
      project_id, account_id, title, model, breadth, format,
      status, summary, parent_conversation_id, branched_at_turn_id,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
  `).run(
    parent.projectId,
    parent.accountId,
    title,
    parent.model,
    parent.breadth,
    parent.format,
    parent.summary,
    input.parentConversationId,
    input.branchedAtTurnId,
    now,
    now
  )
  const created = getConversationById(db, Number(result.lastInsertRowid))
  if (!created) throw new Error('createBranchConversation: SELECT after INSERT returned no row')
  return created
}
```

Make sure `BranchConversationInput` is imported from `@shared/types/conversations`.

- [ ] **Step 4: Verify + commit**

```
npm run test:run -- src/main/__tests__/db/dao-conversations-branch.integration.test.ts
npm run typecheck
git add src/shared/types/conversations.ts src/main/db/dao/conversations.ts \
        src/main/__tests__/db/dao-conversations-branch.integration.test.ts
git commit -m "feat(phase-7c): ConversationsDao.createBranchConversation — inherits parent metadata + summary, sets parent + branched-at"
```

Expected: 7 new tests; full suite 346 + 7 = 353.

---

## Task 2: Shared IPC types

**Files:**
- Modify: `src/shared/ipc/conversations.ts` — add `IPC_CONVERSATIONS_BRANCH` + types
- Modify: `src/shared/ipc.ts` — re-export + extend `IpcChannelName`

- [ ] **Step 1: IPC types**

Edit `src/shared/ipc/conversations.ts`. Add:
```ts
export const IPC_CONVERSATIONS_BRANCH = 'conversations:branch'

export interface ConversationsBranchRequest {
  readonly parentConversationId: number
}
export interface ConversationsBranchResponse {
  readonly conversation: Conversation
}

export type ConversationsBranchResult = IpcResult<ConversationsBranchResponse>
```

- [ ] **Step 2: Re-export from `src/shared/ipc.ts`**

Extend the existing conversations re-export block to include `IPC_CONVERSATIONS_BRANCH`, `ConversationsBranchRequest`, `ConversationsBranchResponse`, `ConversationsBranchResult`. Add `'conversations:branch'` to `IpcChannelName` union.

- [ ] **Step 3: Commit**

```
npm run typecheck
git add src/shared/ipc/conversations.ts src/shared/ipc.ts
git commit -m "feat(phase-7c): shared IPC types for conversations:branch"
```

---

## Task 3: ConversationsHandler.branch IPC

**Files:**
- Modify: `src/main/ipc/conversations-handler.ts`
- Modify: `src/main/__tests__/ipc/conversations-handler.integration.test.ts`

The handler:
1. Reads the parent — returns `NOT_FOUND` if missing
2. Reads the latest turn via `TurnsDao.getLastByConversation(parent.id)` — returns `BRANCH_EMPTY_CONVERSATION` if there's no turn yet (can't branch a conversation that hasn't even started)
3. Calls `ConversationsDao.createBranchConversation`
4. Broadcasts `conversations:changed`
5. Returns the new conversation

- [ ] **Step 1: Failing test**

Append to `src/main/__tests__/ipc/conversations-handler.integration.test.ts`:
```ts
import { TurnsDao } from '../../db'  // adjust import if path differs

// inside the describe block, append:

it('branch creates a new conversation pointing at the parent + latest turn', async () => {
  // setup: create a project, conversation, and at least one turn
  const acc = createAccount(db, { label: 'A', configDir: '/a' })
  const pr = createProject(db, { name: 'P', rootPath: '/p', defaultAccountId: acc.id })
  const parentRes = await handler.create({ input: { projectId: pr.id, accountId: acc.id, title: 'Parent' } })
  expect(parentRes.ok).toBe(true)
  if (!parentRes.ok) return
  TurnsDao.createUserTurn(db, {
    conversationId: parentRes.data.conversation.id, originalPrompt: 'q', modelUsed: null, gearMeta: null
  })

  const r = await handler.branch({ parentConversationId: parentRes.data.conversation.id })
  expect(r.ok).toBe(true)
  if (r.ok) {
    expect(r.data.conversation.parentConversationId).toBe(parentRes.data.conversation.id)
    expect(r.data.conversation.branchedAtTurnId).not.toBeNull()
    expect(r.data.conversation.title).toBe('↳ Parent')
  }
  expect(broadcast).toHaveBeenCalledWith('conversations:changed', undefined)
})

it('branch returns NOT_FOUND when parent does not exist', async () => {
  const r = await handler.branch({ parentConversationId: 99999 })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.error.code).toBe('NOT_FOUND')
})

it('branch returns BRANCH_EMPTY_CONVERSATION when the parent has no turns', async () => {
  const acc = createAccount(db, { label: 'A', configDir: '/a' })
  const pr = createProject(db, { name: 'P', rootPath: '/p', defaultAccountId: acc.id })
  const parentRes = await handler.create({ input: { projectId: pr.id, accountId: acc.id } })
  if (!parentRes.ok) return
  const r = await handler.branch({ parentConversationId: parentRes.data.conversation.id })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.error.code).toBe('BRANCH_EMPTY_CONVERSATION')
})
```

- [ ] **Step 2: Implement handler**

Edit `src/main/ipc/conversations-handler.ts`. Add imports:
```ts
import { TurnsDao } from '../db'
import {
  IPC_CONVERSATIONS_BRANCH,
  type ConversationsBranchRequest,
  type ConversationsBranchResult
} from '@shared/ipc/conversations'
```

Add method:
```ts
branch = async (req: ConversationsBranchRequest): Promise<ConversationsBranchResult> =>
  withIpcResult(this.logger, 'db', 'conversations-branch', async () => {
    const parent = ConversationsDao.getConversationById(this.db, req.parentConversationId)
    if (!parent) {
      const e = new Error('Parent conversation not found') as Error & { code?: string }
      e.code = 'NOT_FOUND'
      throw e
    }
    const lastTurn = TurnsDao.getLastByConversation(this.db, parent.id)
    if (!lastTurn) {
      const e = new Error('Cannot branch a conversation with no turns') as Error & { code?: string }
      e.code = 'BRANCH_EMPTY_CONVERSATION'
      throw e
    }
    const conversation = ConversationsDao.createBranchConversation(this.db, {
      parentConversationId: parent.id,
      branchedAtTurnId: lastTurn.id
    })
    this.broadcast(IPC_CONVERSATIONS_CHANGED, undefined)
    return { conversation }
  })
```

Wire into `install(ipcMain)`:
```ts
ipcMain.handle(IPC_CONVERSATIONS_BRANCH, async (_e: IpcMainInvokeEvent, req: ConversationsBranchRequest) =>
  this.branch(req)
)
this.installedHandlers.push(IPC_CONVERSATIONS_BRANCH)
```

- [ ] **Step 3: Verify + commit**

```
npm run test:run -- src/main/__tests__/ipc/conversations-handler.integration.test.ts
npm run typecheck
git add src/main/ipc/conversations-handler.ts \
        src/main/__tests__/ipc/conversations-handler.integration.test.ts
git commit -m "feat(phase-7c): ConversationsHandler.branch — resolves latest turn + delegates to DAO + broadcasts"
```

Expected: 3 new tests; full suite + 3.

---

## Task 4: Preload + useConversations.branch hook

**Files:**
- Modify: `src/preload/index.ts` + `index.d.ts`
- Modify: `src/renderer/src/hooks/use-conversations.ts`

- [ ] **Step 1: Preload runtime**

Edit `src/preload/index.ts`. Add to imports:
```ts
IPC_CONVERSATIONS_BRANCH,
type ConversationsBranchRequest,
type ConversationsBranchResult
```

Extend the existing `conversations:` namespace:
```ts
conversations: {
  // ... existing methods ...
  branch(req: ConversationsBranchRequest): Promise<ConversationsBranchResult> {
    return ipcRenderer.invoke(IPC_CONVERSATIONS_BRANCH, req) as Promise<ConversationsBranchResult>
  },
  // ... onChanged ...
}
```

Mirror in `src/preload/index.d.ts`.

- [ ] **Step 2: useConversations hook extension**

Edit `src/renderer/src/hooks/use-conversations.ts`. Add `branch` to the return interface + implementation:
```ts
const branch = useCallback(async (parentConversationId: number): Promise<Conversation | null> => {
  const r = await window.tokenless.conversations.branch({ parentConversationId })
  return r.ok ? r.data.conversation : null
}, [])
```

Add to returned object.

- [ ] **Step 3: Commit**

```
npm run typecheck
git add src/preload/index.ts src/preload/index.d.ts src/renderer/src/hooks/use-conversations.ts
git commit -m "feat(phase-7c): preload + useConversations expose .branch(parentConversationId)"
```

---

## Task 5: AppShell.handleBranchConversation + Composer "Branch" button

**Files:**
- Modify: `src/renderer/src/components/composer/ActionsRow.tsx` — add `onBranch` prop + button
- Modify: `src/renderer/src/components/composer/Composer.tsx` — accept + thread `onBranch` prop
- Modify: `src/renderer/src/components/layout/MainPane.tsx` — accept + thread `onBranch` to Composer
- Modify: `src/renderer/src/components/layout/AppShell.tsx` — implement `handleBranchConversation`

The flow:
1. User clicks Branch (only enabled when there's an active conversation with at least one turn — but we don't fetch turns in Composer; the simpler heuristic: enable whenever there's an active conversation. The IPC will return BRANCH_EMPTY_CONVERSATION if there are no turns, which we toast.)
2. AppShell calls `useConversations.branch(activeConversationId)` → new Conversation
3. AppShell calls `cc.start({ conversationId: newConv.id, cwd: activeProject.rootPath, ..., accountId })` to spawn the PTY
4. On success: `setActiveConversationId(newConv.id)`
5. On failure (auth missing, claude-not-found, branch error): existing error toasts handle it

- [ ] **Step 1: ActionsRow extension**

Edit `src/renderer/src/components/composer/ActionsRow.tsx`. Add `onBranch: () => void` to props. Insert "Branch" button in secondary group AFTER Templates (or before it — pick whichever flows better visually; the plan suggests AFTER Templates, before Commit):
```tsx
<InfoTooltip helperText="Create a new conversation that branches off from the latest turn here. Inherits the rolling summary for context.">
  <button
    type="button"
    className="actions-row__button actions-row__button--secondary"
    onClick={onBranch}
  >
    Branch
  </button>
</InfoTooltip>
```

- [ ] **Step 2: Composer prop threading**

Edit `src/renderer/src/components/composer/Composer.tsx`. Add `onBranch: () => void` to `ComposerProps`. Pass it through to `<ActionsRow onBranch={onBranch} />`.

- [ ] **Step 3: MainPane prop threading**

Edit `src/renderer/src/components/layout/MainPane.tsx`. Add `onBranch: () => void` to its props. Pass through to `<Composer onBranch={onBranch} />`.

- [ ] **Step 4: AppShell wires the branch handler**

Edit `src/renderer/src/components/layout/AppShell.tsx`:

Destructure `branch` from useConversations:
```ts
const { conversations, branch: branchConversation } = useConversations(activeProjectId)
```

Add handler:
```ts
const handleBranchConversation = async (): Promise<void> => {
  if (activeConversationId === null) return
  if (activeProjectId === null || activeAccountId === null) return
  const activeProject = projects.find((p) => p.id === activeProjectId)
  if (!activeProject) return

  const branched = await branchConversation(activeConversationId)
  if (!branched) {
    rendererLogger.warn('ui', 'branch-failed', 'conversations.branch returned null', {
      parentConversationId: activeConversationId
    })
    pushToast({ message: 'Could not branch — the conversation has no turns yet.', severity: 'warn' })
    return
  }

  const started = await window.tokenless.cc.start({
    conversationId: branched.id,
    cwd: activeProject.rootPath,
    cols: 100,
    rows: 30,
    accountId: activeAccountId
  })
  if (!started.ok) {
    rendererLogger.error('ui', 'branch-cc-start-failed', started.error.message, {
      conversationId: branched.id,
      code: started.error.code,
      logId: started.error.logId
    })
    if (started.error.code === 'CLAUDE_NOT_FOUND') {
      setClaudeNotFoundOpen(true)
    }
    return
  }
  setActiveConversationId(branched.id)
  rendererLogger.info('ui', 'branch-created', 'Conversation branched', {
    parentConversationId: activeConversationId,
    newConversationId: branched.id
  })
}
```

Pass `onBranch={() => void handleBranchConversation()}` to `<MainPane>`.

- [ ] **Step 5: Verify + commit**

```
npm run typecheck
npm run test:run
git add src/renderer/src/components/composer/ActionsRow.tsx \
        src/renderer/src/components/composer/Composer.tsx \
        src/renderer/src/components/layout/MainPane.tsx \
        src/renderer/src/components/layout/AppShell.tsx
git commit -m "feat(phase-7c): Branch button in ActionsRow + AppShell.handleBranchConversation spawns PTY for new conversation"
```

---

## Task 6: Sidebar shows branch indicator

**Files:**
- Modify: `src/renderer/src/components/layout/ConversationListItem.tsx`
- Modify: `src/renderer/src/components/layout/styles.css`

- [ ] **Step 1: ConversationListItem renders ↳ + indent**

Edit `src/renderer/src/components/layout/ConversationListItem.tsx`. The current render returns a `<li>` with class `conversation-item`. Extend:
```tsx
const isBranch = conversation.parentConversationId !== null
return (
  <li className={`conversation-item ${isActive ? 'is-active' : ''} ${isBranch ? 'is-branch' : ''}`}>
    {/* existing button content */}
  </li>
)
```

The title already contains "↳ " from `createBranchConversation`. So the visual indicator is the title prefix + the indent CSS class. No extra DOM needed.

- [ ] **Step 2: CSS**

Edit `src/renderer/src/components/layout/styles.css`. Find the `.conversation-item` rule (or nearby) and add:
```css
.conversation-item.is-branch {
  padding-left: var(--tl-space-4);
}
.conversation-item.is-branch .conversation-item__title {
  color: var(--tl-text-muted);
}
```

- [ ] **Step 3: Verify + commit**

```
npm run typecheck
git add src/renderer/src/components/layout/ConversationListItem.tsx \
        src/renderer/src/components/layout/styles.css
git commit -m "feat(phase-7c): sidebar indents branched conversations (parentConversationId != null)"
```

---

## Task 7: ADR-040

**Files:**
- Modify: `docs/decisions.md`

```markdown

## ADR-040 (2026-05-15) — Branching MVP: "branch from latest turn" only (no per-turn picker); fresh PTY; inherit rolling summary for context continuity

**Context:** Phase 7C ships the branching feature per spec §2. The schema columns (`parent_conversation_id`, `branched_at_turn_id`) have existed since Phase 3 but have never been written. Phase 7B's turn capture means there's now real data to point `branched_at_turn_id` at.

**Decisions:**

1. **Branch from latest turn ONLY for v1.** The renderer has no turn-level interaction surface — xterm.js renders the PTY stream opaquely. Building a turn-picker means building a transcript / replay view, which is a separate feature roughly the size of Phase 7C itself. Deferred to Phase 8 polish.

2. **Fresh PTY for the branch.** We do NOT resume the parent's claude session. Claude wouldn't see the prior turns anyway (its in-process context is per-session). Instead, the branch INHERITS the parent's rolling `summary` field (Phase 5B), so when the user fires their first gear+send on the branch, Haiku sees the summary in the gearing-context system prompt. Sufficient for v1 continuity.

3. **Title prefix: `↳ {parent.title ?? 'Untitled'}`.** Plus a CSS-based indent on the sidebar item (`.conversation-item.is-branch`). True tree-rendered sidebar is Phase 8.

4. **`BRANCH_EMPTY_CONVERSATION` for branches with no prior turns.** Can't branch what doesn't exist; the IPC handler reads `TurnsDao.getLastByConversation` first and returns the error code if there's nothing. The UI surfaces a non-blocking toast.

5. **No "un-branch" or re-parent.** Users can delete the branched conversation if they regret it (Phase 6B's delete works through the existing IPC). Re-parenting is YAGNI.

**Trade-offs:**
- The first gearing call on a branched conversation sends the inherited summary, but later gearing calls update the branch's OWN summary (Phase 5B's refresher writes per-conversation). The branch and parent diverge from there. Fine — that's the point of branching.
- A branched conversation's `parent_conversation_id` is `ON DELETE SET NULL`. If the parent is deleted, the branch keeps existing but loses its lineage indicator. Acceptable; the title still has "↳" so the user sees the visual cue.
- The "Branch" button is enabled whenever there's an active conversation, even if it has no turns. The toast on empty-branch is the safety net rather than a disable-condition. Trade-off: one more click → toast vs. fetching turns in the Composer just to set a button state.

**Discovered:** Phase 7C implementation; the per-turn picker complexity surfaced during scope planning.

```

Commit:
```
git add docs/decisions.md
git commit -m "docs(phase-7c): ADR-040 — branching MVP (latest-turn only; fresh PTY; inherit summary)"
```

---

## Task 8: Docs sweep — observability + scenarios

**Files:**
- Modify: `docs/observability.md`
- Modify: `docs/test-scenarios.md`

- [ ] **Step 1: observability.md**

Extend `db` row events with: `conversations-branch`.
Extend `ui` row events with: `branch-created`, `branch-failed`, `branch-cc-start-failed`.

- [ ] **Step 2: test-scenarios.md**

Append Phase 7C scenarios:
- **S-7C.1** Branch button visible in ActionsRow
- **S-7C.2** Branch creates new conversation (verify via Dev Mode + sidebar)
- **S-7C.3** Branched conversation's title starts with ↳ and is indented in the sidebar
- **S-7C.4** Branch with no prior turns → toast "no turns yet"
- **S-7C.5** Branch inherits parent's summary (verify via gearing call's context)
- **S-7C.6** Branched conversation has its own PTY (Stop button stops only the branch)
- **S-7C.7** Parent deletion sets branch.parent_conversation_id to NULL but keeps the branch row

Commit:
```
git add docs/observability.md docs/test-scenarios.md
git commit -m "docs(phase-7c): observability events + Phase 7C manual scenarios"
```

---

## Task 9: Verification + tag v0.19.0-phase-7c

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

Expected: 346 (Phase 7D) + 7 DAO + 3 handler = ~356 tests.

- [ ] **Step 2: Tag**

```
git tag -s -a v0.19.0-phase-7c -m "Phase 7C complete — branching MVP (latest-turn only + sidebar indicator)"
git rev-parse v0.19.0-phase-7c^{commit}
```

---

## Self-Review Checklist

- [ ] **Plan exit-state vs spec:**
  - "Branch from latest turn" backend + UI ✓
  - Sidebar visual indicator for branched conversations ✓
  - Inherited summary so gearing has continuity ✓
- [ ] **CLAUDE.md cornerstones:**
  - Logger usage on all error paths
  - No silent catches (BRANCH_EMPTY_CONVERSATION is a documented business code)
- [ ] **TypeScript strict clean**
- [ ] **No console.*** outside tests

---

## Exit State

**Visible to user:**
- New "Branch" button in the ActionsRow secondary group (after Templates, before Commit)
- Clicking branches the active conversation: creates a new entry in the sidebar with title "↳ {parent}" and indent
- The branched conversation auto-selects; its terminal is empty (fresh PTY); the next gear+send uses the inherited summary for context
- If the parent has no turns yet, a toast says "Could not branch — the conversation has no turns yet."

**Under the hood:**
- `ConversationsDao.createBranchConversation` writes `parent_conversation_id` + `branched_at_turn_id` and inherits project/account/configs/summary from parent
- `ConversationsHandler.branch` resolves the latest turn id; returns `BRANCH_EMPTY_CONVERSATION` if missing
- `useConversations.branch` + AppShell `handleBranchConversation` chain the branch IPC + cc:start
- `.conversation-item.is-branch` CSS indents branched sidebar entries
- ADR-040 documents the design

**Phase 8 will deliver:**
- Per-turn picker (transcript / replay view)
- Tree-rendered sidebar (deeper than 1 level of indent)
- Re-parenting / un-branching
- Resume parent's claude session as the branch's starting state (instead of fresh PTY)

**Tag:** `v0.19.0-phase-7c`
