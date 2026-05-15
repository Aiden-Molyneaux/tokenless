import { useCallback, useEffect, useRef, useState } from 'react'

import type { Template, CreateTemplateInput, UpdateTemplateInput } from '@shared/types/templates'

interface UseTemplatesReturn {
  readonly templates: readonly Template[]
  readonly loading: boolean
  readonly error: string | null
  readonly refetch: () => Promise<void>
  readonly create: (input: CreateTemplateInput) => Promise<Template | null>
  readonly update: (input: UpdateTemplateInput) => Promise<Template | null>
  readonly remove: (id: number) => Promise<boolean>
}

export function useTemplates(): UseTemplatesReturn {
  const [templates, setTemplates] = useState<readonly Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetchTemplates = useCallback(async (): Promise<void> => {
    try {
      const result = await window.tokenless.templates.list()
      if (!mountedRef.current) return
      if (result.ok) {
        setTemplates(result.data.templates)
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
    void fetchTemplates()
    const unsubscribe = window.tokenless.templates.onChanged(() => { void fetchTemplates() })
    return () => { mountedRef.current = false; unsubscribe() }
  }, [fetchTemplates])

  const create = useCallback(async (input: CreateTemplateInput): Promise<Template | null> => {
    const r = await window.tokenless.templates.create({ input })
    return r.ok ? r.data.template : null
  }, [])

  const update = useCallback(async (input: UpdateTemplateInput): Promise<Template | null> => {
    const r = await window.tokenless.templates.update({ input })
    return r.ok ? r.data.template : null
  }, [])

  const remove = useCallback(async (id: number): Promise<boolean> => {
    const r = await window.tokenless.templates.delete({ id })
    return r.ok
  }, [])

  return { templates, loading, error, refetch: fetchTemplates, create, update, remove }
}
