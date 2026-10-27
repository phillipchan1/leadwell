import { libpqCleanEnv, refuseUnsafeTestUrl } from "./refuseTestUrl.ts";

const fails: string[] = [];
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) fails.push(msg);
}

function refused(url: string, label?: string): boolean {
  try {
    refuseUnsafeTestUrl(url, label);
    return false;
  } catch {
    return true;
  }
}

ok(!refused("postgresql://postgres:postgres@127.0.0.1:5432/polarch"), "127.0.0.1 allowed");
ok(!refused("postgresql://postgres@localhost:5432/polarch"), "localhost allowed");
ok(!refused("postgresql://postgres@[::1]:5432/polarch"), "::1 allowed");
ok(refused("postgresql://neondb@ep-prod.neon.tech/polarch"), "Neon host refused");
ok(refused("postgresql://u@0127.0.0.1:5432/polarch"), "leading-zero IPv4 refused");
ok(refused("postgresql://u@127:5432/polarch"), "bare 127 refused");
ok(refused("postgresql://u@10.0.0.1:5432/polarch"), "RFC1918 refused");
ok(
  refused("postgresql://u@127.0.0.1:5432/polarch?host=ep-prod.neon.tech"),
  "host= redirect query refused",
);
ok(refused("not-a-url"), "invalid URL refused");

const saved = process.env.PGHOST;
process.env.PGHOST = "ep-prod.neon.tech";
ok(
  refused("postgresql://postgres@127.0.0.1:5432/polarch"),
  "PGHOST non-loopback refused even if URL is loopback",
);
if (saved === undefined) delete process.env.PGHOST;
else process.env.PGHOST = saved;

function withEnv(name: string, value: string, fn: () => boolean): boolean {
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
    refused("postgresql://postgres@127.0.0.1:5432/polarch"),
  ),
  "PGSERVICE refused even if URL is loopback",
);
ok(
  withEnv("PGSERVICEFILE", "/tmp/pg_service.conf", () =>
    refused("postgresql://postgres@127.0.0.1:5432/polarch"),
  ),
  "PGSERVICEFILE refused even if URL is loopback",
);
ok(
  withEnv("PGSYSCONFDIR", "/tmp/pgconf", () =>
    refused("postgresql://postgres@127.0.0.1:5432/polarch"),
  ),
  "PGSYSCONFDIR refused even if URL is loopback",
);

const cleaned = libpqCleanEnv({
  PGHOST: "ep-prod.neon.tech",
  PGSERVICE: "neon-prod",
  PGSERVICEFILE: "/tmp/pg_service.conf",
  PGSYSCONFDIR: "/tmp/pgconf",
  KEEP: "yes",
});
ok(!cleaned.PGSERVICE && !cleaned.PGSERVICEFILE && !cleaned.PGSYSCONFDIR, "libpqCleanEnv drops service vars");
ok(cleaned.KEEP === "yes", "libpqCleanEnv keeps unrelated vars");

if (fails.length) {
  console.error(`${fails.length}/${checks} failed`);
  for (const f of fails) console.error("  -", f);
  process.exit(1);
}
console.log(`refuseTestUrl.check: ${checks} ok`);
