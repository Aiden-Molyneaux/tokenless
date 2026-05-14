// Spike: prove node-pty can spawn `claude`, write a prompt to stdin, and read response from stdout.
// Goal: validate the basic pipe before we trust the rest of the design.

import * as pty from 'node-pty'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

const TEST_PROMPT = 'Reply with exactly the text: PING-OK'
const READ_TIMEOUT_MS = 30_000

// Default to the personal config dir so spike runs never consume work-plan tokens.
// Override with: CLAUDE_CONFIG_DIR=/some/other/path npx tsx spike-spawn.ts
const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude-personal')

async function main() {
  console.log(`[spike-spawn] using CLAUDE_CONFIG_DIR=${CONFIG_DIR}`)
  console.log('[spike-spawn] spawning claude...')

  // On Windows, node-pty's CreateProcess cannot resolve extensionless Unix shims.
  // Use 'claude.cmd' so cmd.exe handles the dispatch to claude.exe.
  const claudeBin = process.platform === 'win32' ? 'claude.cmd' : 'claude'
  const proc = pty.spawn(claudeBin, [], {
    name: 'xterm-256color',
    cols: 100,
    rows: 30,
    cwd: process.cwd(),
    env: { ...process.env, CLAUDE_CONFIG_DIR: CONFIG_DIR } as Record<string, string>
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
