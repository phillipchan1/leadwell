#!/usr/bin/env node
/**
 * Prove the Supabase → Neon migrate helpers and the dry-run contract.
 *
 * Always:
 *   - unit-tests migrate-users.lib (no DB)
 *   - runs `migrate-supabase-to-neon.mjs --dry-run` with no URLs
 *
 * Optional live dump/import (loopback only):
 *   LEADWELL_PROVE_SOURCE_URL=postgres://…@127.0.0.1/… \
 *   LEADWELL_PROVE_TARGET_URL=postgres://…@127.0.0.1/… \
 *     node scripts/prove-migrate.mjs
 *
 * Live mode seeds a throwaway source (including CREATE POLICY …
 * TO authenticated), imports into an empty target, and checks row
 * counts + content hashes + that the role-scoped policy restored.
 * It never talks to Supabase.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { libpqCleanEnv, refuseUnsafeTestUrl } from "./loopback.mjs";
import {
  CHECKSUM_TABLES,
  EXPORT_AUTH_IDENTITIES_COPY_SQL,
  EXPORT_AUTH_USERS_COPY_SQL,
  MIGRATION_READER_ROLE,
  MIGRATION_TMP_DEPENDENTS_SQL,
  MIGRATION_TMP_FUNCTIONS_SQL,
  MIGRATION_TMP_GRANTS_SQL,
  MIGRATION_TMP_PROD_APPLY_SQL,
  PG_DUMP_PUBLIC_ARGS,
  PROVE_MIGRATION_TMP_FUNCTIONS_SQL,
  SOURCE_AUTH_IDENTITIES_FN,
  SOURCE_AUTH_USERS_FN,
  SOURCE_AUTH_USERS_ID_EMAIL_SQL,
  assertAuthUsersCarriedOver,
  assertCountsMatch,
  assertHashesMatch,
  assertSourceUsersReady,
  contentHashQuery,
  createdSince,
  dropCreatedSql,
  filterRestoreToc,
  formatChecksumReport,
  formatNonEmptyTargetAbort,
  isNonEmptyTargetObject,
  parseAuthUsersCsv,
  parseCounts,
  parseHashes,
  parseIdEmailRows,
  parseIdentitiesCsv,
  parseObjectList,
  proveMigrationReaderSetupSql,
  rolesToStubFromDumpSql,
  sourceAuthIdentitiesHashQuery,
  sourceAuthUsersHashQuery,
  stubSupabaseRolesSql,
  collectRolesFromDumpSql,
  targetBetterAuthUsersHashQuery,
} from "./migrate-users.lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const fails = [];
let checks = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) fails.push(msg);
}

const DRY_RUN_NEEDLES = [
  "dry-run: would pg_dump public (exclude auth) and COPY migration_tmp.auth_users() / migration_tmp.auth_identities() from SUPABASE_DB_URL (read-only)",
  "dry-run: would abort before any Neon write if an email is blank or lower(email) is duplicated",
  "dry-run: would refuse a non-empty target",
  "dry-run: would CREATE EXTENSION IF NOT EXISTS pgcrypto",
  "dry-run: would CREATE EXTENSION IF NOT EXISTS pgcrypto, then stub auth.users + auth.uid() and Supabase roles (anon, authenticated, service_role, plus dump TO/GRANT) on NEON_DB_URL",
  "dry-run: would pg_restore --exit-on-error with EXTENSION entries filtered out",
  'dry-run: would insert auth.users into Better Auth "user" (same ids); magic-link uses that email',
  "dry-run: would compare per-table row counts and content hashes and abort on mismatch",
];

// --- lib unit tests (no DB) -------------------------------------------------
assertSourceUsersReady([
  { id: "1", name: "Phil", email: "phil@example.com", email_verified: true },
]);
ok(true, "valid source user accepted");

let blankThrew = false;
try {
  assertSourceUsersReady([{ id: "1", name: "x", email: "   ", email_verified: false }]);
} catch {
  blankThrew = true;
}
ok(blankThrew, "blank email aborted");

let dupeThrew = false;
try {
  assertSourceUsersReady([
    { id: "1", name: "a", email: "Phil@Example.com", email_verified: true },
    { id: "2", name: "b", email: "phil@example.com", email_verified: true },
  ]);
} catch {
  dupeThrew = true;
}
ok(dupeThrew, "case-insensitive email dupe aborted");

const hashes = parseHashes("profiles|1|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\nteams|0|bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n");
ok(hashes.profiles?.n === 1 && hashes.profiles.hash.length === 32, "parseHashes pipe");
assertCountsMatch({ profiles: 1, teams: 0 }, { profiles: 1, teams: 0 }, ["profiles", "teams"]);
assertHashesMatch(hashes, hashes, ["profiles", "teams"]);
ok(true, "matching counts/hashes pass");

let countThrew = false;
try {
  assertCountsMatch({ profiles: 1 }, { profiles: 2 }, ["profiles"]);
} catch {
  countThrew = true;
}
ok(countThrew, "count mismatch aborted");

let hashThrew = false;
try {
  assertHashesMatch(
    { profiles: { n: 1, hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } },
    { profiles: { n: 1, hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" } },
    ["profiles"],
  );
} catch {
  hashThrew = true;
}
ok(hashThrew, "hash mismatch aborted");

const toc = `; archive\n123; SCHEMA - public postgres\n456; COMMENT - SCHEMA public\n789; EXTENSION - pgcrypto\n012; TABLE public profiles\n`;
const filtered = filterRestoreToc(toc);
ok(!filtered.includes("SCHEMA - public"), "toc drops SCHEMA public");
ok(!filtered.includes("EXTENSION"), "toc drops EXTENSION");
ok(filtered.includes("TABLE public profiles"), "toc keeps tables");

const objects = parseObjectList("public\tr\tprofiles\t\nauth\tn\tauth\t\n");
ok(objects.length === 2 && isNonEmptyTargetObject(objects[0]), "object list parse");
ok(formatNonEmptyTargetAbort(objects).includes("public.profiles"), "non-empty abort text");
const created = createdSince([], objects);
ok(dropCreatedSql(created).includes("DROP TABLE"), "drop SQL for created tables");

const users = parseAuthUsersCsv('aaaa,"Phil Chan",phil@example.com,t,2020-01-01,2020-01-02\n');
ok(users[0]?.email === "phil@example.com" && users[0].email_verified, "auth users csv");
const ids = parseIdentitiesCsv("aaaa,google,google-sub-1\n");
ok(ids[0]?.provider === "google" && ids[0].provider_id === "google-sub-1", "identities csv");

ok(CHECKSUM_TABLES.length === 21, "21 public tables checksummed");
ok(contentHashQuery().includes("md5"), "content hash query uses md5");
ok(contentHashQuery().includes('COLLATE "C"'), "hash order is collation-independent");
ok(!contentHashQuery().includes("auth.users"), "public checksums do not read auth.users");
ok(!contentHashQuery().includes("auth.identities"), "public checksums do not read auth.identities");
ok(parseCounts("profiles|3\n").profiles === 3, "parseCounts");

ok(PG_DUMP_PUBLIC_ARGS.includes("--schema=public"), "pg_dump dumps public only");
ok(PG_DUMP_PUBLIC_ARGS.includes("--exclude-schema=auth"), "pg_dump excludes auth");
ok(SOURCE_AUTH_USERS_FN === "migration_tmp.auth_users()", "source users function name");
ok(SOURCE_AUTH_IDENTITIES_FN === "migration_tmp.auth_identities()", "source identities function name");
ok(EXPORT_AUTH_USERS_COPY_SQL.includes(SOURCE_AUTH_USERS_FN), "users COPY uses the function");
ok(!/\bFROM\s+auth\.users\b/.test(EXPORT_AUTH_USERS_COPY_SQL), "users COPY does not read auth.users");
ok(EXPORT_AUTH_IDENTITIES_COPY_SQL.includes(SOURCE_AUTH_IDENTITIES_FN), "identities COPY uses the function");
ok(
  !/\bFROM\s+auth\.identities\b/.test(EXPORT_AUTH_IDENTITIES_COPY_SQL),
  "identities COPY does not read auth.identities",
);
ok(SOURCE_AUTH_USERS_ID_EMAIL_SQL.includes(SOURCE_AUTH_USERS_FN), "Phil id check uses the function");
ok(!/\bFROM\s+auth\.users\b/.test(SOURCE_AUTH_USERS_ID_EMAIL_SQL), "Phil id check does not read auth.users");
ok(sourceAuthUsersHashQuery().includes(SOURCE_AUTH_USERS_FN), "auth users count/md5 uses the function");
ok(sourceAuthIdentitiesHashQuery().includes(SOURCE_AUTH_IDENTITIES_FN), "auth identities count/md5 uses the function");
ok(targetBetterAuthUsersHashQuery().includes('"user"'), "target auth hash reads Better Auth user");
ok(PROVE_MIGRATION_TMP_FUNCTIONS_SQL.includes("SECURITY DEFINER"), "prove harness functions are SECURITY DEFINER");
ok(MIGRATION_TMP_FUNCTIONS_SQL.includes("RETURNS TABLE"), "prod users/identities fns return TABLE");
ok(!/SETOF/.test(MIGRATION_TMP_FUNCTIONS_SQL), "prod fns do not return SETOF");
ok(MIGRATION_TMP_FUNCTIONS_SQL.includes("SET search_path = ''"), "prod fns pin empty search_path");
ok(
  !/SELECT\s+\*\s+FROM\s+auth\.(users|identities)/i.test(MIGRATION_TMP_FUNCTIONS_SQL),
  "prod fns do not SELECT * from auth tables",
);
ok(
  !/encrypted_password|recovery_token|confirmation_token/i.test(MIGRATION_TMP_FUNCTIONS_SQL),
  "prod fns omit password hashes and recovery tokens",
);
ok(
  PROVE_MIGRATION_TMP_FUNCTIONS_SQL.includes(MIGRATION_TMP_FUNCTIONS_SQL.trim()),
  "CI harness uses the same CREATE OR REPLACE SQL as prod",
);
ok(
  /REVOKE ALL ON FUNCTION migration_tmp\.auth_users\(\), migration_tmp\.auth_identities\(\) FROM PUBLIC, anon, authenticated, service_role/.test(
    MIGRATION_TMP_GRANTS_SQL,
  ) &&
    /GRANT EXECUTE ON FUNCTION migration_tmp\.auth_users\(\), migration_tmp\.auth_identities\(\) TO migration_reader/.test(
      MIGRATION_TMP_GRANTS_SQL,
    ),
  "EXECUTE is granted to migration_reader only after REVOKE PUBLIC and Supabase roles",
);
ok(MIGRATION_TMP_PROD_APPLY_SQL.includes("BEGIN;"), "prod apply is wrapped in BEGIN");
ok(MIGRATION_TMP_PROD_APPLY_SQL.includes("COMMIT;"), "prod apply commits as one transaction");
ok(MIGRATION_TMP_PROD_APPLY_SQL.includes("OWNER TO postgres"), "prod apply can pin function owner");
ok(MIGRATION_TMP_DEPENDENTS_SQL.includes("pg_depend"), "dependents pre-check reads pg_depend");
ok(
  /CREATE ROLE "?anon"? NOLOGIN/.test(proveMigrationReaderSetupSql("leadwell_src")),
  "CI stubs anon for the prod REVOKE",
);

const policyDumpSql = `
CREATE POLICY actions_owner ON public.actions TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
GRANT ALL ON TABLE public.actions TO authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE POLICY extra ON public.profiles TO "dashboard_user", PUBLIC USING (true);
SET search_path TO public;
ALTER TABLE public.actions OWNER TO postgres;
GRANT authenticated TO postgres;
`;
const scanned = collectRolesFromDumpSql(policyDumpSql);
ok(scanned.includes("authenticated"), "scan finds POLICY TO authenticated");
ok(scanned.includes("anon") && scanned.includes("service_role"), "scan finds GRANT TO anon/service_role");
ok(scanned.includes("dashboard_user"), "scan finds quoted TO role");
ok(!scanned.includes("public") && !scanned.includes("PUBLIC"), "scan skips PUBLIC");
ok(!scanned.includes("postgres"), "scan skips OWNER TO / GRANT … TO postgres");
const stubbed = rolesToStubFromDumpSql("");
ok(
  stubbed.join(",") === "anon,authenticated,service_role",
  "empty dump still stubs anon, authenticated, service_role",
);
ok(rolesToStubFromDumpSql(policyDumpSql).includes("dashboard_user"), "stub list includes scanned extras");
const roleSql = stubSupabaseRolesSql(["authenticated", "anon"]);
ok(/CREATE ROLE "anon" NOLOGIN/.test(roleSql), "stub SQL creates anon NOLOGIN");
ok(/CREATE ROLE "authenticated" NOLOGIN/.test(roleSql), "stub SQL creates authenticated NOLOGIN");
ok(/IF NOT EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'authenticated'\)/.test(roleSql), "stub SQL is idempotent");
ok(!/raw_user_meta_data|email_confirmed_at/.test(EXPORT_AUTH_USERS_COPY_SQL), "users COPY uses projected TABLE columns");
ok(!/identity_data/.test(EXPORT_AUTH_IDENTITIES_COPY_SQL), "identities COPY uses projected TABLE columns");
ok(proveMigrationReaderSetupSql("leadwell_src").includes(MIGRATION_READER_ROLE), "reader setup names the role");

const migrateSrc = readFileSync(join(here, "migrate-supabase-to-neon.mjs"), "utf8");
ok(migrateSrc.includes("rolesToStubFromDumpSql"), "migrate scans dump TO/GRANT for roles");
ok(migrateSrc.includes("stubSupabaseRolesSql"), "migrate applies role stubs before restore");
ok(migrateSrc.includes("EXPORT_AUTH_USERS_COPY_SQL"), "migrate exports users via lib COPY SQL");
ok(migrateSrc.includes("EXPORT_AUTH_IDENTITIES_COPY_SQL"), "migrate exports identities via lib COPY SQL");
ok(migrateSrc.includes("PG_DUMP_PUBLIC_ARGS"), "migrate uses shared public-only dump args");
ok(!/FROM\s+auth\.users\b/.test(migrateSrc), "migrate source has no FROM auth.users");
ok(!/FROM\s+auth\.identities\b/.test(migrateSrc), "migrate source has no FROM auth.identities");
const verifySrc = readFileSync(join(here, "cutover-verify.mjs"), "utf8");
ok(verifySrc.includes("SOURCE_AUTH_USERS_ID_EMAIL_SQL"), "verify Phil check uses the function SQL");
ok(verifySrc.includes("sourceAuthUsersHashQuery"), "verify auth users count/md5 uses the function");
ok(verifySrc.includes("sourceAuthIdentitiesHashQuery"), "verify auth identities count/md5 uses the function");
ok(!/FROM\s+auth\.users\b/.test(verifySrc), "verify source has no FROM auth.users");
ok(!/FROM\s+auth\.identities\b/.test(verifySrc), "verify source has no FROM auth.identities");

const idEmail = parseIdEmailRows("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa|phil@example.com\n");
ok(idEmail[0]?.id === "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "parseIdEmailRows id");
ok(idEmail[0]?.email === "phil@example.com", "parseIdEmailRows email");
const carried = assertAuthUsersCarriedOver(idEmail, [
  { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", email: "Phil@Example.com" },
]);
ok(carried.length === 1 && carried[0] === "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "auth user id carried over");
let authMissing = false;
try {
  assertAuthUsersCarriedOver(idEmail, []);
} catch (err) {
  authMissing = String(err.message).includes("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  ok(!String(err.message).includes("phil@example.com"), "carry-over errors omit email");
}
ok(authMissing, "missing auth user aborted");
let authMismatch = false;
try {
  assertAuthUsersCarriedOver(idEmail, [
    { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", email: "other@example.com" },
  ]);
} catch (err) {
  authMismatch = String(err.message).includes("email mismatch");
  ok(!String(err.message).includes("other@example.com"), "email mismatch omits email");
}
ok(authMismatch, "auth email mismatch aborted");
const report = formatChecksumReport(
  { profiles: { n: 1, hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } },
  { profiles: { n: 1, hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } },
  ["profiles"],
);
ok(report.includes("yes") && report.includes("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), "checksum report markdown");

const workflow = readFileSync(join(root, ".github/workflows/cutover-migrate.yml"), "utf8");
ok(workflow.includes("workflow_dispatch"), "cutover workflow is workflow_dispatch");
ok(!/^\s+(push|pull_request):/m.test(workflow), "cutover workflow is not on push or pull_request");
ok(/dry_run:[\s\S]*default:\s*true/.test(workflow), "dry_run defaults true");
ok(!/^\s*set -x\b/m.test(workflow), "cutover workflow never set -x");
ok(workflow.includes("::add-mask::") || workflow.includes("githubAddMaskLines"), "cutover workflow masks secrets");
ok(
  /actions\/checkout@[0-9a-f]{40}/.test(workflow) &&
    /actions\/setup-node@[0-9a-f]{40}/.test(workflow) &&
    /actions\/upload-artifact@[0-9a-f]{40}/.test(workflow),
  "cutover actions are SHA-pinned",
);
ok(!/leadwell-source-dump/.test(workflow), "cutover does not upload a source dump artifact");
ok(!/path:.*\.dump/.test(workflow), "cutover upload-artifact paths are not dumps");
ok(workflow.includes("NEVER upload"), "cutover comments the no-dump-artifact guard");
ok(
  /name: Delete dumps[\s\S]*always\(\)/.test(workflow) ||
    /if:\s*\$\{\{\s*always\(\)\s*\}\}[\s\S]*\*\.dump/.test(workflow),
  "cutover always() deletes dumps",
);
ok(workflow.includes("cutover-report.md"), "cutover artifact is the checksum report only");
const workflowUploads = [...workflow.matchAll(/uses:\s*actions\/upload-artifact[^\n]*\n(?:[ \t]+[^\n]*\n)*/g)].map(
  (m) => m[0],
);
ok(workflowUploads.length === 1, "cutover has exactly one upload-artifact");
ok(
  workflowUploads.every((block) => /cutover-report\.md/.test(block) && !/\.dump|\.csv/i.test(block)),
  "cutover upload-artifact is the markdown checksum report",
);
for (const name of readdirSync(join(root, ".github/workflows"))) {
  if (!name.endsWith(".yml") && !name.endsWith(".yaml")) continue;
  const text = readFileSync(join(root, ".github/workflows", name), "utf8");
  const uploads = [...text.matchAll(/uses:\s*actions\/upload-artifact[^\n]*\n(?:[ \t]+[^\n]*\n)*/g)].map((m) => m[0]);
  ok(
    uploads.every((block) => !/\.dump|\.csv|auth_users|auth_identities/i.test(block)),
    `${name} does not upload dump/csv/row-data artifacts`,
  );
}
ok(workflow.includes("default_transaction_read_only=on"), "source dump sets default_transaction_read_only");
ok(workflow.includes("SOURCE_DATABASE_URL") && workflow.includes("NEON_DATABASE_URL"), "cutover uses named secrets");
ok(!/LEADWELL_MIGRATE_TEST:\s*["']?1/.test(workflow), "cutover does not set LEADWELL_MIGRATE_TEST=1");
ok(workflow.includes("scripts/migrate-supabase-to-neon.mjs"), "cutover runs the existing migrate script");
ok(workflow.includes("scripts/cutover-verify.mjs"), "cutover writes checksums via cutover-verify");
ok(workflow.includes("PG_DUMP_PUBLIC_ARGS") || workflow.includes("--exclude-schema=auth"), "cutover dump excludes auth");
ok(workflow.includes("migration_tmp.auth_users"), "cutover comments the SECURITY DEFINER users function");

const runbook = readFileSync(join(root, "RUNBOOK.md"), "utf8");
ok(runbook.includes("has_schema_privilege"), "runbook verifies migration_reader has no USAGE on auth");
ok(runbook.includes("has_function_privilege"), "runbook verifies EXECUTE on the wrappers");
ok(runbook.includes("has_function_privilege('anon'"), "runbook expects anon EXECUTE = f");
ok(runbook.includes("has_function_privilege('authenticated'"), "runbook expects authenticated EXECUTE = f");
ok(runbook.includes("has_function_privilege('service_role'"), "runbook expects service_role EXECUTE = f");
ok(runbook.includes("psql -1 -v ON_ERROR_STOP=1"), "runbook applies prod SQL in one transaction");
ok(runbook.includes("OWNER TO postgres"), "runbook documents optional ALTER FUNCTION owner");
ok(/LIMIT 1/.test(runbook) || /count\(\*\)/.test(runbook), "runbook id check is bounded");
ok(runbook.includes("DROP SCHEMA migration_tmp CASCADE"), "runbook drops migration_tmp after cutover");
ok(runbook.includes("encrypted_password"), "runbook documents that password hashes stay off the TABLE");
ok(runbook.includes('role "authenticated" does not exist'), "runbook documents the restore role failure");
ok(runbook.includes("NOLOGIN"), "runbook documents NOLOGIN role stubs");
ok(runbook.includes("dump's `CREATE POLICY"), "runbook documents scanning dump TO/GRANT roles");
ok(runbook.includes("FORCE ROW LEVEL SECURITY") || runbook.includes("FORCE RLS"), "runbook documents Worker vs RLS");
ok(runbook.includes("user_id"), "runbook documents Worker user_id scoping");
ok(!runbook.includes("uploads the dump"), "runbook no longer says the dump is uploaded");
const setupMd = readFileSync(join(root, "SETUP.md"), "utf8");
ok(!/Continue as test user/.test(setupMd), "SETUP.md has no Continue as test user");
const designPrompt = readFileSync(join(root, "docs/design-audit-implementation-prompt.md"), "utf8");
ok(!/Continue as test user/.test(designPrompt), "design prompt has no Continue as test user");

// --- dry-run with no URLs --------------------------------------------------
const dry = spawnSync(process.execPath, [join(here, "migrate-supabase-to-neon.mjs"), "--dry-run"], {
  encoding: "utf8",
  cwd: root,
  env: { ...process.env, SUPABASE_DB_URL: "", NEON_DB_URL: "", SOURCE_DATABASE_URL: "", TARGET_DATABASE_URL: "" },
});
ok(dry.status === 0, "dry-run (no URLs) exits 0");
const dryOut = `${dry.stdout || ""}\n${dry.stderr || ""}`;
for (const needle of DRY_RUN_NEEDLES) {
  ok(dryOut.includes(needle), `dry-run prints: ${needle.slice(0, 48)}…`);
}

// --- optional live loopback dump/import ------------------------------------
const source = process.env.LEADWELL_PROVE_SOURCE_URL || "";
const target = process.env.LEADWELL_PROVE_TARGET_URL || "";

function run(cmd, args, opts = {}) {
  const { env, ...rest } = opts;
  const res = spawnSync(cmd, args, {
    encoding: "utf8",
    cwd: root,
    ...rest,
    env: libpqCleanEnv(env ?? process.env),
  });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed (${res.status}): ${(res.stderr || res.stdout || "").trim()}`);
  }
  return res.stdout;
}

if (source || target) {
  if (!source || !target) {
    throw new Error("Set both LEADWELL_PROVE_SOURCE_URL and LEADWELL_PROVE_TARGET_URL, or neither.");
  }
  refuseUnsafeTestUrl(source, "LEADWELL_PROVE_SOURCE_URL");
  refuseUnsafeTestUrl(target, "LEADWELL_PROVE_TARGET_URL");
  if (source === target) throw new Error("prove source and target must differ");

  const schema = readFileSync(join(root, "worker/schema/001_leadwell.sql"), "utf8");
  const dir = mkdtempSync(join(tmpdir(), "leadwell-prove-"));
  try {
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", source, "-c", "DROP SCHEMA IF EXISTS migration_tmp CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS auth CASCADE;"]);
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", target, "-c", "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS auth CASCADE;"]);
    const seed = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (
  id UUID PRIMARY KEY,
  email TEXT,
  raw_user_meta_data JSONB,
  email_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  encrypted_password TEXT,
  recovery_token TEXT,
  confirmation_token TEXT
);
CREATE TABLE auth.identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  provider TEXT,
  provider_id TEXT,
  identity_data JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
${schema}
INSERT INTO auth.users (
  id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at,
  encrypted_password, recovery_token, confirmation_token
)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'phil@example.com',
  '{"name":"Phil"}',
  NOW(), NOW(), NOW(),
  'not-a-real-hash',
  'not-a-real-recovery',
  'not-a-real-confirm'
);
INSERT INTO auth.identities (user_id, provider, provider_id, identity_data)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'google',
  'google-sub-1',
  '{"sub":"google-sub-1"}'
);
INSERT INTO public.profiles (user_id, name, title)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Phil', 'Lead');
INSERT INTO public.teams (user_id, id, name, capacity_id, sort_order)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 't1', 'Frontier', 'c1', 0);
INSERT INTO public.actions (user_id, id, person_id, text)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1', 'p1', 'Follow up');
`;
    const seedPath = join(dir, "seed.sql");
    writeFileSync(seedPath, seed);
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", source, "-f", seedPath]);

    const sourceDb = decodeURIComponent(new URL(source).pathname.replace(/^\//, "").replace(/\/$/, ""));
    if (!sourceDb) throw new Error("prove source URL has no database name");
    const readerSetupPath = join(dir, "reader.sql");
    writeFileSync(readerSetupPath, proveMigrationReaderSetupSql(sourceDb));
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", source, "-f", readerSetupPath]);
    const readerSource = (() => {
      const u = new URL(source);
      u.username = MIGRATION_READER_ROLE;
      u.password = MIGRATION_READER_ROLE;
      return u.href;
    })();

    const denied = spawnSync(
      "psql",
      ["-v", "ON_ERROR_STOP=1", "-d", readerSource, "-c", "SELECT 1 FROM auth.users LIMIT 1"],
      { encoding: "utf8", cwd: root, env: libpqCleanEnv() },
    );
    ok(denied.status !== 0, "migration_reader cannot SELECT auth.users directly");
    ok(
      /permission denied/i.test(`${denied.stderr || ""}\n${denied.stdout || ""}`),
      "direct auth.users read is permission denied",
    );
    const viaFn = run("psql", [
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-d",
      readerSource,
      "-c",
      `SELECT count(*) FROM ${SOURCE_AUTH_USERS_FN}`,
    ]).trim();
    ok(viaFn === "1", "migration_reader can read via migration_tmp.auth_users()");

    const usersResult = run("psql", [
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-d",
      readerSource,
      "-c",
      "SELECT pg_get_function_result('migration_tmp.auth_users()'::regprocedure)",
    ]).trim();
    ok(/TABLE/i.test(usersResult) && !/SETOF/i.test(usersResult), "live auth_users() RETURNS TABLE, not SETOF");
    ok(
      !/encrypted_password|recovery_token|confirmation_token/i.test(usersResult),
      "live auth_users() result type omits secrets",
    );
    const identResult = run("psql", [
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-d",
      readerSource,
      "-c",
      "SELECT pg_get_function_result('migration_tmp.auth_identities()'::regprocedure)",
    ]).trim();
    ok(/TABLE/i.test(identResult) && !/SETOF/i.test(identResult), "live auth_identities() RETURNS TABLE, not SETOF");
    ok(!/identity_data/i.test(identResult), "live auth_identities() omits identity_data");

    const secretCols = spawnSync(
      "psql",
      [
        "-v",
        "ON_ERROR_STOP=1",
        "-d",
        readerSource,
        "-c",
        "SELECT encrypted_password, recovery_token FROM migration_tmp.auth_users()",
      ],
      { encoding: "utf8", cwd: root, env: libpqCleanEnv() },
    );
    ok(secretCols.status !== 0, "SELECT encrypted_password from auth_users() fails");
    ok(
      /column .* does not exist/i.test(`${secretCols.stderr || ""}\n${secretCols.stdout || ""}`),
      "auth_users() has no encrypted_password / recovery_token columns",
    );
    const identBlob = spawnSync(
      "psql",
      [
        "-v",
        "ON_ERROR_STOP=1",
        "-d",
        readerSource,
        "-c",
        "SELECT identity_data FROM migration_tmp.auth_identities()",
      ],
      { encoding: "utf8", cwd: root, env: libpqCleanEnv() },
    );
    ok(identBlob.status !== 0, "SELECT identity_data from auth_identities() fails");

    const privSql = (fn) =>
      `SELECT r.rolname || '=' || CASE WHEN has_function_privilege(r.rolname, '${fn}', 'EXECUTE') THEN 't' ELSE 'f' END
FROM (VALUES ('migration_reader'), ('anon'), ('authenticated'), ('service_role')) AS r(rolname)
ORDER BY 1`;
    const privRows = run("psql", ["-v", "ON_ERROR_STOP=1", "-tA", "-d", source, "-c", privSql("migration_tmp.auth_users()")])
      .trim()
      .split("\n")
      .filter(Boolean);
    ok(privRows.includes("anon=f"), "anon has no EXECUTE on auth_users()");
    ok(privRows.includes("authenticated=f"), "authenticated has no EXECUTE on auth_users()");
    ok(privRows.includes("service_role=f"), "service_role has no EXECUTE on auth_users()");
    ok(privRows.includes("migration_reader=t"), "migration_reader has EXECUTE on auth_users()");
    const identPriv = run("psql", [
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-d",
      source,
      "-c",
      privSql("migration_tmp.auth_identities()"),
    ])
      .trim()
      .split("\n")
      .filter(Boolean);
    ok(identPriv.includes("anon=f"), "anon has no EXECUTE on auth_identities()");
    ok(identPriv.includes("authenticated=f"), "authenticated has no EXECUTE on auth_identities()");
    ok(identPriv.includes("service_role=f"), "service_role has no EXECUTE on auth_identities()");
    ok(identPriv.includes("migration_reader=t"), "migration_reader has EXECUTE on auth_identities()");

    const policyPath = join(dir, "source_policies.sql");
    writeFileSync(
      policyPath,
      `
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS actions_owner ON public.actions;
CREATE POLICY actions_owner ON public.actions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
GRANT SELECT ON public.actions TO authenticated;
`,
    );
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", source, "-f", policyPath]);

    const migrated = spawnSync(
      process.execPath,
      [join(here, "migrate-supabase-to-neon.mjs")],
      {
        encoding: "utf8",
        cwd: root,
        env: {
          ...process.env,
          SUPABASE_DB_URL: readerSource,
          NEON_DB_URL: target,
          LEADWELL_MIGRATE_TEST: "1",
        },
      },
    );
    const migratedOut = `${migrated.stdout || ""}\n${migrated.stderr || ""}`;
    console.log(migratedOut.trim());
    ok(migrated.status === 0, "live migrate exits 0");
    ok(migratedOut.includes("migration ok"), "live migrate prints migration ok");
    ok(migratedOut.includes("profiles:"), "live migrate prints per-table hashes");
    ok(
      /creating stub roles \(.*authenticated.*\) as NOLOGIN/.test(migratedOut),
      "live migrate stubs dump roles before restore",
    );

    const roleBits = run("psql", [
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-d",
      target,
      "-c",
      `SELECT rolname || '=' || CASE WHEN rolcanlogin THEN 'login' ELSE 'nologin' END
       FROM pg_roles
       WHERE rolname IN ('anon', 'authenticated', 'service_role')
       ORDER BY 1`,
    ])
      .trim()
      .split("\n")
      .filter(Boolean);
    ok(roleBits.includes("anon=nologin"), "target stubbed anon NOLOGIN");
    ok(roleBits.includes("authenticated=nologin"), "target stubbed authenticated NOLOGIN");
    ok(roleBits.includes("service_role=nologin"), "target stubbed service_role NOLOGIN");

    const pol = run("psql", [
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-d",
      target,
      "-c",
      `SELECT policyname || '=' || array_to_string(roles, ',')
       FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'actions' AND policyname = 'actions_owner'`,
    ]).trim();
    ok(pol === "actions_owner=authenticated", "restored actions_owner policy is TO authenticated");

    const asOwner = run("psql", [
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-d",
      target,
      "-c",
      "SELECT count(*) FROM public.actions",
    ]).trim();
    ok(asOwner === "1", "table owner still reads actions (RLS not forced)");

    const asAuth = run("psql", [
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-d",
      target,
      "-c",
      "SET ROLE authenticated; SELECT count(*) FROM public.actions",
    ]).trim();
    ok(asAuth === "0", "authenticated RLS uses stub auth.uid() (no rows)");

    const mapped = run("psql", [
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-d",
      target,
      "-c",
      `SELECT id || '|' || email FROM "user"`,
    ]).trim();
    ok(
      mapped.startsWith("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa|phil@example.com"),
      "Better Auth user keeps the Supabase UUID",
    );
    const verified = spawnSync(process.execPath, [join(here, "cutover-verify.mjs"), "--report", join(dir, "report.md")], {
      encoding: "utf8",
      cwd: root,
      env: {
        ...process.env,
        SOURCE_DATABASE_URL: readerSource,
        TARGET_DATABASE_URL: target,
        LEADWELL_MIGRATE_TEST: "1",
        DRY_RUN: "true",
      },
    });
    const verifiedOut = `${verified.stdout || ""}\n${verified.stderr || ""}`;
    console.log(verifiedOut.trim());
    ok(verified.status === 0, "cutover-verify on loopback prove exits 0");
    ok(verifiedOut.includes("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), "cutover-verify prints Phil id");
    ok(!verifiedOut.includes("phil@example.com"), "cutover-verify omits Phil email");
    ok(readFileSync(join(dir, "report.md"), "utf8").includes("source_md5"), "cutover-verify writes report");
    const google = run("psql", [
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-d",
      target,
      "-c",
      `SELECT count(*) FROM account WHERE provider_id = 'google'`,
    ]).trim();
    ok(google === "0", "Google identities are not mapped");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
} else {
  console.log("prove-migrate: live dump/import skipped (no LEADWELL_PROVE_* URLs)");
}

if (fails.length) {
  console.error(`${fails.length}/${checks} failed`);
  for (const f of fails) console.error("  -", f);
  process.exit(1);
}
console.log(`prove-migrate: ${checks} ok`);
