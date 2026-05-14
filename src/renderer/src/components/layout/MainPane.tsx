// MainPane is the split container holding the composer (top) and the
// embedded terminal (bottom) per ADR-003 / spec §2. Phase 2A renders
// placeholders; Phase 2B drops the Composer + GearReviewPane + TerminalSection
// into the two halves.

export function MainPane(): JSX.Element {
  return (
    <main className="main-pane">
      <section className="main-pane__composer-area">
        <p className="main-pane__placeholder">
          Composer + GearReviewPane land here in Phase 2B.
        </p>
      </section>
      <section className="main-pane__terminal-area">
        <p className="main-pane__placeholder">
          Terminal pane (xterm.js with canned ANSI for Phase 2B; real PTY in Phase 4) lands here.
        </p>
      </section>
    </main>
  )
}
