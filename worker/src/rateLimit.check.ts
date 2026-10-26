/**
 * Prove the silent soft cap awaits one consume on both paths, and that
 * consumeRateLimitKey uses a fixed window (200 hits over >1h do not cap).
 */
import { readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { deliverMagicLinkOrSkip } from "./auth.ts";
import { applySchema, nextMigrationVersions, SCHEMA_DIR } from "./isolationDb.ts";
import {
  consumeEmailMagicLinkSoftCap,
  consumeRateLimitKey,
  emailSoftLogMagicLinkRateLimitKey,
  emailSoftMagicLinkRateLimitKey,
  MAGIC_LINK_EMAIL_SOFT_MAX,
  MAGIC_LINK_EMAIL_SOFT_RULE,
  MAGIC_LINK_EMAIL_SOFT_WINDOW_SEC,
  recordEmailMagicLinkSoftCapSkip,
  type RateLimitDatabase,
} from "./rateLimit.ts";

const fails: string[] = [];
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) fails.push(msg);
}

function pgliteAsRateLimitDb(db: PGlite): RateLimitDatabase {
  return {
    async connect() {
      return {
        async query(sql: string, parameters: readonly unknown[] = []) {
          const result = await db.query(sql, parameters as never[]);
          return {
            rows: result.rows,
            rowCount: result.affectedRows ?? result.rows.length,
          };
        },
        release() {},
      };
    },
  };
}

function countingDb(
  inner: RateLimitDatabase,
  hits: { sql: string }[],
): RateLimitDatabase {
  return {
    async connect() {
      const client = await inner.connect();
      return {
        async query(sql: string, parameters: readonly unknown[] = []) {
          hits.push({ sql });
          return client.query(sql, parameters);
        },
        release() {
          client.release();
        },
      };
    },
  };
}

ok(
  nextMigrationVersions(readdirSync(SCHEMA_DIR)).includes(4),
  "window_start lives in migration 004",
);
ok(
  !emailSoftMagicLinkRateLimitKey("phil@example.com").includes("203."),
  "soft cap key is email-only (no IP)",
);

const db = new PGlite();
await applySchema(db);
const pool = pgliteAsRateLimitDb(db);

const cols = await db.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'rate_limit'`,
);
const colNames = (cols.rows as { column_name: string }[]).map((row) => row.column_name);
ok(colNames.includes("window_start"), "rate_limit has window_start after 004");
ok(colNames.includes("last_request"), "rate_limit still has last_request");

const env = {
  BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
  BETTER_AUTH_URL: "http://localhost:8787",
  ENVIRONMENT: "local" as const,
  ALLOWED_EMAILS: "phil@example.com",
  RESEND_API_KEY: "re_test",
  AUTH_EMAIL_FROM: "login@polarch.day",
};

try {
  const allowHits: { sql: string }[] = [];
  const denyHits: { sql: string }[] = [];
  const allowDb = countingDb(pool, allowHits);
  const denyDb = countingDb(pool, denyHits);

  const allowed = await consumeEmailMagicLinkSoftCap(allowDb, "phil@example.com");
  ok(allowed.allowed, "first soft-cap consume is allowed");
  ok(allowHits.length === 1, `uncapped soft cap awaits one consume (got ${allowHits.length})`);

  await db.query("DELETE FROM rate_limit");
  const seeded = Date.now();
  await db.query(
    "INSERT INTO rate_limit (id, key, count, last_request, window_start) VALUES ($1, $2, $3, $4, $5)",
    [
      crypto.randomUUID(),
      emailSoftMagicLinkRateLimitKey("phil@example.com"),
      MAGIC_LINK_EMAIL_SOFT_MAX,
      seeded,
      seeded,
    ],
  );
  const denied = await consumeEmailMagicLinkSoftCap(denyDb, "phil@example.com");
  ok(!denied.allowed, "seeded soft cap is denied");
  ok(denyHits.length === 1, `capped soft cap awaits one consume (got ${denyHits.length})`);
  ok(
    allowHits.length === denyHits.length,
    "capped and uncapped soft-cap consumes await the same number of round trips",
  );
  ok(
    (await db.query("SELECT key FROM rate_limit WHERE key = $1", [
      emailSoftLogMagicLinkRateLimitKey("phil@example.com"),
    ])).rows.length === 0,
    "denied soft cap does not consume the log key",
  );

  const firstSkip = await recordEmailMagicLinkSoftCapSkip(pool, "phil@example.com");
  const secondSkip = await recordEmailMagicLinkSoftCapSkip(pool, "phil@example.com");
  ok(firstSkip, "first skip record is logged once");
  ok(!secondSkip, "later skip records stay quiet");

  await db.query("DELETE FROM rate_limit");
  const resendCalls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("api.resend.com")) {
      await new Promise((resolve) => setTimeout(resolve, 180));
      resendCalls.push(String(init?.body ?? ""));
      return new Response(JSON.stringify({ id: "email_test" }), { status: 200 });
    }
    return realFetch(input as never, init);
  }) as typeof fetch;

  const skipLogs: unknown[][] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => {
    skipLogs.push(args);
  };
  try {
    const tSkip = Date.now();
    const skipTask = deliverMagicLinkOrSkip(env, pool, {
      email: "phil@example.com",
      url: "http://localhost:8787/signin",
      token: "visible-token",
      send: false,
    });
    const skipReturnMs = Date.now() - tSkip;
    ok(skipReturnMs < 50, `deliver no-op returns a promise without awaiting Resend (${skipReturnMs}ms)`);
    await skipTask;
    ok(resendCalls.length === 0, "soft-cap no-op does not call Resend");
    ok(
      skipLogs.some((args) => (args[1] as { kind?: string } | undefined)?.kind === "soft_cap"),
      "no-op path logs kind soft_cap",
    );
    const skipBlob = JSON.stringify(skipLogs);
    ok(!skipBlob.includes("phil@example.com"), "no-op log has no email");
    ok(!skipBlob.includes("visible-token"), "no-op log has no token");

    skipLogs.length = 0;
    const tSend = Date.now();
    const sendTask = deliverMagicLinkOrSkip(env, pool, {
      email: "phil@example.com",
      url: "http://localhost:8787/signin",
      token: "visible-token",
      send: true,
    });
    const sendReturnMs = Date.now() - tSend;
    ok(sendReturnMs < 50, `deliver send returns a promise without awaiting Resend (${sendReturnMs}ms)`);
    await sendTask;
    ok(resendCalls.length === 1, "send path dispatches Resend");
    ok(
      !skipLogs.some((args) => (args[1] as { kind?: string } | undefined)?.kind === "soft_cap"),
      "send path does not write a soft-cap log",
    );
    ok(!JSON.stringify(resendCalls).includes("visible-token"), "Resend body is not the raw token");
  } finally {
    console.error = realError;
    globalThis.fetch = realFetch;
  }

  await db.query("DELETE FROM rate_limit");
  const spreadKey = "fixed-window-spread";
  const origin = 1_700_000_000_000;
  const windowMs = MAGIC_LINK_EMAIL_SOFT_WINDOW_SEC * 1000;
  const spanMs = windowMs + 10 * 60 * 1000;
  const step = Math.floor(spanMs / (MAGIC_LINK_EMAIL_SOFT_MAX - 1));
  let spreadDenied = 0;
  for (let i = 0; i < MAGIC_LINK_EMAIL_SOFT_MAX; i++) {
    const now = origin + i * step;
    const result = await consumeRateLimitKey(pool, spreadKey, MAGIC_LINK_EMAIL_SOFT_RULE, now);
    if (!result.allowed) spreadDenied += 1;
  }
  ok(
    spreadDenied === 0,
    `200 requests spread over more than 1h do not cap (denied ${spreadDenied})`,
  );
  const lastSpread = origin + (MAGIC_LINK_EMAIL_SOFT_MAX - 1) * step;
  const afterSpread = await consumeRateLimitKey(
    pool,
    spreadKey,
    MAGIC_LINK_EMAIL_SOFT_RULE,
    lastSpread + 1,
  );
  ok(afterSpread.allowed, "the next request after a >1h spread is still allowed");

  await db.query("DELETE FROM rate_limit");
  const burstKey = "fixed-window-burst";
  let burstDenied = 0;
  for (let i = 0; i < MAGIC_LINK_EMAIL_SOFT_MAX; i++) {
    const result = await consumeRateLimitKey(
      pool,
      burstKey,
      MAGIC_LINK_EMAIL_SOFT_RULE,
      origin + i * 1000,
    );
    if (!result.allowed) burstDenied += 1;
  }
  ok(burstDenied === 0, `200 requests inside one hour are allowed (denied ${burstDenied})`);
  const capped = await consumeRateLimitKey(
    pool,
    burstKey,
    MAGIC_LINK_EMAIL_SOFT_RULE,
    origin + MAGIC_LINK_EMAIL_SOFT_MAX * 1000,
  );
  ok(!capped.allowed, "201st request inside the same hour is capped");
  ok(
    (capped.retryAfter ?? 0) <= MAGIC_LINK_EMAIL_SOFT_WINDOW_SEC - 199,
    `retryAfter uses window_start, not last_request (got ${capped.retryAfter})`,
  );

  await db.query("DELETE FROM rate_limit");
  const empty = await consumeEmailMagicLinkSoftCap(pool, "   ");
  ok(empty.allowed, "blank email does not consume a soft-cap key");
} finally {
  await db.close();
}

if (fails.length) {
  console.error(`${fails.length}/${checks} failed`);
  for (const f of fails) console.error("  -", f);
  process.exit(1);
}
console.log(`rateLimit.check: ${checks} ok`);
