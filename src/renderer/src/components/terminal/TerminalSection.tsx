import { useEffect, useState } from 'react'

import { useCcEvents } from '../../hooks/use-cc-events'
import { useTelemetry } from '../../hooks/use-telemetry'
import { rendererLogger } from '../../observability/logger-bridge'
import { HungBanner } from './HungBanner'
import { TerminalPane } from './TerminalPane'
import { TerminalToolbar } from './TerminalToolbar'
import type { ContextBudget } from './TerminalToolbar'
import './styles.css'

interface TerminalSectionProps {
  conversationId: number | null
}

// TerminalSection is the bottom half of MainPane. Holds the TerminalToolbar
// above the TerminalPane. Phase 4B: streaming (Stop button enabled) derives
// from the presence of a live conversation. When conversationId is set, there
// is a live PTY. When it's null, no PTY exists (either never started or exited).
// The parser events flow through useCcEvents for Phase 4C to drive the budget
// meter; for Phase 4B they're subscribed but not acted upon.
// Phase 4C adds the HungBanner — shown when cc:hung fires for this conversation,
// cleared on cc:exit.

export function TerminalSection({ conversationId }: TerminalSectionProps): JSX.Element {
  const [hung, setHung] = useState<{ severity: 'warn' | 'error' } | null>(null)

  useCcEvents(conversationId, () => {
    /* Phase 4D: drive budget meter from tokens-used events */
  })

  const tick = useTelemetry(conversationId)
  const contextBudget: ContextBudget | null = tick && tick.contextUsed !== null && tick.contextTotal !== null && tick.contextPercent !== null
    ? {
        usedTokens: tick.contextUsed,
        totalTokens: tick.contextTotal,
        percentUsed: tick.contextPercent
      }
    : null

  // Subscribe to cc.onHung for this conversation. Clear on cc.onExit (a stop
  // or successful response always clears the banner).
  useEffect(() => {
    if (conversationId === null) {
      setHung(null)
      return undefined
    }
    const unsubHung = window.tokenless.cc.onHung((payload) => {
      if (payload.conversationId === conversationId) {
        setHung({ severity: payload.severity })
      }
    })
    const unsubExit = window.tokenless.cc.onExit((payload) => {
      if (payload.conversationId === conversationId) setHung(null)
    })
    // Reset on conversation change
    setHung(null)
    return () => {
      unsubHung()
      unsubExit()
    }
  }, [conversationId])

  const handleStop = async (): Promise<void> => {
    if (conversationId === null) {
      rendererLogger.warn('ui', 'terminal-stop-no-conv', 'Stop clicked with no active conversation')
      return
    }
    const result = await window.tokenless.cc.stop({ conversationId })
    if (!result.ok) {
      rendererLogger.error('ui', 'terminal-stop-failed', result.error.message, {
        conversationId, code: result.error.code, logId: result.error.logId
      })
    } else {
      rendererLogger.info('ui', 'terminal-stop-ok', 'Sent stop to backend', { conversationId })
    }
  }

  return (
    <section className="terminal-section">
      <TerminalToolbar onStop={() => void handleStop()} streaming={conversationId !== null} contextBudget={contextBudget} />
      <HungBanner visible={hung !== null} severity={hung?.severity ?? 'warn'} onStop={() => void handleStop()} />
      <TerminalPane key={conversationId ?? 'none'} conversationId={conversationId} />
    </section>
  )
}
