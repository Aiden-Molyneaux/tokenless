// Spike: prove `--model claude-haiku-4-5` is accepted and actually routes to Haiku.

import * as pty from 'node-pty'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

const MODEL = 'claude-haiku-4-5'
const READ_TIMEOUT_MS = 30_000
const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude-personal')
const CLAUDE_BIN = process.platform === 'win32' ? 'claude.cmd' : 'claude'

async function main() {
  console.log(`[spike-model] CLAUDE_CONFIG_DIR=${CONFIG_DIR}`)
  console.log(`[spike-model] spawning claude with --model ${MODEL}`)

  const proc = pty.spawn(CLAUDE_BIN, ['--model', MODEL], {
    name: 'xterm-256color',
    cols: 100,
    rows: 30,
    cwd: process.cwd(),
    env: { ...process.env, CLAUDE_CONFIG_DIR: CONFIG_DIR } as Record<string, string>
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
