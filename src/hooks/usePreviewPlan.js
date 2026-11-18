import { useEffect, useState } from 'react'
import { previewDeparturePlan } from '@/services/departureApi'

/**
 * Debounced what-if calculation through POST /departure/preview (nothing is saved).
 *  - `payload` null = disabled (no request).
 *  - Requests fire only after the user pauses typing, so there is one request per settled input,
 *    never one per keystroke.
 *  - Outdated responses are ignored.
 */
export function usePreviewPlan(payload, delayMs = 350) {
  const key = payload ? JSON.stringify(payload) : null
  const [result, setResult] = useState({ key: null, data: null, error: null })

  useEffect(() => {
    if (!key) return undefined
    let cancelled = false
    const timer = setTimeout(() => {
      previewDeparturePlan(JSON.parse(key))
        .then((data) => !cancelled && setResult({ key, data, error: null }))
        .catch((error) => !cancelled && setResult({ key, data: null, error }))
    }, delayMs)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [key, delayMs])

  const settled = result.key === key
  return {
    data: key ? result.data : null,
    error: key && settled ? result.error : null,
    loading: Boolean(key) && !settled,
  }
}
