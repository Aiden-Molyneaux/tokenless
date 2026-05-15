// Built-in template seed data. Idempotent — keyed by (builtin=1, name=<name>)
// so future releases can add new built-ins without re-running existing ones.

import type { Database } from 'better-sqlite3'

import { createTemplate, listTemplates } from './dao/templates'

interface BuiltinDefinition {
  readonly name: string
  readonly body: string
  readonly description: string
  readonly category: string
}

// Code-focused prompt templates — TokenLess wraps Claude Code, so the built-ins
// target common code-work prompts. Bodies are plain text (no placeholders per
// ADR-039 — v1 doesn't have a templating language).
const BUILTINS: readonly BuiltinDefinition[] = [
  {
    name: 'Refactor for clarity',
    body: "Refactor the highlighted code for clarity. Preserve behavior. Don't add new features. Output only the diff.",
    description: 'Clean up code style/structure without changing behavior',
    category: 'refactor'
  },
  {
    name: 'Add JSDoc',
    body: "Add JSDoc comments to every public export in this file. Focus on parameter contracts + return types. Don't change behavior.",
    description: 'Document public API surface',
    category: 'docs'
  },
  {
    name: 'Write tests',
    body: "Write tests for this function. Cover happy path + 2-3 edge cases. Use the project's existing test framework. Output only the test file.",
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
    body: "Explain what this code does, why it's structured this way, and which inputs/outputs to watch. ≤200 words.",
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

// Per-name idempotency: a built-in is keyed by (builtin=1, name=<name>).
// Re-running inserts only the missing rows. This lets future releases add
// new built-ins without skipping them just because OTHER built-ins exist.
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
