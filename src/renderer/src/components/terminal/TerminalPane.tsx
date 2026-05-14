import { useCallback, useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

import { rendererLogger } from '../../observability/logger-bridge'
import { useCcSubscription } from '../../hooks/use-cc-subscription'

interface TerminalPaneProps {
  conversationId: number | null
}

// xterm.js-backed pane. Phase 4A: live PTY output from the cc subprocess via
// useCcSubscription. The xterm instance is created once on mount; chunks are
// written directly into terminal.write() with no transformation — ANSI escape
// sequences pass through, which is what we want for fidelity with claude's
// rendered output.

export function TerminalPane({ conversationId }: TerminalPaneProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return undefined

    const terminal = new Terminal({
      theme: {
        background: '#1e1e1e',
        foreground: '#ddd',
        cursor: '#ddd'
      },
      fontFamily: '"JetBrains Mono", Consolas, monospace',
      fontSize: 12,
      cursorBlink: false,
      disableStdin: true,
      scrollback: 5000
    })
    terminalRef.current = terminal

    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.current)
    fitAddon.fit()

    const handleResize = (): void => {
      try {
        fitAddon.fit()
        if (conversationId !== null) {
          void window.tokenless.cc.resize({
            conversationId,
            cols: terminal.cols,
            rows: terminal.rows
          })
        }
      } catch (err) {
        // Concurrent teardown can land between fit() and resize() — this is
        // expected during unmount but logging at debug level keeps it visible
        // in Dev Mode if it ever escalates.
        rendererLogger.debug('ui', 'terminal-resize-failed', 'TerminalPane resize raced with teardown', {
          conversationId,
          errorString: String(err)
        })
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
    // Mount effect runs once per (re)mount. Since TerminalPane is keyed by
    // conversationId in its parent (TerminalSection), a conversation switch
    // remounts this whole component — refreshing the closure capture above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Forward chunks into xterm. The callback is stable per render via useCallback
  // so useCcSubscription's effect dep array doesn't re-subscribe constantly.
  const handleChunk = useCallback((chunk: string) => {
    terminalRef.current?.write(chunk)
  }, [])

  const handleExit = useCallback((event: { exitCode: number }) => {
    terminalRef.current?.writeln(`\r\n[claude exited with code ${event.exitCode}]`)
  }, [])

  useCcSubscription(conversationId, { onChunk: handleChunk, onExit: handleExit })

  return <div className="terminal-pane" ref={containerRef} />
}
