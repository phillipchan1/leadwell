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

/**
 * Send a magic-link email through Resend. Fail closed: allowlist, key, and
 * from-address must all be set. Uses fetch (no Resend SDK).
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
      "Idempotency-Key": `magic-link/${opts.token}`,
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
