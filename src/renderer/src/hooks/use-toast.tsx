import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

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
  readonly durationMs?: number | null
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
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const push = useCallback((input: ToastInput): string => {
    const id = generateId()
    const duration = input.durationMs !== undefined
      ? input.durationMs
      : input.severity === 'info' ? 5000
      : input.severity === 'warn' ? 8000
      : null  // 'error' — manual-only
    setToasts((cur) => [...cur, { id, ...input }])
    if (duration !== null) {
      const timer = setTimeout(() => {
        timers.current.delete(id)
        setToasts((cur) => cur.filter((t) => t.id !== id))
      }, duration)
      timers.current.set(id, timer)
    }
    return id
  }, [])

  const dismiss = useCallback((id: string): void => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((cur) => cur.filter((t) => t.id !== id))
  }, [])

  // Clean up all pending timers on unmount
  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => clearTimeout(timer))
      timers.current.clear()
    }
  }, [])

  const value = useMemo<ToastContextValue>(() => ({ toasts, push, dismiss }), [toasts, push, dismiss])

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be called inside a ToastProvider')
  return ctx
}
