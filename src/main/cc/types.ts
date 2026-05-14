// Public types for the cc/ module — what the IPC handler and tests consume.
// node-pty's IPty interface is structurally what PtyHandle requires; we define
// our own narrower view so tests can pass a MockPty without depending on
// node-pty.

export interface PtyHandle {
  readonly pid: number
  cols: number
  rows: number
  onData(listener: (chunk: string) => void): { dispose: () => void }
  onExit(listener: (e: { exitCode: number; signal?: number }) => void): { dispose: () => void }
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(signal?: string): void
}

export interface SpawnOptions {
  readonly conversationId: number
  readonly sessionId: string         // UUID — pre-specified per ADR-016
  readonly cwd: string               // project root
  readonly cols: number
  readonly rows: number
  readonly env: {
    readonly CLAUDE_CONFIG_DIR: string   // per ADR-018
    readonly ANTHROPIC_API_KEY?: string  // per ADR-018; omit for default-key accounts
  }
  // Override the spawned binary — used by tests + CI's mock-claude.
  // Defaults to 'claude.cmd' on Windows (ADR-017), 'claude' elsewhere.
  readonly claudeBin?: string
}

// Factory type used by spawner — production passes node-pty's spawn; tests
// pass a function that returns a MockPty.
export type PtySpawnFn = (
  binary: string,
  args: readonly string[],
  opts: {
    cols: number
    rows: number
    cwd: string
    env: Record<string, string>
    name?: string
  }
) => PtyHandle
