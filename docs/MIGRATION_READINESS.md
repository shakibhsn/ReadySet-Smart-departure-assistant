# Consolidated migration readiness report (Phases 3, 4 and 5)

**Status: NOTHING HAS BEEN APPLIED.** No `db:deploy`, `db:migrate:test`, `db push`, reset or destructive SQL has been run for these phases.
Wait for explicit approval before applying anything below.

Database-dependent features are **written and partly tested but not verified against the migrated schema** (see section 7).

## 1. Proposed schema changes (all additive)

| # | Migration folder | Change |
|---|---|---|
| 1 | `20261124000000_preparation_profile` (Phase 3) | `user_preferences`: +`adaptive_profile_enabled BOOLEAN NOT NULL DEFAULT true`, +`preparation_overrides JSONB`. New table `preparation_logs` (+2 indexes, +2 foreign keys). |
| 2 | `20261125000000_snooze_priority_completion` (Phases 4 and 5) | `events`: +`priority VARCHAR(8) NOT NULL DEFAULT 'normal'`. `checklist_items`: +`completed_at TIMESTAMP(3) NULL`. `notifications`: +`snoozed_until TIMESTAMP(3) NULL` and an index on `(user_id, snoozed_until)`. |

Phase 4's assistant and Phase 5's analytics/PWA need **no** tables: assistant confirmations are signed tokens (no storage), and analytics are computed on request.

## 2. Exact migration SQL

### Migration 1: `backend/prisma/migrations/20261124000000_preparation_profile/migration.sql`
```sql
ALTER TABLE "user_preferences" ADD COLUMN     "adaptive_profile_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "preparation_overrides" JSONB;

CREATE TABLE "preparation_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event_id" UUID,
    "occurrence_start" TIMESTAMP(3) NOT NULL,
    "category" VARCHAR(20) NOT NULL,
    "planned_prep_minutes" INTEGER NOT NULL,
    "planned_departure_at" TIMESTAMP(3) NOT NULL,
    "prep_started_at" TIMESTAMP(3),
    "ready_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "left_at" TIMESTAMP(3),
    "unchecked_items" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "preparation_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "preparation_logs_user_id_occurrence_start_idx" ON "preparation_logs"("user_id", "occurrence_start" DESC);
CREATE UNIQUE INDEX "preparation_logs_user_id_event_id_occurrence_start_key" ON "preparation_logs"("user_id", "event_id", "occurrence_start");
ALTER TABLE "preparation_logs" ADD CONSTRAINT "preparation_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "preparation_logs" ADD CONSTRAINT "preparation_logs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

### Migration 2: `backend/prisma/migrations/20261125000000_snooze_priority_completion/migration.sql`
```sql
ALTER TABLE "events" ADD COLUMN     "priority" VARCHAR(8) NOT NULL DEFAULT 'normal';
ALTER TABLE "checklist_items" ADD COLUMN     "completed_at" TIMESTAMP(3);
ALTER TABLE "notifications" ADD COLUMN     "snoozed_until" TIMESTAMP(3);
CREATE INDEX "notifications_user_id_snoozed_until_idx" ON "notifications"("user_id", "snoozed_until");
```
No `DROP`, `TRUNCATE`, `DELETE` or type change anywhere. The only `DELETE` tokens are foreign-key `ON DELETE` actions of the new table. Existing rows are untouched (new columns are nullable or have defaults).

## 3. Ordering and dependencies
1. Migration 1 first (Prisma applies folders in name order). Migration 2 does not depend on it, but both are pending and applied together by `migrate deploy`.
2. **Apply the migrations, then regenerate the client.** The code detects columns through the generated client (`supportsField`), so:
   - client regenerated **before** migrating = code would use columns that do not exist yet (errors). Do not do this.
   - migrated but client not regenerated = new columns are simply unused (safe, features report "not available yet").
3. Restart the API after regenerating (the old client is loaded in memory).

## 4. Targets (credentials redacted)
| Use | Database | Role | Host:port | Password |
|---|---|---|---|---|
| development (`backend/.env`) | `readyset_isolated_dev` | `readyset_isolated_app` | localhost:5432 | `***redacted***` |
| test (`backend/.env.test`) | `readyset_isolated_test` | `readyset_isolated_app` | localhost:5432 | `***redacted***` |

The guarded commands (`scripts/prisma-safe.mjs`, `scripts/dbGuard.mjs`) re-verify these exact values and refuse anything else. No other project database, role, credential or env file is read or written. The shadow database is not used (`migrate deploy`, never `migrate dev`).

## 5. Commands (run from the repository root; stop the API first: it locks a Prisma engine file on Windows)
```
npm --prefix backend run db:deploy          # development database only
npm --prefix backend run db:migrate:test    # test database only
npm --prefix backend run db:generate        # regenerate the Prisma client
npm --prefix backend run db:deploy          # again: must report "No pending migrations"
npm run dev:api                             # restart
```

## 6. Backup and rollback plan
**Backup before applying** (read-only; prompts for the password, so none appears in the command):
```
pg_dump -h localhost -p 5432 -U readyset_isolated_app -d readyset_isolated_dev -Fc -f readyset_dev_before_phase345.dump
pg_dump -h localhost -p 5432 -U readyset_isolated_app -d readyset_isolated_test -Fc -f readyset_test_before_phase345.dump
```
**Rollback (documented only; destructive, never run without your explicit approval).** The changes are additive, so the safest rollback is simply to not use the new features: code detects missing columns and degrades. A true schema rollback would be:
```sql
-- Migration 2
DROP INDEX "notifications_user_id_snoozed_until_idx";
ALTER TABLE "notifications" DROP COLUMN "snoozed_until";
ALTER TABLE "checklist_items" DROP COLUMN "completed_at";
ALTER TABLE "events" DROP COLUMN "priority";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261125000000_snooze_priority_completion';
-- Migration 1 (drops preparation logs: export them first)
DROP TABLE "preparation_logs";
ALTER TABLE "user_preferences" DROP COLUMN "adaptive_profile_enabled", DROP COLUMN "preparation_overrides";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261124000000_preparation_profile';
```
Data restore (if ever needed): `pg_restore` of the dumps above into a fresh database, never over a live one without approval.

## 7. Required post-migration tests
1. `npm --prefix backend run db:deploy` again: reports no pending migrations.
2. `npm --prefix backend test`: the full suite on the test database. Specifically these currently cannot be verified without the migration:
   - `tests/phase3.test.js` (16 tests: preparation logging, profile, overrides, erase, nullable `event_id` uniqueness, occurrence log after event deletion).
   - In `tests/phase4.test.js`: *snooze* (hidden from unread, history, returns after expiry); currently 1 skipped.
   - In `tests/phase5.test.js`: *priority create/update* and *completed_at* (2 skipped).
   - Analytics with real preparation logs (completion, on-time, average preparation).
3. `npm --prefix backend run test:pure`, `npm test` (frontend), `npm run lint`, `npm run build`.
4. Manual: tap Start preparing / I'm ready / I left on three test events (a throwaway account), then check Prep Profile and Analytics; snooze a notification; set event priority and see it in the Weekly Planner; confirm unread count drops when snoozed.
5. Offline manual checks: see the Phase 5 report (production build, `vite preview`).
