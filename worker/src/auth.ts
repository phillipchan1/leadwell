import { betterAuth } from "better-auth";
import { bearer, magicLink } from "better-auth/plugins";
import { Pool } from "pg";
import {
  authCookieSecure,
  isLocalAuthRuntime,
  resolveAuthBaseURL,
  resolveAuthCookieDomain,
  resolveTrustedOrigins,
} from "./authUrl.ts";
import { clientConnection, poolSsl } from "./db.ts";
import { databaseUrl, type Env } from "./env.ts";
import { sendMagicLinkEmail } from "./mail.ts";
import {
  authRateLimitCustomRules,
  consumeEmailMagicLinkLimit,
  createDatabaseRateLimitStorage,
  rateLimitDeniedResponse,
} from "./rateLimit.ts";

export type AuthInstance = ReturnType<typeof createAuth>;

const ownedPools = new WeakMap<object, Pool>();
const authDatabases = new WeakMap<object, AuthDatabase>();
const authEnvs = new WeakMap<object, Env>();

/**
 * Neon / PGlite columns are snake_case. Better Auth's default identifiers are
 * camelCase (`emailVerified`, `expiresAt`, `userId`, …). Without this map the
 * adapter emits `column "emailVerified" does not exist`.
 */
export const authModels = {
  user: {
    modelName: "user",
    fields: {
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  session: {
    modelName: "session",
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      userId: "user_id",
    },
  },
  account: {
    modelName: "account",
    fields: {
      accountId: "account_id",
      providerId: "provider_id",
      userId: "user_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  verification: {
    modelName: "verification",
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
} as const;

export function allowedEmails(env: Pick<Env, "ALLOWED_EMAILS">): Set<string> {
  return new Set(
    (env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAllowedEmail(
  env: Pick<Env, "ALLOWED_EMAILS">,
  email: string | null | undefined,
): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return false;
  return allowedEmails(env).has(trimmed);
}

/** Prod keys rate limits on CF-Connecting-IP only so XFF/X-Real-IP cannot spoof. */
export const PROD_AUTH_IP_HEADERS = ["cf-connecting-ip"] as const;
export const LOCAL_AUTH_IP_HEADERS = [
  "cf-connecting-ip",
  "x-real-ip",
  "x-forwarded-for",
] as const;

export function authIpAddressHeaders(env: Pick<Env, "ENVIRONMENT">): string[] {
  return isLocalAuthRuntime(env) ? [...LOCAL_AUTH_IP_HEADERS] : [...PROD_AUTH_IP_HEADERS];
}

/**
 * Better Auth magic-link verify looks up `user` by lowercased email and
 * only creates a row when none exists. A migrated Supabase user (same
 * UUID + email) is therefore the first-sign-in target.
 */
export function existingUserForMagicLinkEmail(
  users: readonly { id: string; email: string }[],
  email: string,
): { id: string; email: string } | null {
  const want = email.trim().toLowerCase();
  if (!want) return null;
  return users.find((u) => u.email.trim().toLowerCase() === want) ?? null;
}

/** `pg.Pool` or a PGlite stand-in with the same connect/query/end surface. */
export type AuthDatabase =
  | Pool
  | {
      connect(): Promise<{
        query(
          sql: string,
          parameters: readonly unknown[],
        ): Promise<{ command: string; rowCount: number; rows: unknown[] }>;
        release(): void;
      }>;
      end(): Promise<void>;
      options: object;
    };

export type CreateAuthOptions = {
  /** Workers: `ctx.waitUntil`. Mail is scheduled here so the HTTP response stays fast. */
  waitUntil?: (task: Promise<unknown>) => void;
};

export function createAuth(env: Env, database?: AuthDatabase, options?: CreateAuthOptions) {
  const url = databaseUrl(env);
  if (!database && !url) {
    throw new Error("database is not configured (HYPERDRIVE or DATABASE_URL)");
  }
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  const baseURL = resolveAuthBaseURL(env);
  const cookieDomain = resolveAuthCookieDomain(env);
  let owned: Pool | undefined;
  const opts = url ? clientConnection(env, url) : null;
  const db =
    database ??
    (owned = new Pool({
      connectionString: opts!.connectionString,
      max: 1,
      ssl: poolSsl(opts!.ssl),
    }));
  const auth = betterAuth({
    secret,
    baseURL,
    basePath: "/api/auth",
    database: db as Pool,
    emailAndPassword: { enabled: false },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "rate_limit",
      fields: { lastRequest: "last_request" },
      window: 60,
      max: 60,
      customRules: authRateLimitCustomRules(),
      customStorage: createDatabaseRateLimitStorage(db),
    },
    user: {
      ...authModels.user,
      validateUserInfo: ({ user, source }) => {
        if (
          source.action !== "create-user" &&
          source.action !== "link-account" &&
          source.action !== "sign-in"
        ) {
          return;
        }
        if (isAllowedEmail(env, typeof user.email === "string" ? user.email : null)) {
          return;
        }
        return {
          error: "not_allowed",
          errorDescription: "this account is not allowed",
        };
      },
    },
    session: authModels.session,
    account: authModels.account,
    verification: authModels.verification,
    trustedOrigins: resolveTrustedOrigins(env),
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
      ...(cookieDomain
        ? { crossSubDomainCookies: { enabled: true, domain: cookieDomain } }
        : {}),
      defaultCookieAttributes: {
        sameSite: "lax",
        secure: authCookieSecure(baseURL),
        httpOnly: true,
        path: "/",
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      },
      ipAddress: {
        ipAddressHeaders: authIpAddressHeaders(env),
      },
    },
    plugins: [
      bearer({ requireSignature: true }),
      magicLink({
        expiresIn: 60 * 10,
        sendMagicLink: async ({ email, url, token }) => {
          if (!isAllowedEmail(env, email)) return;
          const sending = sendMagicLinkEmail(env, { email, url, token });
          if (options?.waitUntil) {
            options.waitUntil(sending);
            return;
          }
          await sending;
        },
      }),
    ],
  });
  if (owned) ownedPools.set(auth, owned);
  authDatabases.set(auth, db);
  authEnvs.set(auth, env);
  return auth;
}

/** Per-request Better Auth. Not cached — Workers cannot reuse the Pool. */
export function getAuth(env: Env): AuthInstance {
  return createAuth(env);
}

export async function closeAuth(auth: AuthInstance): Promise<void> {
  const pool = ownedPools.get(auth);
  if (pool) await pool.end();
}

/**
 * Better Auth handler plus the extra per-email magic-link bucket.
 * The built-in limiter keys IP + path only; this adds 3/min per email.
 */
export async function handleAuthRequest(auth: AuthInstance, req: Request): Promise<Response> {
  const path = new URL(req.url).pathname;
  if (req.method === "POST" && path.endsWith("/sign-in/magic-link")) {
    const db = authDatabases.get(auth);
    if (db) {
      let email = "";
      try {
        const body = (await req.clone().json()) as { email?: unknown };
        if (typeof body.email === "string") email = body.email;
      } catch {
        /* Better Auth answers invalid JSON */
      }
      const gate = authEnvs.get(auth);
      if (email && gate && isAllowedEmail(gate, email)) {
        const result = await consumeEmailMagicLinkLimit(db, email);
        if (!result.allowed) return rateLimitDeniedResponse(result.retryAfter ?? 60);
      }
    }
  }
  return auth.handler(req);
}

export async function sessionUser(
  auth: AuthInstance,
  req: Request,
): Promise<{ id: string; email?: string | null } | null> {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) return null;
    return { id: session.user.id, email: session.user.email };
  } catch {
    return null;
  }
}
