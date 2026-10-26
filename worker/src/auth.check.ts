import {
  existingUserForMagicLinkEmail,
  isAllowedEmail,
} from "./auth.ts";
import { clientConnection, poolSsl } from "./db.ts";
import { magicLinkEmail } from "./mail.ts";

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
