# ReadySet — Smart Departure Assistant

> **Don't rush. Be ready.**

ReadySet works backwards from an event to tell you when to start preparing and when to leave.

**Status: Day 2** — Express + PostgreSQL + Prisma backend with JWT authentication, connected to the React frontend.
Events, checklists, notifications and weather are still **mock data in browser state** (Day 3+).

```
frontend (repo root)   React 19 · Vite · Tailwind v4 · React Router · date-fns      http://localhost:5173
backend/               Express 5 · Prisma 6 · PostgreSQL · JWT · bcrypt · Zod        http://localhost:4000
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
npm run db:migrate     # applies prisma/migrations/*_init to readyset_dev (prisma migrate dev)
npm --prefix backend run db:migrate:test   # applies the same migration to readyset_test
```
`migrate dev` applies the checked-in migration to the empty `readyset_dev`. Never run `prisma migrate reset` or `db push --force-reset` on a database you care about.

## 2. Running (two terminals)
```bash
npm run dev:api        # terminal 1 → http://localhost:4000  (GET /api/health)
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
| `npm run test:api` | Backend tests (Vitest + Supertest, real `readyset_test` DB) |
| `npm run lint` | ESLint for frontend and backend |

## 4. API
All responses: `{ success, message, data }` or `{ success: false, message, errors: [{ field, message }] }`.

| Method & path | Auth | Notes |
|---|---|---|
| `POST /api/auth/register` | – | `name, email, password, confirmPassword` → 201 `{ user, token }`; 409 duplicate email |
| `POST /api/auth/login` | – | `email, password` → 200 `{ user, token }`; 401 generic "Invalid email or password" |
| `GET /api/auth/me` | Bearer | user + preferences |
| `POST /api/auth/logout` | – | No-op; see below |
| `GET / PATCH /api/users/me` | Bearer | PATCH accepts `name` only |
| `GET / PATCH /api/users/me/preferences` | Bearer | `defaultPreparationMinutes` (0–600), `defaultArrivalBufferMinutes` (0–240), `preferredTravelMode` (`manual\|walk\|transit\|drive\|bike`), `timezone` (IANA) |
| `GET /api/health` | – | liveness |

## 5. Security notes
- **Passwords**: bcrypt (cost 12, configurable via `BCRYPT_ROUNDS`), 8–72 characters; hashes are never returned. Login does a dummy bcrypt compare for unknown emails so response time does not reveal which emails exist.
- **JWT**: HS256, payload is just `sub` (user id), expiry from `JWT_EXPIRES_IN`. Verified with the algorithm pinned (no `alg: none`). The user id always comes from the verified token, never from the request. Tokens are **not** stored in the database.
- **Validation**: Zod on every body; unknown fields are rejected (so `id`, `passwordHash`, `role`, `userId` can never be mass-assigned).
- **Hardening**: Helmet, CORS limited to `FRONTEND_URL`, 10 kB body limit, rate limit on login/register (20 per 15 min per IP), central error handler with no stack traces or DB details in responses, no password/token logging.
- **Logout does NOT revoke the token.** JWTs are stateless: the server keeps no session list, so it **cannot invalidate a token that has already been issued**. `POST /api/auth/logout` only acknowledges the request; "logging out" means the browser deletes its copy (from both `sessionStorage` and `localStorage`). A token that was copied before logout (e.g. by an attacker who read browser storage) **stays valid until it expires** (`JWT_EXPIRES_IN`, default 1 day). Real revocation needs server-side state (a denylist or refresh-token table with short-lived access tokens); it was not added because nothing requires it yet. Keep `JWT_EXPIRES_IN` short, and rotate `JWT_SECRET` to invalidate every token at once.
- **Token storage (Bearer, chosen over cookies)**: the token lives in browser storage — `sessionStorage` by default (the "Remember me" box is **unticked** by default), `localStorage` only when "Remember me" is ticked. **This is exposed to XSS**: any script on the page can read it. It is *not* fully secure. Mitigations: short expiry, no `dangerouslySetInnerHTML`, no third-party scripts. An HttpOnly + Secure + SameSite cookie would be stronger but also needs CSRF protection and credentialed CORS; that is the recommended hardening before production. Cookie and Bearer auth are deliberately **not** mixed.
- Set `NODE_ENV=production`, a strong `JWT_SECRET`, HTTPS, and `trust proxy` (if behind a proxy) before deploying.

## 6. Testing
- **Backend** (`npm run test:api`): registration (valid, missing fields, bad email, weak password, mismatch, duplicate, hashed storage), login (valid, wrong password, unknown email, missing fields, 429 rate limit), JWT (missing/invalid/`alg:none`/expired/valid/deleted user), profile & preference validation, and **user A vs user B isolation**. Tests only delete rows with `@readyset.test` emails and only in a `*_test` database.
- **Frontend** (`npm test`): register/login forms hit the right endpoints with the right bodies, server/network errors render, protected routes (no flash of protected content while loading), session restore, logout.

## 7. Structure
```
backend/
  prisma/            schema.prisma, migrations/
  scripts/           setup-local-db.sql
  src/               config/ controllers/ middleware/ routes/ schemas/ services/ utils/ app.js server.js
  tests/
src/                 (frontend)
  components/common/ AuthProvider, RouteGuards, Alert, ...
  lib/               apiClient.js (single backend URL, error handling), tokenStorage.js
  services/          authApi.js, userApi.js
```

## 8. Day 3 preparation: where the temporary mock data lives
Events, checklists and notifications are **not** stored on the server or per user. They are **one shared in-memory React state per browser tab**:

| What | Defined in | Held in |
|---|---|---|
| Events | `src/data/events.js` (`mockEvents`) | `useState` in `src/components/common/AppStateProvider.jsx` |
| Checklists + templates | `src/data/checklists.js` (`mockChecklists`, `checklistTemplates`) | same provider |
| Notifications | `src/data/notifications.js` (`mockNotifications`) | same provider |
| Weather | `src/data/weather.js` (`mockWeather`) | not state; imported directly by the dashboard |

- The provider is mounted once in `src/main.jsx`, **below** `AuthProvider` but **not keyed by user**. So if user A logs out and user B logs in without a page reload, B sees A's events/checklist changes. A full reload resets everything to the mock seed. Nothing is persisted (no `localStorage`/IndexedDB for this data).
- Consumers of `useAppState()`: `DashboardPage`, `SchedulePage`, `CreateEventPage`, `ChecklistPage`, `PlannerPage`, `NotificationsPage`, `SettingsPage` (reminders/theme only), `AppSidebar` and `AppNavbar` (unread badge).
- Day 3 plan: add `Event`, `ChecklistItem` and `Notification` tables owned by `userId`, scope every query by the id from the verified JWT (same pattern as `user.service.js`), replace the provider's `useState(mock*)` with API-backed loading, and clear/re-fetch state on logout.

## 9. Dependency audit (`npm audit` in `backend/`)
3 **high** findings, all from one advisory chain, checked on 2026-11-16:

| Package | Installed | Advisory | Affected range | First patched |
|---|---|---|---|---|
| `deepmerge-ts` | 7.1.5 | [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) / CVE-2026-40345 (CWE-674, stack exhaustion on recursive object graphs) | `< 8.0.0` | `8.0.0` (latest 8.0.2) |
| `@prisma/config` | 6.19.3 | via `deepmerge-ts` | 6.13.0-dev.1 – 7.10.0 | pulled in by `prisma` 7.10.1 |
| `prisma` (CLI) | 6.19.3 | via `@prisma/config` | 6.13.0-dev.1 – 7.10.0 | 7.10.1 |

- **Dev tool or runtime?** `prisma` (CLI) is a devDependency, but it is also an *optional peer* of `@prisma/client`, and a production-style `npm ci --omit=dev` **still installs it** (verified). The vulnerable code is only used while the CLI loads `prisma.config` (developer-controlled input); the generated runtime client does not load `deepmerge-ts` or `@prisma/config`, and no HTTP input reaches it. Practical exploitability against the running API: very low. The advisory is still present in the installed production tree.
- **Official fix = Prisma 7.10.1 (stable) is NOT a drop-in upgrade.** Tested on a scratch copy: it clears the audit, but `prisma validate` rejects the current schema (`datasource url` is no longer allowed; a `prisma.config.ts` and a driver adapter for `PrismaClient` are required). Treat it as a planned migration with CLI + Client upgraded together. `npm audit fix --force` would jump to a 8.0.0 release candidate and must not be used.
- **Safest interim remediation (tested on a scratch copy, not yet applied):** keep Prisma 6.19.3 and add `"overrides": { "deepmerge-ts": "^8.0.2" }` to `backend/package.json`, then `npm install`. Result: `npm audit` reports 0 vulnerabilities and `prisma validate`, `prisma generate` and `prisma migrate diff` still work. Not covered: `migrate deploy/dev` against a real database (no database available yet), so run those once after applying it.

## 10. Known limitations / next steps
- Events, checklists and notifications are still mock, in-memory data and are shared by whoever signs in on the same browser tab until Day 3 moves them to per-user database tables.
- No email verification, password reset, email change, or avatar upload (the corresponding UI is still a placeholder).
- No token revocation / refresh tokens (see §5). Rate limiting is in-memory per process; use a shared store when running multiple instances.
- Reminder switches and theme are saved on the device only.
- `npm audit` reports 3 high advisories from Prisma's CLI dependency `deepmerge-ts`; not applied yet. See §9 for the exact IDs, why runtime exposure is low, and the tested override.
- Weather, maps/traffic and push notifications are not implemented.
