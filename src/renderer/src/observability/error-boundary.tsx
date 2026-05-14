import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react'
import { rendererLogger } from './logger-bridge'

interface State {
  hasError: boolean
  error?: Error
}

// Top-level React error boundary. Wraps the entire App. On uncaught render
// errors, logs to main via the renderer logger bridge and renders a minimal
// fallback that the user can recover from via reload.
//
// React error boundaries must be class components — function components
// don't support componentDidCatch / getDerivedStateFromError.

export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    rendererLogger.fatal(
      'ui',
      'react-error-boundary',
      error.message,
      { componentStack: errorInfo.componentStack ?? null },
      error.stack
    )
  }

  reload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h1 className="error-boundary__title">Something broke</h1>
          <p className="error-boundary__body">
            The UI hit an error and stopped rendering. The error has been logged.
            Reload to recover.
          </p>
          <p className="error-boundary__detail">{this.state.error?.message ?? 'Unknown error'}</p>
          <button className="error-boundary__reload" onClick={this.reload} type="button">
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
