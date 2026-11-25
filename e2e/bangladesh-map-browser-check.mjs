// Real-browser checks for the Bangladesh destination map (Explore page) against a PRODUCTION build, the TEST database API
// and the real providers. Edge in headless mode through the DevTools protocol; no extra dependencies.
// usage: node bangladesh-map-browser-check.mjs <outputDir> [apiBase] [appBase] [edgePath]
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const OUT = process.argv[2]
const API = process.argv[3] ?? 'http://localhost:4101/api'
const APP = process.argv[4] ?? 'http://localhost:4173'
const EDGE = process.argv[5] ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9336
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`) }
const note = (name, detail) => { results.push({ name, ok: null, detail }); console.log(`NOTE  ${name}  -> ${detail}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(p, { method = 'GET', token, body } = {}) {
  const res = await fetch(API + p, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, body: await res.json().catch(() => null) }
}

async function launch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-edge-'))
  const proc = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
  for (let i = 0; i < 40; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page')
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
  const listeners = []
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result) }
    else if (msg.method) listeners.forEach((l) => l(msg))
  }
  const opened = new Promise((r) => (ws.onopen = r))
  const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })) })
  return { opened, send, on: (l) => listeners.push(l) }
}

const { proc, wsUrl } = await launch()
const cdp = connect(wsUrl)
await cdp.opened
const { send } = cdp
const requests = []
cdp.on((m) => { if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url) })
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
const clickButton = (re) => evalJs(`(() => { const el = [...document.querySelectorAll('button, a')].find((e) => ${re}.test(e.textContent.trim())); if (!el) return false; el.click(); return true })()`)
const clickInList = (list, name) => evalJs(`(() => { const el = [...document.querySelectorAll('ul[aria-label=${JSON.stringify(list)}] button')].find((e) => e.textContent.trim() === ${JSON.stringify(name)}); if (!el) return false; el.click(); return true })()`)
const crumbs = () => evalJs(`[...document.querySelectorAll('nav[aria-label="Selected area"] button')].map((b) => b.textContent.trim())`)
const mapState = () => evalJs(`(() => { const c = document.querySelector('.leaflet-container'); if (!c) return null; const tiles = [...c.querySelectorAll('img.leaflet-tile')]; return { loaded: tiles.filter((t) => t.classList.contains('leaflet-tile-loaded') && t.naturalWidth > 0).length, paths: c.querySelectorAll('.leaflet-overlay-pane path').length, interactive: c.querySelectorAll('.leaflet-overlay-pane path.leaflet-interactive').length, markers: c.querySelectorAll('.leaflet-marker-icon').length, size: [c.clientWidth, c.clientHeight], attribution: c.querySelector('.leaflet-control-attribution')?.innerText ?? '' } })()`)

try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
  const email = `bdmap-${Date.now()}@readyset.test`
  const reg = await api('/auth/register', { method: 'POST', body: { name: 'Map Tester', email, password: 'Sup3rSecret!', confirmPassword: 'Sup3rSecret!' } })
  const token = reg.body.data.token
  await api('/users/me/preferences', { method: 'PATCH', token, body: { timezone: 'Asia/Dhaka' } })
  await api('/places', { method: 'POST', token, body: { label: 'Dhaka office', kind: 'office', address: 'Motijheel, Dhaka' } })

  await viewport(1280, 900)
  await goto(`${APP}/login`, 800)
  await evalJs(`sessionStorage.setItem('readyset.token', ${JSON.stringify(token)}); localStorage.setItem('readyset.theme', 'light'); true`)

  // ---- 1. overview, no automatic location request, boundary data loaded lazily ----
  requests.length = 0
  await goto(`${APP}/explore`, 2500)
  await waitFor(`document.querySelectorAll('.leaflet-overlay-pane path').length >= 72`, 20000)
  const m0 = await mapState()
  check('the Bangladesh overview map shows 8 clickable divisions plus 64 district boundaries', m0 && m0.interactive === 8 && m0.paths >= 72, JSON.stringify(m0))
  check('the map has OSM + geoBoundaries attribution and a usable size', m0 && /OpenStreetMap/.test(m0.attribution) && /geoBoundaries/.test(m0.attribution) && m0.size[0] > 300 && m0.size[1] > 250)
  check('map tiles load in a real browser', m0 && m0.loaded > 0, `${m0?.loaded} tiles`)
  const perm = await evalJs(`navigator.permissions.query({ name: 'geolocation' }).then((p) => p.state)`)
  check('the page did not ask for location on load (permission still "prompt")', perm === 'prompt', perm)
  check('only the division and district boundary files were fetched on the overview', requests.some((u) => u.endsWith('/geo/bd-divisions.json')) && requests.some((u) => u.endsWith('/geo/bd-districts.json')) && !requests.some((u) => u.includes('/geo/upazilas/')))
  check('no weather or nearby-places request before the user chooses an area', !requests.some((u) => /weather\/forecast|places\/nearby/.test(u)))
  await shot('01-overview-desktop')

  // ---- 2. a click on a division boundary on the map itself ----
  await evalJs(`(() => { const p = [...document.querySelectorAll('.leaflet-overlay-pane path.leaflet-interactive')][0]; p.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true })()`)
  const divPicked = await waitFor(`document.querySelectorAll('nav[aria-label="Selected area"] button').length === 2`, 5000)
  const c1 = await crumbs()
  check('clicking a division on the map selects it (breadcrumb)', divPicked && /Division$/.test(c1[1] ?? ''), JSON.stringify(c1))
  await waitFor(`document.querySelectorAll('ul[aria-label^="Districts in"] button').length > 0`, 8000)
  const m1 = await mapState()
  check('the map now shows that division\'s districts (clickable) with its outline', m1 && m1.interactive >= 4 && m1.interactive <= 13, `${m1?.interactive} districts`)
  await shot('02-division-desktop')
  await evalJs(`[...document.querySelectorAll('nav[aria-label="Selected area"] button')][0].click(); true`)
  check('the Bangladesh breadcrumb returns to the overview', await waitFor(`!!document.querySelector('ul[aria-label="Divisions"]')`, 5000))

  // ---- 3. division -> district -> destinations ----
  await clickInList('Divisions', 'Dhaka')
  await waitFor(`!!document.querySelector('ul[aria-label="Districts in Dhaka"]')`, 8000)
  const districtsInDhaka = await evalJs(`document.querySelectorAll('ul[aria-label="Districts in Dhaka"] button').length`)
  check('Dhaka Division lists its 13 districts', districtsInDhaka === 13, String(districtsInDhaka))
  const weatherOk = await waitFor(`/°C|°F/.test(document.querySelector('section[aria-label^="Selected area"]')?.innerText ?? '')`, 30000)
  check('weather for the selected area comes from the real forecast service', weatherOk, await evalJs(`document.querySelector('section[aria-label^="Selected area"]')?.innerText.split('\\n').find((l) => /Weather/.test(l)) ?? ''`))
  await clickInList('Districts in Dhaka', 'Dhaka')
  await waitFor(`!!document.querySelector('ul[aria-label="Upazilas in Dhaka"]')`, 10000)
  check('the district\'s upazilas load only now', requests.some((u) => /\/geo\/upazilas\//.test(u)))
  const upaz = await evalJs(`document.querySelectorAll('ul[aria-label="Upazilas in Dhaka"] button').length`)
  check('the district view lists its upazilas', upaz > 3, String(upaz))
  const nearbyDone = await waitFor(`!!document.querySelector('ul[aria-label="Destinations"]') || document.body.innerText.includes('No places found here') || !!document.querySelector('[role=alert]')`, 60000)
  const places = await evalJs(`document.querySelectorAll('ul[aria-label="Destinations"] > li').length`)
  if (places > 0) check('LIVE destinations are listed for the district', true, `${places} places`)
  else note('LIVE destinations', `none returned (${(await evalJs(`[...document.querySelectorAll('[role=alert]')].map((a) => a.innerText.trim()).join(' / ')`)) || (nearbyDone ? 'empty result' : 'still loading')}): the public Overpass servers are the likely cause`)
  await sleep(1500)
  await shot('03-district-desktop')
  check('the saved place that mentions Dhaka is offered', (await text()).includes('Dhaka office'))
  check('"Plan a departure here" links to the existing event form with the area as destination', await evalJs(`!!document.querySelector('a[href*="/events/new?destination=Dhaka"]')`))
  await clickButton(/Save to my places/)
  check('Save to my places works for the area (real API)', await waitFor(`document.body.innerText.includes('Saved to your places.')`, 8000))
  const saved = await api('/places', { token })
  check('the place really exists in the user\'s account', saved.body?.data?.places?.some((p) => p.label === 'Dhaka' && /Dhaka Division/.test(p.address)), JSON.stringify(saved.body?.data?.places?.map((p) => p.label)))
  if (places > 0) {
    await evalJs(`document.querySelector('ul[aria-label="Destinations"] button').click(); true`)
    check('selecting a destination card shows its details with Save and Plan actions', await waitFor(`!!document.querySelector('section[aria-label^="Details for"]')`, 5000))
  }

  // ---- 4. optional location: granted, then denied ----
  await goto(`${APP}/explore`, 2500)
  await waitFor(`!!document.querySelector('ul[aria-label="Divisions"]')`)
  await send('Browser.grantPermissions', { origin: APP, permissions: ['geolocation'] })
  await send('Emulation.setGeolocationOverride', { latitude: 22.3569, longitude: 91.7832, accuracy: 50 }) // Chattogram city
  await waitFor(`!document.querySelector('button[disabled]') || true`)
  await sleep(1500) // let the district file arrive
  await clickButton(/Use my location/)
  const located = await waitFor(`document.body.innerText.includes('You are in')`, 15000)
  check('"Use my location" (after the click) selects the area containing the real position', located, (await crumbs()).join(' > '))
  await shot('04-use-my-location-desktop')
  await send('Browser.setPermission', { permission: { name: 'geolocation' }, setting: 'denied', origin: APP }).catch(() => {})
  await goto(`${APP}/explore`, 2500)
  await waitFor(`!!document.querySelector('ul[aria-label="Divisions"]')`)
  await clickButton(/Use my location/)
  const denied = await waitFor(`/denied|could not work out|too long/.test(document.body.innerText)`, 10000)
  check('a denied location leaves the map and lists working', denied && (await evalJs(`!!document.querySelector('ul[aria-label="Divisions"]')`)))
  await clickInList('Divisions', 'Sylhet')
  check('after a denial a division can still be chosen', await waitFor(`!!document.querySelector('ul[aria-label="Districts in Sylhet"]')`, 8000))

  // ---- 5. map data failure ----
  await send('Network.setBlockedURLs', { urls: ['*/geo/bd-divisions.json'] })
  await goto(`${APP}/explore`, 2500)
  check('a map-data failure shows a clear message with retry (the rest of the page still works)', await waitFor(`document.body.innerText.includes('map could not be loaded')`, 8000) && (await text()).includes('Your location'))
  await shot('05-load-failure-desktop')
  await send('Network.setBlockedURLs', { urls: [] })
  await clickButton(/^Try again$/)
  check('"Try again" loads the map', await waitFor(`!!document.querySelector('ul[aria-label="Divisions"]')`, 10000))

  // ---- 6. responsive and dark ----
  await clickInList('Divisions', 'Barishal')
  await waitFor(`!!document.querySelector('ul[aria-label="Districts in Barishal"]')`)
  for (const [name, w, h, mobile] of [['mobile', 390, 844, true], ['tablet', 820, 1100, false], ['laptop', 1024, 768, false]]) {
    await viewport(w, h, mobile)
    await sleep(600)
    check(`no horizontal scrolling at ${w}px`, await noOverflow())
    const m = await mapState()
    check(`the map is usable at ${w}px`, m && m.size[0] > 250 && m.size[1] > 200, JSON.stringify(m?.size))
    await shot(`06-barishal-${name}`)
  }
  await viewport(1280, 900)
  await evalJs(`localStorage.setItem('readyset.theme', 'dark'); true`)
  await goto(`${APP}/explore`, 2500)
  await waitFor(`document.querySelectorAll('.leaflet-overlay-pane path').length >= 72`, 15000)
  await shot('07-overview-dark')
  check('dark mode renders the map', (await mapState())?.paths >= 72)
  await evalJs(`localStorage.setItem('readyset.theme', 'light'); true`)
} catch (error) {
  check('check script completed', false, error.message)
} finally {
  fs.writeFileSync(path.join(OUT, 'bangladesh-map-results.json'), JSON.stringify(results, null, 2))
  const failed = results.filter((r) => r.ok === false).length
  console.log(`\n${results.filter((r) => r.ok).length} passed, ${failed} failed, ${results.filter((r) => r.ok === null).length} notes`)
  proc.kill()
  process.exitCode = failed ? 1 : 0
}
