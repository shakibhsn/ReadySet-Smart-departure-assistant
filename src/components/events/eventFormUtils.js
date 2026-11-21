import { getISODay, parseISO } from 'date-fns'

export const WEEKDAYS = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 7, label: 'Sun' },
]
export const FREQUENCIES = [{ value: 'DAILY', label: 'Daily' }, { value: 'WEEKLY', label: 'Weekly' }, { value: 'MONTHLY', label: 'Monthly' }]
export const END_MODES = [{ value: 'never', label: 'Never' }, { value: 'date', label: 'On a date' }, { value: 'count', label: 'After a number of times' }]
export const FREQUENCY_UNITS = { DAILY: 'day(s)', WEEKLY: 'week(s)', MONTHLY: 'month(s)' }

// Backend field names -> form field names (so server validation errors land under the right input).
export const SERVER_FIELD = {
  startAt: 'date',
  travelDurationMinutes: 'travelMinutes',
  preparationMinutes: 'prepMinutes',
  arrivalBufferMinutes: 'bufferMinutes',
  'recurrence.frequency': 'frequency',
  'recurrence.interval': 'interval',
  'recurrence.daysOfWeek': 'weekdays',
  'recurrence.endsOn': 'endsOn',
  'recurrence.count': 'count',
  durationMinutes: 'durationMinutes',
}

export function timezoneOptions(current) {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  return [...new Set([current, 'UTC', ...zones])].filter(Boolean).map((z) => ({ value: z, label: z }))
}

/** Form state for a brand new event. */
export function emptyEventForm({ timezone, prepMinutes = 30, bufferMinutes = 10, date = '' }) {
  return {
    title: '', category: '', date, startTime: '', destination: '', travelMinutes: '',
    prepMinutes: String(prepMinutes), bufferMinutes: String(bufferMinutes), notes: '', timezone,
    recurring: false, frequency: 'DAILY', interval: '1', weekdays: [], endsOn: '', endMode: 'never', count: '',
    durationMinutes: '', hadDuration: false,
    priority: 'normal', initialPriority: 'normal',
  }
}

/** Form state for an existing API event (edit mode). */
export function eventToForm(event) {
  const r = event.recurrence
  return {
    title: event.title, category: event.category, date: event.localDate, startTime: event.localTime,
    destination: event.destination ?? '', travelMinutes: String(event.travelDurationMinutes),
    prepMinutes: String(event.preparationMinutes), bufferMinutes: String(event.arrivalBufferMinutes),
    notes: event.notes ?? '', timezone: event.timezone,
    recurring: Boolean(r), frequency: r?.frequency ?? 'DAILY', interval: String(r?.interval ?? 1),
    weekdays: r?.daysOfWeek ?? [], endsOn: r?.endsOn ?? '',
    endMode: r?.count ? 'count' : r?.endsOn ? 'date' : 'never', count: r?.count ? String(r.count) : '',
    durationMinutes: event.durationMinutes ? String(event.durationMinutes) : '', hadDuration: Boolean(event.durationMinutes),
    priority: event.priority ?? 'normal', initialPriority: event.priority ?? 'normal',
  }
}

export function validateEventForm(form) {
  const errors = {}
  const num = (v) => (v === '' ? NaN : Number(v))
  if (form.title.trim().length < 1) errors.title = 'Give your event a title.'
  if (!form.category) errors.category = 'Choose a category.'
  if (!form.date) errors.date = 'Pick a date.'
  if (!form.startTime) errors.startTime = 'Pick a start time.'
  if (!Number.isInteger(num(form.travelMinutes)) || num(form.travelMinutes) < 1 || num(form.travelMinutes) > 1440) errors.travelMinutes = 'Enter 1–1440 minutes.'
  if (!Number.isInteger(num(form.prepMinutes)) || num(form.prepMinutes) < 0 || num(form.prepMinutes) > 1440) errors.prepMinutes = 'Enter 0–1440 minutes.'
  if (!Number.isInteger(num(form.bufferMinutes)) || num(form.bufferMinutes) < 0 || num(form.bufferMinutes) > 1440) errors.bufferMinutes = 'Enter 0–1440 minutes.'
  if (form.durationMinutes !== '' && (!Number.isInteger(num(form.durationMinutes)) || num(form.durationMinutes) < 1 || num(form.durationMinutes) > 1440)) errors.durationMinutes = 'Enter 1–1440 minutes, or leave blank.'
  if (form.recurring) {
    const interval = num(form.interval)
    if (!Number.isInteger(interval) || interval < 1 || interval > 52) errors.interval = 'Enter 1–52.'
    if (form.frequency === 'WEEKLY') {
      if (form.weekdays.length === 0) errors.weekdays = 'Choose at least one weekday.'
      else if (form.date && !form.weekdays.includes(getISODay(parseISO(form.date)))) errors.weekdays = 'Include the weekday of the start date.'
    }
    if (form.endMode === 'date') {
      if (!form.endsOn) errors.endsOn = 'Pick an end date.'
      else if (form.date && form.endsOn < form.date) errors.endsOn = 'End date cannot be before the start date.'
    }
    if (form.endMode === 'count' && (!Number.isInteger(num(form.count)) || num(form.count) < 1 || num(form.count) > 365)) errors.count = 'Enter 1–365.'
  }
  return errors
}

/** Local wall time + zone: the server turns this into a UTC instant (see services/eventApi.js). */
export function formToPayload(form) {
  return {
    title: form.title.trim(),
    category: form.category,
    startAt: `${form.date}T${form.startTime}`,
    timezone: form.timezone,
    destination: form.destination.trim() || null,
    notes: form.notes.trim() || null,
    travelDurationMinutes: Number(form.travelMinutes),
    preparationMinutes: Number(form.prepMinutes),
    arrivalBufferMinutes: Number(form.bufferMinutes),
    // Optional: blank = unknown (only sent when set, or to clear a duration that existed).
    ...(form.durationMinutes !== '' ? { durationMinutes: Number(form.durationMinutes) } : form.hadDuration ? { durationMinutes: null } : {}),
    // Only sent when the user changed it, so saving an event never touches a field the user did not touch.
    ...(form.priority && form.priority !== (form.initialPriority ?? 'normal') ? { priority: form.priority } : {}),
    recurrence: form.recurring
      ? {
          frequency: form.frequency,
          interval: Number(form.interval),
          ...(form.frequency === 'WEEKLY' && { daysOfWeek: [...form.weekdays].sort((a, b) => a - b) }),
          endsOn: form.endMode === 'date' ? form.endsOn : null,
          ...(form.endMode === 'count' && { count: Number(form.count) }),
        }
      : null,
  }
}


/** Form state from a saved template: its settings fill the form, the date/time stay as chosen (blank start time). */
export function templateToForm(t, base) {
  const r = t.recurrence
  return {
    ...base,
    title: t.title, category: t.category, destination: t.destination ?? '', notes: t.notes ?? '',
    travelMinutes: String(t.travelDurationMinutes), prepMinutes: String(t.preparationMinutes), bufferMinutes: String(t.arrivalBufferMinutes),
    timezone: t.timezone ?? base.timezone,
    durationMinutes: t.durationMinutes ? String(t.durationMinutes) : '',
    recurring: Boolean(r), frequency: r?.frequency ?? 'DAILY', interval: String(r?.interval ?? 1), weekdays: r?.daysOfWeek ?? [],
    endMode: r?.count ? 'count' : 'never', count: r?.count ? String(r.count) : '', endsOn: '',
  }
}
