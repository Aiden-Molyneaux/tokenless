export default function App(): JSX.Element {
  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">TokenLess</h1>
        <p className="app__subtitle">Phase 0 stub — scaffold verified</p>
      </header>
      <section className="app__body">
        <p>
          The Electron shell, the renderer, the preload, and the IPC handshake are all alive.
          Phase 1 lands the Logger and the integration spike on top of this.
        </p>
        <p className="app__version">
          preload.version = <code>{window.tokenless?.version ?? 'not loaded'}</code>
        </p>
      </section>
    </main>
  )
}
