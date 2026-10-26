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
ok(refused("not-a-url"), "invalid URL refused");

const saved = process.env.PGHOST;
process.env.PGHOST = "ep-prod.neon.tech";
ok(
  refused("postgresql://postgres@127.0.0.1:5432/leadwell"),
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
