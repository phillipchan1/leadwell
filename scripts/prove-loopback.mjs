#!/usr/bin/env node
/**
 * Prove the loopback-only guard used by every DB-touching test/prove script.
 * Does not connect to any database.
 */
import { assertLoopbackDatabaseUrl, refuseUnsafeTestUrl } from "./loopback.mjs";

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

let missing = false;
try {
  assertLoopbackDatabaseUrl("", "LEADWELL_TEST_DATABASE_URL");
} catch {
  missing = true;
}
ok(missing, "empty URL required-and-loopback");

if (fails.length) {
  console.error(`${fails.length}/${checks} failed`);
  for (const f of fails) console.error("  -", f);
  process.exit(1);
}
console.log(`prove-loopback: ${checks} ok`);
