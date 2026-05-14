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
const CLAUDE_BIN = process.platform === 'win32' ? 'claude.cmd' : 'claude'

async function main() {
  const fakeConfigDir = mkdtempSync(join(tmpdir(), 'tl-spike-cfg-'))
  console.log(`[spike-config-dir] using CLAUDE_CONFIG_DIR=${fakeConfigDir}`)

  const proc = pty.spawn(CLAUDE_BIN, [], {
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
