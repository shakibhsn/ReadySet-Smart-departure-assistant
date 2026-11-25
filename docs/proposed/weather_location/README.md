# Proposed migration: `weather_location` (NOT applied)

**Status: prepared only.** Nothing here is in `backend/prisma/` and nothing has been run. It becomes a real migration only after your explicit written approval.

## Why
The weather location chosen in Weather & Explore is kept in the browser's `localStorage` (per user). That survives reloads and logging out and in **on the same browser** but not on another device. Saved places hold address text only, so nothing in the database can store coordinates.

## The change (additive, one nullable column)
`migration.sql` (generated with `prisma migrate diff` from the current schema):
```sql
ALTER TABLE "user_preferences" ADD COLUMN     "weather_location" JSONB;
```
`schema.diff` (add to `model UserPreference` in `backend/prisma/schema.prisma`):
```prisma
  weatherLocation             Json?    @map("weather_location")
```
- Existing rows get `NULL` (= no location chosen). No data is changed, no default, no index, no constraint.
- Stored shape: `{ name, area, latitude, longitude, country, source }` (validated by the API; the same checks as `normalizeLocation` in `src/lib/weatherLocation.js`).

## Risk
Very low: one nullable column on a small table, no lock of consequence, no rewrite. Code that uses it must be feature-detected with `supportsField('UserPreference', 'weatherLocation')` (as priority and snooze are) so the app keeps working before the client is regenerated.

## Steps after approval (in this order)
1. Backup first: new dev and test dumps with `pg_dump`, `pg_restore --list`, scratch restore and comparison, exactly as for the previous migration.
2. Create `backend/prisma/migrations/20261126000000_weather_location/migration.sql` with the SQL above and add the field to `schema.prisma`.
3. API stopped, then: `npm --prefix backend run db:deploy`, `npm --prefix backend run db:migrate:test`, `npm --prefix backend run db:generate`, `db:deploy` again (must say nothing pending), restart the API.
4. Code (small): `GET`/`PATCH /api/users/me/weather-location` (strict schema, `userId` from the JWT); `src/lib/weatherLocation.js` reads the server value first and keeps `localStorage` as the offline/blocked-storage fallback; tests; browser check.
5. Run the full backend and frontend suites, lint and build.

## Rollback (documented only, destructive: never without your approval)
```sql
ALTER TABLE "user_preferences" DROP COLUMN "weather_location";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261126000000_weather_location';
```
The only data lost would be the stored locations, which users can simply choose again.

## Targets (credentials redacted)
`readyset_isolated_dev` and `readyset_isolated_test`, role `readyset_isolated_app`, `localhost:5432`. The shadow database is not used.
