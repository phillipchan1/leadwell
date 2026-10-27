#!/usr/bin/env node
/**
 * Dump LeadWell's Supabase project into Neon (schema + data) and map
 * auth.users → Better Auth `user` with the same UUIDs so every `user_id`
 * still matches. Magic-link sign-in uses that email. Google identities
 * are not mapped (no Google provider).
 *
 * SOURCE IS READ-ONLY. The script only runs pg_dump (public, never auth)
 * and COPY … TO STDOUT against SUPABASE_DB_URL. Auth rows come from
 * migration_tmp.auth_users() / migration_tmp.auth_identities() — the
 * source role has no USAGE on auth. It never ALTER/DROP/DISABLE the source
 * and never CREATE ROLE on Supabase. BYPASSRLS, if needed, is a
 * target-only copy role that is DROP ROLE'd after checksums.
 *
 * Usage:
 *   SUPABASE_DB_URL=postgres://... NEON_DB_URL=postgres://... \
 *     node scripts/migrate-supabase-to-neon.mjs
 *
 *   node scripts/migrate-supabase-to-neon.mjs --dry-run
 *
 * Requires: pg_dump, psql, pg_restore (PostgreSQL client tools).
 *
 * Test/prove invocations that pass a target URL must be loopback — see
 * scripts/loopback.mjs. The live cutover (Phil, by hand) uses real Neon
 * and is not a test.
 */
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  redactSecrets,
  refuseUnsafeTestUrl,
  sourceReadEnv,
  withRoleUrl,
} from "./loopback.mjs";
import {
  installSafeErrorHandlers,
  run as runSafe,
  runToFile as runToFileSafe,
  safeErrorMessage,
  safeLoggedMessage,
  throwSafe,
} from "./safe-cmd.mjs";
import {
  BETTER_AUTH_TABLES_SQL,
  CHECKSUM_TABLES,
  EXPORT_AUTH_IDENTITIES_COPY_SQL,
  EXPORT_AUTH_USERS_COPY_SQL,
  LIST_USER_OBJECTS_TEXT_SQL,
  PG_DUMP_PUBLIC_ARGS,
  REQUIRED_EXTENSIONS_SQL,
  SOURCE_AUTH_IDENTITIES_FN,
  SOURCE_AUTH_USERS_FN,
  STUB_AUTH_SQL,
  TARGET_COPY_ROLE,
  TARGET_PANIC_LOGGING_SQL,
  assertCountsMatch,
  assertHashesMatch,
  assertSourceUsersReady,
  contentHashQuery,
  createdSince,
  createTargetCopyRoleSql,
  disableTargetCopyRoleSql,
  dropCreatedSql,
  filterRestoreToc,
  formatNonEmptyTargetAbort,
  grantTargetCopyRoleSchemasSql,
  isNonEmptyTargetObject,
  loadBetterAuthUsersSql,
  loadStubAuthUsersSql,
  parseAuthUsersCsv,
  parseHashes,
  parseObjectList,
  reassignTargetCopyOwnedSql,
  rolesToStubFromDumpSql,
  sourceAuthIdentitiesHashQuery,
  sourceAuthUsersHashQuery,
  stubSupabaseRolesSql,
  targetBetterAuthUsersHashQuery,
} from "./migrate-users.lib.mjs";

const dryRun = process.argv.includes("--dry-run");
const source = process.env.SUPABASE_DB_URL || process.env.SOURCE_DATABASE_URL || "";
const target = process.env.NEON_DB_URL || process.env.TARGET_DATABASE_URL || "";
const isTest = process.env.LEADWELL_MIGRATE_TEST === "1";
const extraRedact = [];

function redact(text) {
  let out = redactSecrets(String(text));
  for (const secret of extraRedact) {
    if (!secret) continue;
    out = out.split(secret).join("***");
  }
  return out;
}

function databaseNameFromUrl(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, "").replace(/\/$/, ""));
  } catch {
    return "";
  }
}

installSafeErrorHandlers();

function run(cmd, args, opts = {}) {
  return runSafe(cmd, args, { ...opts, redact });
}

function runToFile(cmd, args, file) {
  return runToFileSafe(cmd, args, file, { env: sourceReadEnv(), redact });
}

function toolMajor(bin) {
  const res = spawnSync(bin, ["--version"], { encoding: "utf8" });
  if (res.status !== 0) return null;
  const m = `${res.stdout || ""}\n${res.stderr || ""}`.match(/(\d+)\./);
  return m ? Number(m[1]) : null;
}

function serverMajor(url) {
  const out = run(
    "psql",
    [
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-d",
      url,
      "-c",
      "SHOW server_version_num",
    ],
    { env: sourceReadEnv() },
  );
  const n = Number(String(out).trim());
  if (!Number.isFinite(n) || n < 10000) throwSafe("unparsable server_version_num");
  return Math.floor(n / 10000);
}

function resolvePgBin(name, major) {
  const candidates = [
    process.env.PG_BIN ? join(process.env.PG_BIN, name) : null,
    `/usr/lib/postgresql/${major}/bin/${name}`,
    `/usr/pgsql-${major}/bin/${name}`,
    name,
  ].filter(Boolean);
  for (const bin of candidates) {
    if (bin !== name && !existsSync(bin)) continue;
    if (toolMajor(bin) === major) return bin;
  }
  throwSafe(
    `${name} matching Postgres ${major} not found. Install postgresql-client-${major} (or set PG_BIN).`,
  );
}

function needBin(name) {
  const res = spawnSync(name, ["--version"], { encoding: "utf8" });
  if (res.status !== 0) throwSafe(`Missing ${name}. Install PostgreSQL client tools.`);
}

function psql(url, extraArgs, sql) {
  return run(
    "psql",
    ["-v", "ON_ERROR_STOP=1", "-d", url, ...extraArgs, "-c", sql],
    url === source ? { env: sourceReadEnv() } : {},
  );
}

const DRY_RUN_LINES = [
  "dry-run: would pg_dump public (exclude auth) and COPY migration_tmp.auth_users() / migration_tmp.auth_identities() from SUPABASE_DB_URL (read-only)",
  "dry-run: would abort before any Neon write if an email is blank or lower(email) is duplicated",
  "dry-run: would refuse a non-empty target (any user table/function/enum/type in public or auth)",
  "dry-run: would CREATE EXTENSION IF NOT EXISTS pgcrypto, then stub auth.users + auth.uid() and NOLOGIN roles (anon, authenticated, service_role) on NEON_DB_URL",
  "dry-run: would CREATE a target-only BYPASSRLS copy role on NEON_DB_URL (never on Supabase) and DROP ROLE it after checksums",
  "dry-run: would pg_restore --exit-on-error with EXTENSION entries filtered out",
  'dry-run: would insert auth.users into Better Auth "user" (same ids); magic-link uses that email (Google identities are not mapped)',
  "dry-run: would compare per-table row counts and content hashes and abort on mismatch",
  "tools required: pg_dump, pg_restore, psql",
];

if (dryRun && !source && !target) {
  for (const line of DRY_RUN_LINES) console.log(line);
  process.exit(0);
}

if (!source || !target) {
  console.error(safeLoggedMessage("Set SUPABASE_DB_URL and NEON_DB_URL (or pass --dry-run)."));
  process.exit(2);
}

if (source === target) {
  console.error(safeLoggedMessage("SUPABASE_DB_URL and NEON_DB_URL must be different. Source is read-only."));
  process.exit(2);
}

if (isTest) {
  refuseUnsafeTestUrl(source, "SUPABASE_DB_URL");
  refuseUnsafeTestUrl(target, "NEON_DB_URL");
}

needBin("psql");
const srcMajor = serverMajor(source);
const pgDump = resolvePgBin("pg_dump", srcMajor);
const pgRestore = resolvePgBin("pg_restore", srcMajor);
console.log(`using ${pgDump} / ${pgRestore} for Postgres ${srcMajor}`);

const dir = mkdtempSync(join(tmpdir(), "leadwell-migrate-"));
const dumpPath = join(dir, "public.dump");
const usersPath = join(dir, "auth_users.csv");
const identitiesPath = join(dir, "auth_identities.csv");
const stubAuthPath = join(dir, "stub_auth.sql");
const betterAuthPath = join(dir, "better_auth.sql");
try {
  writeFileSync(stubAuthPath, STUB_AUTH_SQL);
  writeFileSync(betterAuthPath, BETTER_AUTH_TABLES_SQL);

  console.log("dumping public schema + data (no-owner, no-acl, exclude auth)…");
  run(pgDump, [...PG_DUMP_PUBLIC_ARGS, `--file=${dumpPath}`, source], { env: sourceReadEnv() });

  console.log(`exporting auth.users via ${SOURCE_AUTH_USERS_FN}…`);
  runToFile("psql", ["-v", "ON_ERROR_STOP=1", "-d", source, "-c", EXPORT_AUTH_USERS_COPY_SQL], usersPath);
  const csv = readFileSync(usersPath, "utf8");

  console.log(`exporting auth.identities via ${SOURCE_AUTH_IDENTITIES_FN}…`);
  runToFile(
    "psql",
    ["-v", "ON_ERROR_STOP=1", "-d", source, "-c", EXPORT_AUTH_IDENTITIES_COPY_SQL],
    identitiesPath,
  );

  console.log("pre-checking source emails (read-only)…");
  try {
    assertSourceUsersReady(parseAuthUsersCsv(csv));
  } catch (err) {
    throwSafe(err instanceof Error ? err.message : err);
  }

  if (dryRun) {
    console.log(`dry-run: dump at ${dumpPath} (${readFileSync(dumpPath).length} bytes)`);
    console.log(`dry-run: ${csv.trim().split("\n").filter(Boolean).length} auth.users rows`);
    console.log(
      `dry-run: ${readFileSync(identitiesPath, "utf8").trim().split("\n").filter(Boolean).length} auth.identities rows`,
    );
    console.log(`dry-run: would checksum ${CHECKSUM_TABLES.length} public tables (count + md5)`);
    process.exit(0);
  }

  console.log("checking target is empty…");
  const before = parseObjectList(psql(target, ["-tA"], LIST_USER_OBJECTS_TEXT_SQL));
  const dirty = before.filter(isNonEmptyTargetObject);
    if (dirty.length) throwSafe(formatNonEmptyTargetAbort(dirty));

  let wroteTarget = false;
  let copyRoleCreated = false;
  let ownerName = "";
  try {
    ownerName = String(psql(target, ["-tA"], "SELECT current_user")).trim();
    if (!ownerName) throwSafe("could not read target current_user");

    const copyPassword = randomBytes(24).toString("base64url");
    extraRedact.push(copyPassword);

    console.log("creating target-only BYPASSRLS copy role (never on source)…");
    wroteTarget = true;
    const copySqlPath = join(dir, "target_copy_role.sql");
    writeFileSync(copySqlPath, createTargetCopyRoleSql(copyPassword, databaseNameFromUrl(target)));
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", target, "-f", copySqlPath]);
    rmSync(copySqlPath, { force: true });
    copyRoleCreated = true;

    console.log("ensuring pgcrypto on Neon (target only)…");
    writeFileSync(join(dir, "required_ext.sql"), REQUIRED_EXTENSIONS_SQL);
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", target, "-f", join(dir, "required_ext.sql")]);

    console.log("creating stub auth.users + auth.uid() on Neon (target only)…");
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", target, "-f", stubAuthPath]);
    const stubUsersPath = join(dir, "load_stub_users.sql");
    writeFileSync(stubUsersPath, loadStubAuthUsersSql(usersPath));
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", target, "-f", stubUsersPath]);
    writeFileSync(join(dir, "copy_schema_grants.sql"), grantTargetCopyRoleSchemasSql(["public", "auth"]));
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", target, "-f", join(dir, "copy_schema_grants.sql")]);

    const schemaSqlPath = join(dir, "dump.schema.sql");
    run(pgRestore, ["--schema-only", `--file=${schemaSqlPath}`, dumpPath]);
    const stubRoles = rolesToStubFromDumpSql(readFileSync(schemaSqlPath, "utf8"));
    const stubRolesPath = join(dir, "stub_roles.sql");
    writeFileSync(stubRolesPath, stubSupabaseRolesSql(stubRoles));
    console.log(`creating stub roles (${stubRoles.join(", ")}) as NOLOGIN on target…`);
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", target, "-f", stubRolesPath]);

    const copyTarget = withRoleUrl(target, TARGET_COPY_ROLE, copyPassword);
    extraRedact.push(copyTarget);

    try {
      const host = new URL(target).hostname.replace(/^\[|\]$/g, "").toLowerCase();
      if (host === "127.0.0.1" || host === "localhost" || host === "::1") {
        run("psql", ["-v", "ON_ERROR_STOP=1", "-d", target, "-c", TARGET_PANIC_LOGGING_SQL]);
      }
    } catch {
      /* URL parse / ALTER SYSTEM — scratch start step already set panic logging */
    }

    console.log("restoring into Neon…");
    const tocPath = join(dir, "restore.toc");
    const filteredTocPath = join(dir, "restore.filtered.toc");
    writeFileSync(tocPath, run(pgRestore, ["-l", dumpPath]));
    writeFileSync(filteredTocPath, filterRestoreToc(readFileSync(tocPath, "utf8")));
    run(pgRestore, [
      "--no-owner",
      "--no-acl",
      "--exit-on-error",
      "-L",
      filteredTocPath,
      "--dbname",
      copyTarget,
      dumpPath,
    ]);
    writeFileSync(join(dir, "reassign_copy.sql"), reassignTargetCopyOwnedSql(ownerName));
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", target, "-f", join(dir, "reassign_copy.sql")]);
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", target, "-f", betterAuthPath]);

    console.log('mapping auth.users → "user" (one transaction)…');
    const loadPath = join(dir, "load_users.sql");
    writeFileSync(loadPath, loadBetterAuthUsersSql(usersPath));
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", target, "-f", loadPath]);

    if (readFileSync(identitiesPath, "utf8").trim()) {
      console.log("skipping Google identity → account mapping (magic-link auth)");
    }

    const srcHashes = parseHashes(psql(source, ["-tA"], contentHashQuery()));
    const dstHashes = parseHashes(psql(target, ["-tA"], contentHashQuery()));
    for (const table of CHECKSUM_TABLES) {
      const s = srcHashes[table];
      const d = dstHashes[table];
      console.log(
        `  ${table}: source=${s?.n ?? "?"} neon=${d?.n ?? "?"} hash ${s?.hash ?? "?"} → ${d?.hash ?? "?"}`,
      );
    }
    assertCountsMatch(
      Object.fromEntries(CHECKSUM_TABLES.map((t) => [t, srcHashes[t]?.n])),
      Object.fromEntries(CHECKSUM_TABLES.map((t) => [t, dstHashes[t]?.n])),
    );
    assertHashesMatch(srcHashes, dstHashes);

    const srcAuth = parseHashes(psql(source, ["-tA"], sourceAuthUsersHashQuery()));
    const dstAuth = parseHashes(psql(target, ["-tA"], targetBetterAuthUsersHashQuery()));
    console.log(
      `  auth_users: source=${srcAuth.auth_users?.n ?? "?"} neon=${dstAuth.auth_users?.n ?? "?"} hash ${srcAuth.auth_users?.hash ?? "?"} → ${dstAuth.auth_users?.hash ?? "?"}`,
    );
    assertCountsMatch(
      { auth_users: srcAuth.auth_users?.n },
      { auth_users: dstAuth.auth_users?.n },
      ["auth_users"],
    );
    assertHashesMatch(srcAuth, dstAuth, ["auth_users"]);
    const srcIdent = parseHashes(psql(source, ["-tA"], sourceAuthIdentitiesHashQuery()));
    console.log(
      `  auth_identities (source via ${SOURCE_AUTH_IDENTITIES_FN}): n=${srcIdent.auth_identities?.n ?? "?"} hash=${srcIdent.auth_identities?.hash ?? "?"}`,
    );

    console.log("dropping target BYPASSRLS copy role (explicit DROP ROLE)…");
    writeFileSync(join(dir, "drop_copy_role.sql"), disableTargetCopyRoleSql(ownerName));
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", target, "-f", join(dir, "drop_copy_role.sql")]);
    copyRoleCreated = false;
    console.log("migration ok");
  } catch (err) {
    if (copyRoleCreated && ownerName) {
      try {
        writeFileSync(join(dir, "drop_copy_role.sql"), disableTargetCopyRoleSql(ownerName));
        run("psql", ["-v", "ON_ERROR_STOP=1", "-d", target, "-f", join(dir, "drop_copy_role.sql")]);
      } catch (dropErr) {
        console.error(safeErrorMessage(dropErr));
      }
    }
    if (wroteTarget) {
      console.error(safeLoggedMessage("load failed — dropping objects this run created…"));
      const after = parseObjectList(psql(target, ["-tA"], LIST_USER_OBJECTS_TEXT_SQL));
      const created = createdSince(before, after);
      const cleanupPath = join(dir, "cleanup_this_run.sql");
      writeFileSync(cleanupPath, dropCreatedSql(created));
      if (readFileSync(cleanupPath, "utf8").trim()) {
        run("psql", ["-v", "ON_ERROR_STOP=1", "-d", target, "-f", cleanupPath]);
      }
    }
    throw err;
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
