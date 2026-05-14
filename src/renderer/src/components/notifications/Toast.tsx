import type { Toast as ToastModel } from '../../hooks/use-toast'

interface ToastProps {
  readonly toast: ToastModel
  readonly onDismiss: (id: string) => void
}

export function Toast({ toast, onDismiss }: ToastProps): JSX.Element {
  return (
    <div className={`toast toast--${toast.severity}`} role="alert" aria-live="polite">
      <span className="toast__message">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="toast__action"
          onClick={() => {
            toast.action!.onActivate()
            onDismiss(toast.id)
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        className="toast__dismiss"
        aria-label="Dismiss toast"
        onClick={() => onDismiss(toast.id)}
      >
        ×
      </button>
    </div>
  )
}
