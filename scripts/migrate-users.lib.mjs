/**
 * Auth-user cutover helpers. Source is read-only. Target writes happen only
 * after source-user validation and a non-empty-target refusal. Created objects
 * are tracked; failure drops only those. Never DROP SCHEMA public.
 */
import { createHash } from "node:crypto";

export const STUB_AUTH_SQL = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY,
  email TEXT,
  raw_user_meta_data JSONB,
  email_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS auth.identities (
  id UUID PRIMARY KEY,
  user_id UUID,
  provider TEXT,
  provider_id TEXT,
  identity_data JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
`;

export const REQUIRED_EXTENSIONS_SQL = `CREATE EXTENSION IF NOT EXISTS pgcrypto;
`;

export const BETTER_AUTH_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS session_user_id_idx ON session(user_id);
CREATE INDEX IF NOT EXISTS account_user_id_idx ON account(user_id);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);
`;

export const CHECK_LOWER_EMAIL_DUPES_SQL = `
DO $$
DECLARE
  listing text;
BEGIN
  SELECT string_agg(format('%s %s', id, email), E'\\n' ORDER BY lower(email), id)
  INTO listing
  FROM "user" u
  WHERE EXISTS (
    SELECT 1 FROM "user" o
    WHERE lower(o.email) = lower(u.email) AND o.id <> u.id
  );
  IF listing IS NOT NULL THEN
    RAISE EXCEPTION 'cannot create unique index user_email_lower_uidx: case-insensitive email duplicates:%', E'\\n' || listing;
  END IF;
END $$;
`;

export const CREATE_LOWER_EMAIL_INDEX_ONLY_SQL =
  `CREATE UNIQUE INDEX IF NOT EXISTS user_email_lower_uidx ON "user" (lower(email));`;

export const CREATE_LOWER_EMAIL_INDEX_SQL =
  `${CHECK_LOWER_EMAIL_DUPES_SQL}\n${CREATE_LOWER_EMAIL_INDEX_ONLY_SQL}\n`;

export const CHECKSUM_TABLES = [
  "profiles",
  "capacities",
  "domains",
  "managers",
  "teams",
  "people",
  "actions",
  "meetings",
  "tags",
  "topics",
  "follow_ups",
  "one_on_ones",
  "goals",
  "notes",
  "wins",
  "prayers",
  "team_actions",
  "team_goals",
  "team_notes",
  "chats",
  "node_positions",
];

export function checksumQuery() {
  return (
    CHECKSUM_TABLES.map((table, i) =>
      i === 0
        ? `SELECT '${table}' AS t, COUNT(*)::bigint AS n FROM public.${table}`
        : `UNION ALL SELECT '${table}', COUNT(*) FROM public.${table}`,
    ).join("\n") + "\nORDER BY 1"
  );
}

/** Per-table row count plus md5 of every row's text representation, ordered. */
export function contentHashQuery() {
  return (
    CHECKSUM_TABLES.map((table, i) => {
      const select = `SELECT '${table}' AS t, COUNT(*)::bigint AS n,
  md5(COALESCE(string_agg(md5((t.*)::text), '' ORDER BY (t.*)::text), '')) AS h
FROM public.${table} t`;
      return i === 0 ? select : `UNION ALL ${select}`;
    }).join("\n") + "\nORDER BY 1"
  );
}

export function parseCountLine(line) {
  const trimmed = String(line).trim();
  if (!trimmed || trimmed.startsWith("-") || trimmed.startsWith("(")) return null;
  const pipe = trimmed.match(/^(\w+)\s*\|\s*(-?\d+)\s*$/);
  if (pipe && pipe[1] !== "t") return { table: pipe[1], n: Number(pipe[2]) };
  const ta = trimmed.match(/^(\w+)\|(-?\d+)$/);
  if (ta && ta[1] !== "t") return { table: ta[1], n: Number(ta[2]) };
  return null;
}

export function parseCounts(text) {
  const out = {};
  for (const line of String(text).split("\n")) {
    const parsed = parseCountLine(line);
    if (parsed) out[parsed.table] = parsed.n;
  }
  return out;
}

export function parseHashLine(line) {
  const trimmed = String(line).trim();
  if (!trimmed || trimmed.startsWith("-") || trimmed.startsWith("(")) return null;
  const pipe = trimmed.match(/^(\w+)\s*\|\s*(-?\d+)\s*\|\s*([0-9a-f]{32})\s*$/i);
  if (pipe && pipe[1] !== "t") {
    return { table: pipe[1], n: Number(pipe[2]), hash: pipe[3].toLowerCase() };
  }
  const ta = trimmed.match(/^(\w+)\|(-?\d+)\|([0-9a-f]{32})$/i);
  if (ta && ta[1] !== "t") {
    return { table: ta[1], n: Number(ta[2]), hash: ta[3].toLowerCase() };
  }
  return null;
}

export function parseHashes(text) {
  const out = {};
  for (const line of String(text).split("\n")) {
    const parsed = parseHashLine(line);
    if (parsed) out[parsed.table] = parsed;
  }
  return out;
}

export function assertCountsMatch(src, dst, tables = CHECKSUM_TABLES) {
  const problems = [];
  for (const table of tables) {
    const a = src?.[table];
    const b = dst?.[table];
    if (!Number.isFinite(a)) problems.push(`${table}: source count missing or unparsable`);
    if (!Number.isFinite(b)) problems.push(`${table}: target count missing or unparsable`);
    if (Number.isFinite(a) && Number.isFinite(b) && a !== b) {
      problems.push(`${table}: source=${a} target=${b}`);
    }
  }
  if (problems.length) {
    throw new Error(`row-count mismatch — abort:\n${problems.map((p) => `  ${p}`).join("\n")}`);
  }
}

export function assertHashesMatch(src, dst, tables = CHECKSUM_TABLES) {
  const problems = [];
  for (const table of tables) {
    const a = src?.[table];
    const b = dst?.[table];
    if (!a?.hash) problems.push(`${table}: source hash missing or unparsable`);
    if (!b?.hash) problems.push(`${table}: target hash missing or unparsable`);
    if (a?.hash && b?.hash && a.hash !== b.hash) {
      problems.push(`${table}: source=${a.hash} target=${b.hash} (n ${a.n}→${b.n})`);
    }
  }
  if (problems.length) {
    throw new Error(`content-hash mismatch — abort:\n${problems.map((p) => `  ${p}`).join("\n")}`);
  }
}

const USER_OBJECT_FROM = `
SELECT n.nspname AS schema, c.relname AS name, c.relkind::text AS kind, '' AS args
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'auth')
  AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
  AND NOT EXISTS (
    SELECT 1 FROM pg_depend d
    JOIN pg_extension e ON e.oid = d.refobjid
    WHERE d.objid = c.oid AND d.deptype = 'e'
  )
UNION ALL
SELECT n.nspname, p.proname, 'f', pg_get_function_identity_arguments(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'auth')
  AND NOT EXISTS (
    SELECT 1 FROM pg_depend d
    JOIN pg_extension e ON e.oid = d.refobjid
    WHERE d.objid = p.oid AND d.deptype = 'e'
  )
UNION ALL
SELECT n.nspname, t.typname, 't', ''
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname IN ('public', 'auth')
  AND t.typtype IN ('e', 'c', 'd')
  AND (t.typrelid = 0 OR NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid = t.typrelid AND c.relkind IN ('r', 'p', 'v', 'm')
  ))
  AND NOT EXISTS (
    SELECT 1 FROM pg_depend d
    JOIN pg_extension e ON e.oid = d.refobjid
    WHERE d.objid = t.oid AND d.deptype = 'e'
  )
UNION ALL
SELECT n.nspname, e.extname, 'e', ''
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE n.nspname IN ('public', 'auth')
UNION ALL
SELECT n.nspname, n.nspname, 'n', ''
FROM pg_namespace n
WHERE n.nspname = 'auth'
`;

export const LIST_USER_OBJECTS_TEXT_SQL = `
SELECT schema || E'\\t' || kind || E'\\t' || name || E'\\t' || COALESCE(args, '')
FROM (${USER_OBJECT_FROM}) list
ORDER BY schema, kind, name, args
`;

export function parseObjectList(text) {
  const rows = [];
  for (const raw of String(text).split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const [schema, kind, name, ...rest] = line.split("\t");
    if (!schema || !kind || !name) continue;
    rows.push({ schema, kind, name, args: rest.join("\t") });
  }
  return rows;
}

export function objectKey(row) {
  return `${row.schema}\0${row.kind}\0${row.name}\0${row.args ?? ""}`;
}

export function createdSince(before, after) {
  const keys = new Set((before ?? []).map(objectKey));
  return (after ?? []).filter((row) => !keys.has(objectKey(row)));
}

export function objectHash(objects) {
  const payload = (objects ?? [])
    .map((row) => `${row.schema}\t${row.kind}\t${row.name}\t${row.args ?? ""}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(payload).digest("hex");
}

export function isNonEmptyTargetObject(row) {
  return row.kind !== "e";
}

export function quoteIdent(ident) {
  return `"${String(ident).replaceAll('"', '""')}"`;
}

export function dropCreatedSql(created) {
  const lines = [];
  for (const row of created) {
    if (row.kind === "r" || row.kind === "p") {
      lines.push(`DROP TABLE IF EXISTS ${quoteIdent(row.schema)}.${quoteIdent(row.name)} CASCADE;`);
    }
  }
  for (const row of created) {
    if (row.kind === "v") {
      lines.push(`DROP VIEW IF EXISTS ${quoteIdent(row.schema)}.${quoteIdent(row.name)} CASCADE;`);
    }
    if (row.kind === "m") {
      lines.push(
        `DROP MATERIALIZED VIEW IF EXISTS ${quoteIdent(row.schema)}.${quoteIdent(row.name)} CASCADE;`,
      );
    }
  }
  for (const row of created) {
    if (row.kind === "S") {
      lines.push(`DROP SEQUENCE IF EXISTS ${quoteIdent(row.schema)}.${quoteIdent(row.name)} CASCADE;`);
    }
  }
  for (const row of created) {
    if (row.kind === "f") {
      lines.push(
        `DROP FUNCTION IF EXISTS ${quoteIdent(row.schema)}.${quoteIdent(row.name)}(${row.args ?? ""}) CASCADE;`,
      );
    }
  }
  for (const row of created) {
    if (row.kind === "t") {
      lines.push(`DROP TYPE IF EXISTS ${quoteIdent(row.schema)}.${quoteIdent(row.name)} CASCADE;`);
    }
  }
  for (const row of created) {
    if (row.kind === "e") {
      lines.push(`DROP EXTENSION IF EXISTS ${quoteIdent(row.name)};`);
    }
  }
  if (created.some((row) => row.kind === "n" && row.name === "auth")) {
    lines.push("DROP SCHEMA IF EXISTS auth CASCADE;");
  }
  return lines.join("\n") + (lines.length ? "\n" : "");
}

export function formatNonEmptyTargetAbort(objects) {
  const lines = objects.map((row) => `  ${row.schema}.${row.name} (${row.kind})`);
  return `target is not empty — abort, wrote nothing:\n${lines.join("\n")}`;
}

export function filterRestoreToc(listText) {
  return String(listText)
    .split("\n")
    .filter((line) => {
      if (line.trimStart().startsWith(";")) return true;
      if (/\bSCHEMA - public\b/.test(line) || /\bSCHEMA public\b/.test(line)) return false;
      if (/\bCOMMENT\b/.test(line) && /\bSCHEMA public\b/.test(line)) return false;
      if (/\bEXTENSION\b/.test(line)) return false;
      return true;
    })
    .join("\n");
}

export function parseAuthUsersCsv(csv) {
  const users = [];
  for (const line of String(csv).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    if (!cols[0]) continue;
    users.push({
      id: cols[0],
      name: cols[1] ?? "",
      email: cols[2] ?? "",
      email_verified: cols[3] === "t" || cols[3] === "true" || cols[3] === "1",
      created_at: cols[4] || null,
      updated_at: cols[5] || null,
    });
  }
  return users;
}

export function parseIdentitiesCsv(csv) {
  const rows = [];
  for (const line of String(csv).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    if (!cols[0]) continue;
    rows.push({
      user_id: cols[0],
      provider: cols[1] ?? "",
      provider_id: cols[2] ?? "",
    });
  }
  return rows;
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        quoted = false;
        continue;
      }
      cur += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export function emailIsBlank(email) {
  if (email == null) return true;
  if (typeof email !== "string") return true;
  return email.trim() === "";
}

export function describeSourceEmail(email) {
  if (email == null) return "<null>";
  if (typeof email !== "string") return `<${typeof email}>`;
  if (email === "") return "<empty>";
  if (email.trim() === "") return "<whitespace>";
  return email;
}

export function findBlankEmails(users) {
  return users.filter((user) => emailIsBlank(user.email));
}

export function formatBlankEmailAbort(rows) {
  const lines = rows.map((row) => `  ${row.id} ${describeSourceEmail(row.email)}`);
  return `blank source emails:\n${lines.join("\n")}`;
}

export function findCaseInsensitiveEmailDupes(users) {
  const groups = new Map();
  for (const user of users) {
    if (emailIsBlank(user.email)) continue;
    const key = String(user.email).toLowerCase();
    const list = groups.get(key) ?? [];
    list.push(user);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([emailKey, rows]) => ({ emailKey, rows }));
}

export function formatEmailDupeAbort(dupes) {
  const lines = dupes.flatMap((group) => group.rows.map((row) => `  ${row.id} ${row.email}`));
  return `case-insensitive email duplicates:\n${lines.join("\n")}`;
}

export function formatSourceUsersAbort({ blanks, dupes }) {
  const parts = ["source users invalid — abort, wrote nothing:"];
  if (blanks.length) parts.push(formatBlankEmailAbort(blanks));
  if (dupes.length) parts.push(formatEmailDupeAbort(dupes));
  return parts.join("\n");
}

export function assertSourceUsersReady(users) {
  const blanks = findBlankEmails(users);
  const dupes = findCaseInsensitiveEmailDupes(users);
  if (blanks.length || dupes.length) throw new Error(formatSourceUsersAbort({ blanks, dupes }));
}

function authUsersImportSql(csvPath, extraInserts) {
  return `
BEGIN;
CREATE TEMP TABLE auth_users_import (
  id TEXT, name TEXT, email TEXT, email_verified BOOLEAN,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
) ON COMMIT DROP;
\\copy auth_users_import FROM '${csvPath}' WITH CSV
${extraInserts}
COMMIT;
`;
}

export function loadStubAuthUsersSql(csvPath) {
  return authUsersImportSql(
    csvPath,
    `
INSERT INTO auth.users (id, email, created_at, updated_at)
SELECT id::uuid, email, created_at, COALESCE(updated_at, created_at)
FROM auth_users_import
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
`,
  );
}

export function loadBetterAuthUsersSql(csvPath) {
  return authUsersImportSql(
    csvPath,
    `
INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
SELECT id, name, lower(email), email_verified, created_at, COALESCE(updated_at, created_at)
FROM auth_users_import
ON CONFLICT (id) DO UPDATE SET
  email = lower(EXCLUDED.email),
  name = EXCLUDED.name,
  email_verified = EXCLUDED.email_verified;
${CREATE_LOWER_EMAIL_INDEX_SQL}
`,
  );
}

export function loadGoogleAccountsSql(identitiesCsvPath) {
  return `
BEGIN;
CREATE TEMP TABLE auth_identities_import (
  user_id TEXT, provider TEXT, provider_id TEXT
) ON COMMIT DROP;
\\copy auth_identities_import FROM '${identitiesCsvPath}' WITH CSV
INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at)
SELECT gen_random_uuid()::text, provider_id, 'google', user_id, NOW(), NOW()
FROM auth_identities_import
WHERE provider IN ('google', 'Google')
  AND provider_id <> ''
  AND EXISTS (SELECT 1 FROM "user" u WHERE u.id = auth_identities_import.user_id)
ON CONFLICT DO NOTHING;
COMMIT;
`;
}
