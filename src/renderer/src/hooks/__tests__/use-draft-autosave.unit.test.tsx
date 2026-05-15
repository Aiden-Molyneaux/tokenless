// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useDraftAutosave } from '../use-draft-autosave'

describe('hooks/use-draft-autosave', () => {
  let mockSave: ReturnType<typeof vi.fn>
  let mockGet: ReturnType<typeof vi.fn>
  let mockClear: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    mockSave = vi.fn().mockResolvedValue({ ok: true, data: { draft: { id: 1, conversationId: 7, body: '', updatedAt: 0 } } })
    mockGet = vi.fn().mockResolvedValue({ ok: true, data: { draft: null } })
    mockClear = vi.fn().mockResolvedValue({ ok: true, data: { cleared: true } })
    ;(window as unknown as { tokenless: unknown }).tokenless = {
      drafts: { save: mockSave, get: mockGet, clear: mockClear }
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns early when conversationId is null — no fetch, no save', async () => {
    const onLoad = vi.fn()
    renderHook(() => useDraftAutosave(null, 'typed text', onLoad))
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(mockGet).not.toHaveBeenCalled()
    expect(mockSave).not.toHaveBeenCalled()
    expect(onLoad).not.toHaveBeenCalled()
  })

  it('fetches and loads the existing draft on mount', async () => {
    mockGet.mockResolvedValueOnce({
      ok: true,
      data: { draft: { id: 1, conversationId: 7, body: 'persisted text', updatedAt: 1 } }
    })
    const onLoad = vi.fn()
    renderHook(() => useDraftAutosave(7, '', onLoad))
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    expect(mockGet).toHaveBeenCalledWith({ conversationId: 7 })
    expect(onLoad).toHaveBeenCalledWith('persisted text')
  })

  it('does NOT call onLoad when no draft exists', async () => {
    const onLoad = vi.fn()
    renderHook(() => useDraftAutosave(7, '', onLoad))
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    expect(onLoad).not.toHaveBeenCalled()
  })

  it('debounces prompt changes — saves after 750ms of inactivity', async () => {
    const { rerender } = renderHook(
      ({ prompt }: { prompt: string }) => useDraftAutosave(7, prompt, vi.fn()),
      { initialProps: { prompt: '' } }
    )
    // Initial load tick
    await act(async () => { await vi.runAllTimersAsync() })
    mockSave.mockClear()

    rerender({ prompt: 'hello' })
    expect(mockSave).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(749) })
    expect(mockSave).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(1)
      await vi.runAllTimersAsync()
    })
    expect(mockSave).toHaveBeenCalledWith({ conversationId: 7, body: 'hello' })
  })

  it('coalesces multiple rapid prompt changes into a single save', async () => {
    const { rerender } = renderHook(
      ({ prompt }: { prompt: string }) => useDraftAutosave(7, prompt, vi.fn()),
      { initialProps: { prompt: '' } }
    )
    await act(async () => { await vi.runAllTimersAsync() })
    mockSave.mockClear()

    rerender({ prompt: 'a' })
    await act(async () => { vi.advanceTimersByTime(200) })
    rerender({ prompt: 'ab' })
    await act(async () => { vi.advanceTimersByTime(200) })
    rerender({ prompt: 'abc' })
    await act(async () => {
      vi.advanceTimersByTime(750)
      await vi.runAllTimersAsync()
    })
    expect(mockSave).toHaveBeenCalledTimes(1)
    expect(mockSave).toHaveBeenCalledWith({ conversationId: 7, body: 'abc' })
  })

  it('clear() issues IPC clear and prevents the next pending save', async () => {
    const { result, rerender } = renderHook(
      ({ prompt }: { prompt: string }) => useDraftAutosave(7, prompt, vi.fn()),
      { initialProps: { prompt: '' } }
    )
    await act(async () => { await vi.runAllTimersAsync() })
    mockSave.mockClear()

    rerender({ prompt: 'about to send' })
    await act(async () => { vi.advanceTimersByTime(200) })

    // User clicks Send — composer calls clear() before the debounced save fires
    await act(async () => {
      await result.current.clear()
    })

    await act(async () => {
      vi.advanceTimersByTime(2000)
      await vi.runAllTimersAsync()
    })

    expect(mockClear).toHaveBeenCalledWith({ conversationId: 7 })
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('re-fetches when conversationId changes', async () => {
    const onLoad = vi.fn()
    mockGet.mockResolvedValueOnce({ ok: true, data: { draft: { id: 1, conversationId: 7, body: 'first', updatedAt: 1 } } })
    const { rerender } = renderHook(
      ({ id }: { id: number }) => useDraftAutosave(id, '', onLoad),
      { initialProps: { id: 7 } }
    )
    await act(async () => { await vi.runAllTimersAsync() })
    expect(onLoad).toHaveBeenCalledWith('first')

    mockGet.mockResolvedValueOnce({ ok: true, data: { draft: { id: 2, conversationId: 8, body: 'second', updatedAt: 1 } } })
    rerender({ id: 8 })
    await act(async () => { await vi.runAllTimersAsync() })
    expect(onLoad).toHaveBeenCalledWith('second')
  })
})
