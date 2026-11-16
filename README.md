# ReadySet — Smart Departure Assistant

> **Don't rush. Be ready.**

ReadySet works backwards from an event to tell you when to start preparing and when to leave.

**Status: Day 3** — Express + PostgreSQL + Prisma backend with JWT authentication **and a complete, user-specific event management system** (create, list, details, update, delete, upcoming, filters, pagination, daily/weekly recurrence), connected to the React frontend.
Events live in PostgreSQL. Checklists, notifications and weather are still temporary/mock data (see §8).

```
frontend (repo root)   React 19 · Vite · Tailwind v4 · React Router · date-fns      http://localhost:5173
backend/               Express 5 · Prisma 6 · PostgreSQL · JWT · bcrypt · Zod        http://localhost:4100
```

## 1. First-time setup

### 1a. Install dependencies
```bash
npm install            # frontend
npm run setup:api      # backend (runs npm install inside backend/)
```

### 1b. Create a dedicated PostgreSQL database for ReadySet
ReadySet must **never** share a database with another project. Do this once.

1. See which databases/roles already exist (read-only) so you can avoid any name clash:
   ```powershell
   & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -U postgres -c "\l" -c "\du"
   ```
   You need `readyset_dev`, `readyset_test` and the role `readyset_app` to be **absent**. If any exist, pick other names (edit the SQL file and the URLs below).
2. Create them. [`backend/scripts/setup-local-db.sql`](backend/scripts/setup-local-db.sql) only runs `CREATE ROLE` / `CREATE DATABASE`: no `DROP`, no `TRUNCATE`. If a name already exists it stops with an error instead of touching anything.
   ```powershell
   & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -U postgres -v ON_ERROR_STOP=1 -v app_password="CHOOSE_A_PASSWORD" -f backend/scripts/setup-local-db.sql
   ```
   (You will be prompted for the `postgres` superuser password. The role gets `CREATEDB` because `prisma migrate dev` uses a temporary shadow database.)

### 1c. Create the real `.env` files (never committed)
```powershell
Copy-Item backend\.env.example      backend\.env
Copy-Item backend\.env.test.example backend\.env.test
Copy-Item .env.example              .env.local      # frontend; no secrets in it
```
Edit `backend/.env`:
- `DATABASE_URL` → `postgresql://readyset_app:CHOOSE_A_PASSWORD@localhost:5432/readyset_dev?schema=public` (special characters in the password must be URL-encoded).
- `JWT_SECRET` → at least 32 random characters:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- `FRONTEND_URL=http://localhost:5173` (the only origin CORS will allow).

Edit `backend/.env.test` so `DATABASE_URL` points at `readyset_test`. The backend **refuses to run tests** unless the database name ends in `_test`.

The server validates all variables at startup and prints which ones are missing/invalid (never their values).

### 1d. Create the tables
```bash
npm run db:generate    # generate Prisma Client
npm run db:migrate     # applies every migration in prisma/migrations (init, add_token_version, add_events_and_recurrence) to readyset_dev
npm --prefix backend run db:migrate:test   # applies the same migration to readyset_test
```
`migrate dev` applies the checked-in migrations to the empty `readyset_dev`. Port 4100 is used because 4000 is commonly taken by other local projects. Never run `prisma migrate reset` or `db push --force-reset` on a database you care about.

## 2. Running (two terminals)
```bash
npm run dev:api        # terminal 1 → http://localhost:4100  (GET /api/health)
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
| `npm run test:api` | Backend tests (Vitest + Supertest, real `readyset_test` DB). Uses `backend/scripts/run-tests.mjs`, which re-runs the suite only if the Vitest *worker process* crashes (see §6); real test failures are never retried. `npm --prefix backend run test:raw` runs plain Vitest. |
| `npm run lint` | ESLint for frontend and backend |

## 4. API
All responses: `{ success, message, data }` or `{ success: false, message, errors: [{ field, message }] }`.

| Method & path | Auth | Notes |
|---|---|---|
| `POST /api/auth/register` | – | `name, email, password, confirmPassword` → 201 `{ user, token }`; 409 duplicate email |
| `POST /api/auth/login` | – | `email, password` → 200 `{ user, token }`; 401 generic "Invalid email or password" |
| `GET /api/auth/me` | Bearer | user + preferences |
| `POST /api/auth/logout` | Bearer | Revokes every token issued so far for the account (see §5) |
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
- **Frontend** (`npm test`, 38 tests): register/login forms hit the right endpoints with the right bodies, server/network errors render, protected routes, session restore, logout. Day 3 adds `events.test.jsx` against a stateful fake API (`src/test/fakeApi.js`): Create Event submits local time + timezone (and weekly recurrence), client/server validation errors, duplicate-submit blocking, Schedule shows API events with category/date filters and pagination, empty/error/expired-session states, edit (PATCH), delete with confirmation and cancel, Dashboard shows real next/today/upcoming/count, and logout clears event state so user B never sees user A's events.
- **Known tooling flake (Windows):** in roughly 1 of 4-5 runs the Vitest *worker process* dies at startup with exit code `3221226505` (`0xC0000409`) before any test runs. It only reproduced when the worker loads `bcrypt` and Prisma together, and it never produced an assertion failure; the cause was not found. `backend/scripts/run-tests.mjs` therefore re-runs the whole suite (max 3 attempts) **only** when the worker crashed, prints a warning when it does, and never retries an actual test failure.

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

## 9. Dependency audit (`npm audit` in `backend/`)
**Status: resolved with an override (0 vulnerabilities).** Original finding: 3 **high** findings, all from one advisory chain

| Package | Installed | Advisory | Affected range | First patched |
|---|---|---|---|---|
| `deepmerge-ts` | 7.1.5 | [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) / CVE-2026-40345 (CWE-674, stack exhaustion on recursive object graphs) | `< 8.0.0` | `8.0.0` (latest 8.0.2) |
| `@prisma/config` | 6.19.3 | via `deepmerge-ts` | 6.13.0-dev.1 – 7.10.0 | pulled in by `prisma` 7.10.1 |
| `prisma` (CLI) | 6.19.3 | via `@prisma/config` | 6.13.0-dev.1 – 7.10.0 | 7.10.1 |

- **Dev tool or runtime?** `prisma` (CLI) is a devDependency, but it is also an *optional peer* of `@prisma/client`, and a production-style `npm ci --omit=dev` **still installs it** (verified). The vulnerable code is only used while the CLI loads `prisma.config` (developer-controlled input); the generated runtime client does not load `deepmerge-ts` or `@prisma/config`, and no HTTP input reaches it. Practical exploitability against the running API: very low. The advisory is still present in the installed production tree.
- **Official fix = Prisma 7.10.1 (stable) is NOT a drop-in upgrade.** Tested on a scratch copy: it clears the audit, but `prisma validate` rejects the current schema (`datasource url` is no longer allowed; a `prisma.config.ts` and a driver adapter for `PrismaClient` are required). Treat it as a planned migration with CLI + Client upgraded together. `npm audit fix --force` would jump to a 8.0.0 release candidate and must not be used.
- **Applied remediation:** Prisma stays at 6.19.3 (CLI, Client and schema unchanged) and `backend/package.json` now has `"overrides": { "deepmerge-ts": "^8.0.2" }`. `npm audit` reports **0 vulnerabilities**; `prisma validate`, `generate`, `migrate deploy` (both migrations, on a real PostgreSQL) and the full backend test suite all pass with it. Revisit when you migrate to Prisma 7 (the override can then be removed).

## 10. Known limitations / next steps (Day 4+)
- **Day 4:** the departure calculation engine (the dashboard still derives leave/prepare times with the simple formulas from Day 1) and checklist persistence.
- Checklists and notifications are still temporary client state; weather/maps/traffic and push notifications are not implemented.
- Recurrence limits are listed in §8 (no monthly rules, no single-occurrence edits).
- The Dashboard "Today" uses the user's saved timezone while the Schedule calendar uses the browser's calendar days; they only differ if the browser and saved timezone differ.
- No email verification, password reset, email change, or avatar upload (UI placeholders only).
- No refresh tokens or per-device sessions: logout ends all sessions of the account (see §5). Rate limiting is in-memory per process; use a shared store when running multiple instances.
- Reminder switches and theme are saved on the device only.
- The Windows Vitest worker flake in §6 is worked around, not root-caused.
- Dependency audit: see §9 (0 vulnerabilities with the override).
