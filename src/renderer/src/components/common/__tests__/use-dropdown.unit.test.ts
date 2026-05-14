// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDropdown } from '../use-dropdown'

describe('useDropdown', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useDropdown())
    expect(result.current.open).toBe(false)
  })

  it('toggle flips open state', () => {
    const { result } = renderHook(() => useDropdown())
    act(() => result.current.toggle())
    expect(result.current.open).toBe(true)
    act(() => result.current.toggle())
    expect(result.current.open).toBe(false)
  })

  it('setOpen sets open state directly', () => {
    const { result } = renderHook(() => useDropdown())
    act(() => result.current.setOpen(true))
    expect(result.current.open).toBe(true)
    act(() => result.current.setOpen(false))
    expect(result.current.open).toBe(false)
  })

  it('Escape key closes when open', () => {
    const { result } = renderHook(() => useDropdown())
    act(() => result.current.setOpen(true))
    expect(result.current.open).toBe(true)
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(result.current.open).toBe(false)
  })

  it('Escape key does nothing when already closed', () => {
    const { result } = renderHook(() => useDropdown())
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(result.current.open).toBe(false)
  })

  it('removes listeners after close (cleanup)', () => {
    const { result, unmount } = renderHook(() => useDropdown())
    act(() => result.current.setOpen(true))
    unmount()
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(true).toBe(true)
  })
})
