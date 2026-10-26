#!/usr/bin/env node
/**
 * Dump LeadWell's Supabase project into Neon (schema + data) and map
 * auth.users → Better Auth `user` with the same UUIDs so every `user_id`
 * still matches. Google identities become Better Auth `account` rows.
 *
 * SOURCE IS READ-ONLY. The script only runs pg_dump and COPY … TO STDOUT
 * against SUPABASE_DB_URL. It never ALTER/DROP/DISABLE anything on the source.
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
import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { libpqCleanEnv, refuseUnsafeTestUrl } from "./loopback.mjs";
import {
  BETTER_AUTH_TABLES_SQL,
  CHECKSUM_TABLES,
  LIST_USER_OBJECTS_TEXT_SQL,
  REQUIRED_EXTENSIONS_SQL,
  STUB_AUTH_SQL,
  assertCountsMatch,
  assertHashesMatch,
  assertSourceUsersReady,
  contentHashQuery,
  createdSince,
  dropCreatedSql,
  filterRestoreToc,
  formatNonEmptyTargetAbort,
  isNonEmptyTargetObject,
  loadBetterAuthUsersSql,
  loadGoogleAccountsSql,
  loadStubAuthUsersSql,
  parseAuthUsersCsv,
  parseHashes,
  parseObjectList,
} from "./migrate-users.lib.mjs";

const dryRun = process.argv.includes("--dry-run");
const source = process.env.SUPABASE_DB_URL || process.env.SOURCE_DATABASE_URL || "";
const target = process.env.NEON_DB_URL || process.env.TARGET_DATABASE_URL || "";
const isTest = process.env.LEADWELL_MIGRATE_TEST === "1";

function run(cmd, args, opts = {}) {
  const { env, ...rest } = opts;
  const res = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    ...rest,
    env: libpqCleanEnv(env ?? process.env),
  });
  if (res.status !== 0) {
    const err = (res.stderr || res.stdout || "").trim();
    throw new Error(`${cmd} ${args.join(" ")} failed (${res.status}): ${err}`);
  }
  return res.stdout;
}

function runToFile(cmd, args, file) {
  const fd = openSync(file, "w");
  try {
    const res = spawnSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", fd, "pipe"],
      env: libpqCleanEnv(),
    });
    if (res.status !== 0) {
      const err = (res.stderr || "").trim();
      throw new Error(`${cmd} ${args.join(" ")} failed (${res.status}): ${err}`);
    }
  } finally {
    closeSync(fd);
  }
}

function toolMajor(bin) {
  const res = spawnSync(bin, ["--version"], { encoding: "utf8" });
  if (res.status !== 0) return null;
  const m = `${res.stdout || ""}\n${res.stderr || ""}`.match(/(\d+)\./);
  return m ? Number(m[1]) : null;
}

function serverMajor(url) {
  const out = run("psql", [
    "-v",
    "ON_ERROR_STOP=1",
    "-tA",
    "-d",
    url,
    "-c",
    "SHOW server_version_num",
  ]);
  const n = Number(String(out).trim());
  if (!Number.isFinite(n) || n < 10000) throw new Error(`unparsable server_version_num: ${out}`);
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
  throw new Error(
    `${name} matching Postgres ${major} not found. Install postgresql-client-${major} (or set PG_BIN).`,
  );
}

function needBin(name) {
  const res = spawnSync(name, ["--version"], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`Missing ${name}. Install PostgreSQL client tools.`);
}

function psql(url, extraArgs, sql) {
  return run("psql", ["-v", "ON_ERROR_STOP=1", "-d", url, ...extraArgs, "-c", sql]);
}

const DRY_RUN_LINES = [
  "dry-run: would pg_dump public + auth.users + auth.identities from SUPABASE_DB_URL (read-only)",
  "dry-run: would abort before any Neon write if an email is blank or lower(email) is duplicated",
  "dry-run: would refuse a non-empty target (any user table/function/enum/type in public or auth)",
  "dry-run: would CREATE EXTENSION IF NOT EXISTS pgcrypto, then stub auth.users + auth.uid() on NEON_DB_URL",
  "dry-run: would pg_restore --exit-on-error with EXTENSION entries filtered out",
  'dry-run: would insert auth.users into Better Auth "user" (same ids) and Google identities into account',
  "dry-run: would compare per-table row counts and content hashes and abort on mismatch",
  "tools required: pg_dump, pg_restore, psql",
];

if (dryRun && !source && !target) {
  for (const line of DRY_RUN_LINES) console.log(line);
  process.exit(0);
}

if (!source || !target) {
  console.error("Set SUPABASE_DB_URL and NEON_DB_URL (or pass --dry-run).");
  process.exit(2);
}

if (source === target) {
  console.error("SUPABASE_DB_URL and NEON_DB_URL must be different. Source is read-only.");
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

  console.log("dumping public schema + data (no-owner, no-acl)…");
  run(pgDump, [
    "--format=custom",
    "--no-owner",
    "--no-acl",
    "--schema=public",
    `--file=${dumpPath}`,
    source,
  ]);

  console.log("exporting auth.users…");
  const usersCopy = `
    COPY (
      SELECT id::text, COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1), ''),
             email, COALESCE(email_confirmed_at IS NOT NULL, false),
             created_at, updated_at
      FROM auth.users
    ) TO STDOUT WITH CSV
  `;
  runToFile("psql", ["-v", "ON_ERROR_STOP=1", "-d", source, "-c", usersCopy], usersPath);
  const csv = readFileSync(usersPath, "utf8");

  console.log("exporting auth.identities…");
  const identitiesCopy = `
    COPY (
      SELECT user_id::text, provider,
             COALESCE(identity_data->>'sub', identity_data->>'provider_id', provider_id::text, '')
      FROM auth.identities
    ) TO STDOUT WITH CSV
  `;
  try {
    runToFile("psql", ["-v", "ON_ERROR_STOP=1", "-d", source, "-c", identitiesCopy], identitiesPath);
  } catch (err) {
    console.warn("auth.identities export skipped:", err instanceof Error ? err.message : err);
    writeFileSync(identitiesPath, "");
  }

  console.log("pre-checking source emails (read-only)…");
  assertSourceUsersReady(parseAuthUsersCsv(csv));

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
  if (dirty.length) throw new Error(formatNonEmptyTargetAbort(dirty));

  let wroteTarget = false;
  try {
    console.log("ensuring pgcrypto on Neon (target only)…");
    wroteTarget = true;
    writeFileSync(join(dir, "required_ext.sql"), REQUIRED_EXTENSIONS_SQL);
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", target, "-f", join(dir, "required_ext.sql")]);

    console.log("creating stub auth.users + auth.uid() on Neon (target only)…");
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", target, "-f", stubAuthPath]);
    const stubUsersPath = join(dir, "load_stub_users.sql");
    writeFileSync(stubUsersPath, loadStubAuthUsersSql(usersPath));
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", target, "-f", stubUsersPath]);

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
      target,
      dumpPath,
    ]);
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", target, "-f", betterAuthPath]);

    console.log('mapping auth.users → "user" (one transaction)…');
    const loadPath = join(dir, "load_users.sql");
    writeFileSync(loadPath, loadBetterAuthUsersSql(usersPath));
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", target, "-f", loadPath]);

    if (readFileSync(identitiesPath, "utf8").trim()) {
      console.log("mapping Google identities → account…");
      const accountsPath = join(dir, "load_accounts.sql");
      writeFileSync(accountsPath, loadGoogleAccountsSql(identitiesPath));
      run("psql", ["-v", "ON_ERROR_STOP=1", "-d", target, "-f", accountsPath]);
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
    console.log("migration ok");
  } catch (err) {
    if (wroteTarget) {
      console.error("load failed — dropping objects this run created…");
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
