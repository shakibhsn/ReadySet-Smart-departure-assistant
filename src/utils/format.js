import { format, formatDistanceToNowStrict, isToday, isTomorrow, isValid, parse } from 'date-fns'

export const getInitials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?'

export const toDateKey =(date = new Date()) => format(date, 'yyyy-MM-dd')

export function parseDateKey(key) {
  const d = parse(key, 'yyyy-MM-dd', new Date())
  return isValid(d) ? d : null
}

export function formatTime12(time) {
  const d = parse(time, 'HH:mm', new Date())
  return isValid(d) ? format(d, 'h:mm a') : '—'
}

export function formatDayLabel(dateKey) {
  const d = parseDateKey(dateKey)
  if (!d) return '—'
  if (isToday(d)) return 'Today'
  if (isTomorrow(d)) return 'Tomorrow'
  return format(d, 'EEE, MMM d')
}

export function formatLongDate(dateKey) {
  const d = parseDateKey(dateKey)
  return d ? format(d, 'EEEE, MMMM d') : '—'
}

export const formatRelative = (iso) => formatDistanceToNowStrict(new Date(iso), { addSuffix: true })

export function formatDuration(minutes) {
  const m = Number(minutes) || 0
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h ${r}m` : `${h}h`
}
