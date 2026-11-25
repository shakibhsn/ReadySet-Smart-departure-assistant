// Browser checks for the PWA, offline mode, reconnect sync, account switching and responsive layouts, against a PRODUCTION build and the TEST database API.
// usage: node pwa-offline-browser-check.mjs <outputDir> [apiBase] [appBase] [edgePath]
// Uses Edge in headless mode through the DevTools protocol (no extra dependencies).
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const EDGE = process.argv[5] ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const APP = process.argv[4] ?? 'http://localhost:4173'
const API = process.argv[3] ?? 'http://localhost:4101/api'
const OUT = process.argv[2]
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(pathname, { method = 'GET', token, body } = {}) {
  const res = await fetch(API + pathname, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, body: await res.json().catch(() => null) }
}
async function register(tag) {
  const email = `e2e-${tag}-${Date.now()}@readyset.test`
  const r = await api('/auth/register', { method: 'POST', body: { name: `E2E ${tag}`, email, password: 'Sup3rSecret!', confirmPassword: 'Sup3rSecret!' } })
  return { token: r.body.data.token, user: r.body.data.user }
}
const local = (m) => { const d = new Date(Date.now() + m * 60000 + 6 * 3600000); return d.toISOString().slice(0, 16) } // Asia/Dhaka wall time
const mkEvent = (token, over) => api('/events', { method: 'POST', token, body: { title: 'Event', category: 'office', startAt: local(180), timezone: 'Asia/Dhaka', destination: 'Gulshan', travelDurationMinutes: 30, preparationMinutes: 40, arrivalBufferMinutes: 10, ...over } })

// ---- minimal CDP client ----
async function launch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-edge-'))
  const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-port=9335', `--user-data-dir=${dir}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
  for (let i = 0; i < 40; i++) {
    try {
      const targets = await (await fetch('http://127.0.0.1:9335/json')).json()
      const page = targets.find((t) => t.type === 'page')
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
    else listeners.forEach((l) => l(msg))
  }
  const opened = new Promise((r) => (ws.onopen = r))
  const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })) })
  return { opened, send, on: (fn) => listeners.push(fn), close: () => ws.close() }
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
const goto = async (url) => { await send('Page.navigate', { url }); await sleep(1800) }
const waitFor = async (expr, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await evalJs(expr)) return true } catch { /* page navigating */ } await sleep(300) } return false }
const shot = async (name) => { const { data } = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64')) }
const viewport = (w, h, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile })
const scheme = (value) => send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] })
const setOffline = (offline) => send('Network.emulateNetworkConditions', { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
const login = async (token) => { await goto(`${APP}/login`); await evalJs(`sessionStorage.setItem('readyset.token', ${JSON.stringify(token)}); localStorage.removeItem('readyset.token'); true`) }
const idbDump = () => evalJs(`new Promise((res) => { const r = indexedDB.open('readyset-offline'); r.onerror = () => res(null); r.onsuccess = () => { const db = r.result; const out = {}; let left = db.objectStoreNames.length; if (!left) return res(out); for (const n of db.objectStoreNames) { const q = db.transaction(n).objectStore(n).getAll(); q.onsuccess = () => { out[n] = q.result; if (--left === 0) res(out) } } } })`)

try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')

  // ---- data (TEST database only, throwaway @readyset.test users) ----
  const a = await register('a')
  const b = await register('b')
  await api('/users/me/preferences', { method: 'PATCH', token: a.token, body: { timezone: 'Asia/Dhaka' } })
  const lecture = (await mkEvent(a.token, { title: 'Algorithms lecture', category: 'university', startAt: local(180), durationMinutes: 120 })).body.data.event
  await mkEvent(a.token, { title: 'Team meeting', category: 'office', startAt: local(240) }) // overlaps the lecture -> conflict
  await mkEvent(a.token, { title: 'Gym session', category: 'gym', startAt: local(1500) })
  const items = []
  for (const text of ['Laptop', 'Charger', 'Notebook']) items.push((await api(`/events/${lecture.id}/checklist`, { method: 'POST', token: a.token, body: { text } })).body.data.item)
  await mkEvent(b.token, { title: 'Other user private event' })
  check('test data created through the real API', Boolean(lecture?.id) && items.length === 3)

  // ---- installability ----
  await viewport(1280, 800)
  await goto(`${APP}/login`)
  const manifest = await send('Page.getAppManifest')
  check('manifest loads with no errors', (manifest.errors ?? []).length === 0, JSON.stringify(manifest.errors ?? []))
  check('manifest parsed fields', manifest.url?.endsWith('/manifest.webmanifest') && JSON.parse(manifest.data).short_name === 'ReadySet')
  const install = await send('Page.getInstallabilityErrors')
  check('installability errors', (install.installabilityErrors ?? []).length === 0, JSON.stringify((install.installabilityErrors ?? []).map((e) => e.errorId)))
  const swReady = await waitFor(`navigator.serviceWorker.ready.then(r => r.active && r.active.state === 'activated')`)
  check('service worker registered and activated', swReady)
  await sleep(1500)
  await shot('01-login-desktop')

  // ---- sign in as user A, snapshot gets saved ----
  await login(a.token)
  await goto(`${APP}/`)
  await waitFor(`document.body.innerText.includes('Algorithms lecture') || document.body.innerText.includes('Dashboard')`)
  await goto(`${APP}/checklist`)
  await waitFor(`document.body.innerText.includes('Laptop')`)
  await sleep(9000) // let the offline snapshot finish
  const dump1 = await idbDump()
  check('offline snapshot saved for user A (events + checklist)', Boolean(dump1?.events?.length) && Boolean(dump1?.checklists?.length) && dump1.session?.[0]?.userId === a.user.id, `events=${dump1?.events?.length} checklists=${dump1?.checklists?.length}`)
  check('no auth token or password stored in the offline database', !/token|password|eyJ/i.test(JSON.stringify(dump1)))
  const cacheKeys = await evalJs(`caches.keys().then(async ks => { const out = []; for (const k of ks) { const c = await caches.open(k); out.push(...(await c.keys()).map(r => r.url)) } return out })`)
  check('service worker caches contain no API URLs', cacheKeys.length > 0 && !cacheKeys.some((u) => u.includes('/api/') || u.includes(':4101')), `${cacheKeys.length} cached files`)

  // ---- screenshots: responsive + themes ----
  for (const [label, w, h, mobile] of [['desktop', 1280, 800, false], ['tablet', 820, 1100, false], ['mobile', 390, 844, true]]) {
    await viewport(w, h, mobile)
    for (const [route, name] of [['/week', 'week'], ['/analytics', 'analytics'], ['/assistant', 'assistant'], ['/notifications', 'notifications']]) {
      await goto(`${APP}${route}`); await sleep(1200); await shot(`${name}-${label}`)
    }
  }
  await viewport(1280, 800)
  await scheme('dark'); await goto(`${APP}/week`); await sleep(1000); await shot('week-dark'); await scheme('light')

  // ---- assistant, live (rules-based: no key configured) ----
  await goto(`${APP}/assistant`)
  await evalJs(`(() => { const i = document.querySelector('input[placeholder^="Ask"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Do I have any schedule conflicts today?'); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
  await evalJs(`[...document.querySelectorAll('button')].find(b => /Ask/.test(b.textContent)).click()`)
  const answered = await waitFor(`document.body.innerText.includes('Rules-based answer')`)
  await sleep(500); await shot('assistant-answer')
  check('assistant answers from real data, labelled rules-based', answered)

  // ---- offline: reload with the network off ----
  await goto(`${APP}/checklist`)
  await waitFor(`document.body.innerText.includes('Laptop')`)
  await setOffline(true)
  await send('Page.reload'); await sleep(3000)
  const offlineLoaded = await waitFor(`document.body.innerText.includes('You are offline')`, 20000)
  check('app shell opens offline (service worker) and shows the offline banner', offlineLoaded)
  const sawChecklist = await waitFor(`document.body.innerText.includes('Laptop') && document.body.innerText.includes('Charger')`, 20000)
  check('saved checklist is readable offline', sawChecklist)
  await shot('offline-checklist')

  // tick an item offline
  await evalJs(`(() => { const box = [...document.querySelectorAll('input[type=checkbox], [role=checkbox]')][0]; box.click(); return true })()`)
  await sleep(1200)
  const dump2 = await idbDump()
  check('offline tick is queued exactly once on the device', dump2?.queue?.length === 1 && dump2.queue[0].userId === a.user.id, JSON.stringify(dump2?.queue?.map((q) => ({ done: q.done }))))
  const serverBefore = (await api(`/events/${lecture.id}/checklist`, { token: a.token })).body.data.items.map((i) => i.done)
  check('server is unchanged while offline', serverBefore.every((d) => d === false))
  await shot('offline-queued')

  // ---- reconnect: replays once ----
  await setOffline(false)
  const synced = await waitFor(`!document.body.innerText.includes('You are offline')`, 20000)
  await sleep(6000)
  const serverAfter = (await api(`/events/${lecture.id}/checklist`, { token: a.token })).body.data.items
  check('after reconnect the tick reached the server', serverAfter.filter((i) => i.done).length === 1, `online=${synced}`)
  const dump3 = await idbDump()
  check('queue is empty after sync (no duplicate replay)', (dump3?.queue ?? []).length === 0)
  await shot('after-reconnect')

  // ---- conflict: offline tick vs a newer change made elsewhere ----
  await goto(`${APP}/checklist`); await waitFor(`document.body.innerText.includes('Charger')`); await sleep(3000)
  await setOffline(true); await send('Page.reload'); await sleep(2500)
  await waitFor(`document.body.innerText.includes('You are offline')`, 20000)
  const target = serverAfter.find((i) => !i.done)
  const boxes = await evalJs(`[...document.querySelectorAll('input[type=checkbox], [role=checkbox]')].length`)
  await evalJs(`(() => { const boxes = [...document.querySelectorAll('input[type=checkbox], [role=checkbox]')]; const unchecked = boxes.find(b => !(b.checked || b.getAttribute('aria-checked') === 'true')); unchecked.click(); return true })()`)
  await sleep(800)
  // "another device": tick and untick the same item on the server (state differs from the offline wish? it ends unticked while offline wants ticked)
  await api(`/events/${lecture.id}/checklist/${target.id}/completion`, { method: 'PATCH', token: a.token, body: { done: true } })
  await sleep(50)
  await api(`/events/${lecture.id}/checklist/${target.id}/completion`, { method: 'PATCH', token: a.token, body: { done: false } })
  await setOffline(false)
  const conflictShown = await waitFor(`document.body.innerText.includes('Some offline changes were not applied')`, 25000)
  await shot('offline-conflict')
  const finalItem = (await api(`/events/${lecture.id}/checklist`, { token: a.token })).body.data.items.find((i) => i.id === target.id)
  check('a conflicting offline edit is NOT forced through and the user is told', conflictShown && finalItem.done === false, `boxes=${boxes}`)

  // ---- account switching and logout ----
  await login(b.token)
  await goto(`${APP}/`); await sleep(5000)
  const dump4 = await idbDump()
  check('switching to user B purged every record of user A', !JSON.stringify(dump4).includes(a.user.id) && !JSON.stringify(dump4).includes('Algorithms lecture'), `session=${dump4?.session?.[0]?.userId === b.user.id ? 'B' : 'other'}`)
  await shot('user-b-dashboard')
  await evalJs(`[...document.querySelectorAll('button')].find(x => /Log out/.test(x.textContent)).click()`)
  await sleep(2500)
  const dump5 = await idbDump()
  const empty = Object.values(dump5 ?? {}).every((v) => v.length === 0)
  check('explicit logout removes all offline data from the device', empty, JSON.stringify(Object.fromEntries(Object.entries(dump5 ?? {}).map(([k, v]) => [k, v.length]))))
} catch (err) {
  check('script completed without errors', false, err.message)
} finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
  cdp.close(); proc.kill()
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`)
}
