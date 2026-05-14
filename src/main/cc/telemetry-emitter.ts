// TelemetryEmitter — coalesces tokens-used parser events into periodic
// telemetry:tick broadcasts. Per-conversation state. Phase 4C only does
// context budget; Phase 5 will add cost fields.

import type { CcEvent } from '@shared/types/cc-events'
import type { TelemetryTick } from '@shared/types/telemetry'

interface ConvState {
  contextUsed: number | null
  contextTotal: number | null
  dirty: boolean
}

interface TelemetryEmitterOptions {
  readonly intervalMs: number
  readonly emit: (tick: TelemetryTick) => void
}

export class TelemetryEmitter {
  private readonly state = new Map<number, ConvState>()
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly opts: TelemetryEmitterOptions) {}

  start(): void {
    if (this.timer !== null) return
    this.timer = setInterval(() => this.flush(), this.opts.intervalMs)
  }

  stop(): void {
    if (this.timer === null) return
    clearInterval(this.timer)
    this.timer = null
  }

  handle(event: { conversationId: number; event: CcEvent }): void {
    if (event.event.kind !== 'tokens-used') return
    let s = this.state.get(event.conversationId)
    if (!s) {
      s = { contextUsed: null, contextTotal: null, dirty: false }
      this.state.set(event.conversationId, s)
    }
    s.contextUsed = event.event.used
    s.contextTotal = event.event.total
    s.dirty = true
  }

  removeConversation(conversationId: number): void {
    this.state.delete(conversationId)
  }

  private flush(): void {
    const now = Date.now()
    for (const [conversationId, s] of this.state.entries()) {
      if (!s.dirty) continue
      const percent = s.contextUsed !== null && s.contextTotal && s.contextTotal > 0
        ? Math.round((s.contextUsed / s.contextTotal) * 100)
        : null
      const tick: TelemetryTick = {
        conversationId,
        contextUsed: s.contextUsed,
        contextTotal: s.contextTotal,
        contextPercent: percent,
        tickAt: now
      }
      this.opts.emit(tick)
      s.dirty = false
    }
  }
}
