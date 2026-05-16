import { Composer } from '../composer/Composer'

interface MainPaneProps {
  conversationId: number | null
  accountId: number | null
  accountLabel: string | null
  onBranch: () => void
}

// MainPane is the split container holding the composer per ADR-003 / spec §2.
// Phase 2B wires real components into the composer half (with mock data);
// the terminal section has been extracted to a separate headless path (v2).

export function MainPane({ conversationId, accountId, accountLabel, onBranch }: MainPaneProps): JSX.Element {
  return (
    <main className="main-pane">
      <section className="main-pane__composer-area">
        <Composer conversationId={conversationId} accountId={accountId} accountLabel={accountLabel} onBranch={onBranch} />
      </section>
    </main>
  )
}
