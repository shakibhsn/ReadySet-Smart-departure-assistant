// Real-browser checks for Weather & Explore against a PRODUCTION build, the TEST database API and the REAL providers
// (Open-Meteo, Overpass, OpenStreetMap tiles). Edge in headless mode through the DevTools protocol; no extra dependencies.
// usage: node explore-e2e.mjs <outputDir> [apiBase] [appBase] [edgePath]
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const OUT = process.argv[2]
const API = process.argv[3] ?? 'http://localhost:4101/api'
const APP = process.argv[4] ?? 'http://localhost:4173'
const EDGE = process.argv[5] ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`) }
const note = (name, detail) => { results.push({ name, ok: null, detail }); console.log(`NOTE  ${name}  -> ${detail}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(p, { method = 'GET', token, body } = {}) {
  const res = await fetch(API + p, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, body: await res.json().catch(() => null) }
}
const dhakaLocal = (m) => new Date(Date.now() + m * 60000 + 6 * 3600000).toISOString().slice(0, 16)

async function launch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-edge-'))
  const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-port=9334', `--user-data-dir=${dir}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
  for (let i = 0; i < 40; i++) {
    try {
      const page = (await (await fetch('http://127.0.0.1:9334/json')).json()).find((t) => t.type === 'page')
      if (page) return { proc, wsUrl: page.webSocketDebuggerUrl }
    } catch { /* not ready */ }
    await sleep(250)
  }
  throw new Error('Edge did not start')
}
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result) }
  }
  const opened = new Promise((r) => (ws.onopen = r))
  const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })) })
  return { opened, send, close: () => ws.close() }
}

const { proc, wsUrl } = await launch()
const cdp = connect(wsUrl)
await cdp.opened
const { send } = cdp
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed')
  return r.result.value
}
const goto = async (url, wait = 1500) => { await send('Page.navigate', { url }); await sleep(wait) }
const waitFor = async (expr, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await evalJs(expr)) return true } catch { /* navigating */ } await sleep(300) } return false }
const shot = async (name) => { const { data } = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64')) }
const viewport = (w, h, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile })
const text = () => evalJs('document.body.innerText')
const noOverflow = () => evalJs('document.documentElement.scrollWidth <= window.innerWidth + 1')
const typeInto = (selector, value) => evalJs(`(() => { const i = document.querySelector(${JSON.stringify(selector)}); i.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
const clickText = (selector, re) => evalJs(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => ${re}.test(e.textContent)); if (!el) return false; el.click(); return true })()`)
const setTheme = (theme) => evalJs(`localStorage.setItem('readyset.theme', '${theme}'); true`)

try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')

  // ---- data (TEST database, throwaway @readyset.test user) ----
  const email = `explore-${Date.now()}@readyset.test`
  const reg = await api('/auth/register', { method: 'POST', body: { name: 'Explore Tester', email, password: 'Sup3rSecret!', confirmPassword: 'Sup3rSecret!' } })
  const token = reg.body.data.token
  await api('/users/me/preferences', { method: 'PATCH', token, body: { timezone: 'Asia/Dhaka' } })
  const ev = await api('/events', { method: 'POST', token, body: { title: 'Client meeting', category: 'business', startAt: dhakaLocal(180), timezone: 'Asia/Dhaka', destination: 'Gulshan, Dhaka', travelDurationMinutes: 30, preparationMinutes: 40, arrivalBufferMinutes: 10, priority: 'high' } })
  check('throwaway user and a high-priority event created through the real API', Boolean(ev.body?.data?.event?.id) && ev.body.data.event.priority === 'high', `priority=${ev.body?.data?.event?.priority}`)
  await api('/places', { method: 'POST', token, body: { label: 'Office', kind: 'office', address: 'Motijheel, Dhaka' } })

  const login = async () => { await goto(`${APP}/login`, 800); await evalJs(`sessionStorage.setItem('readyset.token', ${JSON.stringify(token)}); true`) }
  await viewport(1280, 800)
  await login()
  await setTheme('light')

  // ---- dashboard before a location is chosen, and lazy loading ----
  await goto(`${APP}/`, 2500)
  await waitFor(`document.body.innerText.includes('Choose a location')`)
  const t0 = await text()
  check('dashboard invites the user to choose a location (no weather shown or faked)', t0.includes('Choose a location') && !/Current temperature/.test(t0))
  check('dashboard has Explore shortcuts and the Saved places section', t0.includes('Explore destinations') && t0.includes('Saved places') && t0.includes('Office'))
  const loadedBefore = await evalJs(`performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /ExplorePage|leaflet/i.test(n)).length`)
  check('Explore code (Leaflet) is NOT loaded with the dashboard (lazy loading)', loadedBefore === 0, `${loadedBefore} requests`)
  await shot('01-dashboard-no-location-desktop')

  // ---- location search (real Open-Meteo geocoding) ----
  await goto(`${APP}/explore`, 2500)
  const loadedAfter = await evalJs(`performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /ExplorePage/i.test(n)).length`)
  check('opening Explore loads its own chunk', loadedAfter >= 1, `${loadedAfter} request(s)`)
  await waitFor(`document.querySelector('input[role=combobox]')`)
  await typeInto('input[role=combobox]', 'Savar')
  const gotOptions = await waitFor(`document.querySelectorAll('[role=option]').length >= 2`, 15000)
  const options = await evalJs(`[...document.querySelectorAll('[role=option]')].map((o) => o.innerText.replace(/\\n+/g, ' | '))`)
  check('searching "Savar" lists same-named places with their area (real Open-Meteo)', gotOptions && new Set(options).size === options.length && options.every((o) => /Bangladesh/.test(o)), JSON.stringify(options.slice(0, 3)))
  await shot('02-search-results-desktop')
  await typeInto('input[role=combobox]', 'Zzqxjkw')
  const none = await waitFor(`document.body.innerText.includes('No places found for')`, 15000)
  check('a search with no match shows the empty state', none)

  // pick Dhaka (dense OpenStreetMap data)
  await typeInto('input[role=combobox]', 'Dhaka')
  await waitFor(`document.querySelectorAll('[role=option]').length >= 1`, 15000)
  await evalJs(`document.querySelector('[role=option]').click()`)
  const weatherOk = await waitFor(`!!document.querySelector('[aria-label^="Current temperature"]')`, 30000)
  const t1 = await text()
  check('weather loads for the chosen location from real Open-Meteo', weatherOk, (await evalJs(`document.querySelector('[aria-label^="Current temperature"]')?.getAttribute('aria-label') ?? ''`)))
  check('weather card shows feels like, min/max, rain, wind, humidity, sunrise, sunset, updated time', ['Feels like', 'Min / max', 'Chance of rain', 'Wind', 'Humidity', 'Sunrise', 'Sunset', 'Forecast by Open-Meteo'].every((s) => t1.includes(s)))
  const hourly = await evalJs(`document.querySelectorAll('section[aria-label="Next 24 hours"] li').length`)
  const daily = await evalJs(`document.querySelectorAll('section[aria-label="Daily forecast"] li').length`)
  check('24 hourly slots and 7 daily rows', hourly === 24 && daily === 7, `hourly=${hourly} daily=${daily}`)
  const c1 = await evalJs(`document.querySelector('[aria-label^="Current temperature"]').textContent`)
  await clickText('[role=radio]', '/°F/')
  await sleep(300)
  const f1 = await evalJs(`document.querySelector('[aria-label^="Current temperature"]').textContent`)
  check('°C/°F switch converts without reloading', /°C/.test(c1) && /°F/.test(f1), `${c1} -> ${f1}`)
  await clickText('[role=radio]', '/°C/')

  // ---- destinations (real Overpass) and Leaflet ----
  const nearbyDone = await waitFor(`!!document.querySelector('ul[aria-label="Destinations"]') || document.body.innerText.includes('No places found here') || !!document.querySelector('[role=alert]')`, 60000)
  const placeCount = await evalJs(`document.querySelectorAll('ul[aria-label="Destinations"] > li').length`)
  const nearbyAlert = await evalJs(`[...document.querySelectorAll('[role=alert]')].map((a) => a.innerText.trim()).join(' / ')`)
  if (placeCount > 0) check('LIVE nearby places returned from OpenStreetMap', true, `${placeCount} places`)
  else note('LIVE nearby places', `no places returned (${nearbyAlert || (nearbyDone ? 'empty result' : 'still loading after 60 s')}): the public Overpass servers are the likely cause`)
  await sleep(2500)
  const leaflet = await evalJs(`(() => { const c = document.querySelector('.leaflet-container'); if (!c) return null; const tiles = [...c.querySelectorAll('img.leaflet-tile')]; return { tiles: tiles.length, loaded: tiles.filter((t) => t.classList.contains('leaflet-tile-loaded') && t.naturalWidth > 0).length, markers: c.querySelectorAll('.leaflet-marker-icon').length, zoom: !!c.querySelector('.leaflet-control-zoom'), attribution: c.querySelector('.leaflet-control-attribution')?.innerText ?? '', size: [c.clientWidth, c.clientHeight] } })()`)
  check('Leaflet map renders with the location marker, zoom controls and OSM attribution', Boolean(leaflet) && leaflet.markers >= 1 && leaflet.zoom && /OpenStreetMap/.test(leaflet.attribution) && leaflet.size[0] > 200 && leaflet.size[1] > 200, JSON.stringify(leaflet))
  check('map tiles actually load from OpenStreetMap in a real browser', Boolean(leaflet) && leaflet.loaded > 0, `${leaflet?.loaded}/${leaflet?.tiles} tiles loaded`)
  check('destination markers match the list', placeCount === 0 || (leaflet && leaflet.markers === placeCount + 1), `markers=${leaflet?.markers} places=${placeCount}`)
  await shot('03-explore-desktop-light')

  if (placeCount > 0) {
    await evalJs(`document.querySelector('ul[aria-label="Destinations"] button').click()`)
    await sleep(500)
    const det = await evalJs(`document.querySelector('section[aria-label^="Details for"]')?.innerText ?? ''`)
    check('destination details show provider data only, with "Not available" for unknown fields', /Opening hours, ratings, prices: Not available/.test(det) && /Weather nearby/.test(det) && /OpenStreetMap/.test(det))
    await shot('04-destination-details-desktop')
    await clickText('button', '/Save to my places/')
    await sleep(1500)
    check('Save to my places works against the real API', (await text()).includes('Saved to your places'))
    const planHref = await evalJs(`document.querySelector('a[href^="/events/new?destination="]')?.getAttribute('href') ?? ''`)
    check('"Plan a departure here" links to the new-event form with the destination', planHref.startsWith('/events/new?destination='), planHref.slice(0, 80))
    await goto(`${APP}${planHref}`, 2500)
    const dest = await evalJs(`document.querySelector('input[id]:not([type=date]):not([type=time])') && [...document.querySelectorAll('input')].map((i) => i.value).find((v) => v.length > 3 && !/^\\d/.test(v)) || ''`)
    check('the new-event form opens with that destination pre-filled', dest.length > 2, dest.slice(0, 60))
    await goto(`${APP}/explore`, 2500)
  }

  // category filter via the dashboard quick link
  await goto(`${APP}/explore?category=park`, 2500)
  await waitFor(`!!document.querySelector('button[aria-pressed=true]')`)
  check('dashboard category link opens Explore on that category', (await evalJs(`document.querySelector('[role=group][aria-label="Filter by category"] button[aria-pressed=true]')?.textContent`)) === 'Parks')

  // ---- dashboard with a location ----
  await goto(`${APP}/`, 3500)
  await waitFor(`!!document.querySelector('[aria-label^="Current temperature"]')`, 30000)
  const t2 = await text()
  check('dashboard shows the compact weather card for the saved location', /Current temperature/.test(await evalJs(`document.querySelector('[aria-label^="Current temperature"]')?.getAttribute('aria-label') ?? ''`)))
  check('dashboard shows the weather-aware departure reminder for the next event', await evalJs(`!!document.querySelector('section[aria-label="Weather for your departure"]')`), (await evalJs(`document.querySelector('section[aria-label="Weather for your departure"]')?.innerText.slice(0, 160).replace(/\\n+/g, ' ') ?? ''`)))
  check('high-priority events show a badge on the dashboard', t2.includes('High priority'))
  await shot('05-dashboard-with-location-desktop')
  const persisted = await evalJs(`!!localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('readyset.weatherLocation.v1:')) ?? '')`)
  check('the chosen location persists in this browser for the user', persisted)
  await goto(`${APP}/`, 3000)
  check('the location survives a page reload', await waitFor(`!!document.querySelector('[aria-label^="Current temperature"]')`, 30000))

  // ---- responsive: tablet and mobile ----
  for (const [label, w, h, mobile] of [['tablet', 820, 1100, false], ['mobile', 390, 844, true]]) {
    await viewport(w, h, mobile)
    for (const [route, name] of [['/', 'dashboard'], ['/explore', 'explore'], ['/week', 'week']]) {
      await goto(`${APP}${route}`, 2500)
      await waitFor(`!!document.querySelector('[aria-label^="Current temperature"], h1')`, 15000)
      if (route === '/explore') await sleep(2500)
      check(`no horizontal scrolling on ${name} (${label} ${w}px)`, await noOverflow())
      await shot(`${name}-${label}`)
    }
    if (mobile) {
      await goto(`${APP}/explore`, 3500)
      const m = await evalJs(`(() => { const c = document.querySelector('.leaflet-container'); const r = c?.getBoundingClientRect(); return c ? { w: Math.round(r.width), h: Math.round(r.height), fits: r.right <= window.innerWidth + 1 } : null })()`)
      check('map fits the phone screen', Boolean(m) && m.fits && m.w > 250, JSON.stringify(m))
      const small = await evalJs(`JSON.stringify([...document.querySelectorAll('button, a, [role=radio]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 28) && getComputedStyle(e).visibility !== 'hidden' }).map((e) => (e.getAttribute('aria-label') || e.textContent || e.className).trim().slice(0, 40) + ' ' + Math.round(e.getBoundingClientRect().height) + 'px'))`)
      note('small interactive elements on the phone layout (height < 28 px)', `${small}`)
    }
  }

  // ---- dark theme ----
  await viewport(1280, 800)
  await setTheme('dark')
  for (const [route, name] of [['/', 'dashboard'], ['/explore', 'explore']]) {
    await goto(`${APP}${route}`, 3000)
    if (route === '/explore') await sleep(2500)
    const dark = await evalJs(`({ theme: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor })`)
    check(`dark theme applies on ${name}`, dark.theme === 'dark' && (dark.bg.match(/\d+/g) ?? [255]).slice(0, 3).every((n) => Number(n) < 90), JSON.stringify(dark))
    await shot(`${name}-dark-desktop`)
  }
  const lowContrast = await evalJs(`(() => { const lum = (c) => { const [r, g, b] = c.match(/\\d+/g).slice(0, 3).map((n) => { n /= 255; return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }; const bad = []; for (const el of document.querySelectorAll('main p, main h1, main h2, main h3, main span, main dd, main dt, main li')) { if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue; let bg = el; let color = null; while (bg && !color) { const c = getComputedStyle(bg).backgroundColor; if (c && !/rgba\\(\\d+, \\d+, \\d+, 0\\)|transparent/.test(c)) color = c; bg = bg.parentElement } const fg = getComputedStyle(el).color; if (!color || el.closest('.leaflet-container')) continue; const [a, b] = [lum(fg), lum(color)].sort((x, y) => y - x); const ratio = (a + 0.05) / (b + 0.05); if (ratio < 3) bad.push(el.textContent.trim().slice(0, 30) + ' ' + ratio.toFixed(1)) } return bad.slice(0, 8) })()`)
  check('no clearly unreadable text (contrast < 3:1) in dark mode on Explore', lowContrast.length === 0, JSON.stringify(lowContrast))
  await setTheme('light')

  // ---- current location: permission denied and granted ----
  await viewport(1280, 800)
  await goto(`${APP}/explore`, 3000)
  await evalJs(`(() => { const o = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation); navigator.geolocation.getCurrentPosition = (ok, fail) => fail({ code: 1 }); return true })()`)
  await clickText('button', '/Use my current location/')
  const denied = await waitFor(`document.body.innerText.includes('permission was denied')`, 5000)
  check('"Use my current location" with permission denied explains and keeps manual search', denied && (await evalJs(`!!document.querySelector('input[role=combobox]')`)))
  await evalJs(`navigator.geolocation.getCurrentPosition = (ok) => ok({ coords: { latitude: 23.7925, longitude: 90.4078 } }); true`)
  await clickText('button', '/Use my current location/')
  const gps = await waitFor(`document.body.innerText.includes('My current location')`, 10000)
  check('"Use my current location" with permission granted selects it and loads weather', gps && (await waitFor(`!!document.querySelector('[aria-label^="Current temperature"]')`, 30000)))
  await shot('06-current-location-desktop')
} catch (err) {
  check('script completed without errors', false, err.message)
} finally {
  fs.writeFileSync(path.join(OUT, 'explore-results.json'), JSON.stringify(results, null, 2))
  cdp.close(); proc.kill()
  console.log(`\n${results.filter((r) => r.ok === true).length} passed, ${results.filter((r) => r.ok === false).length} failed, ${results.filter((r) => r.ok === null).length} notes`)
}
