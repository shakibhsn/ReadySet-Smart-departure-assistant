import { useEffect, useState } from 'react'
import { Lightbulb } from 'lucide-react'
import { getPrepProfile } from '@/services/prepApi'

const CONF = { low: 'low confidence', medium: 'medium confidence', high: 'high confidence' }

/**
 * Shows YOUR usual preparation time / buffer for the selected category and lets you apply it with one click.
 * Never changes anything by itself. Hidden while there is nothing reliable to show (new users) or if it cannot load.
 */
export function PrepHint({ category, onUsePrep, onUseBuffer }) {
  const [profile, setProfile] = useState(null)
  useEffect(() => {
    let cancelled = false
    getPrepProfile().then((p) => !cancelled && setProfile(p)).catch(() => {})
    return () => { cancelled = true }
  }, [])
  if (!profile || !category) return null

  const own = profile.overrides?.[category]
  const prep = own?.prepMinutes !== undefined ? { minutes: own.prepMinutes, note: 'your saved value' } : profile.enabled && profile.preparation?.byCategory?.[category]?.status === 'ok' ? { minutes: profile.preparation.byCategory[category].minutes, note: `from ${profile.preparation.byCategory[category].samples} logged preparations, ${CONF[profile.preparation.byCategory[category].confidence]}` } : null
  const buf = own?.bufferMinutes !== undefined ? { minutes: own.bufferMinutes, note: 'your saved value' } : profile.enabled && profile.buffer?.status === 'ok' && profile.buffer.extraMinutes > 0 ? { minutes: profile.buffer.minutes, note: `you often leave late; from ${profile.buffer.samples} logged departures, ${CONF[profile.buffer.confidence]}` } : null
  if (!prep && !buf) return null

  const btn = 'cursor-pointer font-bold text-brand-700 underline'
  return (
    <p className="flex gap-2 rounded-xl bg-accent-50 p-3 text-sm text-accent-700 sm:col-span-2" aria-label="Your usual times">
      <Lightbulb className="mt-0.5 size-4 shrink-0" />
      <span>
        {prep && <>Your usual preparation: <strong>{prep.minutes} min</strong> ({prep.note}). <button type="button" className={btn} onClick={() => onUsePrep(prep.minutes)}>Use {prep.minutes} min</button>. </>}
        {buf && <>Suggested arrival buffer: <strong>{buf.minutes} min</strong> ({buf.note}). <button type="button" className={btn} onClick={() => onUseBuffer(buf.minutes)}>Use {buf.minutes} min</button>.</>}
      </span>
    </p>
  )
}
