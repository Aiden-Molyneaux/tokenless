# TokenLess v1 — Phase 1A: Setup + Integration Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install `node-pty` (the native PTY library), bump CI's deprecated GHA actions, then run a throwaway integration spike that proves `claude` subprocess + node-pty + `--resume` + `--model` + `CLAUDE_CONFIG_DIR` all work on Windows. End state: spike `FINDINGS.md` documents what works and what doesn't, ready to inform Phase 1B's Logger design and Phase 4's CC subprocess module.

**Architecture:** Spike code lives entirely in `spikes/cc-pty/` with its own tsconfig — isolated from the main project, never imported by production code, gitignored from electron-builder. node-pty is installed at the project root because Phase 4 will use it for real. `@electron/rebuild` rebuilds native modules against Electron's ABI; we run it once after install and verify with a smoke test.

**Tech Stack:** Same as Phase 0 + `node-pty@^1` + `@electron/rebuild@^3`. No new test infrastructure — the spike scripts are standalone Node programs run with `npx tsx`.

---

## Scope

Phase 1A only. Phase 1B (Logger service, IPC bridge, Dev Mode panel UI) is a separate plan written after the spike findings land.

## Prerequisites

- Phase 0 complete (`v0.1.0-phase-0` tag exists; CI green on main)
- Working directory: `C:\personal\tokenless\`
- **`claude` CLI installed and authenticated** on your personal account (`claude --version` should work; `claude login` already done)
- **MSBuild toolchain** — node-pty has prebuilt Windows binaries for common Node versions, but if your Node minor/Electron ABI combo isn't covered, native rebuild needs:
  - Visual Studio 2022 Build Tools with C++ workload
  - Python 3.x (auto-installs with VS Build Tools)
  - If install fails on Windows, run `winget install Microsoft.VisualStudio.2022.BuildTools` and re-run the install step

## File structure

```
package.json                                 [MODIFY] add node-pty, @electron/rebuild
package-lock.json                            [MODIFY — auto]
.github/workflows/ci.yml                     [MODIFY] bump actions to v5, add electron-rebuild step
spikes/
└── cc-pty/                                  [CREATE]
    ├── tsconfig.json                        [CREATE] standalone TS config
    ├── README.md                            [CREATE] how to run + interpret
    ├── spike-spawn.ts                       [CREATE] basic spawn + write + read
    ├── spike-resume.ts                      [CREATE] session-id capture + --resume
    ├── spike-model.ts                       [CREATE] --model flag
    ├── spike-config-dir.ts                  [CREATE] CLAUDE_CONFIG_DIR env var
    └── FINDINGS.md                          [CREATE] documented results
```

**Responsibilities:**

- `spikes/cc-pty/` — throwaway experiments. Nothing in `src/` imports anything from here. The whole directory is excluded from production builds via `electron-builder.yml`'s existing `!spikes/**/*` glob.
- Each `spike-*.ts` is a self-contained Node program. Run via `npx tsx spikes/cc-pty/spike-spawn.ts` etc.
- `FINDINGS.md` is the actual deliverable — Phase 4 will read it.

---

## Tasks

---

### Task 1: Bump deprecated GHA action versions in CI workflow

**Files:**
- Modify: `.github/workflows/ci.yml`

**Step 1:** Read the current workflow:

```bash
cd "C:/personal/tokenless"
cat .github/workflows/ci.yml
```

**Step 2:** Replace `actions/checkout@v4` and `actions/setup-node@v4` references with `@v5`. The full updated content:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  unit-and-integration:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - name: Type-check
        run: npm run typecheck
      - name: Unit + Integration tests
        run: npm run test:run

  e2e:
    runs-on: windows-latest
    needs: unit-and-integration
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - name: Build app
        run: npm run build
      - name: Playwright browsers (none needed for Electron-only E2E)
        run: echo "Skipping browser install — driving Electron directly"
      - name: E2E tests
        run: npm run test:e2e
      - name: Upload Playwright report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

Note: `actions/upload-artifact` stays at `@v4` — there's no v5 yet at time of writing. If CI annotations later flag v4 of upload-artifact as deprecated, bump it in a follow-up.

**Step 3:** Commit:

```bash
git add .github/workflows/ci.yml
git commit -m "ci(phase-1a): bump actions/checkout + actions/setup-node to v5"
```

**Step 4:** Verify locally that the YAML still parses (no syntax errors):

```bash
node -e "require('js-yaml')" 2>&1
```

If `js-yaml` isn't installed, skip this — the GitHub-side workflow parser will catch syntax errors when we push. Otherwise:

```bash
node -e "const yaml = require('js-yaml'); const fs = require('fs'); yaml.load(fs.readFileSync('.github/workflows/ci.yml', 'utf8')); console.log('YAML OK')"
```

Expected: `YAML OK` or skipped.

---

### Task 2: Install node-pty + @electron/rebuild

**Files:**
- Modify: `package.json`, `package-lock.json`

**Step 1:** Install both packages:

```bash
cd "C:/personal/tokenless"
npm install node-pty@^1
npm install -D @electron/rebuild@^3
```

`node-pty` becomes a runtime dependency (main process needs it). `@electron/rebuild` is dev-only.

**Step 2:** Check what got installed:

```bash
node -e "const p = require('./package.json'); console.log('deps:', Object.keys(p.dependencies).filter(k => k === 'node-pty')); console.log('devDeps:', Object.keys(p.devDependencies).filter(k => k === '@electron/rebuild'))"
```

Expected output:
```
deps: [ 'node-pty' ]
devDeps: [ '@electron/rebuild' ]
```

**Step 3 — IF the install reported MSBuild errors:** install Visual Studio Build Tools then retry:

```bash
winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

After install completes, restart your shell and retry Step 1. node-pty's prebuilds usually cover Node 20 on Windows x64, so the toolchain rebuild is a fallback path.

**Step 4:** Commit:

```bash
git add package.json package-lock.json
git commit -m "chore(phase-1a): add node-pty + @electron/rebuild"
```

---

### Task 3: Rebuild native modules against Electron + smoke test

**Files:**
- Modify: `package.json` (add `postinstall` script — optional; flagging in this task)

**Step 1:** Run electron-rebuild manually first:

```bash
cd "C:/personal/tokenless"
npx electron-rebuild --force --module-dir . --which-module node-pty
```

Expected output ends with `√ Rebuild Complete` (or similar success line). On failure, the toolchain issue from Task 2 is likely the cause; resolve and retry.

**Step 2:** Add a `postinstall` script to `package.json` so subsequent `npm install` (including CI) automatically rebuilds. Open `package.json` and add to the `"scripts"` block:

```json
"scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "build:unpack": "electron-vite build && electron-builder --dir",
    "build:win": "electron-vite build && electron-builder --win",
    "preview": "electron-vite preview",
    "test": "vitest",
    "test:run": "vitest run",
    "test:e2e": "playwright test",
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json",
    "rebuild:native": "electron-rebuild --force",
    "postinstall": "electron-rebuild --force --which-module node-pty"
  }
```

The two new scripts: `rebuild:native` (manual escape hatch) and `postinstall` (auto on every install).

**Step 3:** Smoke test that node-pty loads in Electron's runtime, not just Node's. Write a temporary verification file at `spikes/cc-pty/verify-load.ts`:

```typescript
// Minimal verification that node-pty loads without import-time errors.
// This file is throwaway — Task 4 creates the real spike scaffold and deletes this.

import * as pty from 'node-pty'

// Just check the module exposes spawn — don't actually spawn anything yet.
if (typeof pty.spawn !== 'function') {
  console.error('FAIL: node-pty.spawn is not a function')
  process.exit(1)
}

console.log('node-pty loaded; spawn is available')
process.exit(0)
```

Then run it with tsx (will be installed transitively or you can install it now):

```bash
npx tsx spikes/cc-pty/verify-load.ts
```

If tsx isn't on PATH, install it:

```bash
npm install -D tsx
```

Then re-run. Expected output: `node-pty loaded; spawn is available`, exit 0.

**Step 4:** Delete the throwaway verifier (Task 4 will rebuild the spike dir properly):

```bash
rm spikes/cc-pty/verify-load.ts
rmdir spikes/cc-pty 2>/dev/null || true
```

**Step 5:** Commit:

```bash
git add package.json package-lock.json
git commit -m "chore(phase-1a): wire electron-rebuild postinstall + tsx for spike runner"
```

---

### Task 4: Create spike directory + isolated tsconfig + README

**Files:**
- Create: `spikes/cc-pty/tsconfig.json`
- Create: `spikes/cc-pty/README.md`

**Step 1:** Create the directory:

```bash
cd "C:/personal/tokenless"
mkdir -p spikes/cc-pty
```

**Step 2:** Write `spikes/cc-pty/tsconfig.json` (standalone — does NOT extend the root configs, so spike experiments can be loose without polluting strict project rules):

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ES2022",
    "lib": ["ES2022"],
    "strict": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["*.ts"]
}
```

**Step 3:** Write `spikes/cc-pty/README.md`:

```markdown
# cc-pty Integration Spike

Throwaway experiments to verify Claude Code (the `claude` CLI) can be driven via node-pty on Windows with all the behaviors Phase 4 needs.

## Prerequisites

- `claude` CLI installed and logged in (`claude --version` should work)
- node-pty installed and rebuilt for Electron (Phase 1A Task 3)
- `tsx` available (Phase 1A Task 3)

## How to run

Each script is independent. From the project root:

```bash
npx tsx spikes/cc-pty/spike-spawn.ts
npx tsx spikes/cc-pty/spike-resume.ts
npx tsx spikes/cc-pty/spike-model.ts
npx tsx spikes/cc-pty/spike-config-dir.ts
```

Each prints its findings to stdout. After running all four, read `FINDINGS.md` for the documented results.

## What each script proves

| Script | Validates |
|---|---|
| `spike-spawn.ts` | node-pty can spawn `claude`, prompt is written via stdin, output streams via stdout |
| `spike-resume.ts` | `--resume <session-id>` re-attaches and Claude remembers prior context |
| `spike-model.ts` | `--model claude-haiku-4-5` is accepted and routes to the named model |
| `spike-config-dir.ts` | `CLAUDE_CONFIG_DIR` env var switches account context |

## When to delete

After Phase 4 lands its real `src/main/cc/` module, this entire `spikes/cc-pty/` directory can be deleted. Its purpose is one-off learning.
```

**Step 4:** Commit:

```bash
git add spikes/cc-pty/
git commit -m "chore(phase-1a): spike scaffolding for cc-pty (tsconfig + README)"
```

---

### Task 5: spike-spawn.ts — basic spawn + stdin write + stdout read

**Files:**
- Create: `spikes/cc-pty/spike-spawn.ts`

**Step 1:** Write the spike script:

```typescript
// Spike: prove node-pty can spawn `claude`, write a prompt to stdin, and read response from stdout.
// Goal: validate the basic pipe before we trust the rest of the design.

import * as pty from 'node-pty'
import { setTimeout as wait } from 'node:timers/promises'

const TEST_PROMPT = 'Reply with exactly the text: PING-OK'
const READ_TIMEOUT_MS = 30_000

async function main() {
  console.log('[spike-spawn] spawning claude...')

  const proc = pty.spawn('claude', [], {
    name: 'xterm-256color',
    cols: 100,
    rows: 30,
    cwd: process.cwd(),
    env: process.env as Record<string, string>
  })

  let buffer = ''
  let sawResponse = false
  const startedAt = Date.now()

  proc.onData((chunk: string) => {
    buffer += chunk
    process.stdout.write(chunk)
    if (buffer.includes('PING-OK')) {
      sawResponse = true
    }
  })

  proc.onExit(({ exitCode, signal }) => {
    console.log(`\n[spike-spawn] pty exited (code=${exitCode}, signal=${signal})`)
  })

  // Wait for the prompt to be ready, then send the test prompt
  await wait(2000)
  console.log(`\n[spike-spawn] writing prompt: "${TEST_PROMPT}"`)
  proc.write(TEST_PROMPT + '\r')

  // Wait for response
  while (!sawResponse && Date.now() - startedAt < READ_TIMEOUT_MS) {
    await wait(250)
  }

  if (sawResponse) {
    console.log('\n[spike-spawn] RESULT: PASS — claude responded with PING-OK')
  } else {
    console.log('\n[spike-spawn] RESULT: FAIL — timed out waiting for PING-OK')
    console.log('[spike-spawn] Captured output so far:')
    console.log(buffer.slice(-2000))
  }

  proc.kill()
  process.exit(sawResponse ? 0 : 1)
}

main().catch((err) => {
  console.error('[spike-spawn] ERROR:', err)
  process.exit(2)
})
```

**Step 2:** Run it:

```bash
cd "C:/personal/tokenless"
npx tsx spikes/cc-pty/spike-spawn.ts
```

Expected: terminal shows Claude starting up, the prompt being written, Claude's response streaming in, and a final `RESULT: PASS` line. Exit code 0.

If it fails — capture the exact error output for FINDINGS.md (Task 9). Don't fix it inside the spike; the spike is meant to *discover* gotchas, not work around them. If something can't be made to work, that's data Phase 4 needs.

**Step 3:** Commit:

```bash
git add spikes/cc-pty/spike-spawn.ts
git commit -m "spike(phase-1a): spike-spawn validates basic node-pty + claude pipe"
```

---

### Task 6: spike-resume.ts — session-id capture + --resume

**Files:**
- Create: `spikes/cc-pty/spike-resume.ts`

**Step 1:** Write the spike. This one runs two sessions: the first establishes context and captures the session ID; the second resumes and asserts Claude remembers.

```typescript
// Spike: prove `claude --resume <session-id>` restores prior conversation context.
//
// Strategy:
//   1. Start session A. Send "remember the number 7423". Capture session ID.
//   2. Kill session A.
//   3. Start session B with --resume <id>. Send "what number did I tell you?".
//   4. PASS if response contains "7423".

import * as pty from 'node-pty'
import { setTimeout as wait } from 'node:timers/promises'

const MAGIC_NUMBER = '7423'

function spawnClaude(args: string[]): pty.IPty {
  return pty.spawn('claude', args, {
    name: 'xterm-256color',
    cols: 100,
    rows: 30,
    cwd: process.cwd(),
    env: process.env as Record<string, string>
  })
}

async function readUntil(proc: pty.IPty, pattern: RegExp, timeoutMs: number): Promise<{ match: RegExpMatchArray | null; buffer: string }> {
  return new Promise((resolve) => {
    let buffer = ''
    const handler = proc.onData((chunk) => {
      buffer += chunk
      process.stdout.write(chunk)
      const m = buffer.match(pattern)
      if (m) {
        handler.dispose()
        resolve({ match: m, buffer })
      }
    })
    setTimeout(() => {
      handler.dispose()
      resolve({ match: null, buffer })
    }, timeoutMs)
  })
}

async function main() {
  // PHASE 1: establish context + capture session id
  console.log('[spike-resume] === Phase 1: capture session ID ===')
  const procA = spawnClaude([])

  // Wait for claude to print its session-id banner. Claude Code prints something like:
  //   "Session: <uuid>" near startup. The exact format may vary by CLI version.
  // We try a few candidate patterns; document the actual one in FINDINGS.md.
  const sessionIdResult = await readUntil(
    procA,
    /(?:[Ss]ession[\s:-]+|--resume\s+)([A-Za-z0-9_-]{8,})/,
    15_000
  )

  if (!sessionIdResult.match) {
    console.log('\n[spike-resume] FAIL: could not detect session id in startup output')
    console.log('[spike-resume] First 2KB of output:')
    console.log(sessionIdResult.buffer.slice(0, 2000))
    procA.kill()
    process.exit(1)
  }

  const sessionId = sessionIdResult.match[1]
  console.log(`\n[spike-resume] captured session ID: ${sessionId}`)

  // Send the magic number
  await wait(1000)
  procA.write(`Please remember this number for later: ${MAGIC_NUMBER}\r`)
  await readUntil(procA, /[Rr]emember/, 15_000)

  // Kill session A
  procA.kill()
  await wait(2000)

  // PHASE 2: resume and verify memory
  console.log('\n[spike-resume] === Phase 2: resume session ===')
  const procB = spawnClaude(['--resume', sessionId])

  await wait(2000)
  procB.write('What number did I just tell you to remember?\r')

  const recallResult = await readUntil(procB, new RegExp(MAGIC_NUMBER), 30_000)

  if (recallResult.match) {
    console.log(`\n[spike-resume] RESULT: PASS — claude --resume restored context, recalled ${MAGIC_NUMBER}`)
    procB.kill()
    process.exit(0)
  } else {
    console.log('\n[spike-resume] RESULT: FAIL — resumed session did not recall the magic number')
    console.log('[spike-resume] Captured output:')
    console.log(recallResult.buffer.slice(-2000))
    procB.kill()
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[spike-resume] ERROR:', err)
  process.exit(2)
})
```

**Step 2:** Run it:

```bash
cd "C:/personal/tokenless"
npx tsx spikes/cc-pty/spike-resume.ts
```

This one is the most likely to surface surprises. Possible outcomes:
- **PASS** — `--resume` works as expected; document the exact session-id format and where in stdout it appears
- **FAIL on session-id capture** — the regex pattern is wrong; capture what claude actually prints and update FINDINGS.md
- **FAIL on recall** — `--resume` works but doesn't restore the conversation memory (unlikely but possible); this would be a real design problem

Document whichever you see in FINDINGS.md (Task 9). Do not try to make it pass by changing the test — the goal is to learn.

**Step 3:** Commit:

```bash
git add spikes/cc-pty/spike-resume.ts
git commit -m "spike(phase-1a): spike-resume validates --resume session-id round-trip"
```

---

### Task 7: spike-model.ts — --model flag

**Files:**
- Create: `spikes/cc-pty/spike-model.ts`

**Step 1:** Write the spike. We ask Claude to identify which model it is and check the response contains "haiku" when we passed `--model claude-haiku-4-5`.

```typescript
// Spike: prove `--model claude-haiku-4-5` is accepted and actually routes to Haiku.

import * as pty from 'node-pty'
import { setTimeout as wait } from 'node:timers/promises'

const MODEL = 'claude-haiku-4-5'
const READ_TIMEOUT_MS = 30_000

async function main() {
  console.log(`[spike-model] spawning claude with --model ${MODEL}`)

  const proc = pty.spawn('claude', ['--model', MODEL], {
    name: 'xterm-256color',
    cols: 100,
    rows: 30,
    cwd: process.cwd(),
    env: process.env as Record<string, string>
  })

  let buffer = ''
  let saw = false
  const startedAt = Date.now()

  proc.onData((chunk: string) => {
    buffer += chunk
    process.stdout.write(chunk)
    if (/haiku/i.test(buffer)) saw = true
  })

  await wait(2000)
  proc.write('What model are you running as? Respond with just the model family (haiku, sonnet, or opus).\r')

  while (!saw && Date.now() - startedAt < READ_TIMEOUT_MS) {
    await wait(250)
  }

  if (saw) {
    console.log('\n[spike-model] RESULT: PASS — claude --model routed to haiku')
  } else {
    console.log('\n[spike-model] RESULT: FAIL — response did not contain "haiku"')
    console.log('[spike-model] Output captured:')
    console.log(buffer.slice(-2000))
  }

  proc.kill()
  process.exit(saw ? 0 : 1)
}

main().catch((err) => {
  console.error('[spike-model] ERROR:', err)
  process.exit(2)
})
```

**Step 2:** Run it:

```bash
cd "C:/personal/tokenless"
npx tsx spikes/cc-pty/spike-model.ts
```

Expected: `RESULT: PASS`. If it fails because the model name has changed in the CLI (e.g., the CLI uses a different identifier than the API), capture the exact CLI error and document.

**Step 3:** Commit:

```bash
git add spikes/cc-pty/spike-model.ts
git commit -m "spike(phase-1a): spike-model validates --model claude-haiku-4-5"
```

---

### Task 8: spike-config-dir.ts — CLAUDE_CONFIG_DIR env var

**Files:**
- Create: `spikes/cc-pty/spike-config-dir.ts`

**Step 1:** Write the spike. This one points `CLAUDE_CONFIG_DIR` at a brand-new empty directory and asserts that claude responds with an auth-required error (proving it actually read the env var and didn't fall back to the default config).

```typescript
// Spike: prove CLAUDE_CONFIG_DIR redirects claude's auth/config to a custom path.
//
// Strategy: point CLAUDE_CONFIG_DIR at a fresh empty dir. Claude should fail to find
// credentials there and emit an auth-required message. If we see that, the env var
// is honored. If claude succeeds anyway (using cached or default credentials), the
// env var is being ignored — a real problem for multi-account support.

import * as pty from 'node-pty'
import { setTimeout as wait } from 'node:timers/promises'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const READ_TIMEOUT_MS = 15_000

async function main() {
  const fakeConfigDir = mkdtempSync(join(tmpdir(), 'tl-spike-cfg-'))
  console.log(`[spike-config-dir] using CLAUDE_CONFIG_DIR=${fakeConfigDir}`)

  const proc = pty.spawn('claude', [], {
    name: 'xterm-256color',
    cols: 100,
    rows: 30,
    cwd: process.cwd(),
    env: { ...process.env, CLAUDE_CONFIG_DIR: fakeConfigDir } as Record<string, string>
  })

  let buffer = ''
  const startedAt = Date.now()

  proc.onData((chunk: string) => {
    buffer += chunk
    process.stdout.write(chunk)
  })

  // Give claude time to start and either prompt for auth or proceed
  while (Date.now() - startedAt < READ_TIMEOUT_MS) {
    await wait(500)
    // Look for auth-related patterns OR a normal prompt that would indicate auth was bypassed
    if (/(?:log[\s-]?in|authenticate|sign\s?in|unauthorized|API key)/i.test(buffer)) {
      console.log('\n[spike-config-dir] RESULT: PASS — claude detected missing credentials in custom config dir')
      proc.kill()
      rmSync(fakeConfigDir, { recursive: true, force: true })
      process.exit(0)
    }
  }

  console.log('\n[spike-config-dir] RESULT: AMBIGUOUS — no auth prompt detected within 15s')
  console.log('[spike-config-dir] This MAY mean CLAUDE_CONFIG_DIR was ignored, OR claude is silently authenticated via OS keyring.')
  console.log('[spike-config-dir] Captured output (last 2KB):')
  console.log(buffer.slice(-2000))

  proc.kill()
  rmSync(fakeConfigDir, { recursive: true, force: true })
  process.exit(1)
}

main().catch((err) => {
  console.error('[spike-config-dir] ERROR:', err)
  process.exit(2)
})
```

**Step 2:** Run it:

```bash
cd "C:/personal/tokenless"
npx tsx spikes/cc-pty/spike-config-dir.ts
```

Possible outcomes:
- **PASS** — claude correctly looked at the custom dir, found nothing, prompted for auth. Multi-account is feasible.
- **AMBIGUOUS** — no auth prompt. Could mean claude reads creds from OS keyring (Windows DPAPI) regardless of `CLAUDE_CONFIG_DIR`, OR the env var name is wrong. Capture in FINDINGS.md and Phase 4 will need an alternative approach.

This is the most likely spike to return ambiguous results. That's still valuable data.

**Step 3:** Commit:

```bash
git add spikes/cc-pty/spike-config-dir.ts
git commit -m "spike(phase-1a): spike-config-dir tests CLAUDE_CONFIG_DIR account isolation"
```

---

### Task 9: Document FINDINGS.md

**Files:**
- Create: `spikes/cc-pty/FINDINGS.md`

**Step 1:** Re-run all four spikes back-to-back and capture exact results:

```bash
cd "C:/personal/tokenless"
npx tsx spikes/cc-pty/spike-spawn.ts; echo "---spawn exit: $?---"
npx tsx spikes/cc-pty/spike-resume.ts; echo "---resume exit: $?---"
npx tsx spikes/cc-pty/spike-model.ts; echo "---model exit: $?---"
npx tsx spikes/cc-pty/spike-config-dir.ts; echo "---config-dir exit: $?---"
```

**Step 2:** Write `FINDINGS.md` with the actual results. Use this template — fill in the bracketed sections with what you actually observed:

```markdown
# cc-pty Spike Findings

**Date run:** [YYYY-MM-DD]
**Platform:** Windows [10/11], Node [version], Electron [version]
**`claude --version`:** [output]

This document records what each spike actually proved (or didn't). Phase 4's CC subprocess module (`src/main/cc/`) reads this and uses it to make design decisions.

---

## spike-spawn — basic PTY + claude

**Status:** [PASS | FAIL]

**What worked:**
- [e.g., node-pty.spawn('claude', []) succeeds]
- [e.g., writing a prompt followed by \r triggers claude to process it]
- [e.g., output streams back via onData chunks]

**What didn't:**
- [list any surprises — ANSI codes that confused things, prompts that hung, etc.]

**Notes for Phase 4:**
- [e.g., always pass cols/rows on spawn — claude clamps output to terminal width]
- [e.g., \r (CR) works for prompt submission; \n alone does not]

---

## spike-resume — --resume session id round-trip

**Status:** [PASS | FAIL | PARTIAL]

**Session ID format observed:** [e.g., UUID-like 36 chars, or shorter]
**Where in stdout it appeared:** [e.g., on the second line after startup banner, prefixed by "Session: "]

**Regex used to capture session id:** [paste the working pattern]

**Resume behavior:**
- [e.g., context fully restored, magic number recalled]
- [or: resume started a fresh session, context lost]

**Notes for Phase 4:**
- [implications for the conversations.cc_session_id capture in the data model]

---

## spike-model — --model flag

**Status:** [PASS | FAIL]

**Model identifier used:** `claude-haiku-4-5`

**Notes:**
- [did the CLI accept the identifier, route correctly?]
- [if it rejected, what identifier does the current CLI accept?]
- [other model identifiers that worked: opus, sonnet]

---

## spike-config-dir — CLAUDE_CONFIG_DIR isolation

**Status:** [PASS | AMBIGUOUS | FAIL]

**Behavior observed:**
- [e.g., pointing at empty dir triggers auth prompt → PASS, multi-account is feasible]
- [or: claude silently used keyring credentials despite custom config dir → AMBIGUOUS; multi-account needs a different mechanism]

**Implications for Phase 6 (multi-account):**
- [if AMBIGUOUS, list candidate alternative mechanisms: separate `claude login` invocations per account with switching; per-user OS profile; etc.]

---

## Overall recommendation

[1-2 paragraphs synthesizing what this means for Phase 4 (CC subprocess) and Phase 6 (multi-account). If anything is blocked or needs design revision, flag here.]

---

## Cleanup

After Phase 4's `src/main/cc/` module lands and incorporates these learnings, delete the entire `spikes/cc-pty/` directory and add a one-line note to this section about when/where the findings were absorbed.
```

**Step 3:** Commit:

```bash
git add spikes/cc-pty/FINDINGS.md
git commit -m "docs(phase-1a): document cc-pty spike findings"
```

---

### Task 10: Phase 1A verification + tag

**Files:** none — verification only.

**Step 1:** Verify everything still works after the changes:

```bash
cd "C:/personal/tokenless"
npm run typecheck
npm run test:run
npm run build
npm run test:e2e
git status
```

All four commands must exit 0 (Phase 0's verification baseline). `git status` clean.

**Step 2:** Push the new commits to GitHub and verify CI passes:

```bash
git push origin main
```

Then wait for CI:

```bash
"/c/Program Files/GitHub CLI/gh.exe" run watch --exit-status -R Aiden-Molyneaux/tokenless
```

Must exit 0. CI on Windows will also exercise the new `postinstall` electron-rebuild step — verifying the native module rebuild works in the cloud, not just locally.

**Step 3:** Tag the Phase 1A completion:

```bash
git tag -a v0.2.0-phase-1a -m "Phase 1A complete — node-pty installed, spike findings documented"
git push origin v0.2.0-phase-1a
```

**Step 4:** Print summary:

```bash
git log --oneline v0.1.0-phase-0..v0.2.0-phase-1a
git tag --list
```

Expected: ~10 commits since Phase 0's tag; both tags listed (`v0.1.0-phase-0`, `v0.2.0-phase-1a`).

---

## Phase 1A — Exit criteria

Phase 1A is complete when:

1. `npm run typecheck` exits 0
2. `npm run test:run` exits 0
3. `npm run build` exits 0
4. `npm run test:e2e` exits 0
5. CI on GitHub is green for the new commits (including the electron-rebuild postinstall step)
6. `spikes/cc-pty/FINDINGS.md` documents the outcome of all four spikes with concrete observations
7. Tag `v0.2.0-phase-1a` exists at the latest commit, pushed to origin
8. `git status` is clean

Once exit criteria are met, return to write Phase 1B (Logger + IPC bridge + Dev Mode panel UI). The FINDINGS.md may surface considerations that change Phase 1B's design — that's expected and is the whole point of having a spike first.

---

## Self-review (writing-plans skill)

**1. Spec coverage:** Phase 1A maps to spec §5.1 (Claude Code subprocess module — validates the spawn/parse/exit/resume mechanics empirically before Phase 4 codifies them) and the CI annotation follow-ups from Phase 0. The Logger / Dev Mode panel work from spec §6 is deferred to Phase 1B.

**2. Placeholder scan:** Searched for TBD/TODO/"implement later" — none found in this plan. The bracketed placeholders in FINDINGS.md (Task 9) are *intentional fill-in templates* the implementer completes with observed data; this is the correct pattern for documenting an empirical experiment's results.

**3. Type consistency:** Phase 1A doesn't introduce types that other tasks reference. node-pty's `IPty` type is used consistently in all four spikes via `pty.IPty`. The `pty.spawn` return type is consistent.

**4. Scope check:** 10 tasks, each task scoped to a single deliverable. Total estimated time: 4-6 hours of focused work (most of it waiting for npm installs and claude responses; the actual coding is minimal).

**Notes for the executor:**

- The spike scripts call the real `claude` CLI and consume Pro/Max plan tokens. Each run is ~100-1000 tokens. The four spikes together cost maybe $0.05 of plan usage. Not a concern, but flagging because spike runs aren't free.
- If `spike-resume.ts`'s session-id regex fails to match, do NOT widen the regex blindly. Read claude's actual startup output, identify what it really prints, and update the regex with intentional knowledge of the format. The FINDINGS.md should document the exact format so Phase 4's parser doesn't have to re-derive it.
- If `spike-config-dir.ts` returns AMBIGUOUS, that's a Phase 6 (multi-account) design problem, NOT a Phase 1A blocker. Document it and proceed.
- If a spike legitimately fails (not "test pattern wrong" but "claude doesn't support this"), that's the most valuable Phase 1A outcome — Phase 4 design needs to know.

---

*End of Phase 1A plan.*
