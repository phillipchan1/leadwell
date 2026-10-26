/**
 * Better Auth rate limiting is off unless NODE_ENV=production. We turn it
 * on explicitly and store counts in Postgres so Workers isolates share them.
 */

export const MAGIC_LINK_SEND_WINDOW_SEC = 60;
export const MAGIC_LINK_SEND_MAX = 3;
export const MAGIC_LINK_EMAIL_PREFIX_WINDOW_SEC = 60 * 60;
export const MAGIC_LINK_EMAIL_PREFIX_MAX = 10;
export const MAGIC_LINK_EMAIL_SOFT_WINDOW_SEC = 60 * 60;
export const MAGIC_LINK_EMAIL_SOFT_MAX = 200;
export const MAGIC_LINK_VERIFY_WINDOW_SEC = 60;
export const MAGIC_LINK_VERIFY_MAX = 10;
export const AUTH_IP_PREFIX_INVALID = "invalid";

export const MAGIC_LINK_SEND_RULE = {
  window: MAGIC_LINK_SEND_WINDOW_SEC,
  max: MAGIC_LINK_SEND_MAX,
} as const;

export const MAGIC_LINK_EMAIL_IP_RULE = MAGIC_LINK_SEND_RULE;

export const MAGIC_LINK_EMAIL_PREFIX_RULE = {
  window: MAGIC_LINK_EMAIL_PREFIX_WINDOW_SEC,
  max: MAGIC_LINK_EMAIL_PREFIX_MAX,
} as const;

export const MAGIC_LINK_EMAIL_SOFT_RULE = {
  window: MAGIC_LINK_EMAIL_SOFT_WINDOW_SEC,
  max: MAGIC_LINK_EMAIL_SOFT_MAX,
} as const;

export const MAGIC_LINK_EMAIL_SOFT_LOG_RULE = {
  window: MAGIC_LINK_EMAIL_SOFT_WINDOW_SEC,
  max: 1,
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

export function emailIpPrefixMagicLinkRateLimitKey(email: string, prefix: string): string {
  return `email-prefix|/sign-in/magic-link|${email.trim().toLowerCase()}|${prefix}`;
}

export function emailSoftMagicLinkRateLimitKey(email: string): string {
  return `email-soft|/sign-in/magic-link|${email.trim().toLowerCase()}`;
}

export function emailSoftLogMagicLinkRateLimitKey(email: string): string {
  return `email-soft-log|/sign-in/magic-link|${email.trim().toLowerCase()}`;
}

function parseIpv4(value: string): [number, number, number, number] | null {
  const match = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return null;
  const octets = match.slice(1).map(Number) as [number, number, number, number];
  if (octets.some((n) => n > 255)) return null;
  return octets;
}

function parseIpv6Groups(side: string | undefined): string[] | null {
  if (!side) return [];
  const out: string[] = [];
  for (const part of side.split(":")) {
    if (part.includes(".")) {
      const v4 = parseIpv4(part);
      if (!v4) return null;
      out.push(((v4[0] << 8) | v4[1]).toString(16).padStart(4, "0"));
      out.push(((v4[2] << 8) | v4[3]).toString(16).padStart(4, "0"));
      continue;
    }
    if (!/^[0-9a-f]{1,4}$/i.test(part)) return null;
    out.push(part.toLowerCase().padStart(4, "0"));
  }
  return out;
}

/** IPv4 /24 or IPv6 /48. Unparseable strings share one `invalid` bucket. */
export function authIpPrefix(ip: string): string {
  const raw = ip.trim().toLowerCase();
  if (!raw) return AUTH_IP_PREFIX_INVALID;
  const unwrapped = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;
  const noZone = unwrapped.split("%")[0] ?? unwrapped;
  const v4 = parseIpv4(noZone);
  if (v4) return `${v4[0]}.${v4[1]}.${v4[2]}.0/24`;
  const mapped = noZone.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) {
    const inner = parseIpv4(mapped[1] ?? "");
    if (inner) return `${inner[0]}.${inner[1]}.${inner[2]}.0/24`;
  }
  if (!noZone.includes(":")) return AUTH_IP_PREFIX_INVALID;
  const halves = noZone.split("::");
  if (halves.length > 2) return AUTH_IP_PREFIX_INVALID;
  const left = parseIpv6Groups(halves[0]);
  const right = halves.length === 1 ? [] : parseIpv6Groups(halves[1]);
  if (!left || !right) return AUTH_IP_PREFIX_INVALID;
  const groups =
    halves.length === 1
      ? left
      : [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0000"), ...right];
  if (groups.length !== 8) return AUTH_IP_PREFIX_INVALID;
  return `${groups[0]}:${groups[1]}:${groups[2]}::/48`;
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
 * (per IP + path) and for the extra email+IP / email+prefix magic-link buckets.
 *
 * The window is fixed: `window_start` stays put until `now - window_start`
 * meets the window, then count resets. `last_request` is still written so
 * Better Auth's field map stays valid; it does not slide the window.
 */
export async function consumeRateLimitKey(
  db: RateLimitDatabase,
  key: string,
  rule: RateLimitRule,
  nowMs = Date.now(),
): Promise<{ allowed: boolean; retryAfter: number | null; count: number }> {
  const now = nowMs;
  const windowMs = rule.window * 1000;
  const client = await db.connect();
  try {
    const result = await client.query(
      `INSERT INTO rate_limit (id, key, count, last_request, window_start)
       VALUES ($1, $2, 1, $3, $3)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE
           WHEN $3::bigint - COALESCE(rate_limit.window_start, rate_limit.last_request) >= $4::bigint THEN 1
           ELSE rate_limit.count + 1
         END,
         last_request = $3::bigint,
         window_start = CASE
           WHEN $3::bigint - COALESCE(rate_limit.window_start, rate_limit.last_request) >= $4::bigint THEN $3::bigint
           ELSE COALESCE(rate_limit.window_start, rate_limit.last_request)
         END
       RETURNING count, window_start`,
      [crypto.randomUUID(), key, now, windowMs],
    );
    const row = result.rows[0] as
      | { count: number; window_start: string | number }
      | undefined;
    if (!row) throw new Error("rate_limit consume returned no row");
    const count = Number(row.count);
    const start = Number(row.window_start);
    if (count <= rule.max) {
      return { allowed: true, retryAfter: null, count };
    }
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((start + windowMs - now) / 1000)),
      count,
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
 * Hard limits: 3/min per email+IP, then 10/hr per email+IP-prefix (/24 or /48).
 * These buckets are not email-only. The silent 200/hr soft cap is — see
 * `consumeEmailMagicLinkSoftCap`.
 */
export async function consumeEmailMagicLinkLimit(
  db: RateLimitDatabase,
  email: string,
  ip: string,
): Promise<{ allowed: boolean; retryAfter: number | null }> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return { allowed: true, retryAfter: null };
  const address = ip.trim() || "unknown";
  const perIp = await consumeRateLimitKey(
    db,
    emailIpMagicLinkRateLimitKey(trimmed, address),
    MAGIC_LINK_EMAIL_IP_RULE,
  );
  if (!perIp.allowed) return perIp;
  return consumeRateLimitKey(
    db,
    emailIpPrefixMagicLinkRateLimitKey(trimmed, authIpPrefix(address)),
    MAGIC_LINK_EMAIL_PREFIX_RULE,
  );
}

/**
 * Silent 200/hr per-email soft cap. Capped and uncapped paths await the
 * same two consumes (soft key + first-skip log key) so timing stays
 * aligned. The console log itself is scheduled separately — do not do
 * more DB work on the waitUntil path, or `closeAuth` / `pool.end()` can
 * hang the skip task and drop the log.
 */
export async function consumeEmailMagicLinkSoftCap(
  db: RateLimitDatabase,
  email: string,
): Promise<{ allowed: boolean; firstSkip: boolean }> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return { allowed: true, firstSkip: false };
  const result = await consumeRateLimitKey(
    db,
    emailSoftMagicLinkRateLimitKey(trimmed),
    MAGIC_LINK_EMAIL_SOFT_RULE,
  );
  // Same second consume on both paths (timing parity). firstSkip is the
  // first request over the cap, not "log key allowed" — the log key is
  // incremented on every allowlisted send in the window.
  await recordEmailMagicLinkSoftCapSkip(db, trimmed);
  return {
    allowed: result.allowed,
    firstSkip: !result.allowed && result.count === MAGIC_LINK_EMAIL_SOFT_MAX + 1,
  };
}

/** First skip in the window returns true so the caller can log once. */
export async function recordEmailMagicLinkSoftCapSkip(
  db: RateLimitDatabase,
  email: string,
): Promise<boolean> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return false;
  const logged = await consumeRateLimitKey(
    db,
    emailSoftLogMagicLinkRateLimitKey(trimmed),
    MAGIC_LINK_EMAIL_SOFT_LOG_RULE,
  );
  return logged.allowed;
}
