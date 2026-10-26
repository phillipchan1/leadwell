-- Rollback for 004_rate_limit_window_start.sql.
-- Do not apply from applySchema — this directory is not auto-run.
-- Also documented in RUNBOOK.md.

ALTER TABLE rate_limit DROP COLUMN IF EXISTS window_start;
