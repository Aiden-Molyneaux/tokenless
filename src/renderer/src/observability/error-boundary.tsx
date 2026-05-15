import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react'
import type { CrashReport } from '@shared/types/crash-report'
import { rendererLogger } from './logger-bridge'
import { CrashReporterModal } from '../components/notifications/CrashReporterModal'

interface State {
  hasError: boolean
  error?: Error
  report: CrashReport | null
}

// Top-level React error boundary. Wraps the entire App. On uncaught render
// errors, logs to main via the renderer logger bridge, fetches a full crash
// report (including the last 100 log records), and renders CrashReporterModal.
//
// React error boundaries must be class components — function components
// don't support componentDidCatch / getDerivedStateFromError.

export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { hasError: false, report: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
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
    void window.tokenless.crash.getReport({
      source: 'renderer',
      message: error.message,
      stack: error.stack ?? null
    }).then((r) => {
      if (r.ok) this.setState({ report: r.data.report })
    })
  }

  handleContinue = (): void => {
    this.setState({ hasError: false, error: undefined, report: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <CrashReporterModal
          open
          report={this.state.report}
          allowContinue
          onContinue={this.handleContinue}
        />
      )
    }
    return this.props.children
  }
}
