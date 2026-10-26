import {
  ACCOUNT_LINKING,
  isAllowedEmail,
  socialEmailMayLinkToExistingUser,
} from "./auth.ts";
import { clientConnection, poolSsl } from "./db.ts";

const fails: string[] = [];
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) fails.push(msg);
}

ok(!("trustedProviders" in ACCOUNT_LINKING), "google is not a trusted provider");
ok(ACCOUNT_LINKING.disableImplicitLinking === true, "implicit email linking is off");
ok(
  ACCOUNT_LINKING.enabled === true && ACCOUNT_LINKING.disableImplicitLinking === true,
  "Phil signs in via the migrated Google account row (sub), not email adoption",
);

ok(
  !socialEmailMayLinkToExistingUser({
    trustedProviders: [],
    providerId: "google",
    emailVerified: false,
  }),
  "unverified Google email cannot link to an existing user",
);
ok(
  socialEmailMayLinkToExistingUser({
    trustedProviders: [],
    providerId: "google",
    emailVerified: true,
  }),
  "verified Google email may link when implicit linking is otherwise allowed",
);
ok(
  socialEmailMayLinkToExistingUser({
    trustedProviders: ["google"],
    providerId: "google",
    emailVerified: false,
  }),
  "trustedProviders would have allowed the unverified link — we do not set that",
);

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
