#!/usr/bin/env node
/**
 * After a cutover restore, compare source vs target public tables
 * (count + md5) and confirm Phil's auth user kept the same id and
 * email. Source auth rows are read only through
 * migration_tmp.auth_users() / migration_tmp.auth_identities() — the
 * source role has no USAGE on auth. Prints the user id only — never
 * the email or a connection string.
 *
 *   SOURCE_DATABASE_URL=… TARGET_DATABASE_URL=… \
 *     node scripts/cutover-verify.mjs --report artifacts/cutover-report.md
 *
 * Set LEADWELL_MIGRATE_TEST=1 only in prove/CI (both URLs must be
 * loopback). The live/Actions cutover leaves that flag unset.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";
import { libpqCleanEnv, redactSecrets, refuseUnsafeTestUrl, sourceReadEnv } from "./loopback.mjs";
import {
  CHECKSUM_TABLES,
  SOURCE_AUTH_IDENTITIES_FN,
  SOURCE_AUTH_USERS_ID_EMAIL_SQL,
  TARGET_BETTER_AUTH_USERS_ID_EMAIL_SQL,
  assertAuthUsersCarriedOver,
  assertCountsMatch,
  assertHashesMatch,
  contentHashQuery,
  formatChecksumReport,
  parseHashes,
  parseIdEmailRows,
  sourceAuthIdentitiesHashQuery,
  sourceAuthUsersHashQuery,
  targetBetterAuthUsersHashQuery,
} from "./migrate-users.lib.mjs";

const source =
  process.env.SOURCE_DATABASE_URL || process.env.SUPABASE_DB_URL || "";
const target =
  process.env.TARGET_DATABASE_URL ||
  process.env.NEON_DB_URL ||
  process.env.NEON_DATABASE_URL ||
  "";
const isTest = process.env.LEADWELL_MIGRATE_TEST === "1";
const dryRun = process.env.DRY_RUN === "true" || process.argv.includes("--dry-run");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return "";
  return process.argv[i + 1] || "";
}

const reportPath = argValue("--report");

if (isTest) {
  refuseUnsafeTestUrl(source, "SOURCE_DATABASE_URL");
  refuseUnsafeTestUrl(target, "TARGET_DATABASE_URL");
}

if (!source || !target) {
  console.error("Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL.");
  process.exit(2);
}
if (source === target) {
  console.error("SOURCE_DATABASE_URL and TARGET_DATABASE_URL must be different.");
  process.exit(2);
}

function run(cmd, args, env) {
  const res = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    env: libpqCleanEnv(env ?? process.env),
  });
  if (res.status !== 0) {
    const err = (res.stderr || res.stdout || "").trim();
    throw new Error(redactSecrets(`${cmd} failed (${res.status}): ${err}`));
  }
  return res.stdout;
}

function psql(url, sql) {
  return run(
    "psql",
    ["-v", "ON_ERROR_STOP=1", "-tA", "-d", url, "-c", sql],
    url === source ? sourceReadEnv() : undefined,
  );
}

const srcHashes = parseHashes(psql(source, contentHashQuery()));
const dstHashes = parseHashes(psql(target, contentHashQuery()));
const srcAuth = parseHashes(psql(source, sourceAuthUsersHashQuery()));
const dstAuth = parseHashes(psql(target, targetBetterAuthUsersHashQuery()));
const srcIdent = parseHashes(psql(source, sourceAuthIdentitiesHashQuery()));
const reportSrc = { ...srcHashes, ...srcAuth };
const reportDst = { ...dstHashes, ...dstAuth };
const reportTables = [...CHECKSUM_TABLES, "auth_users"];
const table = formatChecksumReport(reportSrc, reportDst, reportTables);
console.log(table);
console.log(
  `auth_identities (source via ${SOURCE_AUTH_IDENTITIES_FN}): n=${srcIdent.auth_identities?.n ?? "?"} md5=${srcIdent.auth_identities?.hash ?? "?"}`,
);

assertCountsMatch(
  Object.fromEntries(reportTables.map((t) => [t, reportSrc[t]?.n])),
  Object.fromEntries(reportTables.map((t) => [t, reportDst[t]?.n])),
  reportTables,
);
assertHashesMatch(reportSrc, reportDst, reportTables);

const srcUsers = parseIdEmailRows(psql(source, SOURCE_AUTH_USERS_ID_EMAIL_SQL));
const dstUsers = parseIdEmailRows(psql(target, TARGET_BETTER_AUTH_USERS_ID_EMAIL_SQL));
const ids = assertAuthUsersCarriedOver(srcUsers, dstUsers);
for (const id of ids) {
  console.log(`Phil auth user carried over: ${id}`);
}

const mode = dryRun ? "dry_run (scratch target, not Neon)" : "live (NEON_DATABASE_URL)";
const report = [
  `# Cutover verify`,
  ``,
  `Mode: ${mode}`,
  ``,
  table,
  ``,
  `auth_identities source via ${SOURCE_AUTH_IDENTITIES_FN}: n=${srcIdent.auth_identities?.n ?? "?"} md5=${srcIdent.auth_identities?.hash ?? "?"}`,
  ``,
  `Phil auth user id(s) (email omitted): ${ids.join(", ") || "(none)"}`,
  ``,
].join("\n");

if (reportPath) {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, report);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
}

console.log("cutover-verify ok");
