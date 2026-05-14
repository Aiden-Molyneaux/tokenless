import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type ToastSeverity = 'info' | 'warn' | 'error'

export interface Toast {
  readonly id: string
  readonly message: string
  readonly severity: ToastSeverity
  // Optional action label + callback for a single "Open in Dev Mode" / "Retry"
  // / "Dismiss" affordance. Phase 4D will use this for branch-from-turn.
  readonly action?: {
    readonly label: string
    readonly onActivate: () => void
  }
}

export interface ToastInput {
  readonly message: string
  readonly severity: ToastSeverity
  readonly action?: Toast['action']
}

interface ToastContextValue {
  readonly toasts: readonly Toast[]
  readonly push: (input: ToastInput) => string
  readonly dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let nextId = 0
function generateId(): string {
  nextId += 1
  return `toast-${Date.now()}-${nextId}`
}

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<readonly Toast[]>([])

  const push = useCallback((input: ToastInput): string => {
    const id = generateId()
    setToasts((cur) => [...cur, { id, ...input }])
    return id
  }, [])

  const dismiss = useCallback((id: string): void => {
    setToasts((cur) => cur.filter((t) => t.id !== id))
  }, [])

  const value = useMemo<ToastContextValue>(() => ({ toasts, push, dismiss }), [toasts, push, dismiss])

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be called inside a ToastProvider')
  return ctx
}
