import type { FSWatcher } from 'chokidar'

export interface SkillsWatcherOptions {
  readonly roots: readonly string[]
  readonly scan: () => Promise<void>
  readonly broadcast: (event: 'skills:changed', payload?: undefined) => void
  // Injectable for tests; production resolves to real chokidar.
  readonly chokidarFactory?: (roots: readonly string[]) => FSWatcher
}

const DEBOUNCE_MS = 1000

export class SkillsWatcher {
  private watcher: FSWatcher | null = null
  private debounceTimer: NodeJS.Timeout | null = null

  constructor(private readonly opts: SkillsWatcherOptions) {}

  start(): void {
    const factory = this.opts.chokidarFactory ?? defaultChokidarFactory
    this.watcher = factory(this.opts.roots)
    const onAny = (): void => this.scheduleRescan()
    this.watcher.on('add', onAny).on('change', onAny).on('unlink', onAny)
    // Initial scan on start (not debounced, no broadcast — boot-time signal).
    void this.opts.scan()
  }

  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }
  }

  triggerRescan(): void {
    this.scheduleRescan()
  }

  private scheduleRescan(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      void this.opts.scan().then(() => this.opts.broadcast('skills:changed', undefined))
    }, DEBOUNCE_MS)
  }
}

function defaultChokidarFactory(roots: readonly string[]): FSWatcher {
  // Lazy require so chokidar isn't loaded in unit tests that don't need it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const chokidar = require('chokidar') as typeof import('chokidar')
  return chokidar.watch(roots as string[], {
    ignored: /(^|[\\/])\.(?!claude)/,
    persistent: true,
    ignoreInitial: true,  // explicit initial scan via start(); chokidar's add-events on startup would be noisy
    depth: 5
  })
}
