// spawner.ts — single entry point for spawning a claude PTY subprocess.
// Multi-account env per ADR-018. Pre-specified session ID per ADR-016.
// Binary selection per ADR-017 (claude.cmd on Windows). Overridable via
// TOKENLESS_CLAUDE_BIN for tests + CI mock.
//
// The PtySpawnFn factory is injected so tests can substitute MockPty
// without dragging node-pty into the test runtime.

import type { PtyHandle, PtySpawnFn, SpawnOptions } from './types'

function pickClaudeBin(explicit: string | undefined): string {
  if (explicit) return explicit
  const override = process.env['TOKENLESS_CLAUDE_BIN']
  if (override) return override
  return process.platform === 'win32' ? 'claude.cmd' : 'claude'
}

export function spawnClaude(opts: SpawnOptions, ptyFactory: PtySpawnFn): PtyHandle {
  const bin = pickClaudeBin(opts.claudeBin)
  const args = ['--session-id', opts.sessionId]

  const baseEnv = filterOutUndefined(process.env)
  // Always remove ANTHROPIC_API_KEY from the base env — it must come only
  // from the account's explicit apiKeyRef (opts.env.ANTHROPIC_API_KEY).
  // This prevents a leaked env var from silently overriding the account config.
  delete baseEnv['ANTHROPIC_API_KEY']

  const env: Record<string, string> = {
    ...baseEnv,
    CLAUDE_CONFIG_DIR: opts.env.CLAUDE_CONFIG_DIR
  }
  if (opts.env.ANTHROPIC_API_KEY) {
    env['ANTHROPIC_API_KEY'] = opts.env.ANTHROPIC_API_KEY
  }

  return ptyFactory(bin, args, {
    cols: opts.cols,
    rows: opts.rows,
    cwd: opts.cwd,
    env,
    name: 'xterm-256color'
  })
}

function filterOutUndefined(src: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(src)) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}
