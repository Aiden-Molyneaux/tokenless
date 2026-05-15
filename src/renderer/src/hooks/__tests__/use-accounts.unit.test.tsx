// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { Account } from '@shared/types/accounts'

import { useAccounts } from '../use-accounts'

// Purpose: useAccounts fetches accounts on mount, exposes loading/error states,
// and refetches when accounts:changed fires.

function makeAccount(id: number, label: string): Account {
  return { id, label, configDir: `/c${id}`, apiKey: null, createdAt: 0 }
}

function setMockTokenless(mock: unknown): void {
  ;(window as unknown as { tokenless: unknown }).tokenless = mock
}

describe('hooks/use-accounts', () => {
  let onChangedCallback: () => void = () => undefined
  let mockAccounts: Account[]

  beforeEach(() => {
    mockAccounts = [makeAccount(1, 'Personal')]
    onChangedCallback = () => undefined
    setMockTokenless({
      accounts: {
        list: vi.fn(async () => ({ ok: true, data: { accounts: mockAccounts } })),
        create: vi.fn(async (req: { input: { label: string; configDir: string } }) => ({
          ok: true,
          data: { account: { ...makeAccount(2, req.input.label) } }
        })),
        onChanged: (fn: () => void): (() => void) => {
          onChangedCallback = fn
          return () => undefined
        }
      }
    })
  })

  it('fetches accounts on mount', async () => {
    const { result } = renderHook(() => useAccounts())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.accounts).toHaveLength(1)
    expect(result.current.accounts[0].label).toBe('Personal')
  })

  it('refetches when accounts:changed fires', async () => {
    const { result } = renderHook(() => useAccounts())
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockAccounts = [makeAccount(1, 'Personal'), makeAccount(2, 'Work')]

    act(() => {
      onChangedCallback()
    })

    await waitFor(() => expect(result.current.accounts).toHaveLength(2))
  })
})
