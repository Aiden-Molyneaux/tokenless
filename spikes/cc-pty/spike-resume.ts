// Spike: prove `claude --resume <session-id>` restores prior conversation context.
//
// Strategy: pre-specify the session UUID via --session-id (simpler than parsing
// the TUI for it). This is also the right strategy for Phase 4's production
// code — TokenLess generates a UUID, persists it as conversations.cc_session_id,
// and uses it symmetrically for new sessions and resumes.
//
//   1. Generate a UUID.
//   2. Start session A with --session-id <uuid>. Send "remember the number 7423".
//   3. Kill session A.
//   4. Start session B with --resume <uuid>. Send "what number did I tell you?".
//   5. PASS if response contains "7423".

import * as pty from 'node-pty'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout as wait } from 'node:timers/promises'

const MAGIC_NUMBER = '7423'
const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude-personal')
const CLAUDE_BIN = process.platform === 'win32' ? 'claude.cmd' : 'claude'

function spawnClaude(args: string[]): pty.IPty {
  return pty.spawn(CLAUDE_BIN, args, {
    name: 'xterm-256color',
    cols: 100,
    rows: 30,
    cwd: process.cwd(),
    env: { ...process.env, CLAUDE_CONFIG_DIR: CONFIG_DIR } as Record<string, string>
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
  const sessionId = randomUUID()
  console.log(`[spike-resume] using CLAUDE_CONFIG_DIR=${CONFIG_DIR}`)
  console.log(`[spike-resume] generated session ID: ${sessionId}`)

  // PHASE 1: establish context with pre-specified session ID
  console.log('\n[spike-resume] === Phase 1: establish context with --session-id ===')
  const procA = spawnClaude(['--session-id', sessionId])

  await wait(3000)
  procA.write(`Please remember this number for later: ${MAGIC_NUMBER}\r`)
  await readUntil(procA, /[Rr]emember/, 15_000)

  procA.kill()
  await wait(2000)

  // PHASE 2: resume with --resume <same id>
  console.log('\n[spike-resume] === Phase 2: resume session ===')
  const procB = spawnClaude(['--resume', sessionId])

  await wait(3000)
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
