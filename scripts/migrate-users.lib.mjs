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

/** Scratch-target only. Stops the server log from recording COPY/DETAIL rows. */
export const TARGET_PANIC_LOGGING_SQL = `ALTER SYSTEM SET log_min_messages = panic;
ALTER SYSTEM SET log_min_error_statement = panic;
ALTER SYSTEM SET log_error_verbosity = terse;
SELECT pg_reload_conf();
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

CREATE TABLE IF NOT EXISTS rate_limit (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL,
  last_request BIGINT NOT NULL,
  window_start BIGINT
);
CREATE INDEX IF NOT EXISTS rate_limit_key_idx ON rate_limit(key);
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

/**
 * Per-table row count plus md5 of every row's text representation.
 * ORDER BY uses COLLATE "C" so source/target collation differences cannot
 * reorder rows and produce a false hash mismatch. A remaining mismatch is
 * a real content difference, not a locale artifact.
 */
export function contentHashQuery() {
  return (
    CHECKSUM_TABLES.map((table, i) => {
      const select = `SELECT '${table}' AS t, COUNT(*)::bigint AS n,
  md5(COALESCE(string_agg(md5((t.*)::text), '' ORDER BY (t.*)::text COLLATE "C"), '')) AS h
FROM public.${table} t`;
      return i === 0 ? select : `UNION ALL ${select}`;
    }).join("\n") + "\nORDER BY 1"
  );
}

/**
 * Prod Polarch grants the read-only source role (migration_reader) EXECUTE
 * on these SECURITY DEFINER wrappers, not USAGE on auth. Every source read
 * of auth.users / auth.identities must go through them. The functions
 * RETURNS TABLE only the Better Auth / COPY columns — never
 * encrypted_password, recovery tokens, or other GoTrue secrets. Auth is
 * magic-link only; those secrets are not required.
 */
export const SOURCE_AUTH_USERS_FN = "migration_tmp.auth_users()";
export const SOURCE_AUTH_IDENTITIES_FN = "migration_tmp.auth_identities()";
export const MIGRATION_READER_ROLE = "migration_reader";

/** pg_dump public only. Never dump auth — those rows come from the functions.
 * Do not add --enable-row-security: that would COPY only rows a policy
 * allows, and migration_reader has no policy (empty dump).
 */
export const PG_DUMP_PUBLIC_ARGS = [
  "--format=custom",
  "--no-owner",
  "--no-acl",
  "--schema=public",
  "--exclude-schema=auth",
];

export const EXPORT_AUTH_USERS_COPY_SQL = `
COPY (
  SELECT id::text, name, email, email_verified, created_at, updated_at
  FROM ${SOURCE_AUTH_USERS_FN}
) TO STDOUT WITH CSV
`;

export const EXPORT_AUTH_IDENTITIES_COPY_SQL = `
COPY (
  SELECT user_id::text, provider, provider_id
  FROM ${SOURCE_AUTH_IDENTITIES_FN}
) TO STDOUT WITH CSV
`;

export const SOURCE_AUTH_USERS_ID_EMAIL_SQL = `
SELECT id::text || '|' || COALESCE(email, '') FROM ${SOURCE_AUTH_USERS_FN} ORDER BY id
`;

export const TARGET_BETTER_AUTH_USERS_ID_EMAIL_SQL = `
SELECT id::text || '|' || COALESCE(email, '') FROM "user" ORDER BY id
`;

function idEmailHashSelect(fromRel, label = "auth_users") {
  return `SELECT '${label}' AS t, COUNT(*)::bigint AS n,
  md5(COALESCE(string_agg(md5((id::text || '|' || lower(COALESCE(email, '')))), '' ORDER BY id::text COLLATE "C"), '')) AS h
FROM ${fromRel}`;
}

/** Source count + md5 of auth users via the SECURITY DEFINER function. */
export function sourceAuthUsersHashQuery() {
  return idEmailHashSelect(SOURCE_AUTH_USERS_FN);
}

/** Target count + md5 of Better Auth "user" (same id + lower(email) as source). */
export function targetBetterAuthUsersHashQuery() {
  return idEmailHashSelect('"user"');
}

/** Source count + md5 of auth identities via the SECURITY DEFINER function. */
export function sourceAuthIdentitiesHashQuery() {
  return `SELECT 'auth_identities' AS t, COUNT(*)::bigint AS n,
  md5(COALESCE(string_agg(md5((user_id::text || '|' || COALESCE(provider, '') || '|' || COALESCE(provider_id::text, ''))), '' ORDER BY (user_id::text || '|' || COALESCE(provider, '') || '|' || COALESCE(provider_id::text, '')) COLLATE "C"), '')) AS h
FROM ${SOURCE_AUTH_IDENTITIES_FN}`;
}

/**
 * Prod + CI SQL for the SECURITY DEFINER wrappers. DROP first because
 * CREATE OR REPLACE cannot change SETOF auth.users / auth.identities to
 * RETURNS TABLE. Qualify every relation — search_path is empty.
 *
 * Columns are exactly what COPY / Better Auth need. encrypted_password,
 * recovery_token, confirmation_token, and identity_data are omitted;
 * magic-link sign-in does not use them.
 */
export const MIGRATION_TMP_FUNCTIONS_SQL = `
CREATE SCHEMA IF NOT EXISTS migration_tmp;

DROP FUNCTION IF EXISTS migration_tmp.auth_users();
DROP FUNCTION IF EXISTS migration_tmp.auth_identities();

CREATE OR REPLACE FUNCTION migration_tmp.auth_users()
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  email_verified boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    u.id,
    COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), ''),
    u.email,
    COALESCE(u.email_confirmed_at IS NOT NULL, false),
    u.created_at,
    u.updated_at
  FROM auth.users AS u;
$$;

CREATE OR REPLACE FUNCTION migration_tmp.auth_identities()
RETURNS TABLE (
  user_id uuid,
  provider text,
  provider_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    i.user_id,
    i.provider,
    COALESCE(
      i.identity_data->>'sub',
      i.identity_data->>'provider_id',
      i.provider_id::text,
      ''
    )
  FROM auth.identities AS i;
$$;
`;

/**
 * REVOKE default/Supabase roles, then EXECUTE for migration_reader only.
 * Prod always has PUBLIC, anon, authenticated, service_role. The CI
 * harness creates the last three as NOLOGIN stubs so this statement
 * applies there too.
 */
export const MIGRATION_TMP_GRANTS_SQL = `
REVOKE ALL ON SCHEMA migration_tmp FROM PUBLIC;
REVOKE ALL ON FUNCTION migration_tmp.auth_users(), migration_tmp.auth_identities() FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA migration_tmp TO ${MIGRATION_READER_ROLE};
GRANT EXECUTE ON FUNCTION migration_tmp.auth_users(), migration_tmp.auth_identities() TO ${MIGRATION_READER_ROLE};
`;

/** Expect 0 rows before DROP FUNCTION. Any row is a normal dependent. */
export const MIGRATION_TMP_DEPENDENTS_SQL = `
SELECT
  pg_catalog.pg_describe_object(d.classid, d.objid, d.objsubid) AS dependent,
  pg_catalog.pg_describe_object(d.refclassid, d.refobjid, d.refobjsubid) AS referenced
FROM pg_catalog.pg_depend d
JOIN pg_catalog.pg_proc p ON p.oid = d.refobjid
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'migration_tmp'
  AND p.proname IN ('auth_users', 'auth_identities')
  AND d.deptype = 'n'
ORDER BY 1, 2
`;

/**
 * Exact prod apply script (function bodies + grants). Run as a privileged
 * role with: psql -1 -v ON_ERROR_STOP=1. Pre-check dependents first.
 * ALTER FUNCTION OWNER is optional when the creating role is already postgres.
 */
export const MIGRATION_TMP_PROD_APPLY_SQL = `
BEGIN;

${MIGRATION_TMP_FUNCTIONS_SQL.trim()}

-- Optional: pin SECURITY DEFINER owner if the creating role is not postgres.
ALTER FUNCTION migration_tmp.auth_users() OWNER TO postgres;
ALTER FUNCTION migration_tmp.auth_identities() OWNER TO postgres;

${MIGRATION_TMP_GRANTS_SQL.trim()}

COMMIT;
`;

/**
 * Roles every Supabase dump's RLS policies / grants expect. Vanilla Postgres
 * and empty Neon do not have these; CREATE POLICY … TO authenticated fails
 * without them. Always stubbed as NOLOGIN on the restore target.
 */
export const DEFAULT_SUPABASE_ROLES = ["anon", "authenticated", "service_role"];

/**
 * Local-Postgres stand-in for the prod wrappers. Same signatures as prod.
 * Call after auth.users / auth.identities exist and after the
 * migration_reader role has been created.
 */
export const PROVE_MIGRATION_TMP_FUNCTIONS_SQL = `
${MIGRATION_TMP_FUNCTIONS_SQL}
${MIGRATION_TMP_GRANTS_SQL}
`;

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

/** Markdown table of per-table counts and md5 hashes. Safe for a step summary.
 * Must not include row data, emails, or password hashes — only counts + md5.
 */
export function formatChecksumReport(srcHashes, dstHashes, tables = CHECKSUM_TABLES) {
  const lines = [
    "| table | source_count | target_count | source_md5 | target_md5 | ok |",
    "| --- | ---: | ---: | --- | --- | --- |",
  ];
  for (const table of tables) {
    const s = srcHashes?.[table];
    const d = dstHashes?.[table];
    const ok =
      Number.isFinite(s?.n) &&
      Number.isFinite(d?.n) &&
      s.n === d.n &&
      Boolean(s?.hash) &&
      Boolean(d?.hash) &&
      s.hash === d.hash;
    lines.push(
      `| ${table} | ${s?.n ?? "?"} | ${d?.n ?? "?"} | ${s?.hash ?? "?"} | ${d?.hash ?? "?"} | ${ok ? "yes" : "NO"} |`,
    );
  }
  return lines.join("\n");
}

/** Parse `id|email` lines from `psql -tA`. Callers must not print emails. */
export function parseIdEmailRows(text) {
  const rows = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const sep = line.indexOf("|");
    if (sep <= 0) continue;
    rows.push({ id: line.slice(0, sep), email: line.slice(sep + 1) });
  }
  return rows;
}

/**
 * Every source auth.users row must exist on target `"user"` with the same
 * id and email (case-insensitive). Messages include ids only — never email.
 */
export function assertAuthUsersCarriedOver(sourceUsers, targetUsers) {
  const src = new Map((sourceUsers ?? []).map((user) => [String(user.id), user]));
  const dst = new Map((targetUsers ?? []).map((user) => [String(user.id), user]));
  const problems = [];
  const ids = [];
  if (src.size === 0) problems.push("source has no auth.users rows");
  for (const [id, user] of src) {
    const other = dst.get(id);
    if (!other) {
      problems.push(`auth user ${id} missing on target`);
      continue;
    }
    const a = String(user.email ?? "").trim().toLowerCase();
    const b = String(other.email ?? "").trim().toLowerCase();
    if (!a || a !== b) {
      problems.push(`auth user ${id} email mismatch`);
      continue;
    }
    ids.push(id);
  }
  for (const id of dst.keys()) {
    if (!src.has(id)) problems.push(`target has extra user ${id}`);
  }
  if (problems.length) {
    throw new Error(
      `auth user carry-over failed — abort:\n${problems.map((p) => `  ${p}`).join("\n")}`,
    );
  }
  return ids;
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

function quoteStringLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function unquoteIdent(raw) {
  const trimmed = String(raw).trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replaceAll('""', '"');
  }
  return trimmed;
}

const SKIP_DUMP_ROLES = new Set([
  "public",
  "none",
  "current_user",
  "session_user",
  "current_role",
]);

const ALLOWED_STUB_ROLE_SET = new Set(DEFAULT_SUPABASE_ROLES.map((role) => role.toLowerCase()));

export function isSkippedDumpRole(name) {
  const n = String(name).toLowerCase();
  return !n || SKIP_DUMP_ROLES.has(n);
}

/** Drop $tag$…$tag$ bodies so CREATE FUNCTION / PROCEDURE SQL is not scanned. */
export function stripDollarQuotedBodies(sql) {
  return String(sql).replace(/\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$/g, " ");
}

function stripSqlCommentsAndBodies(sql) {
  return stripDollarQuotedBodies(sql)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

const DUMP_IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const DUMP_ROLE_LIST = new RegExp(
  String.raw`\bTO\s+((?:${DUMP_IDENT})(?:\s*,\s*(?:${DUMP_IDENT}))*)`,
  "i",
);

/**
 * Roles named by CREATE POLICY … TO and privilege GRANT … ON … TO.
 * Skips function bodies, membership GRANT role TO role, and PUBLIC /
 * session keywords. Does not invent extras.
 */
export function collectRolesFromDumpSql(sql) {
  const roles = new Set();
  const text = stripSqlCommentsAndBodies(sql);
  for (const raw of text.split(";")) {
    const stmt = raw.trim();
    if (!stmt) continue;
    const isPolicy = /^CREATE\s+POLICY\b/i.test(stmt);
    const isPrivilegeGrant = /^GRANT\b/i.test(stmt) && /\bON\b/i.test(stmt);
    if (!isPolicy && !isPrivilegeGrant) continue;
    const match = stmt.match(DUMP_ROLE_LIST);
    if (!match) continue;
    for (const part of match[1].split(",")) {
      const name = unquoteIdent(part);
      if (!isSkippedDumpRole(name)) roles.add(name);
    }
  }
  return [...roles].sort();
}

export function unexpectedDumpRoles(roles) {
  return (roles ?? []).filter((role) => !ALLOWED_STUB_ROLE_SET.has(String(role).toLowerCase()));
}

/**
 * Always stub the three Supabase roles. Any other TO/GRANT role is a
 * hard error — we do not create it.
 */
export function rolesToStubFromDumpSql(sql) {
  const extra = unexpectedDumpRoles(collectRolesFromDumpSql(sql));
  if (extra.length) {
    throw new Error(
      `dump TO/GRANT names non-allowlisted role(s): ${extra.join(", ")}. Only ${DEFAULT_SUPABASE_ROLES.join(", ")} may be stubbed.`,
    );
  }
  return [...DEFAULT_SUPABASE_ROLES].sort();
}

const STUB_ROLES_DOLLAR = "$polarch_stub_roles$";

/**
 * Idempotent NOLOGIN stubs. Safe to re-run on the dry-run scratch target
 * and on Neon (cluster-level CREATE ROLE; IF NOT EXISTS).
 */
export function stubSupabaseRolesSql(roles = DEFAULT_SUPABASE_ROLES) {
  const unique = [...new Set((roles ?? []).map((role) => String(role).trim()).filter(Boolean))].sort();
  if (!unique.length) return "";
  const extra = unexpectedDumpRoles(unique);
  if (extra.length) {
    throw new Error(
      `refusing to stub non-allowlisted role(s): ${extra.join(", ")}. Only ${DEFAULT_SUPABASE_ROLES.join(", ")} may be stubbed.`,
    );
  }
  const body = unique
    .map((role) => {
      const lit = quoteStringLiteral(role);
      const ident = quoteIdent(role);
      return `  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${lit}) THEN
    CREATE ROLE ${ident} NOLOGIN;
  END IF;`;
    })
    .join("\n");
  return `DO ${STUB_ROLES_DOLLAR}\nBEGIN\n${body}\nEND\n${STUB_ROLES_DOLLAR};\n`;
}

/** Local stand-ins for Supabase roles so the prod REVOKE list can run in CI. */
export const PROVE_SUPABASE_ROLE_STUBS_SQL = stubSupabaseRolesSql(DEFAULT_SUPABASE_ROLES);

/** Create the read-only source role used by the live prove harness.
 * Never ALTER … BYPASSRLS here — that must not happen on the source.
 * Prove dumps as the table owner; this role is only for auth-function tests.
 */
export function proveMigrationReaderSetupSql(databaseName) {
  const db = quoteIdent(databaseName);
  const role = quoteIdent(MIGRATION_READER_ROLE);
  return `
DO $polarch_prove_reader$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${MIGRATION_READER_ROLE}') THEN
    CREATE ROLE ${role} LOGIN PASSWORD '${MIGRATION_READER_ROLE}';
  ELSE
    ALTER ROLE ${role} WITH LOGIN PASSWORD '${MIGRATION_READER_ROLE}';
  END IF;
END
$polarch_prove_reader$;
GRANT CONNECT ON DATABASE ${db} TO ${role};
GRANT USAGE ON SCHEMA public TO ${role};
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role};
REVOKE ALL ON SCHEMA auth FROM PUBLIC;
REVOKE ALL ON SCHEMA auth FROM ${role};
${PROVE_SUPABASE_ROLE_STUBS_SQL}
${PROVE_MIGRATION_TMP_FUNCTIONS_SQL}
`;
}

/**
 * Target-only (Neon / scratch Postgres) role used for pg_restore when RLS
 * would otherwise block COPY. Never created on the Supabase source.
 * Password is supplied by the caller and must never be logged.
 */
export const TARGET_COPY_ROLE = "polarch_copy";

export function createTargetCopyRoleSql(password, databaseName) {
  const role = quoteIdent(TARGET_COPY_ROLE);
  const lit = quoteStringLiteral(TARGET_COPY_ROLE);
  const pwd = quoteStringLiteral(password);
  const db = databaseName
    ? `GRANT CONNECT ON DATABASE ${quoteIdent(databaseName)} TO ${role};\n`
    : "";
  return `DO $polarch_copy_role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${lit}) THEN
    CREATE ROLE ${role} LOGIN BYPASSRLS PASSWORD ${pwd};
  ELSE
    ALTER ROLE ${role} WITH LOGIN BYPASSRLS PASSWORD ${pwd};
  END IF;
END
$polarch_copy_role$;
GRANT ${role} TO CURRENT_USER;
${db}GRANT USAGE, CREATE ON SCHEMA public TO ${role};
`;
}

export function grantTargetCopyRoleSchemasSql(schemas = ["public", "auth"]) {
  const role = quoteIdent(TARGET_COPY_ROLE);
  const schemaGrants = schemas
    .map((schema) => `GRANT USAGE, CREATE ON SCHEMA ${quoteIdent(schema)} TO ${role};`)
    .join("\n");
  // REFERENCES only — every public table FK points at auth.users(id).
  // The stub is postgres-owned; USAGE/CREATE on schema auth is not enough.
  // DROP OWNED BY the copy role (then DROP ROLE) revokes this grant.
  // Audit of supabase/migrations 0001–0017: FKs only to auth.users; policies
  // call auth.uid() (default PUBLIC EXECUTE); no auth sequences/types and
  // no extensions-schema objects.
  const tableGrants = `GRANT REFERENCES ON TABLE ${quoteIdent("auth")}.${quoteIdent("users")} TO ${role};`;
  return `${schemaGrants}\n${tableGrants}\n`;
}

export function reassignTargetCopyOwnedSql(ownerName) {
  return `REASSIGN OWNED BY ${quoteIdent(TARGET_COPY_ROLE)} TO ${quoteIdent(ownerName)};\n`;
}

/**
 * Explicit drop of the target-only BYPASSRLS copy role. REASSIGN first so
 * DROP OWNED cannot remove restored tables. Never run on Supabase.
 */
export function disableTargetCopyRoleSql(ownerName) {
  const role = quoteIdent(TARGET_COPY_ROLE);
  const lit = quoteStringLiteral(TARGET_COPY_ROLE);
  const ownerLit = quoteStringLiteral(ownerName);
  return `-- Explicit DROP ROLE of the target-only BYPASSRLS copy role.
-- Alternative if DROP is blocked: ALTER ROLE ${role} NOLOGIN NOBYPASSRLS;
-- Never run this on the Supabase source.
DO $polarch_drop_copy$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${lit}) THEN
    BEGIN
      EXECUTE format('REASSIGN OWNED BY %I TO %I', ${lit}, ${ownerLit});
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    BEGIN
      EXECUTE format('DROP OWNED BY %I', ${lit});
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    EXECUTE format('DROP ROLE %I', ${lit});
  END IF;
END
$polarch_drop_copy$;
`;
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
  const ids = rows.map((row) => row.id).filter(Boolean);
  return `blank source emails: ${ids.length} user id(s): ${ids.join(", ")}`;
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
  const ids = dupes.flatMap((group) => group.rows.map((row) => row.id)).filter(Boolean);
  return `case-insensitive email duplicates: ${ids.length} user id(s) in ${dupes.length} group(s): ${ids.join(", ")}`;
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

/** Harmless no-op. Google identities are not mapped (magic-link auth). */
export function loadGoogleAccountsSql(_identitiesCsvPath) {
  return "-- Google identity mapping skipped (magic-link auth).\n";
}
