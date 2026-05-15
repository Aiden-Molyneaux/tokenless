import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  Conversation,
  CreateConversationInput,
  UpdateConversationInput
} from '@shared/types/conversations'

interface UseConversationsReturn {
  readonly conversations: readonly Conversation[]
  readonly loading: boolean
  readonly error: string | null
  readonly refetch: () => Promise<void>
  readonly create: (input: CreateConversationInput) => Promise<Conversation | null>
  readonly update: (input: UpdateConversationInput) => Promise<Conversation | null>
  readonly remove: (id: number) => Promise<boolean>
  readonly branch: (parentConversationId: number) => Promise<Conversation | null>
}

export function useConversations(projectId: number | null): UseConversationsReturn {
  const [conversations, setConversations] = useState<readonly Conversation[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetchConversations = useCallback(async (): Promise<void> => {
    if (projectId === null) {
      setConversations([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const result = await window.tokenless.conversations.listByProject({ projectId })
      if (!mountedRef.current) return
      if (result.ok) {
        setConversations(result.data.conversations)
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
  }, [projectId])

  useEffect(() => {
    mountedRef.current = true
    void fetchConversations()
    const unsubscribe = window.tokenless.conversations.onChanged(() => {
      void fetchConversations()
    })
    return () => {
      mountedRef.current = false
      unsubscribe()
    }
  }, [fetchConversations])

  const create = useCallback(
    async (input: CreateConversationInput): Promise<Conversation | null> => {
      const result = await window.tokenless.conversations.create({ input })
      return result.ok ? result.data.conversation : null
    },
    []
  )

  const update = useCallback(
    async (input: UpdateConversationInput): Promise<Conversation | null> => {
      const result = await window.tokenless.conversations.update({ input })
      return result.ok ? result.data.conversation : null
    },
    []
  )

  const remove = useCallback(async (id: number): Promise<boolean> => {
    const result = await window.tokenless.conversations.delete({ id })
    return result.ok
  }, [])

  const branch = useCallback(async (parentConversationId: number): Promise<Conversation | null> => {
    const r = await window.tokenless.conversations.branch({ parentConversationId })
    return r.ok ? r.data.conversation : null
  }, [])

  return { conversations, loading, error, refetch: fetchConversations, create, update, remove, branch }
}
