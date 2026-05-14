import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { MOCK_TERMINAL_STREAM } from '../../mocks/terminal-stream'

// xterm.js Terminal mounted in a container div. Phase 2B writes
// MOCK_TERMINAL_STREAM line-by-line every 80ms to simulate streaming.
// Phase 4 replaces the source with real PTY output from a spawned claude
// subprocess via IPC.

export function TerminalPane(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

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
      rows: 30,
      cols: 100,
      scrollback: 1000
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.current)
    fitAddon.fit()

    // Write canned stream line-by-line with a streaming feel
    let i = 0
    const interval = setInterval(() => {
      if (i >= MOCK_TERMINAL_STREAM.length) {
        clearInterval(interval)
        return
      }
      terminal.writeln(MOCK_TERMINAL_STREAM[i])
      i++
    }, 80)

    // Resize on window resize
    const handleResize = (): void => {
      fitAddon.fit()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      clearInterval(interval)
      window.removeEventListener('resize', handleResize)
      terminal.dispose()
    }
  }, [])

  return <div className="terminal-pane" ref={containerRef} />
}
