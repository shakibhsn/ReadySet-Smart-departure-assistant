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
  const places = {} // token -> { list, defaultId }
  const packing = {} // token -> personal packing templates
  let forgottenList = []
  const hourSlot = (i) => ({ time: `2030-05-10T${String((14 + i) % 24).padStart(2, '0')}:00`, temperatureC: 30, feelsLikeC: 34, rainChancePercent: 10, windSpeedKmh: 10, condition: 'Partly cloudy', icon: 'partly-cloudy', severeCondition: false })
  let explore = {
    forecast: { status: 'ok', stale: false, fetchedAt: new Date().toISOString(), timezone: 'Asia/Dhaka', location: { latitude: 23.85, longitude: 90.26 }, current: { time: '2030-05-10T14:15', temperatureC: 31, feelsLikeC: 36, humidityPercent: 74, windSpeedKmh: 14, precipitationMm: 0, rainChancePercent: 20, isDay: true, condition: 'Partly cloudy', icon: 'partly-cloudy', severeCondition: false }, today: { minC: 26, maxC: 33, rainChancePercent: 40, sunrise: '2030-05-10T05:22', sunset: '2030-05-10T18:21' }, hourly: Array.from({ length: 24 }, (_, i) => hourSlot(i)), daily: [], advice: [] },
    locations: { status: 'ok', country: 'BD', results: [] },
    places: { status: 'ok', category: 'all', radiusMeters: 2500, places: [], attribution: '© OpenStreetMap contributors (ODbL)' },
  }
  // preparation profile (simplified mirror): server-side state the tests can set
  const emptyProfile = () => ({ enabled: true, overrides: {}, minSamples: 3, preparation: { overall: { status: 'insufficient_data', samples: 0, needed: 3, message: 'Not enough history yet: 0 of 3 logged preparations.' }, byCategory: {} }, buffer: { status: 'insufficient_data', samples: 0, needed: 3, message: 'Not enough history yet: 0 of 3 logged departures.' }, weekly: { eventsLogged: 0, message: 'No activity logged this week.' , uncheckedWhenLeaving: [] }, oftenUnchecked: [], note: '' })
  let prepProfile = emptyProfile()
  let prepLogs = []
  let prepState = { enabled: true, log: null, occurrenceStart: '2030-05-10T04:00:00.000Z', window: { opensAt: '2030-05-10T02:00:00.000Z', closesAt: '2030-05-10T06:00:00.000Z', open: true } }
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
    // ---- preparation profile + tap-to-log ----
    if (path.startsWith('/events/') && path.endsWith('/prep-log')) {
      if (method === 'GET') return ok(prepState)
      const now = new Date().toISOString()
      const log = prepState.log ?? { id: 'log-1', prepStartedAt: null, readyAt: null, cancelledAt: null, leftAt: null, actualPrepMinutes: null, latenessMinutes: null, uncheckedItems: [] }
      if (body.action === 'start') Object.assign(log, { prepStartedAt: now, cancelledAt: null })
      if (body.action === 'ready') Object.assign(log, { readyAt: now, actualPrepMinutes: 30 })
      if (body.action === 'cancel') Object.assign(log, { cancelledAt: now })
      if (body.action === 'left') Object.assign(log, { leftAt: now, latenessMinutes: 0 })
      prepState = { ...prepState, log }
      return ok({ log, changed: true })
    }
    if (path === '/prep-profile') return ok(prepProfile)
    if (path === '/prep-profile/logs') return ok({ logs: prepLogs })
    if (path.startsWith('/prep-profile/logs/') && method === 'DELETE') { prepLogs = prepLogs.filter((l) => l.id !== path.split('/')[3]); return ok({}) }
    if (path === '/prep-profile/data' && method === 'DELETE') { const deleted = prepLogs.length; prepLogs = []; prepProfile = emptyProfile(); return ok({ deleted }) }
    if (path === '/prep-profile/settings' && method === 'PATCH') { prepProfile = { ...prepProfile, enabled: body.enabled, ...(body.enabled ? {} : { message: 'The preparation profile is turned off: nothing is logged or suggested.' }) }; return ok({ enabled: body.enabled }) }
    if (path === '/prep-profile/overrides' && method === 'PUT') { prepProfile = { ...prepProfile, overrides: { ...prepProfile.overrides, [body.category]: { ...(body.prepMinutes !== undefined && { prepMinutes: body.prepMinutes }), ...(body.bufferMinutes !== undefined && { bufferMinutes: body.bufferMinutes }) } } }; return ok({ overrides: prepProfile.overrides }) }
    if (path.startsWith('/prep-profile/overrides/') && method === 'DELETE') { const { [path.split('/')[3]]: _gone, ...rest } = prepProfile.overrides; prepProfile = { ...prepProfile, overrides: rest }; return ok({ overrides: rest }) }
    // ---- Weather & Explore (simplified mirror: the tests set what the providers would return) ----
    if (path === '/weather/forecast') return ok(explore.forecast)
    if (path === '/locations/search') return ok(explore.locations)
    if (path === '/places/nearby') return ok(explore.places)
    // ---- saved places, packing templates, forgotten items (simplified mirror; per-token isolation) ----
    if (path === '/places' || path.startsWith('/places/')) {
      const book = (places[token] ??= { list: [], defaultId: null })
      const view = () => ({ places: book.list.map((x) => ({ ...x, isDefaultStart: x.id === book.defaultId })), defaultStartPlaceId: book.defaultId })
      const id = path.split('/')[2]
      if (path === '/places' && method === 'GET') return ok(view())
      if (path === '/places' && method === 'POST') {
        if (book.list.some((x) => x.label === body.label)) return respond(409, { success: false, message: 'You already have a place with this name', errors: [] })
        const place = { id: `place-${++seq}`, label: body.label, kind: body.kind ?? 'other', address: body.address }
        book.list.push(place)
        if (body.makeDefault) book.defaultId = place.id
        return respond(201, { success: true, message: 'Place saved', data: { place: { ...place, isDefaultStart: place.id === book.defaultId } } })
      }
      if (path === '/places/default' && method === 'PATCH') {
        book.defaultId = body.placeId
        return ok({ defaultStartPlaceId: book.defaultId })
      }
      const place = book.list.find((x) => x.id === id)
      if (!place) return respond(404, { success: false, message: 'Place not found', errors: [] })
      if (method === 'PATCH') { Object.assign(place, body); return ok({ place: { ...place, isDefaultStart: place.id === book.defaultId } }) }
      if (method === 'DELETE') { book.list.splice(book.list.indexOf(place), 1); if (book.defaultId === id) book.defaultId = null; return ok({ defaultStartPlaceId: book.defaultId }) }
    }
    if (path === '/packing-templates' || path.startsWith('/packing-templates/')) {
      const list = (packing[token] ??= [])
      if (path === '/packing-templates' && method === 'GET') return ok({ templates: structuredClone(list) })
      if (path === '/packing-templates' && method === 'POST') {
        const items = body.fromEventId ? ((checklists[token] ??= {})[body.fromEventId] ?? []).map((i) => ({ text: i.text, group: i.group })) : body.items
        const t = { id: `pack-${++seq}`, name: body.name, items }
        list.push(t)
        return respond(201, { success: true, message: 'Packing template saved', data: { template: t } })
      }
      const i = list.findIndex((t) => t.id === path.split('/')[2])
      if (i < 0) return respond(404, { success: false, message: 'Template not found', errors: [] })
      if (method === 'DELETE') { list.splice(i, 1); return ok({}, 'Packing template deleted') }
    }
    if (path === '/packing/forgotten') return ok({ items: forgottenList })
    if (path.startsWith('/events/') && path.endsWith('/forgot') && method === 'POST') return ok({ reported: true, alreadyReported: false })
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
        const own = body.personalTemplateId ? (packing[token] ?? []).find((t) => t.id === body.personalTemplateId) : null
        if (body.personalTemplateId && !own) return respond(404, { success: false, message: 'Template not found', errors: [] })
        const names = own ? own.items.map((i) => i.text) : event.category === 'university' ? ['Laptop', 'Charger'] : []
        const fresh = names.filter((n) => !items.some((i) => i.text === n))
        fresh.forEach((n) => items.push(make(n, 'Electronics')))
        return ok({ ...view(), template: own ? `personal:${own.name}` : event.category, added: fresh.length, skipped: names.length - fresh.length })
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
    setPrepProfile: (patch) => { prepProfile = { ...prepProfile, ...patch } },
    setPrepState: (patch) => { prepState = { ...prepState, ...patch } },
    setPrepLogs: (list) => { prepLogs = list },
    setExplore: (patch) => { explore = { ...explore, ...patch } },
    setForgotten: (list) => { forgottenList = list },
    seedPackingTemplates: (token, list) => { (packing[token] ??= []).push(...list.map((t, n) => ({ id: `pack-seed-${n}`, ...t }))) },
    seedPlaces: (token, list, defaultId = null) => { const b = (places[token] ??= { list: [], defaultId: null }); b.list.push(...list.map((x, n) => ({ id: `place-seed-${n}`, kind: 'other', ...x }))); b.defaultId = defaultId },
    setConflicts: (c) => { conflictsResult = { ...conflictsResult, ...c } },
    seedTemplates: (token, list) => { (templates[token] ??= []).push(...list.map((t, i) => ({ id: `tpl-seed-${i}`, destination: null, notes: null, timezone: null, durationMinutes: null, recurrence: null, ...t }))) },
    setNotificationPrefs: (token, p) => { notePrefs[token] = { ...defaultPrefs, ...p } },
    notifications: (token) => notes[token] ?? [],
    seedChecklist: (token, eventId, items) => { ((checklists[token] ??= {})[eventId] ??= []).push(...items) },
    checklist: (token, eventId) => (checklists[token] ??= {})[eventId] ?? [],
    clearOverrides: () => (overrides.length = 0),
    respond,
    toApiEvent,
  }
}
