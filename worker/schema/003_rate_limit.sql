-- Better Auth rate-limit rows (database store; Workers have no durable memory).

CREATE TABLE IF NOT EXISTS rate_limit (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL,
  last_request BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS rate_limit_key_idx ON rate_limit(key);
