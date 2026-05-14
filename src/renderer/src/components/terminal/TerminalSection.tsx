import { useCcEvents } from '../../hooks/use-cc-events'
import { rendererLogger } from '../../observability/logger-bridge'
import { TerminalPane } from './TerminalPane'
import { TerminalToolbar } from './TerminalToolbar'
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

export function TerminalSection({ conversationId }: TerminalSectionProps): JSX.Element {
  // Subscribe to events even though we don't use them yet — keeps the
  // wiring hot so Phase 4C just adds state.
  useCcEvents(conversationId, () => {
    /* Phase 4C: drive budget meter from tokens-used events */
  })

  const handleStop = async (): Promise<void> => {
    if (conversationId === null) {
      rendererLogger.warn('ui', 'terminal-stop-no-conv', 'Stop clicked with no active conversation')
      return
    }
    const result = await window.tokenless.cc.stop({ conversationId })
    if (!result.ok) {
      rendererLogger.error('ui', 'terminal-stop-failed', result.error.message, {
        conversationId,
        code: result.error.code,
        logId: result.error.logId
      })
    } else {
      rendererLogger.info('ui', 'terminal-stop-ok', 'Sent stop to backend', { conversationId })
    }
  }

  return (
    <section className="terminal-section">
      <TerminalToolbar onStop={() => void handleStop()} streaming={conversationId !== null} />
      <TerminalPane key={conversationId ?? 'none'} conversationId={conversationId} />
    </section>
  )
}
