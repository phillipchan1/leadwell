import { databaseUrl } from "./env.ts";
import {
  clientConnection,
  clientSsl,
  isHyperdriveHostname,
  poolSsl,
  postgresSsl,
  stripSslMode,
  usesHyperdrive,
} from "./db.ts";
import { authConfigErrorResponse, beginAuthCors } from "./cors.ts";
import {
  authCookieSecure,
  canonicalizeHostname,
  connectionHostname,
  isLocalAuthHost,
  isLocalAuthRuntime,
  isLoopbackHostname,
  isPublicSuffix,
  isSharedPlatformHost,
  parseTrustedOrigins,
  resolveAuthBaseURL,
  resolveAuthCookieDomain,
  resolveTrustedOrigins,
} from "./authUrl.ts";

const fails: string[] = [];
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) fails.push(msg);
}

const neon = "postgresql://neondb@ep-prod.us-east-1.aws.neon.tech/leadwell";
const prodWithLocalUser = "postgresql://localhost_admin@ep-prod.neon.tech/leadwell";
const prodWithLocalDb = "postgresql://app@ep-prod.neon.tech/localhost";
const prodWithLocalQuery =
  "postgresql://app@ep-prod.neon.tech/leadwell?application_name=localhost&sslmode=require";
const loopbackPg = "postgresql://postgres@localhost:5432/leadwell";
const loopbackV4 = "postgresql://postgres@127.0.0.1:5432/leadwell";
const loopbackV6 = "postgresql://postgres:postgres@[::1]:5432/leadwell";
const leadingZeroHost = "postgresql://u@0127.0.0.1:5432/leadwell";
const hyperdrive = "postgresql://u:p@abc.hyperdrive.local:5432/leadwell?sslmode=require";

ok(isLoopbackHostname("::1"), "::1 hostname is loopback");
ok(isLoopbackHostname("[::1]"), "[::1] hostname is loopback");
ok(isLocalAuthHost("http://[::1]:8787"), "[::1] auth origin is local");
ok(!authCookieSecure("http://[::1]:8787"), "[::1] cookies are not Secure");
ok(!isLocalAuthRuntime({}), "[::1] DB hostname is not a local runtime without ENVIRONMENT");
ok(
  connectionHostname(loopbackV6) === "[::1]" || connectionHostname(loopbackV6) === "::1",
  "[::1] postgres hostname parses",
);

ok(isLocalAuthHost("http://localhost:8787"), "localhost is local");
ok(isLocalAuthHost("http://127.0.0.1:5173"), "127.0.0.1 is local");
ok(isLoopbackHostname("127.1"), "127.1 hostname is loopback");
ok(canonicalizeHostname("127.1") === "127.0.0.1", "127.1 canonicalizes to 127.0.0.1");
ok(canonicalizeHostname("0127.0.0.1") === "87.0.0.1", "0127.0.0.1 canonicalizes off loopback");
ok(canonicalizeHostname("127") === "0.0.0.127", "bare 127 canonicalizes to 0.0.0.127");
ok(!isLoopbackHostname("0127.0.0.1"), "leading-zero IPv4 is not loopback");
ok(!isLoopbackHostname("127"), "bare 127 is not loopback");
ok(connectionHostname(leadingZeroHost) === "0127.0.0.1", "postgres:// keeps unnormalized 0127 host");
ok(
  !isLoopbackHostname(connectionHostname(leadingZeroHost) ?? ""),
  "unnormalized 0127 postgres host is not loopback",
);
ok(!isLocalAuthHost("https://leadwell.example.workers.dev"), "workers.dev is not local");
ok(!authCookieSecure("http://localhost:8787"), "localhost cookies are not Secure");
ok(authCookieSecure("https://leadwell.example.workers.dev"), "prod cookies are Secure");

ok(!isLocalAuthRuntime({}), "empty env is not local");
ok(!isLocalAuthRuntime({ ENVIRONMENT: "dev" }), "ENVIRONMENT=dev is not local");
ok(isLocalAuthRuntime({ ENVIRONMENT: "local" }), "ENVIRONMENT=local is local");
ok(isLocalAuthRuntime({ ENVIRONMENT: "LOCAL" }), "ENVIRONMENT=LOCAL is local");
ok(connectionHostname(prodWithLocalUser) === "ep-prod.neon.tech", "parses host not user");
ok(connectionHostname(prodWithLocalDb) === "ep-prod.neon.tech", "parses host not db name");
ok(connectionHostname(prodWithLocalQuery) === "ep-prod.neon.tech", "parses host not query");

ok(
  resolveAuthBaseURL({ BETTER_AUTH_URL: "https://leadwell.example.workers.dev/" }) ===
    "https://leadwell.example.workers.dev",
  "configured URL wins and strips trailing slash",
);
ok(
  resolveAuthBaseURL({ ENVIRONMENT: "local" }) === "http://localhost:8787",
  "ENVIRONMENT=local falls back to localhost",
);
let threw = false;
try {
  resolveAuthBaseURL({});
} catch {
  threw = true;
}
ok(threw, "unset BETTER_AUTH_URL without ENVIRONMENT=local throws");
ok(
  resolveAuthBaseURL({ BETTER_AUTH_URL: "https://polarch.day/" }) === "https://polarch.day",
  "BETTER_AUTH_URL can be the public custom domain",
);
ok(
  resolveAuthBaseURL({ BETTER_AUTH_URL: "http://127.0.0.1:8787" }) === "http://127.0.0.1:8787",
  "loopback BETTER_AUTH_URL may be http",
);
let noScheme = false;
try {
  resolveAuthBaseURL({ BETTER_AUTH_URL: "polarch.day" });
} catch {
  noScheme = true;
}
ok(noScheme, "BETTER_AUTH_URL without a scheme is refused");
let httpRemote = false;
try {
  resolveAuthBaseURL({ BETTER_AUTH_URL: "http://polarch.day" });
} catch {
  httpRemote = true;
}
ok(httpRemote, "non-loopback BETTER_AUTH_URL must be https");
let starBase = false;
try {
  resolveAuthBaseURL({ BETTER_AUTH_URL: "https://*" });
} catch {
  starBase = true;
}
ok(starBase, "BETTER_AUTH_URL wildcard host is refused");

ok(
  parseTrustedOrigins("https://polarch.day, https://www.polarch.day/").join(",") ===
    "https://polarch.day,https://www.polarch.day",
  "TRUSTED_ORIGINS parses comma list to origins",
);
let badOrigin = false;
try {
  parseTrustedOrigins("polarch.day");
} catch {
  badOrigin = true;
}
ok(badOrigin, "TRUSTED_ORIGINS rejects a bare host");
let starOrigin = false;
try {
  parseTrustedOrigins("https://*");
} catch {
  starOrigin = true;
}
ok(starOrigin, "TRUSTED_ORIGINS rejects https://*");
let starSub = false;
try {
  parseTrustedOrigins("https://*.polarch.day");
} catch {
  starSub = true;
}
ok(starSub, "TRUSTED_ORIGINS rejects https://*.polarch.day");
let encodedStar = false;
try {
  parseTrustedOrigins("https://%2a.polarch.day");
} catch {
  encodedStar = true;
}
ok(encodedStar, "TRUSTED_ORIGINS rejects percent-encoded wildcard host");

const custom = resolveTrustedOrigins({
  BETTER_AUTH_URL: "https://polarch.day",
  TRUSTED_ORIGINS: "https://www.polarch.day, https://leadwell.example.workers.dev",
});
ok(custom.includes("https://polarch.day"), "trusted origins always include BETTER_AUTH_URL");
ok(custom.includes("https://www.polarch.day"), "trusted origins include TRUSTED_ORIGINS extras");
ok(!custom.includes("http://localhost:5173"), "prod custom domain does not auto-trust localhost");

const localOrigins = resolveTrustedOrigins({ ENVIRONMENT: "local" });
ok(localOrigins.includes("http://localhost:8787"), "local runtime trusts wrangler");
ok(localOrigins.includes("http://localhost:5173"), "local runtime trusts Vite");

ok(
  resolveAuthCookieDomain({
    BETTER_AUTH_URL: "https://polarch.day",
    AUTH_COOKIE_DOMAIN: "polarch.day",
  }) === "polarch.day",
  "cookie domain matches the custom-domain host",
);
ok(
  resolveAuthCookieDomain({
    BETTER_AUTH_URL: "https://www.polarch.day",
    AUTH_COOKIE_DOMAIN: ".polarch.day",
  }) === "polarch.day",
  "cookie domain leading dot is stripped; suffix of www is allowed",
);
ok(
  resolveAuthCookieDomain({
    BETTER_AUTH_URL: "https://polarch.day",
  }) === undefined,
  "unset cookie domain is host-only",
);
ok(
  resolveAuthCookieDomain({
    ENVIRONMENT: "local",
    AUTH_COOKIE_DOMAIN: "polarch.day",
  }) === undefined,
  "cookie domain is ignored on loopback so local sign-in still works",
);
let badDomain = false;
try {
  resolveAuthCookieDomain({
    BETTER_AUTH_URL: "https://leadwell.example.workers.dev",
    AUTH_COOKIE_DOMAIN: "polarch.day",
  });
} catch {
  badDomain = true;
}
ok(badDomain, "cookie domain that is not a suffix of BETTER_AUTH_URL is refused");
let tld = false;
try {
  resolveAuthCookieDomain({
    BETTER_AUTH_URL: "https://polarch.day",
    AUTH_COOKIE_DOMAIN: "day",
  });
} catch {
  tld = true;
}
ok(tld, "single-label cookie domain is refused");
ok(isPublicSuffix("co.uk"), "co.uk is a public suffix");
ok(isPublicSuffix("workers.dev"), "workers.dev is a public suffix");
ok(!isPublicSuffix("polarch.day"), "polarch.day is not a public suffix");
ok(isSharedPlatformHost("leadwell.example.workers.dev"), "workers.dev host is shared platform");
ok(isSharedPlatformHost("app.pages.dev"), "pages.dev host is shared platform");
ok(!isSharedPlatformHost("polarch.day"), "custom domain is not a shared platform");
let workersCookie = false;
try {
  resolveAuthCookieDomain({
    BETTER_AUTH_URL: "https://leadwell.example.workers.dev",
    AUTH_COOKIE_DOMAIN: "workers.dev",
  });
} catch {
  workersCookie = true;
}
ok(workersCookie, "cookie domain workers.dev is refused");
let pagesCookie = false;
try {
  resolveAuthCookieDomain({
    BETTER_AUTH_URL: "https://app.pages.dev",
    AUTH_COOKIE_DOMAIN: "pages.dev",
  });
} catch {
  pagesCookie = true;
}
ok(pagesCookie, "cookie domain pages.dev is refused");
let workersEqual = false;
try {
  resolveAuthCookieDomain({
    BETTER_AUTH_URL: "https://leadwell.example.workers.dev",
    AUTH_COOKIE_DOMAIN: "leadwell.example.workers.dev",
  });
} catch {
  workersEqual = true;
}
ok(workersEqual, "cookie domain on a workers.dev host is refused even when equal");
let publicSuffixCookie = false;
try {
  resolveAuthCookieDomain({
    BETTER_AUTH_URL: "https://app.example.co.uk",
    AUTH_COOKIE_DOMAIN: "co.uk",
  });
} catch {
  publicSuffixCookie = true;
}
ok(publicSuffixCookie, "cookie domain that is a public suffix is refused");

ok(postgresSsl(neon) === "require", "remote Neon requires TLS");
ok(postgresSsl(`${neon}?sslmode=disable`) === "require", "remote sslmode=disable still TLS");
ok(postgresSsl(loopbackPg) === false, "loopback defaults to no TLS");
ok(postgresSsl(`${loopbackV4}?sslmode=require`) === "require", "loopback can opt into TLS");
ok(postgresSsl(hyperdrive) === false, "Hyperdrive hostname is never client TLS");
ok(isHyperdriveHostname("abc.hyperdrive.local"), "hyperdrive.local suffix");
ok(!isHyperdriveHostname("not-hyperdrive.local"), "unrelated .local is not Hyperdrive");

ok(usesHyperdrive({ HYPERDRIVE: { connectionString: hyperdrive } }), "bound Hyperdrive is used");
ok(
  !usesHyperdrive({
    HYPERDRIVE: { connectionString: "postgresql://u@x/db?options=00000000000000000000000000000000" },
  }),
  "placeholder Hyperdrive id is not used",
);
ok(clientSsl({ HYPERDRIVE: { connectionString: hyperdrive } }, hyperdrive) === false, "bound HD ssl off");
ok(stripSslMode(hyperdrive).includes("sslmode") === false, "sslmode stripped");
ok(
  clientConnection({ HYPERDRIVE: { connectionString: hyperdrive } }, hyperdrive).ssl === false,
  "clientConnection Hyperdrive ssl false",
);
ok(poolSsl("require") === true, "poolSsl require is TLS on");
ok(poolSsl(false) === false, "poolSsl false is TLS off");
ok(
  poolSsl(clientConnection({}, `${neon}?sslmode=disable`).ssl) === true,
  "auth pool still TLS after sslmode stripped from remote URL",
);

ok(
  databaseUrl({
    HYPERDRIVE: { connectionString: hyperdrive },
    DATABASE_URL: neon,
  }) === hyperdrive,
  "Hyperdrive binding wins over DATABASE_URL",
);
ok(
  databaseUrl({
    HYPERDRIVE: { connectionString: `postgresql://u@x/${"0".repeat(32)}` },
    DATABASE_URL: neon,
  }) === neon,
  "placeholder Hyperdrive falls back to DATABASE_URL",
);

const cors = beginAuthCors("http://localhost:5173", {
  ENVIRONMENT: "local",
  BETTER_AUTH_SECRET: "x",
});
ok(cors.ok === true, "local origin CORS starts");
if (cors.ok) {
  ok(cors.cors["Access-Control-Allow-Origin"] === "http://localhost:5173", "echoes allowlisted origin");
  ok(cors.cors["Access-Control-Allow-Credentials"] === "true", "credentialed CORS");
  ok(cors.cors["Access-Control-Allow-Origin"] !== "*", "never * + credentials");
}

const customCors = beginAuthCors("https://www.polarch.day", {
  BETTER_AUTH_URL: "https://polarch.day",
  TRUSTED_ORIGINS: "https://www.polarch.day",
  BETTER_AUTH_SECRET: "x",
});
ok(customCors.ok === true, "custom-domain extra origin CORS starts");
if (customCors.ok) {
  ok(
    customCors.cors["Access-Control-Allow-Origin"] === "https://www.polarch.day",
    "echoes TRUSTED_ORIGINS custom domain",
  );
}

const cfgErr = authConfigErrorResponse("https://evil.example", new Error("BETTER_AUTH_URL must be set"));
ok(cfgErr.status === 500, "auth config error is 500");
ok(!(cfgErr.headers.get("Access-Control-Allow-Origin") === "https://evil.example"), "non-local origin not echoed on config error");

if (fails.length) {
  console.error(`${fails.length}/${checks} failed`);
  for (const f of fails) console.error("  -", f);
  process.exit(1);
}
console.log(`authUrl.check: ${checks} ok`);
