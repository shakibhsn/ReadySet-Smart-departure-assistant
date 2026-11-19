-- ReadySet: create a dedicated role + two NEW databases. Run ONCE as a PostgreSQL superuser:
--
--   psql -h localhost -U postgres -v ON_ERROR_STOP=1 -v app_password='CHOOSE_A_PASSWORD' -f backend/scripts/setup-local-db.sql
--
-- This script only CREATEs. It never drops, truncates or alters anything that already exists.
-- If a role or database with these names already exists, the script STOPS with an error
-- (so it can never overwrite another project's data). Pick other names in that case.
--

CREATE ROLE readyset_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'app_password';
CREATE DATABASE readyset_dev  OWNER readyset_app;
CREATE DATABASE readyset_test OWNER readyset_app;
