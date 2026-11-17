-- Phase 01: create the isolated test database on first PostgreSQL volume init.
-- \gexec runs the generated CREATE only when the database does not exist, so
-- re-running the init against an existing volume stays idempotent.
SELECT 'CREATE DATABASE tradesense_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tradesense_test')\gexec
