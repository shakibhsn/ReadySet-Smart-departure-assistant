import { vi } from 'vitest'
import { fakePlanView } from './planFixture'

/**
 * A small stateful fake of the ReadySet backend for frontend tests.
 * Each token owns a separate list of events, like the real per-user database rows.
 */
export function createFakeApi({ users, events = {} }) {
  const db = Object.fromEntries(Object.entries(events).map(([token, list]) => [token, [...list]]))
  const calls = []
  let seq = 0
  const overrides = []
  const checklists = {} // token -> eventId -> items
  let conflictsResult = { from: null, to: null, eventsChecked: 0, summary: { high: 0, medium: 0 }, conflicts: [], assumptions: ['Events without a duration are assumed to last 60 minutes.'] }
  const templates = {} // token -> event templates
  const notes = {} // token -> notifications (newest first)
  const notePrefs = {} // token -> notification preferences
  const defaultPrefs = { enabled: true, upcoming: true, prep: true, departure: true, checklist: true, leadMinutes: 10, browser: false }
  let weatherResult = { status: 'no_location', eventStartAt: null, location: null, forecast: null, fetchedAt: null, message: 'Add a destination to see the weather.' }

  const respond = (status, body) =>
    Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) })
  const ok = (data = {}, message = 'ok') => respond(200, { success: true, message, data })

  const toApiEvent = (input, id = `evt-${++seq}`) => {
    const [localDate, localTime] = input.startAt.split('T')
    return {
      id,
      title: input.title,
      category: input.category,
      startAt: `${localDate}T${localTime.slice(0, 5)}:00.000Z`,
      timezone: input.timezone,
      localDate,
      localTime: localTime.slice(0, 5),
      destination: input.destination ?? null,
      notes: input.notes ?? null,
      travelDurationMinutes: input.travelDurationMinutes,
      preparationMinutes: input.preparationMinutes,
      arrivalBufferMinutes: input.arrivalBufferMinutes,
      isRecurring: Boolean(input.recurrence),
      recurrence: input.recurrence ? { endsOn: null, ...input.recurrence } : null,
      seriesStartAt: `${localDate}T${localTime.slice(0, 5)}:00.000Z`,
      isOccurrence: false,
      createdAt: '2030-01-01T00:00:00.000Z',
      updatedAt: '2030-01-01T00:00:00.000Z',
    }
  }

  const sorted = (list) => [...list].sort((a, b) => a.startAt.localeCompare(b.startAt))

  // Controllable clock (defaults to the real/fake-timer Date.now()).
  let clock = null
  const now = () => clock ?? Date.now()
  const planView = (event, startIso) => fakePlanView(event, startIso, now())

  const handle = (url, init = {}) => {
    const u = new URL(url)
    const path = u.pathname.replace(/^\/api/, '')
    const method = init.method ?? 'GET'
    const token = init.headers?.Authorization?.replace('Bearer ', '')
    const body = init.body ? JSON.parse(init.body) : undefined
    calls.push({ method, path, search: u.search, params: u.searchParams, body, token })

    for (const o of overrides) {
      const result = o(method, path, token)
      if (result) return result
    }

    if (path === '/auth/login') {
      const entry = users[body.email]
      return entry ? ok({ user: entry.user, token: entry.token }) : respond(401, { success: false, message: 'Invalid email or password', errors: [] })
    }
    if (path === '/auth/logout') return ok()
    const owner = Object.values(users).find((e) => e.token === token)
    if (!owner) return respond(401, { success: false, message: 'Invalid token', errors: [] })
    if (path === '/auth/me') return ok({ user: owner.user })

    const mine = (db[token] ??= [])
    if (path === '/events' && method === 'POST') {
      if (body.title === 'bad') return respond(400, { success: false, message: 'Validation failed', errors: [{ field: 'title', message: 'Server says no' }] })
      const event = toApiEvent(body)
      mine.push(event)
      return respond(201, { success: true, message: 'Event created', data: { event } })
    }
    if (path === '/events' && method === 'GET') {
      const category = u.searchParams.get('category')
      const from = u.searchParams.get('from')
      const to = u.searchParams.get('to')
      const page = Number(u.searchParams.get('page') ?? 1)
      const limit = Number(u.searchParams.get('limit') ?? 10)
      const all = sorted(mine).filter((e) => (!category || e.category === category) && (!from || e.localDate >= from) && (!to || e.localDate <= to))
      return ok({
        events: all.slice((page - 1) * limit, page * limit),
        pagination: { page, limit, total: all.length, totalPages: Math.ceil(all.length / limit) },
      })
    }
    if (path === '/events/upcoming') return ok({ events: sorted(mine).slice(0, Number(u.searchParams.get('limit') ?? 10)) })
    if (path === '/events/occurrences') {
      const category = u.searchParams.get('category')
      const from = u.searchParams.get('from')
      const to = u.searchParams.get('to')
      return ok({ events: sorted(mine).filter((e) => (!category || e.category === category) && e.localDate >= from && e.localDate <= to) })
    }
    // ---- departure engine (simplified mirror of the backend response shape) ----
    if (path === '/departure/upcoming') {
      const limit = Number(u.searchParams.get('limit') ?? 20)
      const views = sorted(mine).map((e) => planView(e, e.startAt)).filter((v) => new Date(v.plan.eventStart) >= new Date(now()))
      views.sort((a, b) => a.plan.departureTime.localeCompare(b.plan.departureTime))
      return ok({ from: new Date(now()).toISOString(), to: null, plans: views.slice(0, limit) })
    }
    if (path === '/departure/today') return ok({ date: null, timezone: 'Asia/Dhaka', plans: [] })
    if (path === '/departure/preview' && method === 'POST') {
      if (body.travelDurationMinutes < 1) return respond(400, { success: false, message: 'Validation failed', errors: [{ field: 'travelDurationMinutes', message: 'Travel duration must be at least 1 minute' }] })
      const asEvent = { id: null, title: null, timezone: body.timezone ?? 'Asia/Dhaka', travelDurationMinutes: body.travelDurationMinutes, preparationMinutes: body.preparationMinutes ?? 30, arrivalBufferMinutes: body.arrivalBufferMinutes ?? 10 }
      const startIso = /Z$|[+-]\d\d:\d\d$/.test(body.startAt) ? new Date(body.startAt).toISOString() : `${body.startAt}:00.000Z`
      return ok(planView(asEvent, startIso))
    }
    // ---- schedule conflicts + event templates (simplified mirror of the backend) ----
    if (path === '/schedule/conflicts') return ok(conflictsResult)
    if (path === '/event-templates') {
      const list = (templates[token] ??= [])
      if (method === 'POST') {
        const t = { id: `tpl-${++seq}`, name: body.name, title: body.title ?? 'From event', category: body.category ?? 'other', destination: null, notes: null, timezone: null, travelDurationMinutes: 20, preparationMinutes: 15, arrivalBufferMinutes: 5, durationMinutes: null, recurrence: null, ...body }
        list.push(t)
        return respond(201, { success: true, message: 'Template saved', data: { template: t } })
      }
      return ok({ templates: structuredClone(list) })
    }
    const tplMatch = path.match(/^\/event-templates\/([^/]+)$/)
    if (tplMatch && method === 'DELETE') {
      const list = (templates[token] ??= [])
      const i = list.findIndex((t) => t.id === tplMatch[1])
      if (i < 0) return respond(404, { success: false, message: 'Template not found', errors: [] })
      list.splice(i, 1)
      return ok({}, 'Template deleted')
    }
    const occMatch = path.match(/^\/events\/([^/]+)\/occurrences(\/skip|\/restore)?$/)
    if (occMatch) return ok({ skipped: true, restored: true, occurrence: null })
    // ---- notifications (simplified mirror of the backend; per-token isolation) ----
    if (path === '/users/me/notification-preferences') {
      const prefs = (notePrefs[token] ??= { ...defaultPrefs })
      if (method === 'PATCH') Object.assign(prefs, body)
      return ok({ preferences: { ...prefs } })
    }
    if (path.startsWith('/notifications')) {
      const list = (notes[token] ??= [])
      const unread = () => list.filter((n) => !n.read).length
      if (path === '/notifications' && method === 'GET') {
        const limit = Number(u.searchParams.get('limit') ?? 20)
        const page = Number(u.searchParams.get('page') ?? 1)
        return ok({ notifications: structuredClone(list.slice((page - 1) * limit, page * limit)), unreadCount: unread(), pagination: { page, limit, total: list.length, totalPages: Math.max(1, Math.ceil(list.length / limit)) } })
      }
      if (path === '/notifications/read-all' && method === 'POST') {
        list.forEach((n) => { n.read = true })
        return ok({ updated: 0, unreadCount: 0 })
      }
      const nm = path.match(/^\/notifications\/([^/]+)(\/read)?$/)
      const note = nm && list.find((n) => n.id === nm[1])
      if (!note) return respond(404, { success: false, message: 'Notification not found', errors: [] })
      if (method === 'PATCH') { note.read = true; return ok({ notification: { ...note }, unreadCount: unread() }) }
      if (method === 'DELETE') { list.splice(list.indexOf(note), 1); return ok({ unreadCount: unread() }) }
    }
    // ---- checklist + weather (simplified mirror of the backend; per-token isolation like the real API) ----
    if (path === '/checklist-templates') return ok({ templates: [{ key: 'university', label: 'University / Class', items: [{ text: 'Laptop', group: 'Electronics' }, { text: 'Charger', group: 'Electronics' }] }, { key: 'other', label: 'Custom event', items: [] }] })
    const weatherMatch = path.match(/^\/events\/([^/]+)\/weather$/)
    if (weatherMatch) {
      if (!mine.some((e) => e.id === weatherMatch[1])) return respond(404, { success: false, message: 'Event not found', errors: [] })
      return ok({ weather: weatherResult })
    }
    const clMatch = path.match(/^\/events\/([^/]+)\/checklist(?:\/([^/]+?))?(?:\/(completion))?$/)
    if (clMatch) {
      const [, eventId, tail, completion] = clMatch
      const event = mine.find((e) => e.id === eventId)
      if (!event) return respond(404, { success: false, message: 'Event not found', errors: [] })
      const items = ((checklists[token] ??= {})[eventId] ??= [])
      const view = () => ({ items: structuredClone(items), progress: { total: items.length, done: items.filter((i) => i.done).length } })
      const make = (text, group = 'Essentials') => ({ id: `item-${++seq}`, eventId, text, group, done: false, position: items.length })
      if (!tail && method === 'GET') return ok(view())
      if (!tail && method === 'POST') {
        if (!body.text?.trim()) return respond(400, { success: false, message: 'Validation failed', errors: [{ field: 'text', message: 'Item name is required' }] })
        const item = make(body.text.trim(), body.group)
        items.push(item)
        return respond(201, { success: true, message: 'Item added', data: { item: { ...item } } })
      }
      if (tail === 'apply-template') {
        const names = event.category === 'university' ? ['Laptop', 'Charger'] : []
        const fresh = names.filter((n) => !items.some((i) => i.text === n))
        fresh.forEach((n) => items.push(make(n, 'Electronics')))
        return ok({ ...view(), template: event.category, added: fresh.length, skipped: names.length - fresh.length })
      }
      const item = items.find((i) => i.id === tail)
      if (!item) return respond(404, { success: false, message: 'Checklist item not found', errors: [] })
      if (method === 'DELETE') {
        items.splice(items.indexOf(item), 1)
        return ok({}, 'Item deleted')
      }
      if (method === 'PATCH') {
        Object.assign(item, completion ? { done: body.done } : body)
        return ok({ item: { ...item } })
      }
    }
    const planMatch = path.match(/^\/events\/([^/]+)\/departure-plan$/)
    if (planMatch) {
      const found = mine.find((e) => e.id === planMatch[1])
      if (!found) return respond(404, { success: false, message: 'Event not found', errors: [] })
      return ok(planView(found, u.searchParams.get('occurrence') ?? found.startAt))
    }
    const match = path.match(/^\/events\/([^/]+)$/)
    if (match) {
      const index = mine.findIndex((e) => e.id === match[1])
      if (index < 0) return respond(404, { success: false, message: 'Event not found', errors: [] })
      if (method === 'GET') return ok({ event: mine[index] })
      if (method === 'PATCH') {
        mine[index] = { ...toApiEvent({ ...mine[index], ...body, startAt: body.startAt ?? `${mine[index].localDate}T${mine[index].localTime}` }, mine[index].id), updatedAt: '2030-01-02T00:00:00.000Z' }
        return ok({ event: mine[index] }, 'Event updated')
      }
      if (method === 'DELETE') {
        mine.splice(index, 1)
        return ok({}, 'Event deleted')
      }
    }
    return respond(404, { success: false, message: 'Route not found', errors: [] })
  }

  const fetchMock = vi.fn(handle)
  return {
    fetchMock,
    /** Freeze the fake server clock at a Date (or null for the real clock). */
    setNow: (date) => { clock = date ? new Date(date).getTime() : null },
    install: () => vi.stubGlobal('fetch', fetchMock),
    calls,
    events: (token) => (db[token] ??= []),
    /** Make matching requests fail. `fn(method, path, token)` returns a response promise or undefined. */
    override: (fn) => overrides.push(fn),
    /** Set the weather every event reports (the shape of the backend weather result). */
    setWeather: (w) => { weatherResult = w },
    /** Seed notifications for a token (newest first). */
    seedNotifications: (token, items) => { (notes[token] ??= []).push(...items.map((n, i) => ({ id: `note-${++seq}-${i}`, eventId: null, type: 'PREP_NOW', category: 'preparation', body: 'Body', read: false, createdAt: new Date().toISOString(), ...n }))) },
    setConflicts: (c) => { conflictsResult = { ...conflictsResult, ...c } },
    seedTemplates: (token, list) => { (templates[token] ??= []).push(...list.map((t, i) => ({ id: `tpl-seed-${i}`, destination: null, notes: null, timezone: null, durationMinutes: null, recurrence: null, ...t }))) },
    setNotificationPrefs: (token, p) => { notePrefs[token] = { ...defaultPrefs, ...p } },
    notifications: (token) => notes[token] ?? [],
    checklist: (token, eventId) => (checklists[token] ??= {})[eventId] ?? [],
    clearOverrides: () => (overrides.length = 0),
    respond,
    toApiEvent,
  }
}
