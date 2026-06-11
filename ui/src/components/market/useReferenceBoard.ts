import { useEffect, useState } from 'react'

/**
 * The one fetch-and-poll hook for board-shaped data — replaces the
 * hand-rolled useState×4 + useEffect + setInterval block every board view
 * used to copy. Polling (not SSE) per the low-frequency-surface rule.
 */
export function useReferenceBoard<T>(fetcher: () => Promise<T>, refreshMs: number) {
  const [data, setData] = useState<T | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetcher()
        if (!alive) return
        setData(res)
        setUpdatedAt(new Date())
        setError(null)
      } catch (err) {
        if (!alive) return
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    const timer = setInterval(load, refreshMs)
    return () => { alive = false; clearInterval(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetcher is a stable module-level api fn
  }, [refreshMs])

  return { data, updatedAt, loading, error }
}
