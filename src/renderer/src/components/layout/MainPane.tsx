import { Composer } from '../composer/Composer'
import { TerminalSection } from '../terminal/TerminalSection'

interface MainPaneProps {
  conversationId: number | null
  accountId: number | null
  accountLabel: string | null
  onBranch: () => void
}

// MainPane is the split container holding the composer (top) and the
// embedded terminal (bottom) per ADR-003 / spec §2. Phase 2B wires real
// components into both halves (with mock data); Phase 4 replaces the
// terminal source with a real PTY subprocess.

export function MainPane({ conversationId, accountId, accountLabel, onBranch }: MainPaneProps): JSX.Element {
  return (
    <main className="main-pane">
      <section className="main-pane__composer-area">
        <Composer conversationId={conversationId} accountId={accountId} accountLabel={accountLabel} onBranch={onBranch} />
      </section>
      <section className="main-pane__terminal-area">
        <TerminalSection conversationId={conversationId} />
      </section>
    </main>
  )
}
