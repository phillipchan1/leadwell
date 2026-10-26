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
 * Live mode seeds a throwaway source, imports into an empty target, and
 * checks row counts + content hashes. It never talks to Supabase.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { libpqCleanEnv, refuseUnsafeTestUrl } from "./loopback.mjs";
import {
  CHECKSUM_TABLES,
  assertCountsMatch,
  assertHashesMatch,
  assertSourceUsersReady,
  contentHashQuery,
  createdSince,
  dropCreatedSql,
  filterRestoreToc,
  formatNonEmptyTargetAbort,
  isNonEmptyTargetObject,
  parseAuthUsersCsv,
  parseCounts,
  parseHashes,
  parseIdentitiesCsv,
  parseObjectList,
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
  "dry-run: would pg_dump public + auth.users + auth.identities from SUPABASE_DB_URL (read-only)",
  "dry-run: would abort before any Neon write if an email is blank or lower(email) is duplicated",
  "dry-run: would refuse a non-empty target",
  "dry-run: would CREATE EXTENSION IF NOT EXISTS pgcrypto",
  "dry-run: would pg_restore --exit-on-error with EXTENSION entries filtered out",
  'dry-run: would insert auth.users into Better Auth "user"',
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
ok(parseCounts("profiles|3\n").profiles === 3, "parseCounts");

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
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", source, "-c", "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS auth CASCADE;"]);
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
  updated_at TIMESTAMPTZ
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
INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'phil@example.com',
  '{"name":"Phil"}',
  NOW(), NOW(), NOW()
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
`;
    const seedPath = join(dir, "seed.sql");
    writeFileSync(seedPath, seed);
    run("psql", ["-v", "ON_ERROR_STOP=1", "-d", source, "-f", seedPath]);

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
    const google = run("psql", [
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-d",
      target,
      "-c",
      `SELECT provider_id || '|' || account_id FROM account WHERE provider_id = 'google'`,
    ]).trim();
    ok(google.includes("google-sub-1"), "Google identity mapped to account");
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
