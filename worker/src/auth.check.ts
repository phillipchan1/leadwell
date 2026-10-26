import {
  authIpAddressHeaders,
  existingUserForMagicLinkEmail,
  isAllowedEmail,
  PROD_AUTH_IP_HEADERS,
} from "./auth.ts";
import { clientConnection, poolSsl } from "./db.ts";
import { magicLinkEmail, resendIdempotencyKey } from "./mail.ts";
import { MAGIC_LINK_SEND_MAX, MAGIC_LINK_VERIFY_MAX } from "./rateLimit.ts";

const fails: string[] = [];
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) fails.push(msg);
}

ok(
  isAllowedEmail({ ALLOWED_EMAILS: "phil@example.com" }, "Phil@Example.com"),
  "allowlist is case-insensitive",
);
ok(
  !isAllowedEmail({ ALLOWED_EMAILS: "phil@example.com" }, "other@example.com"),
  "unknown email is rejected",
);
ok(!isAllowedEmail({ ALLOWED_EMAILS: "" }, "phil@example.com"), "empty allowlist admits nobody");
ok(!isAllowedEmail({ ALLOWED_EMAILS: "phil@example.com" }, ""), "blank email rejected");
ok(
  isAllowedEmail({ ALLOWED_EMAILS: "a@x.com, phil@example.com" }, "phil@example.com"),
  "comma-separated allowlist",
);

const philId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const migrated = [{ id: philId, email: "Phil@Example.com" }];
ok(
  existingUserForMagicLinkEmail(migrated, "phil@example.com")?.id === philId,
  "first magic-link sign-in lands on the migrated Supabase UUID",
);
ok(
  existingUserForMagicLinkEmail(migrated, "other@example.com") === null,
  "unknown email is not an existing user",
);
ok(
  existingUserForMagicLinkEmail([], "phil@example.com") === null,
  "empty user table would create, not adopt",
);

const mail = magicLinkEmail({ url: "https://polarch.day/api/auth/magic-link/verify?token=abc" });
ok(mail.subject.includes("LeadWell"), "magic-link subject is set");
ok(mail.text.includes("https://polarch.day/api/auth/magic-link/verify"), "magic-link body has url");

const token = "visible-token-should-not-appear";
const idem = await resendIdempotencyKey(token);
ok(idem.startsWith("ml/"), "Resend idempotency key is hashed");
ok(!idem.includes(token), "Resend idempotency key does not contain the token");
ok(MAGIC_LINK_SEND_MAX === 3, "magic-link send is 3 per window");
ok(MAGIC_LINK_VERIFY_MAX === 10, "magic-link verify is tightly capped");

ok(
  authIpAddressHeaders({}).join(",") === PROD_AUTH_IP_HEADERS.join(","),
  "prod IP limit reads only CF-Connecting-IP",
);
ok(!authIpAddressHeaders({}).includes("x-forwarded-for"), "prod ignores X-Forwarded-For");
ok(!authIpAddressHeaders({}).includes("x-real-ip"), "prod ignores X-Real-IP");
ok(
  authIpAddressHeaders({ ENVIRONMENT: "local" }).includes("x-forwarded-for"),
  "local still accepts XFF for wrangler/vite",
);

const neon = "postgresql://neondb@ep-prod.us-east-1.aws.neon.tech/leadwell?sslmode=disable";
const loopback = "postgresql://postgres@127.0.0.1:5432/leadwell";
const hyperdrive = "postgresql://u:p@abc.hyperdrive.local:5432/leadwell?sslmode=require";

ok(
  poolSsl(clientConnection({}, neon).ssl) === true,
  "Better Auth pool requires TLS for remote Neon even if sslmode is stripped",
);
ok(
  poolSsl(clientConnection({}, loopback).ssl) === false,
  "Better Auth pool TLS off for loopback",
);
ok(
  poolSsl(clientConnection({ HYPERDRIVE: { connectionString: hyperdrive } }, hyperdrive).ssl) ===
    false,
  "Better Auth pool TLS off for Hyperdrive",
);

if (fails.length) {
  console.error(`${fails.length}/${checks} failed`);
  for (const f of fails) console.error("  -", f);
  process.exit(1);
}
console.log(`auth.check: ${checks} ok`);
