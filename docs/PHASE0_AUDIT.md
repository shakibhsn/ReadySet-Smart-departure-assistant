# Phase 0 — ReadySet architecture and safety audit

Read-only. Nothing was written to any database, no migration was run, no `.env` was modified, and no secret was printed.
Date of audit: 2026-11-20 (HEAD `a7ae9db`).

## 0. Database isolation verdict: VERIFIED (static) — not BLOCKED

| Check | Result |
|---|---|
| `backend/.env` (dev) validated by `scripts/dbGuard.mjs` | valid: role `readyset_isolated_app`, DB `readyset_isolated_dev`, shadow `readyset_isolated_shadow`, host `localhost`, port allowlist |
| `backend/.env.test` | valid: DB `readyset_isolated_test` |
| No `DATABASE_URL` / `SHADOW_DATABASE_URL` / `DIRECT_URL` / `PG*` in the shell | confirmed earlier this session |
| Runtime guard (`src/config/env.js`) | refuses to start on any other database, host, port or user, and on a shell value that differs from the env file |
| Prisma commands | `db:migrate`, `db:deploy`, `db:migrate:test` go through `scripts/prisma-safe.mjs`, which re-validates the URLs first |

Limit of this verification: it is static (configuration), not a live connection. Server-side privileges of the role were checked by the setup script when it ran, not re-checked here.

## 1. Stack and structure

- **Frontend** (`src/`): React 19, Vite 8, Tailwind 4 (tokens in `styles/index.css`), react-router 7, no state library. Server data via a small `useEventQuery` hook with a shared invalidation counter; per-user client state is remounted per user (`UserScopedAppState`). No shadcn CLI components: `components/ui` are hand-written shadcn-style primitives.
- **Backend** (`backend/src/`): Express 5, Prisma 6.19.3, zod validation, `routes -> controllers -> services` layering, JWT (HS256) with a `tokenVersion` revocation check on every request.
- **Database**: PostgreSQL 17, 9 tables: `users`, `user_preferences`, `recurrence_rules`, `events`, `auth_tokens`, `email_logs`, `checklist_items`, `notifications` (+ `_prisma_migrations`). 6 migrations, all additive.

## 2. Working features (each backed by tests that passed in this session)

Auth (register, login, logout with token revocation, email verification, password reset, email change, rate limits); event CRUD with timezone-aware storage; **recurrence rules** (DAILY / WEEKLY, interval, weekdays, end date); Smart Departure Engine (pure calculator, plan endpoints, preview, upcoming, today) and live countdown; checklist (templates, CRUD, completion); weather (Open-Meteo, optional, graceful failures); in-app notifications (single scheduler, idempotent, preferences, browser opt-in); email reminders (separate sweep); premium UI on the new palette.

Last test run: backend 411 passed (18 files); frontend 147 passed (12 files); lint and build clean.

## 3. Incomplete, limited, or broken

| Item | Detail |
|---|---|
| Recurrence is limited | DAILY/WEEKLY only. No monthly, no "end after N occurrences", no per-occurrence edit, skip or cancel. Editing a recurring event always edits the whole series. |
| No event templates | `checklist-templates` exist, but there is no reusable *event* template. |
| **Events have no end time / duration** | Only `startAt` exists. "Overlap" is therefore undefined today. This blocks the conflict detector unless a duration is added (see Phase 1 plan). |
| Travel estimate is manual only | `travelDurationMinutes` per event (and a `preferredTravelMode` label). There is no routing service and no origin location, so travel *between consecutive destinations* cannot be computed, only each event's own estimate. |
| Two reminder systems | Email reminders (`reminder.service`, gated by `EMAIL_REMINDERS_ENABLED`) and in-app notifications (`notification/`) each have their own sweep and their own recurrence expansion call. Both must learn about any future occurrence exceptions. |
| Uncommitted work not mine | Dark-mode feature (`ThemeProvider`, `useTheme`, `App.jsx`, `SettingsPage`, `data/user.js`, `email.test.jsx`, `theme.test.jsx`) is still uncommitted; my committed tree does not depend on it. |
| Dead state | `AppStateProvider` still holds `settings.reminders` (device-only mock) that nothing reads after Day 6. Harmless. |
| Dialog exit | Dialogs animate in but close instantly. |

## 4. Reusable components and services

- `services/recurrence.service.js` (pure `expandOccurrences`, hard cap 500) — the single place occurrences are computed.
- `services/departure/*` (pure calculator, status, plan service, validation) — single source of truth for prep/departure/arrival times.
- `services/event.service.js` (`listOccurrenceRecords`, `findOwnedEvent`, `toPublicEvent`), `utils/timezone.js` (Luxon helpers).
- Notification sweep pattern (page-bounded, unique `dedupeKey`, `createMany skipDuplicates`) — reusable template for any idempotent generation.
- Frontend: `EventForm`, `MonthCalendar`, `WeekView`, `ScheduleList`, `DeparturePreview`, `ConfirmDialog`, `useEventQuery`, `usePreviewPlan`, design tokens and `anim-*` utilities.

## 5. Tables and relations relevant to future features

- `events` (user_id, title, category, start_at, timezone, destination, notes, travel/prep/buffer minutes, is_recurring, recurrence_rule_id) -> 1:1 optional `recurrence_rules` (frequency, interval, days_of_week[], ends_at).
- `checklist_items`, `notifications` -> cascade from events/users.
- Indexes: `events(user_id,start_at)`, `events(user_id,category)`; notifications `(user_id,created_at desc)`, `(user_id,read_at)`, unique `dedupe_key`.
- Missing for the new features: exceptions per occurrence, event templates, event duration, rule occurrence count.

## 6. API endpoints (existing)

`/api/auth/*` (register, login, logout, verify-email, resend-verification, forgot/reset-password, confirm-email-change); `/api/users/me` (+ `/preferences`, `/email-preferences`, `/notification-preferences`, `/email-change`); `/api/events` (POST, GET, `/upcoming`, `/occurrences`, `/:id` GET/PATCH/DELETE, `/:id/departure-plan`, `/:id/weather`, `/:id/checklist[/...]`); `/api/checklist-templates`; `/api/departure` (`/preview`, `/today`, `/upcoming`); `/api/notifications` (list, unread-count, read-all, `/:id/read`, DELETE).

## 7. Security and authorization review

- Good: user id always from the verified token; every service query filters by `userId`; IDOR cases covered by tests for events, checklist, weather, notifications; zod `strictObject` on writes; helmet; single-origin CORS; bcrypt; revocation via `tokenVersion`; startup guards.
- Risks:
  1. **Rate limiting only on auth routes.** The weather endpoint triggers outbound calls to Open-Meteo and the conflict detector will be CPU-heavy; neither is limited (cache mitigates weather).
  2. **Token in browser storage** (documented trade-off; HttpOnly cookie is future work).
  3. **`npm audit` (backend, prod deps): 3 high** — all in the Prisma CLI chain (`prisma` -> `@prisma/config` -> `effect`). Dev-time tool, not reachable from request handling; the suggested fix is a major Prisma change, so deferred. Frontend: 0 vulnerabilities.
  4. Weather sends the destination text to a third party (documented).
  5. No request-size or per-user quotas on events/templates: needed for Phase 1 (unbounded recurrence/template creation).
  6. Two schedulers read events without a per-user cap beyond page size; fine today, relevant once exceptions add joins.

## 8. Tests and coverage

- Counts: backend 411, frontend 147 (see above). Pure (DB-free) backend suite: 93.
- **No coverage tool is installed**, so line coverage is unmeasured.
- Known gaps: no tests for monthly recurrence, count-based end, occurrence exceptions, event templates, or schedule conflicts (features do not exist yet); no frontend tests for `MonthCalendar`/`WeekView` interactions beyond what `events.test.jsx` exercises; no E2E browser tests (Playwright) — journeys are tested through Supertest and jsdom.
- Test infrastructure note: on Windows the Vitest worker crashes at startup on ~1 in 4 DB files; `scripts/run-tests.mjs` re-runs only crashed files.

## 9. UI/UX and responsive state

Checked with screenshots (desktop 1440 and ~390-500 px, light and dark): sign-in, dashboard, planner, checklist, notifications, create event. Not screenshotted: schedule (month/week/list), event details, settings. Tablet width and touch-target sizes were not measured.

## 10. Recommended implementation order for Phase 1 and beyond

1. Phase 1a: pure rules first (monthly + count in `recurrence.service`, conflict rules) with unit tests — no database needed.
2. Phase 1b (after approval): additive migration (below), exceptions in all four occurrence consumers (event list/upcoming, departure plan, email reminders, notification sweep), templates API, conflicts API.
3. Phase 1c: UI (series edit dialog, skip, template picker, conflicts panel).
4. Add rate limits on the heavy new endpoints and a request quota for templates and exceptions.

## 11. Feature classification

| Proposed feature | Class | Notes |
|---|---|---|
| Daily / weekly recurrence, end date, edit whole series | Reusable, no DB change | already built |
| Monthly recurrence | Reusable with no DB change if `frequency` stays a free `VARCHAR(10)`; add `MONTHLY` value | rule column is not an enum |
| End after N occurrences | Requires additive DB change | new nullable `occurrence_count` on `recurrence_rules` |
| Edit one occurrence, skip or cancel an occurrence | Requires additive DB change | new `event_exceptions` table |
| Event templates | Requires additive DB change | new `event_templates` table |
| Conflict detector: travel/prep/reachability | Reusable with no DB change | computed on demand from occurrences + departure engine |
| Conflict detector: **overlap** | **Blocked by an existing gap** unless an additive `duration_minutes` is approved | events have no end time |
| Real-time-traffic aspects | Out of scope (external service) | the prompt forbids inventing traffic data |

The 9 other proposed features were not listed in this prompt; I will classify them when you send them.

## 12. Phase 1 database plan (for approval — nothing applied)

All additive; no existing row or column changes meaning; new columns are nullable or defaulted.

```
ALTER TABLE recurrence_rules ADD COLUMN occurrence_count INTEGER;           -- NULL = not count-limited
ALTER TABLE events           ADD COLUMN duration_minutes  INTEGER;          -- NULL = unknown (treated as an assumed default, labelled as assumed)
CREATE TABLE event_exceptions (
  id UUID PK, user_id UUID FK users CASCADE, event_id UUID FK events CASCADE,
  original_start TIMESTAMP NOT NULL,              -- the generated occurrence this refers to
  kind VARCHAR(10) NOT NULL,                      -- 'SKIPPED' | 'OVERRIDDEN'
  title, destination, notes, start_at, travel/preparation/arrival_buffer minutes, duration_minutes  -- override fields, all nullable
  created_at, updated_at,
  UNIQUE (event_id, original_start)               -- idempotent: the same occurrence can have only one exception
);
CREATE TABLE event_templates (
  id UUID PK, user_id UUID FK users CASCADE, name VARCHAR(80) NOT NULL,
  title, category, destination, notes, timezone, travel/preparation/arrival_buffer minutes, duration_minutes,
  recurrence JSONB NULL,                          -- optional default rule
  created_at, updated_at, UNIQUE (user_id, name)
);
CREATE INDEX event_exceptions_user_event_idx ON event_exceptions (user_id, event_id);
```

Rollback plan (only if you ask for it; it deletes data in the NEW objects only, never touches existing tables' data):
`DROP TABLE event_templates; DROP TABLE event_exceptions; ALTER TABLE events DROP COLUMN duration_minutes; ALTER TABLE recurrence_rules DROP COLUMN occurrence_count;` followed by deleting the migration folder and its `_prisma_migrations` row. Because the changes are additive and the new code treats NULL as "not set", the old application version keeps working against the new schema, so a code rollback alone is usually enough and the schema rollback can be skipped.

Applies to ReadySet's `readyset_isolated_dev` and `readyset_isolated_test` only, through the guarded `db:deploy` / `db:migrate:test` commands. No other project's database is involved.
