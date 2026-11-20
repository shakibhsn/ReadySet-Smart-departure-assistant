# ReadySet — Smart Departure Assistant

> **Don't rush. Be ready.**

ReadySet works backwards from an event to tell you when to start preparing and when to leave.

**Status:** events (Day 3), a transactional **email system** (§10) and the **Smart Departure Engine** (§9: formulas, timezone-safe calculation, live status/countdown).
Events live in PostgreSQL. Checklists, notifications and weather are still temporary/mock data (see §8).

```
frontend (repo root)   React 19 · Vite · Tailwind v4 · React Router · date-fns      http://localhost:5173
backend/               Express 5 · Prisma 6 · PostgreSQL · JWT · bcrypt · Zod        http://localhost:5174
```

## 1. First-time setup

### 1a. Install dependencies
```bash
npm install            # frontend
npm run setup:api      # backend (runs npm install inside backend/)
```
### 1b. Create the isolated PostgreSQL environment for ReadySet

ReadySet must **never** share a database or role with another project. It uses its own resources: role `readyset_isolated_app` and databases `readyset_isolated_dev`, `readyset_isolated_test`, `readyset_isolated_shadow`. Older `readyset_app` / `readyset_dev` / `readyset_test` objects are never touched.

**Option A (script):** `npm run db:setup` (root or `backend/`, in a real terminal). It asks for your PostgreSQL administrator (`postgres`) password (hidden), inspects all four names read-only and **stops if any exists**. Otherwise it creates the role and databases, sets the privileges below, verifies ownership, writes only `DATABASE_URL` + `SHADOW_DATABASE_URL` in `backend/.env` and `DATABASE_URL` in `backend/.env.test` (both gitignored), then runs `prisma migrate deploy` per database with explicit, validated URLs. Each run writes a scrubbed `backend/.db-setup.log`.

**Option B (pgAdmin):** pgAdmin may or may not still be authenticated, and a password saved in pgAdmin cannot be viewed or recovered. Open a server entry whose role is the administrator (e.g. `postgres`). If pgAdmin asks for the password, you need the real administrator password; without it nothing here can proceed. Do not change PostgreSQL authentication settings to get around this: if the password is truly lost, resetting it is a deliberate administrator action for your own PostgreSQL installation (see the PostgreSQL documentation on `pg_hba.conf`), and it affects every project on that server, so ReadySet's scripts never do it. Once connected, run [`backend/scripts/setup-local-db.sql`](backend/scripts/setup-local-db.sql) step by step (step 0 must return no rows), put the matching URLs in `backend/.env` (dev + shadow) and `backend/.env.test` (test), then run `npm --prefix backend run db:deploy` and `npm --prefix backend run db:migrate:test`.

**Privileges.** The role is `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT` and owns only the three databases. On each: `REVOKE ALL ON DATABASE … FROM PUBLIC`, `GRANT CONNECT, TEMPORARY … TO readyset_isolated_app`, then inside the database `REVOKE ALL ON SCHEMA public FROM PUBLIC` and `GRANT USAGE, CREATE ON SCHEMA public TO readyset_isolated_app`.
`REVOKE … FROM PUBLIC` *does* stop ordinary roles from connecting to or creating objects in these databases. It does *not* stop superusers (e.g. `postgres`), roles with the `BYPASSRLS`/owner-like rights, or roles that were explicitly granted access; it does not affect other databases; and it does not hide the databases' names from `\l`.

**Shadow database (development only).** `prisma migrate dev` needs a scratch database (Prisma 6.19.3: `shadowDatabaseUrl = env("SHADOW_DATABASE_URL")` in the `datasource` block). With it set, `migrate dev` uses only `readyset_isolated_dev` and `readyset_isolated_shadow`, and **resets the shadow database**, so it must target exactly `readyset_isolated_shadow` on the same server. `SHADOW_DATABASE_URL` lives only in `backend/.env`; the API does not read it, `.env.test` does not need it (`migrate deploy` never uses a shadow database), and in production the API **refuses to start** if it is set. Never put it in deployment configuration. If `db:migrate:test` ever complains that it is missing, add it to `.env.test` manually.
**Runtime isolation (API and tests).** `backend/src/config/env.js` validates the resolved `DATABASE_URL` before anything can open a database connection: in development it must be exactly `readyset_isolated_dev`, in tests exactly `readyset_isolated_test` (a database merely named `*_test` is refused), user `readyset_isolated_app`, local allowlisted host/port. If `DATABASE_URL` is also set in your terminal/environment and differs from the env file, the API and tests **refuse to start** instead of silently choosing one (unset the variable). `SHADOW_DATABASE_URL`, if present, must be exactly `readyset_isolated_shadow`; `DIRECT_URL` / `TEST_DATABASE_URL` are refused because ReadySet does not use them. Production is exempt from the exact-name rule (its database is deployment-specific) but still refuses a leaked `SHADOW_DATABASE_URL`. Until the isolated setup is done, an existing `.env` with the old names makes the API refuse to start, by design.
**Server allowlist.** Setup and migrations only talk to a local PostgreSQL: host `localhost` or `127.0.0.1`, port `5432` or `5433` (`ALLOWED_HOSTS` / `ALLOWED_PORTS` in `backend/scripts/dbGuard.mjs`). `PGHOST` / `PGPORT` are read by the setup script, but any other value makes it stop **before** the password prompt or any SQL; other `PG*` variables (e.g. `PGHOSTADDR`, `PGSERVICE`) are never passed to `psql`. There is no fallback to another server.

**Your existing env files.** Before changing `backend/.env` / `.env.test`, `npm run db:setup` saves copies as `.env.backup-<timestamp>` (gitignored, they contain the OLD credentials: keep them private or delete them after checking). Only the `DATABASE_URL` / `SHADOW_DATABASE_URL` lines are replaced, and only after the new role and databases were created and verified. Open both files afterwards and confirm the URLs point at `readyset_isolated_*`.

**Guarded migrations.** `npm run db:migrate` (migrate dev), `db:deploy` and `db:migrate:test` run through `backend/scripts/prisma-safe.mjs`, which re-reads `backend/.env` / `.env.test` on every run and refuses (running nothing, correcting nothing, printing no URL) unless every URL has the right protocol, local host, explicit port, user `readyset_isolated_app` and exact database (dev / test / shadow). Inherited `DATABASE_URL`/`PG*` variables are ignored. Only `dev` and `deploy` are possible; there is no reset or db push. Database-free tests: `npm --prefix backend run test:pure`.

**Partial-failure recovery (nothing is ever dropped automatically).** If setup stops after creating something, the log and summary list what exists. Then:
1. Inspect in pgAdmin/psql (read-only): `select rolname from pg_roles where rolname = 'readyset_isolated_app';` and `select datname, pg_get_userbyid(datdba) from pg_database where datname like 'readyset_isolated_%';`.
2. If everything that exists is owned by `readyset_isolated_app` and was clearly created by the failed run, finish the missing steps manually using `setup-local-db.sql` (skip statements for objects that exist) and set the URLs in the env files yourself. If the role password was lost, an administrator can set a new one for that role only: `ALTER ROLE readyset_isolated_app PASSWORD '…'` (run by you, never by the script).
3. Only you may decide to remove leftover isolated objects, manually, after confirming the name and owner. The script never does.
4. Re-running `npm run db:setup` while any isolated name exists will stop immediately by design.
### 1c. Create the real `.env` files (never committed)
```powershell
Copy-Item backend\.env.example      backend\.env
Copy-Item backend\.env.test.example backend\.env.test
Copy-Item .env.example              .env.local      # frontend; no secrets in it
```
Edit `backend/.env`:
- `DATABASE_URL` → `postgresql://readyset_isolated_app:CHOOSE_A_PASSWORD@localhost:5432/readyset_isolated_dev?schema=public` (special characters in the password must be URL-encoded).
- `JWT_SECRET` → at least 32 random characters:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- `FRONTEND_URL=http://localhost:5173` (the only origin CORS will allow).

Edit `backend/.env.test` so `DATABASE_URL` points at `readyset_isolated_test`. The backend **refuses to run tests** unless the database name ends in `_test`.

The server validates all variables at startup and prints which ones are missing/invalid (never their values).

### 1d. Create the tables
```bash
npm run db:generate    # generate Prisma Client
npm run db:migrate     # applies every migration in prisma/migrations (init, add_token_version, add_events_and_recurrence, add_email_system) to readyset_isolated_dev
npm --prefix backend run db:migrate:test   # applies the same migration to readyset_isolated_test
```
`migrate dev` applies the checked-in migrations to the empty `readyset_isolated_dev`. Port 5174 is used for the API because 4000 is commonly taken by other local projects. (Vite also falls back to 5174 when 5173 is busy: if you start a second frontend dev server, stop it or pass `--port` so it does not collide with the API.) Never run `prisma migrate reset` or `db push --force-reset` on a database you care about.

## 2. Running (two terminals)
```bash
npm run dev:api        # terminal 1 → http://localhost:5174  (GET /api/health)
npm run dev            # terminal 2 → http://localhost:5173
```

## 3. Commands
| Command | What it does |
|---|---|
| `npm run dev` / `npm run build` | Frontend dev server / production build |
| `npm run dev:api` | Backend with auto-reload |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:migrate` | Apply/create migrations on the **dev** database |
| `npm --prefix backend run db:migrate:test` | Apply migrations on the **test** database |
| `npm run test` | Frontend tests (Vitest + Testing Library, mocked `fetch`) |
| `npm run test:api` | Backend tests (Vitest + Supertest, real `readyset_isolated_test` DB). Uses `backend/scripts/run-tests.mjs`, which re-runs the suite only if the Vitest *worker process* crashes (see §6); real test failures are never retried. `npm --prefix backend run test:raw` runs plain Vitest. |
| `npm run lint` | ESLint for frontend and backend |

## 4. API
All responses: `{ success, message, data }` or `{ success: false, message, errors: [{ field, message }] }`.

| Method & path | Auth | Notes |
|---|---|---|
| `POST /api/auth/register` | – | `name, email, password, confirmPassword` → 201 `{ user, token }`; 409 duplicate email |
| `POST /api/auth/login` | – | `email, password` → 200 `{ user, token }`; 401 generic "Invalid email or password" |
| `GET /api/auth/me` | Bearer | user + preferences |
| `POST /api/auth/logout` | Bearer | Revokes every token issued so far for the account (see §5) |
| Departure engine: `GET /api/events/:id/departure-plan`, `POST /api/departure/preview`, `GET /api/departure/today`, `GET /api/departure/upcoming` | Bearer | see §9 |
| Email endpoints (verify, resend, forgot/reset password, email change, email preferences) | see §10 | |
| `GET / PATCH /api/users/me` | Bearer | PATCH accepts `name` only |
| `GET / PATCH /api/users/me/preferences` | Bearer | `defaultPreparationMinutes` (0–600), `defaultArrivalBufferMinutes` (0–240), `preferredTravelMode` (`manual\|walk\|transit\|drive\|bike`), `timezone` (IANA) |
| `POST /api/events` | Bearer | Create (201). `userId` is never accepted; it comes from the JWT |
| `GET /api/events` | Bearer | List: `page`, `limit` (≤100), `category`, `from`, `to`, `sort` (`startAt`, `-startAt`, `createdAt`, `-createdAt`) → `{ events, pagination: { page, limit, total, totalPages } }` |
| `GET /api/events/upcoming` | Bearer | Future occurrences, earliest first, `limit` ≤ 50 (recurring events expanded, 90-day horizon) |
| `GET /api/events/occurrences` | Bearer | `from`, `to` (required, ≤ 93 days), optional `category`: every occurrence in the range, recurring series expanded |
| `GET / PATCH / DELETE /api/events/:id` | Bearer | 404 when the event does not exist **or belongs to someone else** (identical response); 400 for a malformed id |
| `GET /api/health` | – | liveness |

## 5. Security notes
- **Passwords**: bcrypt (cost 12, configurable via `BCRYPT_ROUNDS`), 8–72 characters; hashes are never returned. Login does a dummy bcrypt compare for unknown emails so response time does not reveal which emails exist.
- **JWT**: HS256, payload is just `sub` (user id), expiry from `JWT_EXPIRES_IN`. Verified with the algorithm pinned (no `alg: none`). The user id always comes from the verified token, never from the request. Tokens are **not** stored in the database.
- **Validation**: Zod on every body; unknown fields are rejected (so `id`, `passwordHash`, `role`, `userId` can never be mass-assigned).
- **Hardening**: Helmet, CORS limited to `FRONTEND_URL`, 10 kB body limit, rate limit on login/register (20 per 15 min per IP), central error handler with no stack traces or DB details in responses, no password/token logging.
- **Logout revokes tokens on the server.** Each user row has a `tokenVersion` and every JWT carries the version it was issued with (`tv`). `POST /api/auth/logout` (authenticated) increments it, so **every token issued before logout — on every device — is rejected with 401** from then on. The auth middleware checks the version (one primary-key lookup per request) and also rejects tokens of deleted users. Trade-offs: logout signs the account out everywhere, and tokens are still plain JWTs until the next request hits the database. The browser also deletes its own copy (from both `sessionStorage` and `localStorage`). Rotate `JWT_SECRET` to invalidate all users at once.
- **Token storage (Bearer, chosen over cookies)**: the token lives in browser storage — `sessionStorage` by default (the "Remember me" box is **unticked** by default), `localStorage` only when "Remember me" is ticked. **This is exposed to XSS**: any script on the page can read it. It is *not* fully secure. Mitigations: short expiry, no `dangerouslySetInnerHTML`, no third-party scripts. An HttpOnly + Secure + SameSite cookie would be stronger but also needs CSRF protection and credentialed CORS; that is the recommended hardening before production. Cookie and Bearer auth are deliberately **not** mixed.
- Set `NODE_ENV=production`, a strong `JWT_SECRET`, HTTPS, and `trust proxy` (if behind a proxy) before deploying.

## 6. Testing
- **Backend** (`npm run test:api`): registration (valid, missing fields, bad email, weak password, mismatch, duplicate, hashed storage), login (valid, wrong password, unknown email, missing fields, 429 rate limit), JWT (missing/invalid/`alg:none`/expired/valid/deleted user), profile & preference validation, and **user A vs user B isolation**. Tests only delete rows with `@readyset.test` emails and only in a `*_test` database.
  Day 3 adds `tests/events.test.js` (80 API tests on a real PostgreSQL: validation matrix, CRUD, pagination with stable order, category/date filters, upcoming, occurrences, recurrence rule storage/replace/remove, cascade deletes, and two-user isolation for read/update/delete/upcoming) and `tests/recurrence.test.js` (12 pure tests: daily, weekly, intervals, end dates, no duplicates, DST, timezone parsing).
- **Frontend** (`npm test`, 100 tests): auth forms, protected routes, session restore, logout, `events.test.jsx` (stateful fake API: create/edit/delete, filters, pagination, empty/error/expired states, per-user state) `departure.test.jsx` + `departureStatus.test.js` (Next Departure card with fake timers: countdown without network calls, local status advance with a single refetch, late/arrival/started warnings, hidden-tab pause and instant catch-up, Planner timeline, debounced what-if preview that saves nothing, loading/error/empty states, Event Details plan), and `email.test.jsx` (verification banner and Settings status/resend, login `EMAIL_NOT_VERIFIED` notice, mandatory-verification registration, forgot-password and reset-password forms incl. loading/success/expired/used/invalid states, verify and confirm-email-change links submitted exactly once, email-preference switches incl. revert on failure, change-email form).
  The email system adds `tests/email.test.js` (registration email, verification/resend/forgot/reset/email-change flows, expired/reused tokens, rate limits, backward compatibility for pre-existing users, mandatory mode, preferences authorization/isolation), `tests/emailService.test.js` (retry/backoff/idempotency, duplicate guard, Resend error mapping, console mode, startup config failures, template escaping) and `tests/reminders.test.js` (departure maths and reminder/plan parity, timing/grace/preferences rules, sweep with dedupe, event edits/deletes, recurrence). **All use a mock mailbox: automated tests can never send real email** (`EMAIL_MODE=provider` is refused under `NODE_ENV=test`). Day 4 adds `tests/departure.test.js` (30 pure calculator/status/validation tests: the required examples, midnight rollover, other timezones, daylight saving, every status boundary, fallbacks) and `tests/departureApi.test.js` (44 API tests: ownership/isolation, exact plans, statuses, recurrence without duplicates, preview side-effects, fallbacks, validation, sorting, route order). 288 backend tests in total.
- **Known tooling flake (Windows):** the Vitest *worker process* sometimes dies with exit code `3221226505` (`0xC0000409`), at startup or mid-run, with no assertion failure. It only reproduced on database-backed tests, and it is **not** caused by the native `bcrypt` addon (swapping in pure-JS `bcryptjs` still crashed, 3 of 10 runs). The cause was not found. `backend/scripts/run-tests.mjs` runs each test **file** in its own Vitest process and re-runs only that file (max 3 attempts) when its worker crashed, prints a warning when it does, and never retries an actual test failure.

## 7. Structure
```
backend/
  prisma/            schema.prisma, migrations/
  scripts/           setup-local-db.sql
  src/               config/ controllers/ middleware/ routes/ schemas/ services/ utils/ app.js server.js
                     services/event.service.js (all event queries, always scoped by userId)
                     services/recurrence.service.js (pure occurrence calculation)
                     utils/timezone.js (local time <-> UTC conversion)
  tests/
src/                 (frontend)
  components/common/ AuthProvider, RouteGuards, EventsProvider, UserScopedAppState, Alert, ...
  components/events/ EventCard, EventForm (+ eventFormUtils.js), MonthCalendar, WeekView, ScheduleList
  hooks/             useEventQuery (fetch + refetch-on-change), useEvents (mutations, upcoming list)
  lib/               apiClient.js (single backend URL, error handling), tokenStorage.js
  services/          authApi.js, userApi.js, eventApi.js
  pages/events/      CreateEventPage, EditEventPage, EventDetailPage
```

## 8. Events (Day 3)

### Data model (migration `20261117000000_add_events_and_recurrence`, additive only)
| Table | Notes |
|---|---|
| `events` | `id` UUID, `user_id` → `users` (**ON DELETE CASCADE**), `title`, `category`, `start_at` (UTC instant of the first occurrence), `timezone` (IANA), `destination?`, `notes?`, `travel_duration_minutes`, `preparation_minutes`, `arrival_buffer_minutes`, `is_recurring`, `recurrence_rule_id?` (unique, → `recurrence_rules`, SET NULL), timestamps. Indexes: `(user_id, start_at)` and `(user_id, category)`. |
| `recurrence_rules` | `id`, `user_id` (cascade, so a deleted user can never leave orphan rules), `frequency` (`DAILY` \| `WEEKLY`), `interval`, `days_of_week` (ISO 1=Mon … 7=Sun, WEEKLY only), `ends_at?`, timestamps. |

`users` and `user_preferences` were not changed. Categories: `university, office, appointment, travel, personal, other`.

### How date-times travel (frontend ⇄ backend)
- **Sending:** the form sends the **local wall time the user typed** plus an IANA zone, e.g. `{ "startAt": "2026-11-20T10:00", "timezone": "Asia/Dhaka" }`. The server converts it to a UTC instant with Luxon, so neither the browser's nor the server's timezone is ever used. A string with `Z`/an offset (`2026-11-20T04:00:00Z`) is also accepted and is treated as an absolute instant. If `timezone` is omitted, the user's saved preference is used (default `Asia/Dhaka`).
- **Storing:** `start_at` is a UTC instant; the zone is stored separately, so the intended local time is never lost.
- **Receiving:** every event has `startAt` (UTC ISO) plus `localDate` (`yyyy-MM-dd`) and `localTime` (`HH:mm`) **already expressed in the event's own zone**. The UI displays those strings directly and only uses `startAt` for countdown maths; clock times on the Dashboard departure card are formatted with `Intl` in the event's zone.
- **Filters:** `from` / `to` accept `yyyy-MM-dd` (the whole local day in the user's saved timezone, or `?timezone=`) or an ISO instant. Both ends are inclusive.
- **Changing only the timezone** on an existing event keeps the same *local* wall time (10:00 stays 10:00) and recomputes the UTC instant. A local time that does not exist on a DST-gap day moves forward to the next valid time (Luxon behaviour).
- Edge cases covered by tests: UTC+6 and UTC−5 conversion, impossible dates (`2026-02-30`), and a daily series staying at 09:00 local across a DST change while the UTC hour shifts.

### Recurrence (DAILY / WEEKLY only)
- **Storage:** one event row + one rule row. **No occurrence rows are ever generated**, so a "daily forever" event costs two rows.
- **Calculation** (`recurrence.service.js`, pure and unit-tested): for a requested range, walk the *local calendar days* of the event's timezone starting at the event's first day. DAILY keeps a day when `daysSinceStart % interval === 0`; WEEKLY (weeks anchored on Monday) keeps it when `weekIndex % interval === 0` and the ISO weekday is in `daysOfWeek`. Each kept day gets the original local clock time in the original zone. Days come in strictly increasing order, so occurrences cannot be duplicated; a hard cap (500) and a 93-day range limit bound the work. The optional end date (`endsOn`, a local date) is **inclusive**.
- **Validation:** frequency ∈ {DAILY, WEEKLY}; interval 1–52; `daysOfWeek` only for WEEKLY, values 1–7, at least one; `endsOn` a real date and not before the event's start date; for WEEKLY the event's start weekday must be one of the chosen days (otherwise the first listed occurrence would not be the event itself). Unknown fields are rejected.
- **Updating:** `recurrence: {…}` adds or replaces the rule, `recurrence: null` removes it (rule row deleted), omitting it keeps it (and re-validates it if the start/timezone moved). Deleting an event deletes its rule in the same transaction.
- **Limitations:** no monthly/yearly patterns, no per-occurrence edits or exceptions ("skip this Monday"), editing a series always changes the whole series, and the list endpoint paginates *events* (one row per series) — use `/occurrences` for expanded calendar data.

### User isolation (IDOR protection)
Every event query in `event.service.js` filters by `userId` taken from the verified JWT (`req.userId`); an event id alone never grants access. Requests may not contain `userId` (unknown fields are rejected). Another user's event returns the same `404 Event not found` as a non-existent one, so ids cannot be probed. Updates and deletes use `where: { id, userId }`. Covered by two-user API tests (read, list, upcoming, occurrences, update, delete) and a two-browser end-to-end run.

### Frontend data flow
- Events come only from the API. `useEventQuery` fetches, keeps previous data while refetching, ignores stale responses, and refetches automatically after any create/update/delete (a shared version counter in `EventsProvider`). No state library was added.
- `UserScopedAppState` re-creates the event cache and the remaining temporary state when the signed-in user changes, so logout clears event data and a new login refetches.
- An expired/revoked token (401) on any request signs the user out and redirects to login.

### Still temporary (not in the database yet)
Checklists (keyed by real event id, in browser memory, reset on reload), notifications (mock seed), weather (mock placeholder), and the reminder/theme switches.

## 9. Smart Departure Engine

The calculation lives in the **backend** (`backend/src/services/departure/`) and is the single source of truth. The frontend shows the plans it returns and only re-derives the *visible countdown and status* from the returned timestamps.

### Formulas
```
targetArrival        = eventStart    − arrivalBufferMinutes
departureTime        = targetArrival − travelDurationMinutes
preparationStart     = departureTime − preparationMinutes
totalRequiredMinutes = preparationMinutes + travelDurationMinutes + arrivalBufferMinutes
```
Example: event 10:00 AM, travel 35, buffer 10, preparation 30 → prepare **8:45 AM**, leave **9:15 AM**, arrive by **9:50 AM**, event **10:00 AM** (75 minutes in total).

> Spec note: the second example in the original requirements (3:00 PM, travel 60, buffer 15, preparation 45 → "12:00 / 12:45 / 2:45 PM") is arithmetically inconsistent with these formulas. With travel 60 the result is **1:00 PM / 1:45 PM / 2:45 PM**; the listed times correspond to travel = 120. Both variants are covered by tests (`tests/departure.test.js`, Tests 2 and 2b).

### Architecture
| File | Responsibility |
|---|---|
| `departureCalculator.js` | **Pure.** Formulas, duration validation, fallbacks (`resolveDurations`, `resolveTimezone`), local presentation. No database, Express or clock |
| `departureStatus.js` | **Pure.** Status + explainable messages from the plan and an **injected `now`** |
| `departureValidation.js` | Zod schemas for the API (preview body, query strings) |
| `departurePlan.service.js` | Loads the user's real events (scoped by `userId`), builds the response shape, today/upcoming selection |
| `controllers/departure.controller.js`, `routes/departure.routes.js` | HTTP layer; clock is read once per request and passed down |

The reminder emails (`reminder.service.js`) call the same calculator, so there is exactly one implementation of the formulas. The Create/Edit event form's live preview also comes from the backend (`POST /departure/preview`, debounced, sent only when the input is valid, saves nothing), so every screen shows backend-calculated times in the event's own timezone.

### Timezone strategy
- All arithmetic uses **absolute instants** (UTC milliseconds). "35 minutes of travel" is 35 *elapsed* minutes, which stays correct across midnight and daylight-saving changes (tested for New York's spring-forward and fall-back).
- The event's **IANA timezone** is used only to *present* instants (`local.*` fields: `date`, `time`, `time12`, ISO with offset) and to find local-day boundaries. Calculations never use formatted strings, and a local time is never reinterpreted as UTC.
- Fallbacks: event timezone → user's saved timezone → `Asia/Dhaka` (the project default). Durations: explicit value → user preference → application default (30 min preparation, 10 min buffer). **Travel time has no fallback and is always required**: guessing it would make the plan misleading. Saved events are never overwritten.
- A milestone that lands on a different local day than the event is explained ("10:55 PM (the day before)").

### Status (derived only from the schedule and the current time)
| Status | When |
|---|---|
| `UPCOMING` | now < preparation start |
| `PREPARING` | preparation start ≤ now < departure time |
| `READY_TO_LEAVE` | departure time ≤ now < target arrival (the message says how late you are and what leaving now means) |
| `ARRIVAL_TARGET_PASSED` | target arrival ≤ now < event start |
| `EVENT_STARTED` | now ≥ event start (also used for events long in the past) |

Zero-length phases collapse (no preparation skips `PREPARING`; no buffer skips `ARRIVAL_TARGET_PASSED`). Countdown values are **never negative**. **`ON_THE_WAY` and `COMPLETED` are deliberately not implemented**: they need the user to say "I have left" / "done", and the app has no such action; time alone cannot prove either. There is also no cancelled/deleted-status field (deletes are hard deletes), so deleted events simply disappear.

### Endpoints (all require a Bearer token; user id always comes from the JWT)
| Endpoint | Behaviour |
|---|---|
| `GET /api/events/:id/departure-plan[?occurrence=ISO]` | Plan for one of **your** events (404 for missing or someone else's). Recurring events default to the next occurrence; `occurrence` selects an exact one (400 if it is not an occurrence) |
| `POST /api/departure/preview` | What-if calculation, **saves nothing**. Body: `startAt` (local `YYYY-MM-DDTHH:mm` in `timezone`, or an ISO instant), `travelDurationMinutes` (1–1440, required), optional `timezone`, `preparationMinutes`, `arrivalBufferMinutes` (0–1440; fall back as above). Unknown fields are rejected |
| `GET /api/departure/today[?timezone=]` | Plans relevant on the user's **local** day: the event starts today (or is running) and its preparation begins before today ends, so a 00:30 event whose preparation starts at 22:30 the evening before is included. Sorted by departure time |
| `GET /api/departure/upcoming?days=7&limit=20` | Upcoming occurrences (`days` 1–30, `limit` 1–100) sorted by **departure time**, recurring events expanded once per occurrence (no duplicates) |

Response (all timestamps are UTC ISO strings):
```json
{
  "event": { "id": "…", "title": "University Class", "startAt": "2026-11-20T04:00:00.000Z", "timezone": "Asia/Dhaka", "destination": "…", "isRecurring": false },
  "plan": { "preparationStart": "…02:45Z", "departureTime": "…03:15Z", "targetArrival": "…03:50Z", "eventStart": "…04:00Z" },
  "local": { "timezone": "Asia/Dhaka", "preparationStart": { "date": "2026-11-20", "time": "08:45", "time12": "8:45 AM", "iso": "…+06:00" }, "…": "…" },
  "durations": { "preparationMinutes": 30, "travelDurationMinutes": 35, "arrivalBufferMinutes": 10, "totalRequiredMinutes": 75 },
  "status": "UPCOMING",
  "readiness": { "message": "Preparation starts at 8:45 AM, in 3 h 15 min. …", "nextMilestone": { "key": "preparationStart", "label": "Preparation starts", "at": "…", "secondsUntil": 11700 }, "minutesPastDeparture": 0, "projectedArrival": "…" },
  "explanation": "Start preparing at 8:45 AM and leave at 9:15 AM to arrive 10 minutes before your event.",
  "calculatedAt": "…"
}
```
Internal fields (`userId`, rule ids) are never exposed. `/api/departure/*` is a separate router, and `/:id/departure-plan` is declared with the other fixed event paths, so nothing conflicts with the existing dynamic routes.

### Frontend behaviour
- **Dashboard** Next Departure card: next plan by departure time, times in the event's timezone, status badge, countdown to the next milestone, explanation, late/started warnings, **View Departure Plan** CTA; empty state with *Create event*; loading and error states with retry.
- **Departure Planner**: pick a saved event (or `?event=`), see the backend plan, formula cards and a 4-step **timeline**; change travel / preparation / buffer for a **what-if preview** (debounced, one request per settled input, clearly labelled "Preview only", never saved, with *Reset to saved values*); "Custom plan" mode for any date/time/timezone.
- **Event details**: *View Departure Plan* action and the plan for the event's saved values.
- **Countdown**: computed from the plan's timestamps with one 1-second timer (`useNow`), **no per-second API calls**, paused while the tab is hidden and corrected instantly when it becomes visible. When the derived status moves past the server's, the plan is refetched **once**; creating/editing/deleting events refetches plans automatically.

### Limitations
No live traffic, weather, maps or GPS (later milestones). Plans use the saved travel time as a fixed estimate. The message wording is generated by the server at `calculatedAt`; between refetches the UI shows generic wording for a new status. No cancelled / completed / departed states (see above).

## 10. Email system

### Architecture
```
controllers / services (auth, accountEmail, reminder)         <- business logic never imports a provider SDK
        │  queueEmail({ type, to, template, dedupeKey })
        ▼
services/email/emailService.js   logging (email_logs), bounded retries, idempotency key, duplicate guard
        │  provider.send({ to, from, subject, html, text, idempotencyKey })
        ▼
providers.js ──► resendProvider.js   (EMAIL_MODE=provider, EMAIL_PROVIDER=resend)
             └─► consoleProvider.js  (EMAIL_MODE=console, nothing leaves your machine)
templates/  baseTemplate + verify / reset / password-changed / email-change / event-reminder (HTML + plain text)
```
- **Emails are queued, never awaited in the request**, so a provider outage cannot fail registration/login, and response time does not reveal whether an address exists. `sendEmail` never throws. (Limitation: the queue is in-process memory; an email queued at the instant the server is killed is lost. The `email_logs` row shows it as `PENDING`.)
- **Nothing is claimed about delivery.** Status `ACCEPTED` in `email_logs` means *the provider accepted the message*. Inbox delivery, bounces and spam complaints are not tracked: webhooks are **not implemented**. If you add Resend webhooks later, verify the signature of every event before trusting it.

### Single-use tokens (`auth_tokens`)
Verification, password-reset and email-change links use 256-bit random tokens. **Only the SHA-256 hash is stored**; the plaintext exists only in the email link. A token is consumed with an atomic conditional update, so two simultaneous requests cannot both succeed. Errors carry a `code` the UI uses: `INVALID_TOKEN`, `TOKEN_EXPIRED`, `TOKEN_USED`. Lifetimes: verify 24 h, reset 30 min, email change 60 min. Requesting a new link deletes the older unused one, and there is a 60 s per-account cooldown so nobody can be mail-bombed.

### Endpoints
| Endpoint | Auth | Behaviour |
|---|---|---|
| `POST /api/auth/verify-email` `{ token }` | – | Marks the address verified; token consumed |
| `POST /api/auth/resend-verification` `{ email }` | – | **Always the same 200** (no account enumeration); sends only to an existing unverified account; rate limited (5 / 15 min / IP) + cooldown |
| `POST /api/auth/forgot-password` `{ email }` | – | **Always the same 200**; rate limited + cooldown |
| `POST /api/auth/reset-password` `{ token, password, confirmPassword }` | – | Sets the password (bcrypt), **bumps `tokenVersion` = every existing JWT is revoked**, deletes other reset tokens, sends a "password changed" email |
| `POST /api/users/me/email-change` `{ newEmail, password }` | Bearer | Requires the current password (wrong password = 403, not 401). Sends a confirmation link to the **new** address; the account email does **not** change yet. An address already in use gets the identical response and no email |
| `POST /api/auth/confirm-email-change` `{ token }` | – | Switches the address (marked verified), revokes all sessions, notifies the **old** address |
| `GET / PATCH /api/users/me/email-preferences` | Bearer | `upcomingEventReminders`, `prepStartReminders`, `departureReminders` (all default **off**). Security, verification and reset emails are listed as always-on and **cannot** be changed (unknown keys → 400) |

### Configuration (`backend/.env`)
| Variable | Meaning |
|---|---|
| `EMAIL_MODE` | `console` (default): print a preview, send nothing. `provider`: really send. **Production requires `provider`**; the server refuses to start otherwise. Tests refuse `provider` |
| `EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY`, `EMAIL_FROM` | Required when `EMAIL_MODE=provider` (names are validated at startup; values are never printed) |
| `EMAIL_FROM_NAME` | Display name (default `ReadySet`) |
| `APP_BASE_URL` | Frontend URL used inside email links (defaults to `FRONTEND_URL`) |
| `SUPPORT_EMAIL` | Optional contact shown in email footers |
| `EMAIL_VERIFICATION_REQUIRED` | `false` (default) or `true`; see the rollout below |
| `EMAIL_REMINDERS_ENABLED` | `true` starts the reminder scheduler (default `false`) |

### Local development
Leave `EMAIL_MODE=console`. Every email appears in the **API terminal** as a masked-recipient preview **including the plain-text body, so you can click the verify / reset links**. The body is only printed outside production. Nothing is ever sent, so you cannot email real people by accident.

### Resend dashboard: what *you* must do (cannot be done from code)
1. Create a Resend account and open **Domains → Add Domain**. Prefer a sending subdomain such as `mail.yourdomain.com`.
2. Resend then shows the **exact DNS records** for that domain (SPF, DKIM, and the DMARC recommendation, if shown). Add them **exactly as displayed** at your DNS provider; do not copy records from any other source or from this README. Click **Verify** and wait until the domain shows *Verified* (DNS can take minutes to hours).
3. **API Keys → Create API Key** with *Sending access*, restricted to your domain. Copy it once.
4. Put it in the production environment only: `RESEND_API_KEY=...`, `EMAIL_FROM=no-reply@mail.yourdomain.com` (an address on the verified domain), `EMAIL_MODE=provider`, `APP_BASE_URL=https://your-frontend`.
5. Send yourself a real verification email and check it lands in the inbox (and not spam) in Gmail and Outlook before enabling anything for users.
6. Optional but recommended: publish a DMARC policy as Resend/your DNS provider instructs and review reports. Resend's shared test sender is limited (see Resend's docs); use your verified domain for real testing.

### Verification rollout (existing users are never locked out)
- The migration leaves **`email_verified_at = NULL` for every existing user** (nobody is auto-verified, nothing is faked) and **`email_verification_required = false`**.
- Existing and new users can all use the app while `EMAIL_VERIFICATION_REQUIRED=false`; unverified users see a reminder banner and a status/resend control in Settings.
1. Deploy with `EMAIL_VERIFICATION_REQUIRED=false`. New sign-ups get a verification email; nobody is blocked.
2. Configure Resend (above), switch to `EMAIL_MODE=provider`, test end to end.
3. Turn on `EMAIL_VERIFICATION_REQUIRED=true`. From then on **new accounts** get no session until they verify, and login answers `403 EMAIL_NOT_VERIFIED` (after the password is checked) until they do. The flag is stored **per user**, so it never applies to accounts that existed before, and switching the env var back does not unlock accounts that were created while it was on.
4. Forcing verification on *old* accounts is a separate product decision and is deliberately not implemented.

### Reminder emails (upcoming event / start preparing / time to leave)
Opt-in per type in Settings; sent only to **verified** addresses. A sweep runs every minute when `EMAIL_REMINDERS_ENABLED=true` and recomputes what is due from the **current** event data, using the Day 1 formulas (target arrival = start − buffer, departure = target − travel, prep start = departure − preparation) in the **event's own timezone** (Asia/Dhaka only as the stored default). Consequently: edited events change their reminder times automatically; deleted events send nothing; an event that has already started sends nothing; recurring events are expanded only in a short look-ahead window (no infinite jobs); after downtime, reminders that came due less than 30 minutes ago are still sent and older ones are skipped. A unique `dedupe_key` (event + occurrence time + type) in `email_logs` guarantees a reminder is sent at most once, even across restarts or several server instances. Upcoming-event reminders go out 60 minutes before the start. A failed reminder is not hammered again (its dedupe key is already taken).

### Reliability & logging
`email_logs` records type, recipient, provider, provider message id, status (`PENDING`, `RETRYING`, `ACCEPTED`, `FAILED`), attempts and an error **code**: never bodies, tokens, URLs or passwords. Retryable provider errors (rate limits, 5xx, network) are retried up to **3 attempts** with exponential backoff (500 ms, 1 s) using one idempotency key; permanent errors (bad key, invalid sender, validation) are not retried. Structured JSON logs use masked addresses (`j***@e***.com`).

### Switching provider (e.g. Brevo)
Implement `{ name, send({ to, from, subject, html, text, idempotencyKey }) }` (throw `EmailProviderError` with `retryable` and a `code`), add one `case` in `services/email/providers.js` and one enum value in `config/env.js`. Controllers, auth logic, templates and tests do not change.

### Production checklist
- [ ] Domain verified in Resend, DNS records exactly as shown there, API key scoped to the domain.
- [ ] `EMAIL_MODE=provider`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL` (https) set; `NODE_ENV=production`; strong `JWT_SECRET`.
- [ ] `npm run db:deploy` applied (`20261118000000_add_email_system`).
- [ ] Sent real verification, reset and email-change emails to Gmail and Outlook and checked the inbox/spam placement.
- [ ] `EMAIL_REMINDERS_ENABLED=true` on **one** instance only is simplest (duplicates are prevented anyway).
- [ ] Rate limiting is in-memory per process: use a shared store behind multiple instances; set `trust proxy` behind a proxy so per-IP limits work.
- [ ] Decide when to enable `EMAIL_VERIFICATION_REQUIRED=true`.

### Known limitations
No bounce/complaint/delivery webhooks (so "delivered" is unknown); the email queue is in memory; password changes while logged in (a "change password" settings form) are not implemented, only reset-by-email; reminder defaults (60 min upcoming lead, 30 min grace) are constants; reminders for several thousand opted-in users would need batching; no email unsubscribe link (preferences are in Settings).

## 11. Dependency audit (`npm audit` in `backend/`)
**Status: resolved with an override (0 vulnerabilities).** Original finding: 3 **high** findings, all from one advisory chain

| Package | Installed | Advisory | Affected range | First patched |
|---|---|---|---|---|
| `deepmerge-ts` | 7.1.5 | [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) / CVE-2026-40345 (CWE-674, stack exhaustion on recursive object graphs) | `< 8.0.0` | `8.0.0` (latest 8.0.2) |
| `@prisma/config` | 6.19.3 | via `deepmerge-ts` | 6.13.0-dev.1 – 7.10.0 | pulled in by `prisma` 7.10.1 |
| `prisma` (CLI) | 6.19.3 | via `@prisma/config` | 6.13.0-dev.1 – 7.10.0 | 7.10.1 |

- **Dev tool or runtime?** `prisma` (CLI) is a devDependency, but it is also an *optional peer* of `@prisma/client`, and a production-style `npm ci --omit=dev` **still installs it** (verified). The vulnerable code is only used while the CLI loads `prisma.config` (developer-controlled input); the generated runtime client does not load `deepmerge-ts` or `@prisma/config`, and no HTTP input reaches it. Practical exploitability against the running API: very low. The advisory is still present in the installed production tree.
- **Official fix = Prisma 7.10.1 (stable) is NOT a drop-in upgrade.** Tested on a scratch copy: it clears the audit, but `prisma validate` rejects the current schema (`datasource url` is no longer allowed; a `prisma.config.ts` and a driver adapter for `PrismaClient` are required). Treat it as a planned migration with CLI + Client upgraded together. `npm audit fix --force` would jump to a 8.0.0 release candidate and must not be used.
- **Applied remediation:** Prisma stays at 6.19.3 (CLI, Client and schema unchanged) and `backend/package.json` now has `"overrides": { "deepmerge-ts": "^8.0.2" }`. `npm audit` reports **0 vulnerabilities**; `prisma validate`, `generate`, `migrate deploy` (both migrations, on a real PostgreSQL) and the full backend test suite all pass with it. Revisit when you migrate to Prisma 7 (the override can then be removed).

## 12. Known limitations / next steps
- **Next:** checklist persistence (checklists are still temporary client state). Departure plans use the saved travel time as a fixed estimate; live traffic, weather and maps are later milestones (see §9 limitations).
- Checklists and notifications are still temporary client state; weather/maps/traffic and push notifications are not implemented.
- Recurrence limits are listed in §8 (no monthly rules, no single-occurrence edits).
- The Dashboard "Today" uses the user's saved timezone while the Schedule calendar uses the browser's calendar days; they only differ if the browser and saved timezone differ.
- Avatar upload is a UI placeholder. Email verification, password reset and email change are implemented (§10).
- No refresh tokens or per-device sessions: logout ends all sessions of the account (see §5). Rate limiting is in-memory per process; use a shared store when running multiple instances.
- Reminder switches and theme are saved on the device only.
- The Windows Vitest worker flake in §6 is worked around, not root-caused.
- Dependency audit: see §11 (0 vulnerabilities with the override).
