import { describe, it, expect } from 'vitest'

import { spawnClaude } from '../../cc/spawner'
import type { PtySpawnFn } from '../../cc/types'
import { MockPty } from '../../../../test/doubles/mock-pty'

// Purpose: spawnClaude assembles the right binary, args, env, and dimensions
// then delegates to the injected pty factory. Multi-account env per ADR-018
// is verified. Session-id pre-specification per ADR-016 verified.

describe('cc/spawner', () => {
  it('on Windows: spawns claude.cmd with --session-id <uuid>, propagates env, cwd, dims', () => {
    const captured: { bin?: string; args?: readonly string[]; opts?: Record<string, unknown> } = {}
    const factory: PtySpawnFn = (bin, args, opts) => {
      captured.bin = bin
      captured.args = args
      captured.opts = opts as Record<string, unknown>
      return new MockPty({ initialCols: opts.cols, initialRows: opts.rows })
    }
    const pty = spawnClaude(
      {
        conversationId: 1,
        sessionId: '11111111-2222-3333-4444-555555555555',
        cwd: 'C:/personal/tokenless',
        cols: 100,
        rows: 30,
        env: { CLAUDE_CONFIG_DIR: 'C:/Users/me/.claude-personal' },
        claudeBin: 'claude.cmd'
      },
      factory
    )

    expect(pty.pid).toBeGreaterThan(0)
    expect(captured.bin).toBe('claude.cmd')
    expect(captured.args).toEqual(['--session-id', '11111111-2222-3333-4444-555555555555'])
    expect(captured.opts?.cwd).toBe('C:/personal/tokenless')
    expect((captured.opts?.env as Record<string, string>).CLAUDE_CONFIG_DIR).toBe(
      'C:/Users/me/.claude-personal'
    )
    expect(captured.opts?.cols).toBe(100)
    expect(captured.opts?.rows).toBe(30)
  })

  it('forwards ANTHROPIC_API_KEY when provided (per ADR-018)', () => {
    let envSeen: Record<string, string> | undefined
    const factory: PtySpawnFn = (_bin, _args, opts) => {
      envSeen = opts.env
      return new MockPty()
    }
    spawnClaude(
      {
        conversationId: 1,
        sessionId: 'abc-uuid',
        cwd: 'C:/x',
        cols: 80,
        rows: 24,
        env: {
          CLAUDE_CONFIG_DIR: 'C:/c',
          ANTHROPIC_API_KEY: 'sk-test-12345'
        }
      },
      factory
    )
    expect(envSeen?.['ANTHROPIC_API_KEY']).toBe('sk-test-12345')
  })

  it('does NOT include ANTHROPIC_API_KEY when omitted', () => {
    let envSeen: Record<string, string> | undefined
    const factory: PtySpawnFn = (_bin, _args, opts) => {
      envSeen = opts.env
      return new MockPty()
    }
    spawnClaude(
      {
        conversationId: 1,
        sessionId: 'abc-uuid',
        cwd: 'C:/x',
        cols: 80,
        rows: 24,
        env: { CLAUDE_CONFIG_DIR: 'C:/c' }
      },
      factory
    )
    expect(envSeen?.['ANTHROPIC_API_KEY']).toBeUndefined()
  })

  it('respects TOKENLESS_CLAUDE_BIN override (for CI mock)', () => {
    let binSeen: string | undefined
    const factory: PtySpawnFn = (bin, _args, _opts) => {
      binSeen = bin
      return new MockPty()
    }
    const prev = process.env['TOKENLESS_CLAUDE_BIN']
    process.env['TOKENLESS_CLAUDE_BIN'] = 'C:/path/to/mock-claude.cjs'
    try {
      spawnClaude(
        {
          conversationId: 1,
          sessionId: 'abc-uuid',
          cwd: 'C:/x',
          cols: 80,
          rows: 24,
          env: { CLAUDE_CONFIG_DIR: 'C:/c' }
        },
        factory
      )
    } finally {
      if (prev === undefined) delete process.env['TOKENLESS_CLAUDE_BIN']
      else process.env['TOKENLESS_CLAUDE_BIN'] = prev
    }
    expect(binSeen).toBe('C:/path/to/mock-claude.cjs')
  })

  it('on resume, spawns claude with --resume <sessionId> instead of --session-id', () => {
    let argsSeen: readonly string[] | undefined
    const factory: PtySpawnFn = (_bin, args, _opts) => {
      argsSeen = args
      return new MockPty()
    }
    spawnClaude(
      {
        conversationId: 1,
        sessionId: 'abc-def-uuid',
        resume: true,
        cwd: 'C:/x',
        cols: 80,
        rows: 24,
        env: { CLAUDE_CONFIG_DIR: 'C:/c' }
      },
      factory
    )
    expect(argsSeen).toEqual(['--resume', 'abc-def-uuid'])
  })
})
