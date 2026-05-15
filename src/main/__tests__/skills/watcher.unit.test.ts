import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { SkillsWatcher } from '../../skills/watcher'

interface FakeWatcher {
  handlers: Map<string, (path: string) => void>
  on: (event: string, fn: (path: string) => void) => FakeWatcher
  close: () => Promise<void>
  fire: (event: string, path: string) => void
}

function makeFakeWatcher(): FakeWatcher {
  const handlers = new Map<string, (path: string) => void>()
  const w: FakeWatcher = {
    handlers,
    on(event, fn) { handlers.set(event, fn); return w },
    close: vi.fn().mockResolvedValue(undefined) as never,
    fire(event, path) { handlers.get(event)?.(path) }
  }
  return w
}

describe('skills/watcher', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('debounces rescans: 3 rapid fs events trigger 1 rescan after 1s', async () => {
    const fake = makeFakeWatcher()
    const scan = vi.fn().mockResolvedValue(undefined)
    const broadcast = vi.fn()
    const watcher = new SkillsWatcher({
      roots: ['/a'],
      scan,
      broadcast,
      chokidarFactory: () => fake as never
    })
    watcher.start()
    expect(scan).toHaveBeenCalledTimes(1)              // initial scan on start

    fake.fire('add', '/a/x/SKILL.md')
    fake.fire('change', '/a/x/SKILL.md')
    fake.fire('unlink', '/a/x/SKILL.md')
    expect(scan).toHaveBeenCalledTimes(1)              // still 1; debounce pending

    await vi.advanceTimersByTimeAsync(1100)
    expect(scan).toHaveBeenCalledTimes(2)              // debounced scan ran
    expect(broadcast).toHaveBeenCalledWith('skills:changed', undefined)
  })

  it('start() runs the initial scan immediately (not debounced)', async () => {
    const fake = makeFakeWatcher()
    const scan = vi.fn().mockResolvedValue(undefined)
    const broadcast = vi.fn()
    const watcher = new SkillsWatcher({
      roots: ['/a'], scan, broadcast,
      chokidarFactory: () => fake as never
    })
    watcher.start()
    expect(scan).toHaveBeenCalledTimes(1)
    // The initial scan should NOT broadcast — that's reserved for changes.
    // (If the implementation chooses to broadcast on initial-scan completion
    // it's also defensible, but we want it OFF to avoid noisy bootup signals.)
  })

  it('stop() closes the underlying chokidar watcher and clears pending debounce', async () => {
    const fake = makeFakeWatcher()
    const scan = vi.fn().mockResolvedValue(undefined)
    const watcher = new SkillsWatcher({
      roots: ['/a'], scan, broadcast: vi.fn(),
      chokidarFactory: () => fake as never
    })
    watcher.start()
    fake.fire('add', '/a/x/SKILL.md')   // schedules debounce
    await watcher.stop()
    expect(fake.close).toHaveBeenCalled()
    // Advance time past the original debounce; the rescan should NOT fire
    // because stop() cleared it.
    await vi.advanceTimersByTimeAsync(2000)
    expect(scan).toHaveBeenCalledTimes(1)  // only the initial scan
  })

  it('triggerRescan() schedules a debounced rescan', async () => {
    const fake = makeFakeWatcher()
    const scan = vi.fn().mockResolvedValue(undefined)
    const broadcast = vi.fn()
    const watcher = new SkillsWatcher({
      roots: ['/a'], scan, broadcast,
      chokidarFactory: () => fake as never
    })
    watcher.start()
    watcher.triggerRescan()
    expect(scan).toHaveBeenCalledTimes(1)              // still only the initial
    await vi.advanceTimersByTimeAsync(1100)
    expect(scan).toHaveBeenCalledTimes(2)
  })
})
