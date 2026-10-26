/**
 * Prove magic-link rate limits, waitUntil mail, CF-Connecting-IP keying,
 * allowlist-before-email-counter, and no password auth.
 */
import { PGlite } from "@electric-sql/pglite";
import { closeAuth, createAuth, handleAuthRequest, type AuthDatabase } from "./auth.ts";
import { applySchema } from "./isolationDb.ts";
import {
  emailMagicLinkRateLimitKey,
  MAGIC_LINK_SEND_MAX,
  MAGIC_LINK_VERIFY_MAX,
} from "./rateLimit.ts";

const fails: string[] = [];
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) fails.push(msg);
}

function pgliteAsPool(db: PGlite): AuthDatabase {
  return {
    async connect() {
      return {
        async query(sql: string, parameters: readonly unknown[] = []) {
          const result = await db.query(sql, parameters as never[]);
          return {
            command: "SELECT",
            rowCount: result.affectedRows ?? result.rows.length,
            rows: result.rows,
          };
        },
        release() {},
      };
    },
    async end() {
      /* PGlite is closed by the test */
    },
    options: {},
  };
}

const env = {
  BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
  BETTER_AUTH_URL: "http://localhost:8787",
  ENVIRONMENT: "local" as const,
  ALLOWED_EMAILS: "phil@example.com,pat@example.com",
  RESEND_API_KEY: "re_test",
  AUTH_EMAIL_FROM: "login@polarch.day",
};

const origin = "http://localhost:8787";
const db = new PGlite();
await applySchema(db);
const pool = pgliteAsPool(db);
const background: Promise<unknown>[] = [];
const auth = createAuth(env, pool, {
  waitUntil: (task) => {
    background.push(task);
  },
});

const resendCalls: { to: string[]; idempotency?: string | null }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("api.resend.com")) {
    await new Promise((resolve) => setTimeout(resolve, 180));
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body ?? "{}")) as { to?: string[] };
    resendCalls.push({ to: body.to ?? [], idempotency: headers.get("Idempotency-Key") });
    return new Response(JSON.stringify({ id: "email_test" }), { status: 200 });
  }
  return realFetch(input as never, init);
}) as typeof fetch;

function magicLinkHeaders(extra: Record<string, string> = {}): Headers {
  return new Headers({
    origin,
    "content-type": "application/json",
    "cf-connecting-ip": "203.0.113.10",
    ...extra,
  });
}

async function sendLink(
  email: string,
  extra: Record<string, string> = {},
  instance = auth,
  requestOrigin = origin,
): Promise<Response> {
  return handleAuthRequest(
    instance,
    new Request(`${requestOrigin}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: magicLinkHeaders({ origin: requestOrigin, ...extra }),
      body: JSON.stringify({ email, callbackURL: `${requestOrigin}/signin` }),
    }),
  );
}

async function verifyBad(token: string): Promise<Response> {
  return handleAuthRequest(
    auth,
    new Request(`${origin}/api/auth/magic-link/verify?token=${token}&callbackURL=${origin}/signin`, {
      method: "GET",
      headers: { origin, "cf-connecting-ip": "203.0.113.10" },
    }),
  );
}

async function flushMail(): Promise<void> {
  const pending = background.splice(0);
  await Promise.all(pending);
}

async function emailBucket(email: string): Promise<number> {
  const result = await db.query("SELECT count FROM rate_limit WHERE key = $1", [
    emailMagicLinkRateLimitKey(email),
  ]);
  const row = result.rows[0] as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}

try {
  const tAllowed = Date.now();
  const allowed = await sendLink("phil@example.com");
  const allowedMs = Date.now() - tAllowed;
  const allowedBody = (await allowed.json()) as { status?: boolean };
  ok(allowed.status === 200, `allowlisted send is 200 (got ${allowed.status})`);
  ok(allowedBody.status === true, "allowlisted send returns {status:true}");
  ok(allowedMs < 120, `allowlisted response does not wait on Resend (${allowedMs}ms)`);
  ok(resendCalls.length === 0, "Resend has not finished before waitUntil flush");

  const tDenied = Date.now();
  const denied = await sendLink("stranger@example.com");
  const deniedMs = Date.now() - tDenied;
  const deniedBody = (await denied.json()) as { status?: boolean };
  ok(denied.status === 200, `non-allowlisted send is 200 (got ${denied.status})`);
  ok(deniedBody.status === true, "non-allowlisted send returns {status:true}");
  ok(deniedMs < 120, `non-allowlisted response is equally fast (${deniedMs}ms)`);

  await flushMail();
  ok(resendCalls.length === 1, `waitUntil sent exactly one email (got ${resendCalls.length})`);
  ok(
    resendCalls.every((c) => c.to.includes("phil@example.com")),
    "Resend is not called for a non-allowlisted address",
  );
  ok(
    resendCalls.every((c) => !c.idempotency?.includes("visible") && Boolean(c.idempotency)),
    "Resend Idempotency-Key is present and is not the raw token",
  );

  await db.query("DELETE FROM rate_limit");
  resendCalls.length = 0;
  const strangerStatuses: number[] = [];
  for (let i = 0; i < 20; i++) {
    strangerStatuses.push(
      (await sendLink("stranger@example.com", { "cf-connecting-ip": `198.51.100.${i + 1}` })).status,
    );
  }
  await flushMail();
  ok(
    strangerStatuses.every((s) => s === 200),
    "non-allowlisted floods still return 200 (not 429 on email)",
  );
  ok((await emailBucket("phil@example.com")) === 0, "stranger floods do not charge Phil's email bucket");
  ok(resendCalls.length === 0, "stranger floods do not call Resend");

  const philAfterFlood: number[] = [];
  for (let i = 0; i < 3; i++) {
    philAfterFlood.push(
      (await sendLink("phil@example.com", { "cf-connecting-ip": `203.0.113.${20 + i}` })).status,
    );
  }
  await flushMail();
  ok(
    philAfterFlood.every((s) => s === 200),
    `Phil can still send after stranger floods (got ${philAfterFlood.join(",")})`,
  );
  ok((await emailBucket("phil@example.com")) === 3, "Phil's email bucket is 3 after his own sends");
  const locked = await sendLink("phil@example.com", { "cf-connecting-ip": "203.0.113.200" });
  ok(locked.status === 429, "fourth Phil send is 429 on the email counter, even from a new IP");

  await db.query("DELETE FROM rate_limit");
  resendCalls.length = 0;
  const sendStatuses: number[] = [];
  for (let i = 0; i < 20; i++) {
    sendStatuses.push((await sendLink("phil@example.com")).status);
  }
  await flushMail();
  const sendOk = sendStatuses.filter((s) => s === 200).length;
  const sendLimited = sendStatuses.filter((s) => s === 429).length;
  ok(resendCalls.length <= MAGIC_LINK_SEND_MAX, `20 sends produce ≤${MAGIC_LINK_SEND_MAX} Resend calls (got ${resendCalls.length})`);
  ok(sendLimited >= 20 - MAGIC_LINK_SEND_MAX, `20 sends produce 429s after the cap (got ${sendLimited} 429s, statuses=${sendStatuses.join(",")})`);
  ok(sendOk <= MAGIC_LINK_SEND_MAX, `20 sends produce ≤${MAGIC_LINK_SEND_MAX} successes (got ${sendOk})`);

  const verifyStatuses: number[] = [];
  for (let i = 0; i < 40; i++) {
    verifyStatuses.push((await verifyBad(`bad-token-${i}`)).status);
  }
  const verifyLimited = verifyStatuses.filter((s) => s === 429).length;
  ok(verifyLimited > 0, `40 bad verifies hit 429 (got ${verifyLimited}; statuses=${verifyStatuses.join(",")})`);
  ok(
    verifyLimited >= 40 - MAGIC_LINK_VERIFY_MAX,
    `verify 429s match the tight cap (got ${verifyLimited}, cap ${MAGIC_LINK_VERIFY_MAX})`,
  );

  const prodEnv = {
    ...env,
    ENVIRONMENT: undefined,
    BETTER_AUTH_URL: "https://polarch.day",
  };
  const prodBg: Promise<unknown>[] = [];
  const prodAuth = createAuth(prodEnv, pool, { waitUntil: (task) => prodBg.push(task) });
  await db.query("DELETE FROM rate_limit");
  const ipA = { "cf-connecting-ip": "198.51.100.10", "x-forwarded-for": "8.8.8.8", "x-real-ip": "1.1.1.1" };
  const ipASpoof = {
    "cf-connecting-ip": "198.51.100.10",
    "x-forwarded-for": "9.9.9.9",
    "x-real-ip": "2.2.2.2",
  };
  const ipB = { "cf-connecting-ip": "198.51.100.11", "x-forwarded-for": "8.8.8.8", "x-real-ip": "1.1.1.1" };
  for (let i = 0; i < 3; i++) {
    ok(
      (await sendLink("phil@example.com", i === 0 ? ipA : ipASpoof, prodAuth, "https://polarch.day"))
        .status === 200,
      `prod IP A send ${i + 1} succeeds`,
    );
  }
  ok(
    (await sendLink("pat@example.com", ipASpoof, prodAuth, "https://polarch.day")).status === 429,
    "prod: same CF-Connecting-IP is one bucket even when XFF/X-Real-IP change",
  );
  ok(
    (await sendLink("pat@example.com", ipB, prodAuth, "https://polarch.day")).status === 200,
    "prod: a new CF-Connecting-IP is a separate bucket (XFF match is ignored)",
  );
  await Promise.all(prodBg.splice(0));
  await closeAuth(prodAuth);

  const signup = await handleAuthRequest(
    auth,
    new Request(`${origin}/api/auth/sign-up/email`, {
      method: "POST",
      headers: magicLinkHeaders(),
      body: JSON.stringify({
        email: "phil@example.com",
        password: "a-long-enough-password",
        name: "Phil",
      }),
    }),
  );
  ok(signup.status >= 400, `email/password sign-up is disabled (got ${signup.status})`);
  const signin = await handleAuthRequest(
    auth,
    new Request(`${origin}/api/auth/sign-in/email`, {
      method: "POST",
      headers: magicLinkHeaders(),
      body: JSON.stringify({
        email: "phil@example.com",
        password: "a-long-enough-password",
      }),
    }),
  );
  ok(signin.status >= 400, `email/password sign-in is disabled (got ${signin.status})`);
} finally {
  globalThis.fetch = realFetch;
  await closeAuth(auth);
  await db.close();
}

if (fails.length) {
  console.error(`${fails.length}/${checks} failed`);
  for (const f of fails) console.error("  -", f);
  process.exit(1);
}
console.log(`auth.flow.check: ${checks} ok`);
