import { useCallback, useEffect, useRef, useState } from 'react'

import type { Account, CreateAccountInput, UpdateAccountInput } from '@shared/types/accounts'

interface UseAccountsReturn {
  readonly accounts: readonly Account[]
  readonly loading: boolean
  readonly error: string | null
  readonly refetch: () => Promise<void>
  readonly create: (input: CreateAccountInput) => Promise<Account | null>
  readonly update: (input: UpdateAccountInput) => Promise<Account | null>
  readonly remove: (id: number) => Promise<boolean>
}

export function useAccounts(): UseAccountsReturn {
  const [accounts, setAccounts] = useState<readonly Account[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetchAccounts = useCallback(async (): Promise<void> => {
    try {
      const result = await window.tokenless.accounts.list()
      if (!mountedRef.current) return
      if (result.ok) {
        setAccounts(result.data.accounts)
        setError(null)
      } else {
        setError(result.error.message)
      }
    } catch (e) {
      if (!mountedRef.current) return
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void fetchAccounts()
    const unsubscribe = window.tokenless.accounts.onChanged(() => {
      void fetchAccounts()
    })
    return () => {
      mountedRef.current = false
      unsubscribe()
    }
  }, [fetchAccounts])

  const create = useCallback(async (input: CreateAccountInput): Promise<Account | null> => {
    const result = await window.tokenless.accounts.create({ input })
    return result.ok ? result.data.account : null
  }, [])

  const update = useCallback(async (input: UpdateAccountInput): Promise<Account | null> => {
    const result = await window.tokenless.accounts.update({ input })
    return result.ok ? result.data.account : null
  }, [])

  const remove = useCallback(async (id: number): Promise<boolean> => {
    const result = await window.tokenless.accounts.delete({ id })
    return result.ok
  }, [])

  return { accounts, loading, error, refetch: fetchAccounts, create, update, remove }
}
