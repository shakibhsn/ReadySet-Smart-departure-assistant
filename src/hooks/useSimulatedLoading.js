import { useEffect, useState } from 'react'

/** Short fake loading phase so skeleton states are exercised before real data fetching exists. */
export function useSimulatedLoading(ms = 500) {
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const id = setTimeout(() => setLoading(false), ms)
    return () => clearTimeout(id)
  }, [ms])
  return loading
}
