-- ReadySet isolated setup for pgAdmin / psql, run MANUALLY by you as a PostgreSQL administrator.
-- It only CREATEs new objects with unique names. It contains no DROP, TRUNCATE, DELETE or ALTER ROLE.
-- Each CREATE fails if the name already exists, so it can never overwrite or adopt anything.
--
-- STEP 0 (read-only): run this first. It must return ZERO rows. If it returns anything, STOP.
select 'role' as kind, rolname as name from pg_roles where rolname = 'readyset_isolated_app'
union all
select 'database', datname from pg_database
where datname in ('readyset_isolated_dev', 'readyset_isolated_test', 'readyset_isolated_shadow');

-- STEP 1: replace CHANGE_ME with a long random password (letters and digits only), keep it for backend/.env.
CREATE ROLE readyset_isolated_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD 'CHANGE_ME';

-- STEP 2: run each statement on its own (CREATE DATABASE cannot run inside a transaction block).
CREATE DATABASE readyset_isolated_dev    OWNER readyset_isolated_app;
CREATE DATABASE readyset_isolated_test   OWNER readyset_isolated_app;
CREATE DATABASE readyset_isolated_shadow OWNER readyset_isolated_app;

-- STEP 3: privileges at database level (pgAdmin: any database).
REVOKE ALL ON DATABASE readyset_isolated_dev    FROM PUBLIC;
REVOKE ALL ON DATABASE readyset_isolated_test   FROM PUBLIC;
REVOKE ALL ON DATABASE readyset_isolated_shadow FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE readyset_isolated_dev    TO readyset_isolated_app;
GRANT CONNECT, TEMPORARY ON DATABASE readyset_isolated_test   TO readyset_isolated_app;
GRANT CONNECT, TEMPORARY ON DATABASE readyset_isolated_shadow TO readyset_isolated_app;

-- STEP 4: schema privileges. Connect to EACH of the three databases in turn and run:
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO readyset_isolated_app;
