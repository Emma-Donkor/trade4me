-- Phase 01: create the isolated test database on first PostgreSQL volume init.
-- This file is mounted into /docker-entrypoint-initdb.d, which runs only once
-- on a fresh data volume, so a plain CREATE DATABASE is safe here.
-- Kept as standard SQL (no psql-only \gexec) so it also works in GUI clients.
CREATE DATABASE tradesense_test;
