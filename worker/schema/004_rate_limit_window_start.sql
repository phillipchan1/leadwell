-- Fixed-window rate limits. `last_request` stays for Better Auth; the
-- window is `window_start` and resets when now - window_start >= window.
--
-- Rollback (also documented in RUNBOOK.md):
--   ALTER TABLE rate_limit DROP COLUMN IF EXISTS window_start;

BEGIN;

ALTER TABLE rate_limit
  ADD COLUMN IF NOT EXISTS window_start BIGINT;

UPDATE rate_limit
  SET window_start = last_request
  WHERE window_start IS NULL;

COMMIT;
