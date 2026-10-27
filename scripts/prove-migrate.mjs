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
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
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
  formatBlankEmailAbort,
  formatEmailDupeAbort,
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
  TARGET_COPY_ROLE,
  createTargetCopyRoleSql,
  disableTargetCopyRoleSql,
} from "./migrate-users.lib.mjs";
import {
  ALLOWED_UPLOAD_ARTIFACT_PATHS,
  assertSafeMigrateLog,
  assertWorkflowUploadAllowlist,
  assertWorkflowsUploadAllowlist,
  collectWorkflowUnits,
  isWorkflowFilename,
  listHash,
  logLooksLikeRowData,
  parseWorkflowDocument,
  unitHash,
  usesIsShaPinned,
} from "./guard-public-ci.mjs";
import {
  GENERIC_SAFE_ERROR,
  formatSafeCommandError,
  sanitizePgFailureText,
  stripPgErrorValues,
} from "./safe-cmd.mjs";

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
  "dry-run: would CREATE EXTENSION IF NOT EXISTS pgcrypto, then stub auth.users + auth.uid() and NOLOGIN roles (anon, authenticated, service_role) on NEON_DB_URL",
  "dry-run: would CREATE a target-only BYPASSRLS copy role on NEON_DB_URL (never on Supabase) and DROP ROLE it after checksums",
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
} catch (err) {
  blankThrew = true;
  ok(!/@/.test(String(err.message)), "blank-email abort has no email");
  ok(/\b1\b/.test(String(err.message)), "blank-email abort names the user id");
  ok(!logLooksLikeRowData(String(err.message)), "blank-email abort is not row data");
}
ok(blankThrew, "blank email aborted");
ok(
  !/@/.test(formatBlankEmailAbort([{ id: "1", email: "   " }])),
  "formatBlankEmailAbort prints ids and counts only",
);

let dupeThrew = false;
try {
  assertSourceUsersReady([
    { id: "1", name: "a", email: "Phil@Example.com", email_verified: true },
    { id: "2", name: "b", email: "phil@example.com", email_verified: true },
  ]);
} catch (err) {
  dupeThrew = true;
  ok(!/phil@/i.test(String(err.message)), "dupe-email abort has no email");
  ok(/\b1\b/.test(String(err.message)) && /\b2\b/.test(String(err.message)), "dupe-email abort names both ids");
  ok(!logLooksLikeRowData(String(err.message)), "dupe-email abort is not row data");
}
ok(dupeThrew, "case-insensitive email dupe aborted");
ok(
  !/@/.test(
    formatEmailDupeAbort([
      {
        emailKey: "phil@example.com",
        rows: [
          { id: "1", email: "Phil@Example.com" },
          { id: "2", email: "phil@example.com" },
        ],
      },
    ]),
  ),
  "formatEmailDupeAbort prints ids and counts only",
);

const leakyPg = [
  'ERROR:  duplicate key value violates unique constraint "user_email_key"',
  "DETAIL:  Key (email)=(phil@example.com) already exists.",
  'CONTEXT:  COPY auth_users_import, line 1: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa,Phil,phil@example.com,t"',
  "HINT:  You might need to use ON CONFLICT.",
  "WHERE:  SQL statement",
  "LINE 1: INSERT INTO",
  "Failing row contains (aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa, Phil, phil@example.com).",
  "SQLSTATE 23505",
].join("\n");
const sanitized = sanitizePgFailureText(leakyPg);
ok(sanitized.sqlstate === "23505", "sanitizer keeps SQLSTATE");
ok(/ERROR:/i.test(sanitized.firstError), "sanitizer keeps the first ERROR line");
ok(!/phil@/i.test(sanitized.firstError), "sanitizer strips emails from ERROR");
ok(!/Key \(email\)=\(phil@/i.test(sanitized.firstError), "sanitizer strips Key (...)=(...)");
ok(!/DETAIL|CONTEXT|HINT|WHERE|LINE |Failing row/i.test(sanitized.firstError), "sanitizer drops DETAIL and friends");
const safeFail = formatSafeCommandError("psql", 1, leakyPg, "");
ok(!/phil@/i.test(safeFail), "safe command error has no email");
ok(/psql failed \(1\)/.test(safeFail), "safe command error names cmd and exit");
ok(/SQLSTATE 23505/.test(safeFail), "safe command error includes SQLSTATE");
ok(!logLooksLikeRowData(safeFail), "safe command error is not row data");
ok(
  !/\(phil@/i.test(stripPgErrorValues("DETAIL:  Key (email)=(phil@example.com) already exists.")),
  "stripPgErrorValues removes Key values",
);
ok(
  formatSafeCommandError("psql", 1, "ERROR:  boom phil@example.com leaked\n", "") === GENERIC_SAFE_ERROR,
  "safe command error becomes generic if it still looks like row data",
);

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
ok(!PG_DUMP_PUBLIC_ARGS.includes("--enable-row-security"), "pg_dump does not enable row security");
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
SET search_path TO public;
ALTER TABLE public.actions OWNER TO postgres;
GRANT authenticated TO postgres;
CREATE FUNCTION sneak() RETURNS void LANGUAGE sql AS $function$
CREATE POLICY hidden ON public.profiles TO dashboard_user USING (true);
GRANT SELECT ON TABLE public.profiles TO dashboard_user;
$function$;
`;
const scanned = collectRolesFromDumpSql(policyDumpSql);
ok(scanned.includes("authenticated"), "scan finds POLICY TO authenticated");
ok(scanned.includes("anon") && scanned.includes("service_role"), "scan finds GRANT TO anon/service_role");
ok(!scanned.includes("dashboard_user"), "scan ignores roles inside function bodies");
ok(!scanned.includes("public") && !scanned.includes("PUBLIC"), "scan skips PUBLIC");
ok(!scanned.includes("postgres"), "scan skips membership GRANT role TO role");
ok(
  collectRolesFromDumpSql(
    "-- Name: actions_owner; Type: POLICY; Schema: public; Owner: -\nCREATE POLICY actions_owner ON public.actions TO authenticated USING (true);",
  ).includes("authenticated"),
  "scan finds POLICY after dump comment that contains semicolons",
);
const stubbed = rolesToStubFromDumpSql("");
ok(
  stubbed.join(",") === "anon,authenticated,service_role",
  "empty dump still stubs anon, authenticated, service_role",
);
ok(rolesToStubFromDumpSql(policyDumpSql).join(",") === "anon,authenticated,service_role", "allowlisted dump stubs only the three roles");
let extraThrew = false;
try {
  rolesToStubFromDumpSql("CREATE POLICY extra ON public.profiles TO dashboard_user USING (true);");
} catch (err) {
  extraThrew = String(err.message).includes("dashboard_user");
}
ok(extraThrew, "non-allowlisted TO role fails loudly");
let stubExtraThrew = false;
try {
  stubSupabaseRolesSql(["authenticated", "dashboard_user"]);
} catch (err) {
  stubExtraThrew = String(err.message).includes("dashboard_user");
}
ok(stubExtraThrew, "stub SQL refuses non-allowlisted roles");
const roleSql = stubSupabaseRolesSql(["authenticated", "anon"]);
ok(/CREATE ROLE "anon" NOLOGIN/.test(roleSql), "stub SQL creates anon NOLOGIN");
ok(/CREATE ROLE "authenticated" NOLOGIN/.test(roleSql), "stub SQL creates authenticated NOLOGIN");
ok(/IF NOT EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'authenticated'\)/.test(roleSql), "stub SQL is idempotent");
ok(roleSql.includes("$leadwell_stub_roles$"), "stub SQL uses a tagged dollar-quote");
ok(!/DO \$\$/.test(roleSql), "stub SQL does not use untagged DO $$");
ok(
  !proveMigrationReaderSetupSql("leadwell_src").includes("BYPASSRLS"),
  "prove reader is not granted BYPASSRLS",
);
ok(TARGET_COPY_ROLE === "leadwell_copy", "target copy role name");
const copySql = createTargetCopyRoleSql("x", "leadwell_dst");
ok(copySql.includes("BYPASSRLS") && copySql.includes("LOGIN"), "copy role SQL is LOGIN BYPASSRLS");
ok(copySql.includes("$leadwell_copy_role$"), "copy role SQL uses a tagged dollar-quote");
ok(!/DO \$\$/.test(copySql), "copy role SQL does not use untagged DO $$");
const dropCopySql = disableTargetCopyRoleSql("postgres");
ok(/DROP ROLE/.test(dropCopySql), "copy role drop step is explicit DROP ROLE");
ok(dropCopySql.includes("leadwell_copy") || dropCopySql.includes('"leadwell_copy"'), "drop SQL names leadwell_copy");
ok(dropCopySql.includes("Never run this on the Supabase source"), "drop SQL forbids the source");
ok(!/raw_user_meta_data|email_confirmed_at/.test(EXPORT_AUTH_USERS_COPY_SQL), "users COPY uses projected TABLE columns");
ok(!/identity_data/.test(EXPORT_AUTH_IDENTITIES_COPY_SQL), "identities COPY uses projected TABLE columns");
ok(proveMigrationReaderSetupSql("leadwell_src").includes(MIGRATION_READER_ROLE), "reader setup names the role");

const migrateSrc = readFileSync(join(here, "migrate-supabase-to-neon.mjs"), "utf8");
ok(migrateSrc.includes("rolesToStubFromDumpSql"), "migrate scans dump TO/GRANT for roles");
ok(migrateSrc.includes("stubSupabaseRolesSql"), "migrate applies role stubs before restore");
ok(migrateSrc.includes("createTargetCopyRoleSql"), "migrate creates the target copy role");
ok(migrateSrc.includes("disableTargetCopyRoleSql"), "migrate drops the target copy role");
ok(migrateSrc.includes("never on source"), "migrate copy role is target-only");
ok(migrateSrc.includes("explicit DROP ROLE"), "migrate drop step is explicit");
ok(!/ALTER ROLE \$\{role\} BYPASSRLS/.test(migrateSrc), "migrate does not grant source BYPASSRLS");
ok(migrateSrc.includes("safe-cmd.mjs"), "migrate uses the shared safe runner");
ok(migrateSrc.includes("installSafeErrorHandlers"), "migrate installs uncaught error handlers");
ok(!/res\.stderr \|\| res\.stdout/.test(migrateSrc), "migrate run does not echo raw streams");
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
ok(verifySrc.includes("safe-cmd.mjs"), "verify uses the shared safe runner");
ok(verifySrc.includes("installSafeErrorHandlers"), "verify installs uncaught error handlers");

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
ok(!/upload-artifact/.test(workflow), "cutover has no upload-artifact");
ok(!/GITHUB_STEP_SUMMARY/.test(workflow.replace(/#[^\n]*/g, "")), "cutover writes no step summary");
ok(!/GITHUB_OUTPUT/.test(workflow.replace(/#[^\n]*/g, "")), "cutover writes no GITHUB_OUTPUT");
ok(!/cutover-report\.md/.test(workflow), "cutover does not write a report file");
ok(workflow.includes("pg_restore --list") || workflow.includes("--list"), "cutover verifies the dump with pg_restore --list");
ok(/id:\s*backup/.test(workflow), "cutover has a named backup step");
ok(/id:\s*leftover-copy-role/.test(workflow), "cutover has a leftover leadwell_copy always() step");
ok(/id:\s*leftover-copy-role[\s\S]*always\(\)/.test(workflow), "leftover copy-role step is always()");
ok(workflow.includes("scripts/safe-cmd.mjs"), "cutover backup uses the shared safe runner");
ok(workflow.includes("CUTOVER_DUMP_DIR") && workflow.includes("runner.temp"), "backup dump stays in runner.temp");
ok(!/leadwell-source-dump/.test(workflow), "cutover does not upload a source dump artifact");
ok(
  /id:\s*delete-dumps[\s\S]*always\(\)/.test(workflow) ||
    /if:\s*\$\{\{\s*always\(\)\s*\}\}[\s\S]*\*\.dump/.test(workflow),
  "cutover always() deletes dumps",
);
ok(ALLOWED_UPLOAD_ARTIFACT_PATHS.length === 0, "upload-artifact path allowlist is empty");
let allowlistOk = true;
try {
  const steps = assertWorkflowsUploadAllowlist(join(root, ".github/workflows"));
  ok(steps.length === 0, "committed workflows upload no artifacts");
} catch (err) {
  allowlistOk = false;
  ok(false, `workflow hasher allowlist: ${err.message}`);
}
ok(allowlistOk, "committed workflows pass the public-repo hasher");
let dumpUploadThrew = false;
try {
  assertWorkflowUploadAllowlist(
    [
      "name: bad",
      "on: push",
      "jobs:",
      "  j:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - id: up",
      "        uses: actions/upload-artifact@0123456789abcdef0123456789abcdef01234567",
      "        with:",
      "          path: secret.dump",
    ].join("\n"),
    "bad.yml",
  );
} catch (err) {
  dumpUploadThrew = /secret\.dump|upload-artifact|forbidden upload/.test(String(err.message));
}
ok(dumpUploadThrew, "hasher rejects a dump upload");
ok(logLooksLikeRowData("phil@example.com,not-a-real-hash"), "email/CSV is treated as row data");
ok(!logLooksLikeRowData("| profiles | 1 | 1 | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |"), "checksum table is not row data");
assertSafeMigrateLog("  profiles: source=1 neon=1 hash aaa → aaa", "count/hash log");
let rowLogThrew = false;
try {
  assertSafeMigrateLog("id,email\naaaa,phil@example.com\n", "csv");
} catch {
  rowLogThrew = true;
}
ok(rowLogThrew, "row-data log fails the safe-log guard");
ok(!/console\.log\(\s*csv\b/.test(migrateSrc), "migrate does not log CSV contents");
ok(!/console\.log\([^)]*\.email/.test(migrateSrc), "migrate does not log emails");
ok(!/console\.log\([^)]*copyPassword/.test(migrateSrc), "migrate does not log the copy-role password");
ok(!/console\.log\([^)]*copyTarget/.test(migrateSrc), "migrate does not log the copy-role URL");
ok(/console\.log\(\s*` {2}\$\{table\}: source=/.test(migrateSrc), "migrate logs counts and hashes only");
const checksYml = readFileSync(join(root, ".github/workflows/checks.yml"), "utf8");
ok(checksYml.includes("scripts/guard-public-ci.mjs"), "checks.yml runs the hasher");
ok(checksYml.includes("githubAddMaskLines"), "checks.yml masks DB URLs before use");
ok(workflow.includes("githubAddMaskLines"), "cutover masks DB URLs before use");
ok(workflow.includes("default_transaction_read_only=on"), "source dump sets default_transaction_read_only");
ok(workflow.includes("SOURCE_DATABASE_URL") && workflow.includes("NEON_DATABASE_URL"), "cutover uses named secrets");
ok(!/LEADWELL_MIGRATE_TEST:\s*["']?1/.test(workflow), "cutover does not set LEADWELL_MIGRATE_TEST=1");
ok(workflow.includes("scripts/migrate-supabase-to-neon.mjs"), "cutover runs the existing migrate script");
ok(workflow.includes("scripts/cutover-verify.mjs"), "cutover writes checksums via cutover-verify");
ok(!/cutover-verify\.mjs --report/.test(workflow), "cutover verify does not write a report file");
ok(workflow.includes("PG_DUMP_PUBLIC_ARGS") || workflow.includes("--exclude-schema=auth"), "cutover dump excludes auth");
ok(workflow.includes("migration_tmp.auth_users"), "cutover comments the SECURITY DEFINER users function");
ok(!/appendFileSync/.test(verifySrc), "cutover-verify never appends a step summary");
ok(!/GITHUB_STEP_SUMMARY|GITHUB_OUTPUT/.test(verifySrc.replace(/\/\*[\s\S]*?\*\//g, "")), "cutover-verify body never writes summary or output");

for (const [name, text] of [
  ["checks.yml", checksYml],
  ["cutover-migrate.yml", workflow],
]) {
  const collected = collectWorkflowUnits(text);
  ok(collected.full, `${name} parses as a full workflow`);
  ok(collected.units.every((u) => u.id), `${name} every step has an id`);
  ok(collected.jobs.every((j) => j.duplicateIds.length === 0), `${name} has no duplicate step ids`);
  for (const unit of collected.units) {
    if (unit.uses) {
      ok(usesIsShaPinned(unit.uses), `${name} ${unit.id} uses is SHA-pinned`);
    }
  }
}

let parseThrew = false;
try {
  parseWorkflowDocument("jobs: [\n");
} catch {
  parseThrew = true;
}
ok(parseThrew, "hasher fails closed on a YAML parse error");
let mergeThrew = false;
try {
  parseWorkflowDocument("on: push\njobs:\n  a:\n    <<: {runs-on: ubuntu-latest}\n");
} catch (err) {
  mergeThrew = String(err.message).includes("merge");
}
ok(mergeThrew, "hasher fails closed on YAML merge keys");
let multiThrew = false;
try {
  parseWorkflowDocument("name: a\n---\nname: b\n");
} catch (err) {
  multiThrew = /exactly one document/.test(String(err.message));
}
ok(multiThrew, "hasher fails closed on multi-document YAML");
const baseWf = [
  "name: t",
  "on: push",
  "jobs:",
  "  one:",
  "    runs-on: ubuntu-latest",
  "    steps:",
  "      - id: a",
  "        run: echo 1",
  "  two:",
  "    runs-on: ubuntu-latest",
  "    steps:",
  "      - id: b",
  "        run: echo 2",
].join("\n");
const baseUnits = collectWorkflowUnits(baseWf);
const stepA = baseUnits.units.find((u) => u.id === "a");
const h1 = unitHash(stepA);
const extraKey = collectWorkflowUnits(
  [
    "name: t",
    "on: push",
    "jobs:",
    "  one:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - id: a",
    "        run: echo 1",
    "        timeout-minutes: 5",
    "  two:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - id: b",
    "        run: echo 2",
  ].join("\n"),
);
const extraA = extraKey.units.find((u) => u.id === "a");
ok(unitHash(extraA) !== h1, "hasher includes every step key");
const swapped = collectWorkflowUnits(
  [
    "name: t",
    "on: push",
    "jobs:",
    "  two:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - id: b",
    "        run: echo 2",
    "  one:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - id: a",
    "        run: echo 1",
  ].join("\n"),
);
ok(swapped.jobOrder.join(",") === "two,one", "hasher records job order");
ok(listHash(swapped.jobOrder) !== listHash(baseUnits.jobOrder), "hasher hashes workflow job order");
const timeoutJob = collectWorkflowUnits(
  [
    "name: t",
    "on: push",
    "jobs:",
    "  one:",
    "    runs-on: ubuntu-latest",
    "    timeout-minutes: 9",
    "    steps:",
    "      - id: a",
    "        run: echo 1",
    "  two:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - id: b",
    "        run: echo 2",
  ].join("\n"),
);
ok(unitHash(timeoutJob.units.find((u) => u.id === "a")) !== h1, "hasher includes the whole job minus steps");
const triggerChange = collectWorkflowUnits(baseWf.replace("on: push", "on: pull_request"));
ok(unitHash(triggerChange.units.find((u) => u.id === "a")) !== h1, "hasher includes the whole workflow minus jobs");
let dupThrew = false;
try {
  assertWorkflowUploadAllowlist(
    [
      "name: t",
      "on: push",
      "jobs:",
      "  one:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - id: a",
      "        run: echo 1",
      "      - id: a",
      "        run: echo 2",
    ].join("\n"),
    "dup.yml",
  );
} catch (err) {
  dupThrew = /duplicate step id/.test(String(err.message));
}
ok(dupThrew, "hasher rejects duplicate step ids");
ok(usesIsShaPinned("actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5.1.0"), "full SHA uses is pinned");
ok(!usesIsShaPinned("actions/checkout@v5"), "tag uses is not pinned");
ok(!usesIsShaPinned("actions/checkout@v5.1.0"), "semver uses is not pinned");

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
ok(runbook.includes("CREATE POLICY … TO"), "runbook documents scanning dump TO/GRANT roles");
ok(runbook.includes("function bodies"), "runbook documents not scanning function bodies");
ok(runbook.includes("FORCE ROW LEVEL SECURITY") || runbook.includes("FORCE RLS"), "runbook documents Worker vs RLS");
ok(runbook.includes("user_id"), "runbook documents Worker user_id scoping");
ok(!runbook.includes("uploads the dump"), "runbook no longer says the dump is uploaded");
ok(runbook.includes("BYPASSRLS"), "runbook documents the target-only BYPASSRLS copy role");
ok(runbook.includes("DROP ROLE"), "runbook documents the explicit copy-role drop");
ok(runbook.includes("Never create roles on the Supabase source") || runbook.includes("never create roles on the Supabase source") || runbook.includes("Never create roles on Supabase"), "runbook forbids source roles");
ok(runbook.includes("--enable-row-security"), "runbook documents why --enable-row-security is not the dump fix");
ok(!runbook.includes("cutover-report.md"), "runbook does not name a cutover artifact");
ok(runbook.includes("CODEOWNERS"), "runbook names CODEOWNERS as the hasher protection");
ok(runbook.includes("LeadWell") && /intact/.test(runbook) && /[Rr]ollback/.test(runbook), "runbook names intact LeadWell Supabase as rollback");
ok(runbook.includes("Neon branch"), "runbook offers an optional Neon branch snapshot");
ok(!/plus dump TO\/GRANT/.test(runbook), "runbook dry-run lines match the allowlist stubs");
ok(runbook.includes("NOLOGIN roles (anon, authenticated, service_role)"), "runbook expected dry-run names the three NOLOGIN stubs");
ok(
  /user ids and counts only/i.test(runbook) && /never emails/i.test(runbook),
  "runbook says blank/dupe aborts print ids and counts only",
);
ok(
  /pause or delete/i.test(runbook) && /until Neon is verified/i.test(runbook),
  "runbook says not to pause or delete Supabase until Neon is verified",
);
ok(runbook.includes("::add-mask::"), "runbook documents secret masking");
const codeowners = readFileSync(join(root, ".github/CODEOWNERS"), "utf8");
ok(codeowners.includes("scripts/guard-public-ci.allowlist.json"), "CODEOWNERS covers the hasher allowlist");
ok(codeowners.includes("scripts/guard-public-ci.mjs"), "CODEOWNERS covers the hasher");
ok(codeowners.includes("scripts/regen-public-ci-allowlist.mjs"), "CODEOWNERS covers the regen script");
ok(codeowners.includes("scripts/prove-migrate.mjs"), "CODEOWNERS covers prove-migrate");
ok(codeowners.includes("package.json"), "CODEOWNERS covers package.json");
ok(codeowners.includes("package-lock.json"), "CODEOWNERS covers the lockfile");
ok(codeowners.includes(".github/CODEOWNERS"), "CODEOWNERS covers itself");
ok(codeowners.includes(".github/workflows/"), "CODEOWNERS covers workflows");
ok(codeowners.includes("@phillipchan1"), "CODEOWNERS requires phillipchan1");
ok(isWorkflowFilename("cutover-migrate.yml"), "yml is a workflow");
ok(isWorkflowFilename("SNEAK.YML"), "mixed-case YML is a workflow");
ok(isWorkflowFilename("other.YAML"), "YAML is a workflow");
ok(!isWorkflowFilename("notes.md"), "md is not a workflow");
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
    throw new Error(formatSafeCommandError(cmd, res.status, res.stderr, res.stdout));
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

    const readerBypass = run("psql", [
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-d",
      source,
      "-c",
      "SELECT CASE WHEN rolbypassrls THEN 't' ELSE 'f' END FROM pg_roles WHERE rolname = 'migration_reader'",
    ]).trim();
    ok(readerBypass === "f", "prove migration_reader is not BYPASSRLS (source never gets that grant)");

    function spawnSafeModule(code) {
      return spawnSync(process.execPath, ["--input-type=module", "-e", code], {
        encoding: "utf8",
        cwd: root,
        env: libpqCleanEnv({ ...process.env }),
      });
    }
    function assertNoRowLeak(label, res) {
      const captured = `${res.stdout || ""}\n${res.stderr || ""}`;
      ok(res.status !== 0, `${label} exits non-zero`);
      ok(/failed|ERROR|omitted|duplicate/i.test(captured), `${label} logs a safe failure`);
      ok(!logLooksLikeRowData(captured), `${label} captured log is not row data`);
      ok(!captured.includes("phil@example.com"), `${label} omits phil@example.com`);
      ok(!captured.includes("Phil@Example.com"), `${label} omits Phil@Example.com`);
      ok(!/Failing row contains/i.test(captured), `${label} drops Failing row contains`);
      ok(!/^\s*DETAIL:/mi.test(captured), `${label} drops DETAIL`);
      ok(!/^\s*CONTEXT:/mi.test(captured), `${label} drops CONTEXT`);
      return captured;
    }

    const errUrl = (() => {
      const u = new URL(source);
      u.pathname = "/leadwell_err";
      return u.href;
    })();
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", source, "-c", "DROP DATABASE IF EXISTS leadwell_err"]);
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", source, "-c", "CREATE DATABASE leadwell_err"]);
    run("psql", [
      "-v",
      "ON_ERROR_STOP=1",
      "-d",
      errUrl,
      "-c",
      `CREATE TABLE auth_users_import (
        id TEXT, name TEXT, email TEXT CHECK (char_length(email) < 5),
        email_verified BOOLEAN, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
      )`,
    ]);
    const copyCsv = join(dir, "bad_copy.csv");
    writeFileSync(
      copyCsv,
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa,Phil,phil@example.com,t,2020-01-01,2020-01-01\n",
    );
    const copySql = `\\copy auth_users_import FROM '${copyCsv}' WITH CSV`;
    const copyFail = spawnSafeModule(`
      import { installSafeErrorHandlers, run } from ${JSON.stringify(join(here, "safe-cmd.mjs"))};
      installSafeErrorHandlers();
      run("psql", ["-v", "ON_ERROR_STOP=1", "-d", ${JSON.stringify(errUrl)}, "-c", ${JSON.stringify(copySql)}]);
    `);
    assertNoRowLeak("COPY constraint failure", copyFail);

    run("psql", [
      "-v",
      "ON_ERROR_STOP=1",
      "-d",
      errUrl,
      "-c",
      "CREATE TABLE uniq_t (email TEXT PRIMARY KEY); INSERT INTO uniq_t VALUES ('phil@example.com')",
    ]);
    const uniqFail = spawnSafeModule(`
      import { installSafeErrorHandlers, run } from ${JSON.stringify(join(here, "safe-cmd.mjs"))};
      installSafeErrorHandlers();
      run("psql", ["-v", "ON_ERROR_STOP=1", "-d", ${JSON.stringify(errUrl)}, "-c", "INSERT INTO uniq_t VALUES ('phil@example.com')"]);
    `);
    assertNoRowLeak("unique violation", uniqFail);

    const invalidFail = spawnSafeModule(`
      import { installSafeErrorHandlers, run } from ${JSON.stringify(join(here, "safe-cmd.mjs"))};
      installSafeErrorHandlers();
      run("psql", ["-v", "ON_ERROR_STOP=1", "-d", ${JSON.stringify(errUrl)}, "-c", "SELECT 'phil@example.com'::uuid"]);
    `);
    assertNoRowLeak("invalid-input error", invalidFail);

    run("psql", [
      "-v",
      "ON_ERROR_STOP=1",
      "-d",
      errUrl,
      "-c",
      "DROP TABLE IF EXISTS restore_t; CREATE TABLE restore_t (id int PRIMARY KEY, email text); INSERT INTO restore_t VALUES (1, 'phil@example.com')",
    ]);
    const restoreDump = join(dir, "restore_fail.dump");
    const pgDump17 = existsSync("/usr/lib/postgresql/17/bin/pg_dump")
      ? "/usr/lib/postgresql/17/bin/pg_dump"
      : "pg_dump";
    const pgRestore17 = existsSync("/usr/lib/postgresql/17/bin/pg_restore")
      ? "/usr/lib/postgresql/17/bin/pg_restore"
      : "pg_restore";
    run(pgDump17, ["-Fc", "-t", "restore_t", "-f", restoreDump, errUrl]);
    run("psql", [
      "-v",
      "ON_ERROR_STOP=1",
      "-d",
      errUrl,
      "-c",
      "TRUNCATE restore_t; ALTER TABLE restore_t ADD CONSTRAINT restore_t_short CHECK (char_length(email) < 3)",
    ]);
    const restoreFail = spawnSafeModule(`
      import { installSafeErrorHandlers, run } from ${JSON.stringify(join(here, "safe-cmd.mjs"))};
      installSafeErrorHandlers();
      run(${JSON.stringify(pgRestore17)}, ["--data-only", "--exit-on-error", "--dbname", ${JSON.stringify(errUrl)}, ${JSON.stringify(restoreDump)}]);
    `);
    assertNoRowLeak("pg_restore data-load failure", restoreFail);

    run("psql", [
      "-v",
      "ON_ERROR_STOP=1",
      "-d",
      source,
      "-c",
      `INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
       VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Phil@Example.com', '{"name":"Other"}', NOW(), NOW())`,
    ]);
    const dupeMigrate = spawnSync(process.execPath, [join(here, "migrate-supabase-to-neon.mjs")], {
      encoding: "utf8",
      cwd: root,
      env: {
        ...process.env,
        SUPABASE_DB_URL: source,
        NEON_DB_URL: target,
        LEADWELL_MIGRATE_TEST: "1",
      },
    });
    const dupeCap = assertNoRowLeak("dupe-email abort", dupeMigrate);
    ok(/user id\(s\)/.test(dupeCap) || /duplicate/i.test(dupeCap), "dupe-email abort names ids or counts");
    run("psql", [
      "-v",
      "ON_ERROR_STOP=1",
      "-d",
      source,
      "-c",
      "DELETE FROM auth.users WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'",
    ]);
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", source, "-c", "DROP DATABASE IF EXISTS leadwell_err"]);

    const migrated = spawnSync(
      process.execPath,
      [join(here, "migrate-supabase-to-neon.mjs")],
      {
        encoding: "utf8",
        cwd: root,
        env: {
          ...process.env,
          SUPABASE_DB_URL: source,
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
    ok(
      migratedOut.includes("creating target-only BYPASSRLS copy role"),
      "live migrate creates the target copy role",
    );
    ok(
      migratedOut.includes("dropping target BYPASSRLS copy role (explicit DROP ROLE)"),
      "live migrate drops the copy role after verify",
    );
    ok(!logLooksLikeRowData(migratedOut), "live migrate log has no emails or row data");
    if (migrated.status !== 0) {
      throw new Error(`live migrate failed:\n${migratedOut.trim()}`);
    }

    const copyLeft = run("psql", [
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-d",
      target,
      "-c",
      "SELECT COUNT(*) FROM pg_roles WHERE rolname = 'leadwell_copy'",
    ]).trim();
    ok(copyLeft === "0", "target BYPASSRLS copy role is gone after a successful restore");

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
    ok(asOwner === "1", "table owner still reads actions (Worker path; RLS not forced)");
    const authUsage = run("psql", [
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-d",
      target,
      "-c",
      "SELECT has_schema_privilege('authenticated', 'public', 'USAGE')",
    ]).trim();
    ok(authUsage === "f", "authenticated stub has no USAGE on public (Worker does not SET ROLE)");

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
        SOURCE_DATABASE_URL: source,
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
    ok(!logLooksLikeRowData(verifiedOut), "cutover-verify log has no emails or row data");
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
