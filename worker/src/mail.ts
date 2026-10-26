import type { Env } from "./env.ts";

const RESEND_URL = "https://api.resend.com/emails";

export function authEmailFrom(env: Pick<Env, "AUTH_EMAIL_FROM">): string {
  return env.AUTH_EMAIL_FROM?.trim() || "";
}

export function magicLinkEmail(opts: { url: string }): { subject: string; text: string; html: string } {
  const subject = "Your LeadWell sign-in link";
  const text = `Sign in to LeadWell:\n${opts.url}\n\nThis link expires in a few minutes. If you did not ask for it, ignore this email.`;
  const html = `<p>Sign in to LeadWell:</p><p><a href="${opts.url}">Open LeadWell</a></p><p>This link expires in a few minutes. If you did not ask for it, ignore this email.</p>`;
  return { subject, text, html };
}

/** SHA-256 hex of the token — never put the raw token in Resend headers. */
export async function resendIdempotencyKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `ml/${hex}`;
}

export type MagicLinkSendFailure = {
  kind: "missing_env" | "resend_http" | "unknown";
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

/**
 * Send a magic-link email through Resend. Fail closed: key and from-address
 * must be set. Uses fetch (no Resend SDK).
 */
export async function sendMagicLinkEmail(
  env: Env,
  opts: { email: string; url: string; token: string },
): Promise<void> {
  const key = env.RESEND_API_KEY?.trim();
  const from = authEmailFrom(env);
  if (!key || !from) {
    throw new MagicLinkSendError("missing_env");
  }
  const body = magicLinkEmail({ url: opts.url });
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "Idempotency-Key": await resendIdempotencyKey(opts.token),
    },
    body: JSON.stringify({
      from,
      to: [opts.email.trim().toLowerCase()],
      subject: body.subject,
      html: body.html,
      text: body.text,
    }),
  });
  if (!res.ok) {
    throw new MagicLinkSendError("resend_http", res.status);
  }
}
