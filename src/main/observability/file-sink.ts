import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync
} from 'node:fs'
import { join } from 'node:path'
import type { LogRecord } from '@shared/observability'

type Clock = () => Date

// JSONL writer. One file per day named `tokenless-YYYY-MM-DD.jsonl`.
// Daily boundaries are checked lazily on every write — when the date changes,
// the next write rolls to a new file and prunes files older than retentionDays.

export class FileSink {
  private currentDate: string
  private currentPath: string

  constructor(
    private readonly logDir: string,
    private readonly retentionDays: number = 30,
    private readonly clock: Clock = () => new Date()
  ) {
    mkdirSync(logDir, { recursive: true })
    this.currentDate = this.dateString(this.clock())
    this.currentPath = join(this.logDir, `tokenless-${this.currentDate}.jsonl`)
  }

  write(record: LogRecord): void {
    this.rotateIfNeeded()
    appendFileSync(this.currentPath, JSON.stringify(record) + '\n', 'utf8')
  }

  private rotateIfNeeded(): void {
    const today = this.dateString(this.clock())
    if (today !== this.currentDate) {
      this.currentDate = today
      this.currentPath = join(this.logDir, `tokenless-${today}.jsonl`)
      this.prune()
    }
  }

  private prune(): void {
    const cutoff = this.clock().getTime() - this.retentionDays * 86_400_000
    for (const file of readdirSync(this.logDir)) {
      const full = join(this.logDir, file)
      try {
        if (statSync(full).mtimeMs < cutoff) {
          unlinkSync(full)
        }
      } catch {
        // file may have been removed between readdir and stat — ignore
      }
    }
  }

  // Local time per ADR-020 — matches Dev Mode display + user mental model.
  private dateString(d: Date): string {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }
}
