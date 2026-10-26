/**
 * Better Auth rate limiting is off unless NODE_ENV=production. We turn it
 * on explicitly and store counts in Postgres so Workers isolates share them.
 */

export const MAGIC_LINK_SEND_WINDOW_SEC = 60;
export const MAGIC_LINK_SEND_MAX = 3;
export const MAGIC_LINK_EMAIL_GLOBAL_WINDOW_SEC = 60 * 60;
export const MAGIC_LINK_EMAIL_GLOBAL_MAX = 20;
export const MAGIC_LINK_VERIFY_WINDOW_SEC = 60;
export const MAGIC_LINK_VERIFY_MAX = 10;

export const MAGIC_LINK_SEND_RULE = {
  window: MAGIC_LINK_SEND_WINDOW_SEC,
  max: MAGIC_LINK_SEND_MAX,
} as const;

export const MAGIC_LINK_EMAIL_IP_RULE = MAGIC_LINK_SEND_RULE;

export const MAGIC_LINK_EMAIL_GLOBAL_RULE = {
  window: MAGIC_LINK_EMAIL_GLOBAL_WINDOW_SEC,
  max: MAGIC_LINK_EMAIL_GLOBAL_MAX,
} as const;

export const MAGIC_LINK_VERIFY_RULE = {
  window: MAGIC_LINK_VERIFY_WINDOW_SEC,
  max: MAGIC_LINK_VERIFY_MAX,
} as const;

/** Paths Better Auth sees after stripping the origin (baseURL is origin-only). */
export const MAGIC_LINK_SEND_PATHS = [
  "/sign-in/magic-link",
  "/api/auth/sign-in/magic-link",
] as const;

export const MAGIC_LINK_VERIFY_PATHS = [
  "/magic-link/verify",
  "/api/auth/magic-link/verify",
] as const;

export type RateLimitRule = { window: number; max: number };

export type RateLimitDatabase = {
  connect(): Promise<{
    query(
      sql: string,
      parameters: readonly unknown[],
    ): Promise<{ rows: unknown[]; rowCount?: number }>;
    release(): void;
  }>;
};

export function emailIpMagicLinkRateLimitKey(email: string, ip: string): string {
  return `email-ip|/sign-in/magic-link|${email.trim().toLowerCase()}|${ip.trim()}`;
}

export function emailGlobalMagicLinkRateLimitKey(email: string): string {
  return `email|/sign-in/magic-link|${email.trim().toLowerCase()}`;
}

export function rateLimitDeniedResponse(retryAfter: number): Response {
  return new Response(JSON.stringify({ message: "Too many requests. Please try again later." }), {
    status: 429,
    statusText: "Too Many Requests",
    headers: {
      "Content-Type": "application/json",
      "X-Retry-After": String(Math.max(1, retryAfter)),
    },
  });
}

export function authRateLimitCustomRules(): Record<string, RateLimitRule> {
  const rules: Record<string, RateLimitRule> = {};
  for (const path of MAGIC_LINK_SEND_PATHS) rules[path] = MAGIC_LINK_SEND_RULE;
  for (const path of MAGIC_LINK_VERIFY_PATHS) rules[path] = MAGIC_LINK_VERIFY_RULE;
  return rules;
}

/**
 * One atomic consume against `rate_limit`. Used as Better Auth customStorage
 * (per IP + path) and for the extra email+IP / global-email magic-link buckets.
 */
export async function consumeRateLimitKey(
  db: RateLimitDatabase,
  key: string,
  rule: RateLimitRule,
): Promise<{ allowed: boolean; retryAfter: number | null }> {
  const now = Date.now();
  const windowMs = rule.window * 1000;
  const client = await db.connect();
  try {
    const result = await client.query(
      `INSERT INTO rate_limit (id, key, count, last_request)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE
           WHEN $3::bigint - rate_limit.last_request >= $4::bigint THEN 1
           WHEN rate_limit.count < $5 THEN rate_limit.count + 1
           ELSE rate_limit.count
         END,
         last_request = CASE
           WHEN $3::bigint - rate_limit.last_request >= $4::bigint THEN $3::bigint
           WHEN rate_limit.count < $5 THEN $3::bigint
           ELSE rate_limit.last_request
         END
       RETURNING count, last_request`,
      [crypto.randomUUID(), key, now, windowMs, rule.max],
    );
    const row = result.rows[0] as { count: number; last_request: string | number } | undefined;
    if (!row) throw new Error("rate_limit consume returned no row");
    const last = Number(row.last_request);
    if (last === now && Number(row.count) <= rule.max) {
      return { allowed: true, retryAfter: null };
    }
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((last + windowMs - now) / 1000)),
    };
  } finally {
    client.release();
  }
}

export function createDatabaseRateLimitStorage(db: RateLimitDatabase) {
  return {
    consume(key: string, rule: RateLimitRule) {
      return consumeRateLimitKey(db, key, rule);
    },
  };
}

/**
 * 3/min per email+IP, then a 20/hr global per-email cap. The global consume
 * runs only after the per-IP check so one IP cannot burn the hour bucket
 * without first passing its own 3/min, and a distributed flood cannot lock
 * the real user out of a fresh IP until 20/hr.
 */
export async function consumeEmailMagicLinkLimit(
  db: RateLimitDatabase,
  email: string,
  ip: string,
): Promise<{ allowed: boolean; retryAfter: number | null }> {
  const trimmed = email.trim().toLowerCase();
  const address = ip.trim();
  if (!trimmed || !address) return { allowed: true, retryAfter: null };
  const perIp = await consumeRateLimitKey(
    db,
    emailIpMagicLinkRateLimitKey(trimmed, address),
    MAGIC_LINK_EMAIL_IP_RULE,
  );
  if (!perIp.allowed) return perIp;
  return consumeRateLimitKey(db, emailGlobalMagicLinkRateLimitKey(trimmed), MAGIC_LINK_EMAIL_GLOBAL_RULE);
}
