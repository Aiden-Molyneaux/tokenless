// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { ConfirmModal } from '../ConfirmModal'

describe('ConfirmModal', () => {
  it('renders title, message, and confirm/cancel buttons when open', () => {
    render(
      <ConfirmModal
        open
        title="Delete account?"
        message="Are you sure?"
        confirmLabel="Delete"
        variant="danger"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByText('Delete account?')).toBeInTheDocument()
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('returns null when not open', () => {
    const { container } = render(
      <ConfirmModal
        open={false}
        title="t" message="m"
        onConfirm={vi.fn()} onCancel={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('calls onConfirm when confirm clicked', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmModal open title="t" message="m"
        onConfirm={onConfirm} onCancel={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('calls onCancel on Escape key', () => {
    const onCancel = vi.fn()
    render(
      <ConfirmModal open title="t" message="m"
        onConfirm={vi.fn()} onCancel={onCancel} />
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('uses btn--danger class for danger variant; btn--primary for default', () => {
    const { rerender } = render(
      <ConfirmModal open title="t" message="m" variant="danger"
        confirmLabel="Delete" onConfirm={vi.fn()} onCancel={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('btn--danger')
    rerender(
      <ConfirmModal open title="t" message="m" variant="default"
        onConfirm={vi.fn()} onCancel={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: 'OK' })).toHaveClass('btn--primary')
  })
})
