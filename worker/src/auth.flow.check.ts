/**
 * Prove magic-link rate limits and allowlist non-disclosure against a real
 * Better Auth instance on PGlite.
 */
import { PGlite } from "@electric-sql/pglite";
import { closeAuth, createAuth, handleAuthRequest, type AuthDatabase } from "./auth.ts";
import { applySchema } from "./isolationDb.ts";
import { MAGIC_LINK_SEND_MAX, MAGIC_LINK_VERIFY_MAX } from "./rateLimit.ts";

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
  ALLOWED_EMAILS: "phil@example.com",
  RESEND_API_KEY: "re_test",
  AUTH_EMAIL_FROM: "login@polarch.day",
};

const origin = "http://localhost:8787";
const db = new PGlite();
await applySchema(db);
const pool = pgliteAsPool(db);
const auth = createAuth(env, pool);

const resendCalls: { to: string[]; idempotency?: string | null }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("api.resend.com")) {
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

async function sendLink(email: string, extra: Record<string, string> = {}): Promise<Response> {
  return handleAuthRequest(
    auth,
    new Request(`${origin}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: magicLinkHeaders(extra),
      body: JSON.stringify({ email, callbackURL: `${origin}/signin` }),
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

try {
  const allowed = await sendLink("phil@example.com");
  const allowedBody = (await allowed.json()) as { status?: boolean };
  ok(allowed.status === 200, `allowlisted send is 200 (got ${allowed.status})`);
  ok(allowedBody.status === true, "allowlisted send returns {status:true}");

  const denied = await sendLink("stranger@example.com");
  const deniedBody = (await denied.json()) as { status?: boolean };
  ok(denied.status === 200, `non-allowlisted send is 200 (got ${denied.status})`);
  ok(deniedBody.status === true, "non-allowlisted send returns {status:true}");
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
  const sendStatuses: number[] = [];
  for (let i = 0; i < 20; i++) {
    sendStatuses.push((await sendLink("phil@example.com")).status);
  }
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
