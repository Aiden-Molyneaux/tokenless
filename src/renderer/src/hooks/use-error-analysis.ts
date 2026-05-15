import { useCallback, useState } from 'react'

interface UseErrorAnalysisReturn {
  readonly analysis: string | null
  readonly loading: boolean
  readonly error: string | null
  readonly analyze: (errorRecordId: string) => Promise<void>
}

export function useErrorAnalysis(): UseErrorAnalysisReturn {
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const analyze = useCallback(async (errorRecordId: string): Promise<void> => {
    setLoading(true)
    setError(null)
    setAnalysis(null)
    try {
      const r = await window.tokenless.ai.analyzeError({ errorRecordId })
      if (r.ok) setAnalysis(r.data.analysis)
      else setError(r.error.message)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  return { analysis, loading, error, analyze }
}
