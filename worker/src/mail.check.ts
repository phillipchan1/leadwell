import { parseFrom, sendMagicLinkEmail } from "./mail.ts";
import type { Env } from "./env.ts";

let checks = 0;
const fails: string[] = [];
function ok(cond: unknown, msg: string) {
  checks++;
  if (!cond) fails.push(msg);
}

const resendBodies: { from: string; to: string[] }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("api.resend.com")) {
    resendBodies.push(JSON.parse(String(init?.body ?? "{}")));
    return new Response("{}", { status: 200 });
  }
  return realFetch(input as never, init);
}) as typeof fetch;

type Sent = { from: unknown; to: unknown; subject: string; text?: string; html?: string };
function binding(fail = false) {
  const sent: Sent[] = [];
  return {
    sent,
    EMAIL: {
      async send(m: Sent) {
        if (fail) throw new Error("boom to phil@example.com");
        sent.push(m);
        return { messageId: "m1" };
      },
    } as unknown as SendEmail,
  };
}
const base: Env = { RESEND_API_KEY: "re_test", AUTH_EMAIL_FROM: "Polarch <login@usedayspring.app>" };
const opts = { email: " Phil@Example.com ", url: "https://polarch.day/x?token=visible", token: "visible" };

ok(JSON.stringify(parseFrom("Polarch <login@polarch.day>")) === '{"email":"login@polarch.day","name":"Polarch"}', "parseFrom name+addr");
ok(parseFrom("login@polarch.day") === "login@polarch.day", "parseFrom bare addr");

try {
  // 1. Binding present: Cloudflare is used, Resend is not.
  const b = binding();
  const via = await sendMagicLinkEmail({ ...base, EMAIL: b.EMAIL }, opts, () => {});
  ok(via === "cloudflare", "binding path returns cloudflare");
  ok(b.sent.length === 1 && resendBodies.length === 0, "one CF send, zero Resend sends");
  const m = b.sent[0];
  ok(JSON.stringify(m?.from) === '{"email":"login@polarch.day","name":"Polarch"}', "default from is Polarch <login@polarch.day>");
  ok(m?.to === "phil@example.com", "recipient normalized");
  ok(m?.subject === "Your Polarch sign-in link", "subject unchanged");
  ok(Boolean(m?.text?.includes(opts.url)) && Boolean(m?.html?.includes(opts.url)), "link in text and html");

  // 2. Binding throws: falls back to Resend from AUTH_EMAIL_FROM; log is email/token free.
  const logs: unknown[][] = [];
  const f = binding(true);
  const via2 = await sendMagicLinkEmail({ ...base, EMAIL: f.EMAIL }, opts, (...a) => logs.push(a));
  ok(via2 === "resend", "binding error falls back to resend");
  ok(resendBodies.length === 1 && resendBodies[0].from === "Polarch <login@usedayspring.app>", "fallback uses AUTH_EMAIL_FROM");
  const blob = JSON.stringify(logs);
  ok(blob.includes("cf_email"), "fallback logs kind cf_email");
  ok(!blob.includes("phil@") && !blob.includes("visible"), "fallback log has no email or token");

  // 3. No binding: Resend only (old behaviour / rollback path).
  resendBodies.length = 0;
  const via3 = await sendMagicLinkEmail(base, opts, () => {});
  ok(via3 === "resend" && resendBodies.length === 1, "no binding uses resend");

  // 4. Binding fails and Resend unconfigured: fail closed.
  let threw = false;
  try {
    await sendMagicLinkEmail({ EMAIL: binding(true).EMAIL }, opts, () => {});
  } catch {
    threw = true;
  }
  ok(threw, "both senders unavailable throws");
} finally {
  globalThis.fetch = realFetch;
}

if (fails.length) {
  console.error(`${fails.length}/${checks} failed`);
  for (const f of fails) console.error("  -", f);
  process.exit(1);
}
console.log(`mail.check: ${checks} ok`);
