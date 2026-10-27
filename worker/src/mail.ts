import type { Env } from "./env.ts";

const RESEND_URL = "https://api.resend.com/emails";

export function authEmailFrom(env: Pick<Env, "AUTH_EMAIL_FROM">): string {
  return env.AUTH_EMAIL_FROM?.trim() || "";
}

export function magicLinkEmail(opts: { url: string }): { subject: string; text: string; html: string } {
  const subject = "Your Polarch sign-in link";
  const text = `Sign in to Polarch:\n${opts.url}\n\nThis link expires in a few minutes. If you did not ask for it, ignore this email.`;
  const html = `<p>Sign in to Polarch:</p><p><a href="${opts.url}">Open Polarch</a></p><p>This link expires in a few minutes. If you did not ask for it, ignore this email.</p>`;
  return { subject, text, html };
}

/** SHA-256 hex of the token — never put the raw token in Resend headers. */
export async function resendIdempotencyKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `ml/${hex}`;
}

export type MagicLinkSendFailure = {
  kind: "missing_env" | "resend_http" | "cf_email" | "unknown";
  status?: number;
};

export class MagicLinkSendError extends Error {
  readonly kind: Exclude<MagicLinkSendFailure["kind"], "unknown">;
  readonly status?: number;
  constructor(kind: MagicLinkSendError["kind"], status?: number) {
    super("magic-link send failed");
    this.name = "MagicLinkSendError";
    this.kind = kind;
    this.status = status;
  }
}

export function describeMagicLinkSendFailure(err: unknown): MagicLinkSendFailure {
  if (err instanceof MagicLinkSendError) {
    return err.status == null ? { kind: err.kind } : { kind: err.kind, status: err.status };
  }
  return { kind: "unknown" };
}

/** Token-free, email-free. Logs kind and optional HTTP status only. */
export function logMagicLinkSendFailure(
  err: unknown,
  log: (message: string, detail: MagicLinkSendFailure) => void = console.error,
): void {
  log("magic-link send failed", describeMagicLinkSendFailure(err));
}

export type MagicLinkSoftCapSkip = { kind: "soft_cap" };

/** Token-free, email-free. Call only on the first skip in the window. */
export function logMagicLinkSoftCapSkip(
  log: (message: string, detail: MagicLinkSoftCapSkip) => void = console.error,
): void {
  log("magic-link send skipped", { kind: "soft_cap" });
}

const DEFAULT_CF_EMAIL_FROM = "Polarch <login@polarch.day>";

/** Parse `Name <addr>` or `addr` into the Email Service builder shape. */
export function parseFrom(raw: string): string | { email: string; name: string } {
  const m = raw.trim().match(/^(.*)<\s*([^<>\s]+@[^<>\s]+)\s*>$/);
  if (m) {
    const name = m[1].trim().replace(/^"|"$/g, "");
    return name ? { email: m[2], name } : m[2];
  }
  return raw.trim();
}

export function cfEmailFrom(env: Pick<Env, "CF_EMAIL_FROM">): string {
  return env.CF_EMAIL_FROM?.trim() || DEFAULT_CF_EMAIL_FROM;
}

/** Cloudflare Email Service via the `send_email` binding (from login@polarch.day). */
async function sendViaCloudflare(
  binding: SendEmail,
  env: Env,
  to: string,
  body: { subject: string; text: string; html: string },
): Promise<void> {
  try {
    await binding.send({ from: parseFrom(cfEmailFrom(env)), to, subject: body.subject, html: body.html, text: body.text });
  } catch {
    // Never surface the binding error text: it can echo the recipient.
    throw new MagicLinkSendError("cf_email");
  }
}

/** Resend fallback (AUTH_EMAIL_FROM, e.g. `Polarch <login@usedayspring.app>`). */
async function sendViaResend(
  env: Env,
  to: string,
  token: string,
  body: { subject: string; text: string; html: string },
): Promise<void> {
  const key = env.RESEND_API_KEY?.trim();
  const from = authEmailFrom(env);
  if (!key || !from) {
    throw new MagicLinkSendError("missing_env");
  }
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "Idempotency-Key": await resendIdempotencyKey(token),
    },
    body: JSON.stringify({ from, to: [to], subject: body.subject, html: body.html, text: body.text }),
  });
  if (!res.ok) {
    throw new MagicLinkSendError("resend_http", res.status);
  }
}

/**
 * Send a magic-link email. Primary: Cloudflare Email Service (`EMAIL`
 * binding, from CF_EMAIL_FROM / login@polarch.day). If the binding is absent
 * or throws, fall back to Resend (AUTH_EMAIL_FROM). Fail closed if neither works.
 */
export async function sendMagicLinkEmail(
  env: Env,
  opts: { email: string; url: string; token: string },
  log: (message: string, detail: MagicLinkSendFailure) => void = console.error,
): Promise<"cloudflare" | "resend"> {
  const to = opts.email.trim().toLowerCase();
  const body = magicLinkEmail({ url: opts.url });
  if (env.EMAIL) {
    try {
      await sendViaCloudflare(env.EMAIL, env, to, body);
      return "cloudflare";
    } catch (err) {
      log("magic-link cloudflare send failed, falling back to resend", describeMagicLinkSendFailure(err));
    }
  }
  await sendViaResend(env, to, opts.token, body);
  return "resend";
}
