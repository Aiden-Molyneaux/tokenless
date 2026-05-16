// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { Conversation } from '@shared/types/conversations'

import { useConversations } from '../use-conversations'

function makeConv(id: number, projectId: number, title: string): Conversation {
  return {
    id, projectId, accountId: null, title,
    model: null, breadth: null, format: null, status: 'active',
    createdAt: 0, updatedAt: 0, endedAt: null, archivedAt: null
  }
}

function setMockTokenless(mock: unknown): void {
  ;(window as unknown as { tokenless: unknown }).tokenless = mock
}

describe('hooks/use-conversations', () => {
  let onChangedCallback: () => void = () => undefined
  let mockConvs: Conversation[]

  beforeEach(() => {
    mockConvs = [makeConv(1, 7, 'one')]
    onChangedCallback = () => undefined
    setMockTokenless({
      conversations: {
        listByProject: vi.fn(async () => ({ ok: true, data: { conversations: mockConvs } })),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        onChanged: (fn: () => void): (() => void) => {
          onChangedCallback = fn
          return () => undefined
        }
      }
    })
  })

  it('returns empty + loading when projectId is null', () => {
    const { result } = renderHook(() => useConversations(null))
    expect(result.current.conversations).toEqual([])
    expect(result.current.loading).toBe(false)
  })

  it('fetches by project id on mount', async () => {
    const { result } = renderHook(() => useConversations(7))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.conversations).toHaveLength(1)
  })

  it('refetches when onChanged fires', async () => {
    const { result } = renderHook(() => useConversations(7))
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockConvs = [makeConv(1, 7, 'one'), makeConv(2, 7, 'two')]

    act(() => onChangedCallback())
    await waitFor(() => expect(result.current.conversations).toHaveLength(2))
  })

  it('refetches when projectId changes', async () => {
    const { result, rerender } = renderHook(({ id }: { id: number | null }) => useConversations(id), {
      initialProps: { id: 7 }
    })
    await waitFor(() => expect(result.current.conversations).toHaveLength(1))

    mockConvs = []
    rerender({ id: 8 })
    await waitFor(() => expect(result.current.conversations).toHaveLength(0))
  })
})
