import { useState } from 'react'
import { rendererLogger } from '../../observability/logger-bridge'
import { TerminalPane } from './TerminalPane'
import { TerminalToolbar } from './TerminalToolbar'
import './styles.css'

// TerminalSection is the bottom half of MainPane. Holds the TerminalToolbar
// above the TerminalPane. Phase 2B's "streaming" is the mock stream's
// playback duration; setting streaming = false enables the Stop button
// to no-op (Phase 4 wires real SIGINT to a claude subprocess via IPC).

export function TerminalSection(): JSX.Element {
  const [streaming, setStreaming] = useState(true)

  const handleStop = (): void => {
    rendererLogger.info('ui', 'terminal-stop', 'Stop clicked (stub)')
    setStreaming(false)
  }

  return (
    <div className="terminal-section">
      <TerminalToolbar onStop={handleStop} streaming={streaming} />
      <TerminalPane />
    </div>
  )
}
