// MockPty mimics node-pty's IPty interface for tests. It collects writes, lets
// the test push synthetic output via `emitData`, and tracks kill/dispose calls.
//
// Use via the spawner's seam: spawner.spawnClaude(opts, ptyFactory?) accepts a
// factory that returns an IPty-shaped object. Tests pass a factory that returns
// a MockPty.

type DataListener = (chunk: string) => void
type ExitListener = (e: { exitCode: number; signal?: number }) => void

export interface MockPtyOptions {
  initialCols?: number
  initialRows?: number
}

export class MockPty {
  readonly pid = 1
  cols: number
  rows: number
  readonly writes: string[] = []
  killed = false
  readonly killSignals: (string | undefined)[] = []
  resized: { cols: number; rows: number }[] = []
  private dataListeners: DataListener[] = []
  private exitListeners: ExitListener[] = []
  private disposed = false

  constructor(opts: MockPtyOptions = {}) {
    this.cols = opts.initialCols ?? 100
    this.rows = opts.initialRows ?? 30
  }

  onData(listener: DataListener): { dispose: () => void } {
    this.dataListeners.push(listener)
    return { dispose: () => {} }
  }

  onExit(listener: ExitListener): { dispose: () => void } {
    this.exitListeners.push(listener)
    return { dispose: () => {} }
  }

  write(data: string): void {
    if (this.disposed) throw new Error('write to disposed pty')
    this.writes.push(data)
  }

  resize(cols: number, rows: number): void {
    this.cols = cols
    this.rows = rows
    this.resized.push({ cols, rows })
  }

  kill(signal?: string): void {
    this.killed = true
    this.killSignals.push(signal)
    queueMicrotask(() => {
      for (const l of this.exitListeners) l({ exitCode: 0, signal: undefined })
    })
  }

  pause(): void {}
  resume(): void {}

  // Test helpers — not on real IPty
  emitData(chunk: string): void {
    for (const l of this.dataListeners) l(chunk)
  }

  emitExit(exitCode: number, signal?: number): void {
    for (const l of this.exitListeners) l({ exitCode, signal })
  }

  markDisposed(): void {
    this.disposed = true
  }
}
