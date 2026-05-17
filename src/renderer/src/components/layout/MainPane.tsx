import { Composer } from '../composer/Composer'

interface MainPaneProps {
  conversationId: number | null
  accountId: number | null
  accountLabel: string | null
}

// MainPane is the split container holding the composer per ADR-003 / spec §2.
// Phase 2B wires real components into the composer half (with mock data);
// the terminal section has been extracted to a separate headless path (v2).
//
// Keying Composer by conversationId forces React to unmount + remount the
// component on every conversation switch, isolating per-conversation state
// (prompt, gearState, captureHint, lastCostPreview, debounce timers, etc.)
// to the lifetime of that conversation being active. Without the key, the
// Composer's useState values carry over across conversation switches —
// resulting in the previous conversation's prompt + geared text appearing
// in the new conversation, AND in useDraftAutosave's debounced save then
// persisting the leaked prompt to the new conversation's drafts row.
// See ADR-053.

export function MainPane({ conversationId, accountId, accountLabel }: MainPaneProps): JSX.Element {
  return (
    <main className="main-pane">
      <section className="main-pane__composer-area">
        <Composer
          key={conversationId ?? 'none'}
          conversationId={conversationId}
          accountId={accountId}
          accountLabel={accountLabel}
        />
      </section>
    </main>
  )
}
