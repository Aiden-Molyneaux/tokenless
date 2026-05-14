// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act } from '@testing-library/react'

import { ToastProvider, useToast } from '../use-toast'
import { ToastHost } from '../../components/notifications/ToastHost'

// Purpose: pushToast adds a toast to the rendered list. dismissToast removes
// it. Toasts have a stable id + auto-expire after their duration (timer logic
// will land later — for this task just verify the push + dismiss path).

function ConsumerButton({ label, severity }: { label: string; severity: 'info' | 'warn' | 'error' }): JSX.Element {
  const { push } = useToast()
  return (
    <button type="button" onClick={() => push({ message: label, severity })}>
      Push
    </button>
  )
}

describe('hooks/use-toast', () => {
  beforeEach(() => {
    // Each test starts with a fresh provider (mounted by render below)
  })

  it('pushToast adds a toast that ToastHost renders', () => {
    render(
      <ToastProvider>
        <ToastHost />
        <ConsumerButton label="hello world" severity="info" />
      </ToastProvider>
    )
    act(() => {
      screen.getByRole('button', { name: /push/i }).click()
    })
    expect(screen.getByText('hello world')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('the dismiss button removes the toast', () => {
    render(
      <ToastProvider>
        <ToastHost />
        <ConsumerButton label="dismiss me" severity="warn" />
      </ToastProvider>
    )
    act(() => {
      screen.getByRole('button', { name: /push/i }).click()
    })
    expect(screen.getByText('dismiss me')).toBeInTheDocument()
    act(() => {
      screen.getByRole('button', { name: /dismiss toast/i }).click()
    })
    expect(screen.queryByText('dismiss me')).not.toBeInTheDocument()
  })
})
