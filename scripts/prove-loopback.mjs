#!/usr/bin/env node
/**
 * Prove the loopback-only guard used by every DB-touching test/prove script.
 * Does not connect to any database.
 */
import {
  assertLoopbackDatabaseUrl,
  ensureSslMode,
  githubAddMaskLines,
  libpqCleanEnv,
  redactSecrets,
  refuseUnsafeTestUrl,
  SOURCE_READ_PGOPTIONS,
  sourceReadEnv,
} from "./loopback.mjs";

const fails = [];
let checks = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) fails.push(msg);
}

function refused(url, label) {
  try {
    refuseUnsafeTestUrl(url, label);
    return false;
  } catch {
    return true;
  }
}

ok(!refused("postgresql://postgres:postgres@127.0.0.1:5432/leadwell"), "127.0.0.1 allowed");
ok(!refused("postgresql://postgres@localhost:5432/leadwell"), "localhost allowed");
ok(!refused("postgresql://postgres@[::1]:5432/leadwell"), "::1 allowed");
ok(refused("postgresql://neondb@ep-prod.neon.tech/leadwell"), "Neon host refused");
ok(refused("postgresql://u@0127.0.0.1:5432/leadwell"), "leading-zero IPv4 refused");
ok(refused("postgresql://u@127:5432/leadwell"), "bare 127 refused");
ok(refused("postgresql://u@10.0.0.1:5432/leadwell"), "RFC1918 refused");
ok(
  refused("postgresql://u@127.0.0.1:5432/leadwell?host=ep-prod.neon.tech"),
  "host= redirect query refused",
);
ok(refused("postgresql://u@a,b:5432/leadwell"), "multi-host list refused");
ok(refused("not-a-url"), "invalid URL refused");

const saved = process.env.PGHOST;
process.env.PGHOST = "ep-prod.neon.tech";
ok(
  refused("postgresql://postgres@127.0.0.1:5432/leadwell"),
  "PGHOST non-loopback refused even if URL is loopback",
);
if (saved === undefined) delete process.env.PGHOST;
else process.env.PGHOST = saved;

function withEnv(name, value, fn) {
  const prev = process.env[name];
  process.env[name] = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[name];
    else process.env[name] = prev;
  }
}

ok(
  withEnv("PGSERVICE", "neon-prod", () =>
    refused("postgresql://postgres@127.0.0.1:5432/leadwell"),
  ),
  "PGSERVICE refused even if URL is loopback",
);
ok(
  withEnv("PGSERVICEFILE", "/tmp/pg_service.conf", () =>
    refused("postgresql://postgres@127.0.0.1:5432/leadwell"),
  ),
  "PGSERVICEFILE refused even if URL is loopback",
);
ok(
  withEnv("PGSYSCONFDIR", "/tmp/pgconf", () =>
    refused("postgresql://postgres@127.0.0.1:5432/leadwell"),
  ),
  "PGSYSCONFDIR refused even if URL is loopback",
);

const dirty = {
  PGHOST: "ep-prod.neon.tech",
  PGHOSTADDR: "1.2.3.4",
  PGSERVICE: "neon-prod",
  PGSERVICEFILE: "/tmp/pg_service.conf",
  PGSYSCONFDIR: "/tmp/pgconf",
  KEEP: "yes",
};
const cleaned = libpqCleanEnv(dirty);
ok(!cleaned.PGHOST && !cleaned.PGHOSTADDR, "libpqCleanEnv drops PGHOST/PGHOSTADDR");
ok(!cleaned.PGSERVICE && !cleaned.PGSERVICEFILE && !cleaned.PGSYSCONFDIR, "libpqCleanEnv drops service vars");
ok(cleaned.KEEP === "yes", "libpqCleanEnv keeps unrelated vars");
ok(
  SOURCE_READ_PGOPTIONS === "-c default_transaction_read_only=on",
  "source PGOPTIONS force default_transaction_read_only",
);
const sourceEnv = sourceReadEnv(dirty);
ok(!sourceEnv.PGHOST && !sourceEnv.PGSERVICE, "sourceReadEnv drops libpq redirect vars");
ok(sourceEnv.PGOPTIONS === SOURCE_READ_PGOPTIONS, "sourceReadEnv sets read-only PGOPTIONS");
ok(sourceEnv.KEEP === "yes", "sourceReadEnv keeps unrelated vars");

let missing = false;
try {
  assertLoopbackDatabaseUrl("", "LEADWELL_TEST_DATABASE_URL");
} catch {
  missing = true;
}
ok(missing, "empty URL required-and-loopback");

ok(
  redactSecrets("pg_dump failed: postgres://u:s3cret@db.example.com/leadwell") ===
    "pg_dump failed: postgres://***",
  "redactSecrets strips postgres URIs",
);
ok(
  redactSecrets("postgresql://u:s3cret@db.example.com/leadwell?sslmode=require").includes("***") &&
    !redactSecrets("postgresql://u:s3cret@db.example.com/leadwell?sslmode=require").includes("s3cret"),
  "redactSecrets strips postgresql URIs and passwords",
);
ok(ensureSslMode("") === "", "ensureSslMode empty");
ok(
  ensureSslMode("postgres://u@h/db") === "postgres://u@h/db?sslmode=require",
  "ensureSslMode appends when missing",
);
ok(
  ensureSslMode("postgres://u@h/db?sslmode=prefer") === "postgres://u@h/db?sslmode=prefer",
  "ensureSslMode keeps an existing sslmode",
);
ok(
  ensureSslMode("postgres://u@h/db?foo=1") === "postgres://u@h/db?foo=1&sslmode=require",
  "ensureSslMode appends with &",
);

const masked = githubAddMaskLines("postgres://phil:p%40ss@db.example.com/leadwell");
ok(masked.some((l) => l === "::add-mask::postgres://phil:p%40ss@db.example.com/leadwell"), "mask raw URI");
ok(masked.some((l) => l === "::add-mask::p%40ss"), "mask encoded password");
ok(masked.some((l) => l === "::add-mask::p@ss"), "mask decoded password");
ok(masked.every((l) => l.startsWith("::add-mask::")), "mask lines are add-mask only");

if (fails.length) {
  console.error(`${fails.length}/${checks} failed`);
  for (const f of fails) console.error("  -", f);
  process.exit(1);
}
console.log(`prove-loopback: ${checks} ok`);
