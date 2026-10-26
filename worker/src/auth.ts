import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { Pool } from "pg";
import {
  authCookieSecure,
  resolveAuthBaseURL,
  resolveAuthCookieDomain,
  resolveTrustedOrigins,
} from "./authUrl.ts";
import { clientConnection, poolSsl } from "./db.ts";
import { databaseUrl, type Env } from "./env.ts";

export type AuthInstance = ReturnType<typeof createAuth>;

const ownedPools = new WeakMap<object, Pool>();

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

/**
 * No `trustedProviders`. Better Auth then only implicit-links when the
 * provider email is verified. An unverified Google email must never attach
 * to an existing user. Phil signs in through the migrated `account` row
 * (Google `sub`), not through email linking.
 */
export const ACCOUNT_LINKING = {
  enabled: true,
  disableImplicitLinking: true,
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

/** Implicit email-link is allowed only for a verified address of an untrusted provider. */
export function socialEmailMayLinkToExistingUser(opts: {
  trustedProviders: readonly string[];
  providerId: string;
  emailVerified: boolean;
}): boolean {
  if (opts.trustedProviders.includes(opts.providerId)) return true;
  return opts.emailVerified === true;
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

export function createAuth(env: Env, database?: AuthDatabase) {
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
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            disableImplicitSignUp: true,
          },
        }
      : undefined;
  const auth = betterAuth({
    secret,
    baseURL,
    basePath: "/api/auth",
    database: db as Pool,
    emailAndPassword: { enabled: true },
    socialProviders: google,
    user: {
      ...authModels.user,
      validateUserInfo: ({ user, source }) => {
        if (source.action !== "create-user" && source.action !== "link-account") {
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
    account: {
      ...authModels.account,
      accountLinking: ACCOUNT_LINKING,
    },
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
    },
    plugins: [bearer({ requireSignature: true })],
  });
  if (owned) ownedPools.set(auth, owned);
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
