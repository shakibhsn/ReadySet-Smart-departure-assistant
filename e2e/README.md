# Browser checks (real browser, real providers)

Two scripts drive Microsoft Edge (headless, through the DevTools protocol: no extra dependencies, Node 22+ for the built-in WebSocket)
against a **production build** of the frontend and an API running on the **test database**. They create throwaway
`@readyset.test` users through the real API and print PASS / FAIL / NOTE per check. They never touch the development database.

| Script | Covers |
|---|---|
| `explore-browser-check.mjs` | Weather & Explore: lazy loading, location search (real Open-Meteo), weather card, units, **Leaflet map and OSM tiles**, destinations (real Overpass), details/save/plan links, dashboard sections, phone/tablet layout (no horizontal scroll), dark theme, contrast, current location (denied / granted) |
| `bangladesh-map-browser-check.mjs` | Bangladesh map: 8 divisions + 64 district boundaries, map clicks, division/district/upazila navigation, lazy boundary files, no location request on load, "Use my location" (granted/denied), save/plan actions, load failure + retry, responsive, dark |
| `pwa-offline-browser-check.mjs` | Manifest and installability, service worker, offline reload, offline checklist ticks, reconnect sync without duplicates, sync conflict, account switching and logout purge, responsive screenshots |

## Run (three terminals, from the repository root)
```bash
# 1. build the frontend pointing at the test API port, serve it on the port the API allows (CORS = FRONTEND_URL)
VITE_API_BASE_URL=http://localhost:4101/api npx vite build --outDir /tmp/rs-e2e-dist --emptyOutDir
npx vite preview --outDir /tmp/rs-e2e-dist --port 4173 --strictPort
# 2. the API on the TEST database, on a port that is free on your machine
cd backend && PORT=4101 NODE_ENV=test FRONTEND_URL=http://localhost:4173 node src/server.js
# 3. the checks (the output folder receives screenshots and a results JSON file)
mkdir -p /tmp/rs-shots
node e2e/explore-browser-check.mjs /tmp/rs-shots
node e2e/bangladesh-map-browser-check.mjs /tmp/rs-shots
node e2e/pwa-offline-browser-check.mjs /tmp/rs-shots
```
Optional arguments: `<apiBase> <appBase> <edgePath>`. Use another Chromium-based browser by passing its path.

## Notes
- The Explore check calls the **public** Overpass servers. They are shared and sometimes slow or down; the check then reports a NOTE ("no places returned") instead of failing, because the application correctly shows an error with "Try again". Re-run later, or set `OVERPASS_URL` to your own instance.
- The checks need internet access (Open-Meteo, Overpass and OpenStreetMap tiles).
- Port 4001 is not used on purpose: another project on the same machine may own it.
