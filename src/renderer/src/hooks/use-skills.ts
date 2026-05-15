import { useCallback, useEffect, useRef, useState } from 'react'

import type { Skill } from '@shared/types/skills'

interface UseSkillsReturn {
  readonly skills: readonly Skill[]
  readonly loading: boolean
  readonly error: string | null
  readonly refetch: () => Promise<void>
  readonly toggleFavorite: (id: number, favorited: boolean) => Promise<boolean>
  readonly toggleHidden: (id: number, hidden: boolean) => Promise<boolean>
  readonly rescan: () => Promise<void>
}

export function useSkills(): UseSkillsReturn {
  const [skills, setSkills] = useState<readonly Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetchSkills = useCallback(async (): Promise<void> => {
    try {
      const result = await window.tokenless.skills.list()
      if (!mountedRef.current) return
      if (result.ok) {
        setSkills(result.data.skills)
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
    void fetchSkills()
    const unsubscribe = window.tokenless.skills.onChanged(() => { void fetchSkills() })
    return () => { mountedRef.current = false; unsubscribe() }
  }, [fetchSkills])

  const toggleFavorite = useCallback(async (id: number, favorited: boolean): Promise<boolean> => {
    const r = await window.tokenless.skills.toggleFavorite({ id, favorited })
    return r.ok
  }, [])
  const toggleHidden = useCallback(async (id: number, hidden: boolean): Promise<boolean> => {
    const r = await window.tokenless.skills.toggleHidden({ id, hidden })
    return r.ok
  }, [])
  const rescan = useCallback(async (): Promise<void> => {
    await window.tokenless.skills.rescan()
  }, [])

  return { skills, loading, error, refetch: fetchSkills, toggleFavorite, toggleHidden, rescan }
}
