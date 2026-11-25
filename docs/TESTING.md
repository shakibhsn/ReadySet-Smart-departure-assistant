# Testing ReadySet

Everything below runs from the repository root. Database tests use **only** `readyset_isolated_test` (never the development database, never another project).

## Commands
| Command | What it runs |
|---|---|
| `npm test` | Frontend: Vitest + Testing Library in jsdom, with a stateful fake API (`src/test/fakeApi.js`) |
| `npm --prefix backend run test:pure` | Backend tests that need **no database** (rules, helpers, providers with simulated replies) |
| `npm --prefix backend test` | Backend: every test file on the real `readyset_isolated_test` database through Supertest. One process per file; a file is re-run only if the Windows Vitest *worker* crashed (never for a real failure) |
| `npm run lint` | ESLint (frontend and backend) |
| `npm run build` | Production build (check the chunk sizes it prints) |
| `node e2e/*.mjs` | Real-browser checks: see `e2e/README.md` |

## What exists (latest full run)
| Suite | Result |
|---|---|
| Frontend (`npm test`) | 377 tests, 24 files (3 consecutive full runs) |
| Backend pure (`test:pure`) | 242 tests, 12 files |
| Backend with database (`npm --prefix backend test`) | 691 tests, 31 files (3 files needed one automatic re-run for the known Windows worker crash) |
| Lint / build | clean / passes (main chunk about 690 kB / 204 kB gzip, Explore page 169 kB loaded only when opened) |

Coverage by area: authentication and per-user isolation; events, recurrence, exceptions, templates; the departure engine; conflicts (including priority ordering); checklist, packing, saved places; email; notifications (priority, snooze, dedupe, reminder timing); preparation profile (tap-to-log, percentiles, overrides, erase); analytics and weekly planner; the AI assistant (routing, injection, provider failure, signed confirmation tokens); PWA manifest and service worker rules; offline store, sync queue, user isolation of background work; Weather & Explore (provider mapping, caching, stale fallback, validation, rate limit, privacy of provider requests, location persistence, search, weather card, destinations, recommendation rules, map).

## Real-browser checks (`e2e/`)
Run against a production build, the test database and the real providers. Last results:
- **PWA / offline** (`pwa-offline-browser-check.mjs`): 18 of 18 passed (installable manifest, service worker, offline reload, offline tick, reconnect sync without duplicates, conflict handling, account switching and logout purge).
- **After the purple/lime redesign** both scripts were re-run on the new build: Weather & Explore 32 of 32 (same two NOTEs), PWA/offline 18 of 18.
- **Weather & Explore** (`explore-browser-check.mjs`): 32 of 32 passed, with two NOTEs: live nearby places could not be returned because every public Overpass server was down or very slow that day (the application showed its error state with "Try again", and the map and weather still worked), and the small touch targets reported were Leaflet's own attribution links. Verified live: lazy loading, real Open-Meteo search and forecast, Leaflet with 15 of 15 OpenStreetMap tiles loaded, dashboard sections, no horizontal scrolling at 820 and 390 px, dark theme (no text under 3:1 contrast on Explore), current location denied and granted.
- **Still to confirm when a public Overpass server is healthy (or with your own `OVERPASS_URL`):** live nearby places, details, "Save to my places", and "Plan a departure here". They are covered by unit and integration tests and by one real Overpass response used to check the mapping, but not yet seen end to end in a browser.

## Rules that keep the suite reliable
- **Tests never reach a real server.** `vite.config.js` points `VITE_API_BASE_URL` at a refused port during tests. (Without this, a late request that outlived its test hit a running development API, got a real 401 for the fake token, and logged the *next* test out: random failures in unrelated files.)
- **Background work is cancelled per user.** The offline provider checks, before every request and every save, that it is still the signed-in user's work (`src/components/common/OfflineProvider.jsx`, tested in `src/test/offlineIsolation.test.jsx`).
- Frontend tests run on at most 4 workers with a 10 s wait and a 30 s test limit: the screens render a ~430-option timezone list inside jsdom, and running every file at once on a busy Windows machine starved them.
- Database tests only delete rows of `@readyset.test` users.

## Known test-environment flakes (not application bugs)
- **Windows Vitest worker crash** (exit code `3221226505`) on database tests; handled by `backend/scripts/run-tests.mjs` (see README §6).
- **Computer sleep during a run**: timers jump by hours and tests "time out" at once. Re-run.
- **Public providers** (Open-Meteo, Overpass, OpenStreetMap tiles) are used only by the browser checks, never by `npm test`.

## Manual smoke test of a release
1. `npm run lint && npm test && npm --prefix backend run test:pure && npm --prefix backend test && npm run build`.
2. Start the API and the frontend, sign in with a throwaway account, create an event, open Weather & Explore, choose a place, tick a checklist item, open Analytics and the Weekly Planner.
3. Run the browser checks in `e2e/` when you changed the UI, offline mode or Explore.
