import type { Env } from "./env.ts";

const RESEND_URL = "https://api.resend.com/emails";

/** Both allowlisted send and silent skip wait at least this long. */
export const MAGIC_LINK_SEND_FLOOR_MS = 200;

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

export async function settleMagicLinkSend(
  startedAt: number,
  floorMs: number = MAGIC_LINK_SEND_FLOOR_MS,
): Promise<void> {
  const wait = floorMs - (Date.now() - startedAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
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
    throw new Error("RESEND_API_KEY and AUTH_EMAIL_FROM must be set");
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
    throw new Error("failed to send sign-in email");
  }
}
