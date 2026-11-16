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
- **Logout**: JWTs are stateless, so the server **cannot revoke** a token before it expires. `POST /api/auth/logout` only acknowledges; logging out means the client deletes its token. Real revocation would need a server-side store (a `RefreshToken`/denylist table); it was not added because nothing requires it yet.
- **Token storage (Bearer, chosen over cookies)**: the token lives in browser storage — `sessionStorage` by default, `localStorage` when "Remember me" is ticked. **This is exposed to XSS**: any script on the page can read it. It is *not* fully secure. Mitigations: short expiry, no `dangerouslySetInnerHTML`, no third-party scripts. An HttpOnly + Secure + SameSite cookie would be stronger but also needs CSRF protection and credentialed CORS; that is the recommended hardening before production. Cookie and Bearer auth are deliberately **not** mixed.
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

## 8. Known limitations / next steps
- Events, checklists and notifications are still mock, in-memory data and are shared by whoever signs in on the same browser tab until Day 3 moves them to per-user database tables.
- No email verification, password reset, email change, or avatar upload (the corresponding UI is still a placeholder).
- No token revocation / refresh tokens (see §5). Rate limiting is in-memory per process; use a shared store when running multiple instances.
- Reminder switches and theme are saved on the device only.
- `npm audit` reports advisories in Prisma's own CLI dependency (`deepmerge-ts`, dev tooling only); fixing requires a major Prisma upgrade, so it was not done.
- Weather, maps/traffic and push notifications are not implemented.
