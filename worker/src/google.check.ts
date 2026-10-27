/**
 * Prove Google sign-in (Better Auth socialProviders.google) against PGlite:
 * - off when GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are missing (magic link still works)
 * - an existing magic-link user links by verified email: same user id, one
 *   user row, one google account row; a repeat sign-in adds nothing
 * - a brand-new allowlisted Google email signs in (verified) and gets one user
 * - a non-allowlisted Google email is refused and creates nothing
 * - email_verified=false is refused: no link, no new user (even though google is trusted)
 * - the magic link keeps working with Google on
 * - /api/auth-providers reports booleans only
 *
 * Google's token endpoint is mocked; the id_token is an unsigned JWT, which is
 * exactly what Better Auth decodes on the authorization-code path.
 */
import { PGlite } from "@electric-sql/pglite";
import {
  ACCOUNT_LINKING,
  closeAuth,
  createAuth,
  googleConfigured,
  googleSocialProviders,
  handleAuthRequest,
  type AuthDatabase,
} from "./auth.ts";
import { applySchema } from "./isolationDb.ts";
import { app } from "./index.ts";

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
    async end() {},
    options: {},
  };
}

const origin = "http://localhost:8787";
const baseEnv = {
  BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
  BETTER_AUTH_URL: origin,
  ENVIRONMENT: "local" as const,
  ALLOWED_EMAILS: "phil@example.com,pat@example.com,new@example.com",
  RESEND_API_KEY: "re_test",
  AUTH_EMAIL_FROM: "login@polarch.day",
};
const googleEnv = {
  ...baseEnv,
  GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "test-google-secret",
};

const db = new PGlite();
await applySchema(db);
const pool = pgliteAsPool(db);

// ---- fetch mock: Resend (magic link mail) + Google token endpoint ----
const mailedUrls: string[] = [];
type Profile = { sub: string; email: string; email_verified: boolean; name?: string };
let nextProfile: Profile | null = null;
const tokenCalls: string[] = [];
const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("api.resend.com")) {
    const body = JSON.parse(String(init?.body ?? "{}")) as { text?: string };
    const m = /(http\S+magic-link\/verify\S+)/.exec(body.text ?? "");
    if (m) mailedUrls.push(m[1]);
    return new Response(JSON.stringify({ id: "email_test" }), { status: 200 });
  }
  if (url.startsWith("https://oauth2.googleapis.com/token")) {
    tokenCalls.push(url);
    const p = nextProfile!;
    const now = Math.floor(Date.now() / 1000);
    const idToken = `${b64url({ alg: "none", typ: "JWT" })}.${b64url({
      iss: "https://accounts.google.com",
      aud: googleEnv.GOOGLE_CLIENT_ID,
      iat: now,
      exp: now + 3600,
      name: p.name ?? "Test User",
      ...p,
    })}.`;
    return new Response(
      JSON.stringify({
        access_token: "ya29.test",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "openid email profile",
        id_token: idToken,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  return realFetch(input as never, init);
}) as typeof fetch;

function cookieHeader(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${sql}`, params as never[]);
  return r.rows[0].n;
}

async function magicLinkSignIn(auth: ReturnType<typeof createAuth>, email: string) {
  const before = mailedUrls.length;
  const send = await handleAuthRequest(
    auth,
    new Request(`${origin}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { origin, "content-type": "application/json", "cf-connecting-ip": "203.0.113.20" },
      body: JSON.stringify({ email, callbackURL: `${origin}/signin` }),
    }),
  );
  // Mail is sent in the background; give it a tick.
  for (let i = 0; i < 50 && mailedUrls.length === before; i++) {
    await new Promise((r) => setTimeout(r, 20));
  }
  const link = mailedUrls[before];
  if (!link) return { sendStatus: send.status, verifyStatus: 0, cookie: "" };
  const verify = await handleAuthRequest(
    auth,
    new Request(link, { headers: { origin, "cf-connecting-ip": "203.0.113.20" } }),
  );
  return { sendStatus: send.status, verifyStatus: verify.status, cookie: cookieHeader(verify) };
}

// Better Auth caps /sign-in/* at 3 per 10s per IP; give each flow its own IP.
let ipSeq = 0;
async function googleSignIn(auth: ReturnType<typeof createAuth>, profile: Profile) {
  const ip = `198.51.100.${++ipSeq}`;
  const start = await handleAuthRequest(
    auth,
    new Request(`${origin}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { origin, "content-type": "application/json", "cf-connecting-ip": ip },
      body: JSON.stringify({
        provider: "google",
        callbackURL: `${origin}/signin`,
        errorCallbackURL: `${origin}/signin`,
      }),
    }),
  );
  const startBody = (await start.json().catch(() => ({}))) as { url?: string };
  if (start.status !== 200 || !startBody.url) {
    return { startStatus: start.status, authUrl: null, location: null, cookie: "" };
  }
  const authUrl = new URL(startBody.url);
  const state = authUrl.searchParams.get("state") ?? "";
  nextProfile = profile;
  const cb = await handleAuthRequest(
    auth,
    new Request(
      `${origin}/api/auth/callback/google?code=test-code&state=${encodeURIComponent(state)}`,
      {
        headers: { cookie: cookieHeader(start), "cf-connecting-ip": ip },
        redirect: "manual",
      },
    ),
  );
  return {
    startStatus: start.status,
    authUrl,
    location: cb.headers.get("location"),
    cookie: cookieHeader(cb),
  };
}

async function sessionEmail(auth: ReturnType<typeof createAuth>, cookie: string) {
  const res = await handleAuthRequest(
    auth,
    new Request(`${origin}/api/auth/get-session`, { headers: { origin, cookie } }),
  );
  const body = (await res.json().catch(() => null)) as { user?: { id: string; email: string } } | null;
  return body?.user ?? null;
}

try {
  // ---- config helpers ----
  ok(!googleConfigured(baseEnv), "Google off with no secrets");
  ok(!googleConfigured({ GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: " " }), "blank secret = off");
  ok(googleSocialProviders(baseEnv) === undefined, "no socialProviders without secrets");
  ok(googleConfigured(googleEnv), "Google on with both secrets");
  ok(ACCOUNT_LINKING.enabled && ACCOUNT_LINKING.trustedProviders.includes("google"), "google trusted for linking");
  ok(ACCOUNT_LINKING.requireLocalEmailVerified === true, "local email must be verified to link");
  ok(ACCOUNT_LINKING.allowDifferentEmails === false, "no cross-email linking");

  // ---- Google off: social sign-in refused, magic link works ----
  const offAuth = createAuth(baseEnv, pool);
  const off = await googleSignIn(offAuth, { sub: "g-off", email: "phil@example.com", email_verified: true });
  ok(off.authUrl === null && off.startStatus >= 400, `Google off: sign-in/social refused (got ${off.startStatus})`);
  ok(tokenCalls.length === 0, "Google off: no token call");
  const philMagic = await magicLinkSignIn(offAuth, "phil@example.com");
  ok(philMagic.sendStatus === 200, `magic link send 200 (got ${philMagic.sendStatus})`);
  ok(philMagic.verifyStatus === 302, `magic link verify redirects (got ${philMagic.verifyStatus})`);
  const philUser = await sessionEmail(offAuth, philMagic.cookie);
  ok(philUser?.email === "phil@example.com", "magic link creates a session for Phil");
  const philId = philUser?.id ?? "";
  ok((await count("account")) === 0, "magic link adds no account row");
  await closeAuth(offAuth);

  const auth = createAuth(googleEnv, pool);

  // ---- authorize URL ----
  const probe = await handleAuthRequest(
    auth,
    new Request(`${origin}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { origin, "content-type": "application/json", "cf-connecting-ip": "203.0.113.31" },
      body: JSON.stringify({ provider: "google", callbackURL: `${origin}/signin` }),
    }),
  );
  const probeUrl = new URL(((await probe.json()) as { url: string }).url);
  ok(probeUrl.origin === "https://accounts.google.com", "redirects to accounts.google.com");
  ok(
    probeUrl.searchParams.get("redirect_uri") === `${origin}/api/auth/callback/google`,
    `redirect_uri is BETTER_AUTH_URL/api/auth/callback/google (got ${probeUrl.searchParams.get("redirect_uri")})`,
  );
  ok(probeUrl.searchParams.get("client_id") === googleEnv.GOOGLE_CLIENT_ID, "client_id from Worker secret");
  ok(!probeUrl.href.includes(googleEnv.GOOGLE_CLIENT_SECRET), "client secret never in the authorize URL");
  ok(probeUrl.searchParams.get("prompt") === "select_account", "prompt=select_account");

  // ---- existing magic-link user links by verified email ----
  const link1 = await googleSignIn(auth, { sub: "g-phil", email: "Phil@Example.com", email_verified: true });
  ok(link1.location === `${origin}/signin`, `link: lands on /signin (got ${link1.location})`);
  const linked = await sessionEmail(auth, link1.cookie);
  ok(linked?.id === philId && philId !== "", "link: Google lands on Phil's existing user id");
  ok((await count(`"user"`)) === 1, "link: still exactly one user");
  ok(
    (await count(`account WHERE provider_id = 'google' AND account_id = 'g-phil' AND user_id = $1`, [philId])) === 1,
    "link: one google account row on Phil's user",
  );

  const link2 = await googleSignIn(auth, { sub: "g-phil", email: "phil@example.com", email_verified: true });
  ok((await sessionEmail(auth, link2.cookie))?.id === philId, "repeat: same user id");
  ok((await count(`"user"`)) === 1, "repeat: no duplicate user");
  ok((await count(`account WHERE provider_id = 'google'`)) === 1, "repeat: no duplicate google account");

  // ---- new allowlisted Google user ----
  const fresh = await googleSignIn(auth, { sub: "g-new", email: "new@example.com", email_verified: true });
  const freshUser = await sessionEmail(auth, fresh.cookie);
  ok(freshUser?.email === "new@example.com", "new allowlisted Google user signs in");
  ok((await count(`"user" WHERE lower(email) = 'new@example.com'`)) === 1, "new user: one row");

  // ---- allowlist ----
  const usersBefore = await count(`"user"`);
  const stranger = await googleSignIn(auth, { sub: "g-x", email: "stranger@example.com", email_verified: true });
  ok(stranger.location?.startsWith(`${origin}/signin?error=`) ?? false, `stranger: error redirect (got ${stranger.location})`);
  ok((await sessionEmail(auth, stranger.cookie)) === null, "stranger: no session");
  ok((await count(`"user"`)) === usersBefore, "stranger: no user created");
  ok((await count(`account WHERE account_id = 'g-x'`)) === 0, "stranger: no account created");

  // ---- unverified Google email cannot adopt an existing user ----
  const unv = await googleSignIn(auth, { sub: "g-evil", email: "pat@example.com", email_verified: false });
  ok(unv.location?.startsWith(`${origin}/signin?error=`) ?? false, `unverified: error redirect (got ${unv.location})`);
  ok((await sessionEmail(auth, unv.cookie)) === null, "unverified: no session");
  ok((await count(`"user"`)) === usersBefore, "unverified: no user created");
  ok((await count(`account WHERE account_id = 'g-evil'`)) === 0, "unverified: no account created");

  const patMagic = await magicLinkSignIn(auth, "pat@example.com");
  const pat = await sessionEmail(auth, patMagic.cookie);
  ok(pat?.email === "pat@example.com", "magic link still works with Google on");
  const unvLink = await googleSignIn(auth, { sub: "g-evil", email: "pat@example.com", email_verified: false });
  ok((await sessionEmail(auth, unvLink.cookie)) === null, "unverified: cannot take over existing Pat");
  ok((await count(`account WHERE user_id = $1`, [pat?.id ?? ""])) === 0, "unverified: no account on Pat");

  // ---- magic link for a Google-linked user still works ----
  const philAgain = await magicLinkSignIn(auth, "phil@example.com");
  ok((await sessionEmail(auth, philAgain.cookie))?.id === philId, "Phil can still use the magic link");

  ok(!(await count(`account WHERE password IS NOT NULL`)), "no password accounts");

  // ---- /api/auth-providers: booleans only ----
  const ctx = { waitUntil() {}, passThroughOnException() {} } as never;
  for (const [label, e, want] of [
    ["off", baseEnv, false],
    ["on", googleEnv, true],
  ] as const) {
    const res = await app.request("/api/auth-providers", { method: "GET" }, e as never, ctx);
    const text = await res.text();
    const body = JSON.parse(text) as { google?: unknown; magicLink?: unknown };
    ok(res.status === 200, `auth-providers ${label}: 200`);
    ok(body.google === want && body.magicLink === true, `auth-providers ${label}: google=${want}, magicLink=true`);
    ok(!text.includes("test-client") && !text.includes("test-google-secret"), `auth-providers ${label}: no ids or secrets`);
    ok(res.headers.get("cache-control") === "no-store", `auth-providers ${label}: no-store`);
  }

  await closeAuth(auth);
} catch (err) {
  fails.push(`threw: ${err instanceof Error ? err.stack : String(err)}`);
} finally {
  globalThis.fetch = realFetch;
  await db.close();
}

if (fails.length) {
  console.error(`${fails.length}/${checks} failed`);
  for (const f of fails) console.error("  -", f);
  process.exit(1);
}
console.log(`google.check: ${checks} ok`);
