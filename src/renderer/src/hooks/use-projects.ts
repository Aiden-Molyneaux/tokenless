// useProjects — subscribe to the live project list via IPC + projects:changed.
// Returns { projects, loading, error, refetch, create, update, remove }.

import { useCallback, useEffect, useRef, useState } from 'react'

import type { Project, CreateProjectInput, UpdateProjectInput } from '@shared/types/projects'

interface UseProjectsReturn {
  readonly projects: readonly Project[]
  readonly loading: boolean
  readonly error: string | null
  readonly refetch: () => Promise<void>
  readonly create: (input: CreateProjectInput) => Promise<Project | null>
  readonly update: (input: UpdateProjectInput) => Promise<Project | null>
  readonly remove: (id: number) => Promise<boolean>
}

export function useProjects(): UseProjectsReturn {
  const [projects, setProjects] = useState<readonly Project[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetchProjects = useCallback(async (): Promise<void> => {
    try {
      const result = await window.tokenless.projects.list()
      if (!mountedRef.current) return
      if (result.ok) {
        setProjects(result.data.projects)
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
    void fetchProjects()
    const unsubscribe = window.tokenless.projects.onChanged(() => {
      void fetchProjects()
    })
    return () => {
      mountedRef.current = false
      unsubscribe()
    }
  }, [fetchProjects])

  const create = useCallback(
    async (input: CreateProjectInput): Promise<Project | null> => {
      const result = await window.tokenless.projects.create({ input })
      return result.ok ? result.data.project : null
    },
    []
  )

  const update = useCallback(
    async (input: UpdateProjectInput): Promise<Project | null> => {
      const result = await window.tokenless.projects.update({ input })
      return result.ok ? result.data.project : null
    },
    []
  )

  const remove = useCallback(async (id: number): Promise<boolean> => {
    const result = await window.tokenless.projects.delete({ id })
    return result.ok
  }, [])

  return { projects, loading, error, refetch: fetchProjects, create, update, remove }
}
