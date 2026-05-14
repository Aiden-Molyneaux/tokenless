import { useToast } from '../../hooks/use-toast'
import { Toast } from './Toast'

export function ToastHost(): JSX.Element {
  const { toasts, dismiss } = useToast()
  if (toasts.length === 0) return <></>
  return (
    <div className="toast-host" aria-label="Notifications">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  )
}
