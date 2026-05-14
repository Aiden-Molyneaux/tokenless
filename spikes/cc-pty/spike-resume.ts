// Spike: prove `claude --resume <session-id>` restores prior conversation context.
//
// Strategy:
//   1. Start session A. Send "remember the number 7423". Capture session ID.
//   2. Kill session A.
//   3. Start session B with --resume <id>. Send "what number did I tell you?".
//   4. PASS if response contains "7423".

import * as pty from 'node-pty'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

const MAGIC_NUMBER = '7423'
const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude-personal')

// On Windows, node-pty's CreateProcess cannot resolve extensionless Unix shims.
// Use 'claude.cmd' so cmd.exe handles the dispatch to claude.exe.
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
  console.log(`[spike-resume] using CLAUDE_CONFIG_DIR=${CONFIG_DIR}`)

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
