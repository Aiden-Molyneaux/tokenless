// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InfoTooltip } from '../InfoTooltip'

describe('InfoTooltip', () => {
  it('renders the (i) icon but not the panel by default', () => {
    render(<InfoTooltip helperText="Helper text">child</InfoTooltip>)
    expect(screen.getByRole('button', { name: /More information/i })).toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows panel with helperText on icon hover', () => {
    render(<InfoTooltip helperText="Important info">child</InfoTooltip>)
    const icon = screen.getByRole('button', { name: /More information/i })
    fireEvent.mouseEnter(icon)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    expect(screen.getByText('Important info')).toBeInTheDocument()
  })

  it('hides panel on mouse leave', () => {
    render(<InfoTooltip helperText="Helper">child</InfoTooltip>)
    const icon = screen.getByRole('button', { name: /More information/i })
    fireEvent.mouseEnter(icon)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.mouseLeave(icon)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('calls contextFn and renders its output when truthy', () => {
    render(
      <InfoTooltip
        helperText="Base text"
        contextFn={() => 'Context-aware extra'}
      >
        child
      </InfoTooltip>
    )
    fireEvent.mouseEnter(screen.getByRole('button', { name: /More information/i }))
    expect(screen.getByText('Context-aware extra')).toBeInTheDocument()
  })

  it('omits context line when contextFn returns null', () => {
    render(
      <InfoTooltip
        helperText="Base text"
        contextFn={() => null}
      >
        child
      </InfoTooltip>
    )
    fireEvent.mouseEnter(screen.getByRole('button', { name: /More information/i }))
    expect(screen.queryByText(/Context-aware/i)).not.toBeInTheDocument()
  })

  it('renders both contextFn and outcomeFn output when both truthy', () => {
    render(
      <InfoTooltip
        helperText="Base"
        contextFn={() => 'Context line'}
        outcomeFn={() => 'Outcome line: saved 1.2k tokens'}
      >
        child
      </InfoTooltip>
    )
    fireEvent.mouseEnter(screen.getByRole('button', { name: /More information/i }))
    expect(screen.getByText('Context line')).toBeInTheDocument()
    expect(screen.getByText('Outcome line: saved 1.2k tokens')).toBeInTheDocument()
  })
})
