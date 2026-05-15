// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { TurnFeedbackBar } from '../TurnFeedbackBar'

describe('TurnFeedbackBar', () => {
  it('renders three feedback buttons', () => {
    render(<TurnFeedbackBar turnId={42} onSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: /thumbs up/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /thumbs down/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /shrug/i })).toBeInTheDocument()
  })

  it('calls onSubmit with the turnId and feedback when each button is clicked', () => {
    const onSubmit = vi.fn()
    render(<TurnFeedbackBar turnId={42} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: /thumbs up/i }))
    expect(onSubmit).toHaveBeenCalledWith(42, 'up')
    fireEvent.click(screen.getByRole('button', { name: /thumbs down/i }))
    expect(onSubmit).toHaveBeenCalledWith(42, 'down')
    fireEvent.click(screen.getByRole('button', { name: /shrug/i }))
    expect(onSubmit).toHaveBeenCalledWith(42, 'shrug')
  })

  it('is grouped via aria-label for screen readers', () => {
    render(<TurnFeedbackBar turnId={1} onSubmit={vi.fn()} />)
    expect(screen.getByRole('group', { name: /rate this response/i })).toBeInTheDocument()
  })
})
