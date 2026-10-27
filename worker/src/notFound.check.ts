/**
 * Prove unknown /api/* and /functions/* paths return a JSON 404 with the API
 * security headers (not the SPA, not a 500), and known routes still win.
 */
import { app } from "./index.ts";
import { API_SECURITY } from "./cors.ts";

const fails: string[] = [];
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) fails.push(msg);
}

const env = {
  ASSETS: {
    fetch: async () =>
      new Response("<!doctype html><title>spa</title>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
  },
} as never;
const ctx = { waitUntil() {}, passThroughOnException() {} } as never;

for (const [method, path] of [
  ["GET", "/api/version"],
  ["GET", "/api/foo"],
  ["POST", "/api/foo/bar"],
  ["GET", "/functions/v1/foo"],
  ["DELETE", "/functions/v1/openai"],
  ["POST", "/api/health"],
] as const) {
  const res = await app.request(path, { method }, env, ctx);
  ok(res.status === 404, `${method} ${path} is 404 (got ${res.status})`);
  ok((res.headers.get("content-type") ?? "").includes("application/json"), `${method} ${path} is JSON`);
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  ok(body?.error === "not found", `${method} ${path} body is {error:"not found"}`);
  for (const [k, v] of Object.entries(API_SECURITY)) {
    ok(res.headers.get(k) === v, `${method} ${path} has ${k}`);
  }
}

const health = await app.request("/api/health", { method: "GET" }, env, ctx);
ok(health.status === 200, "GET /api/health still 200");
const spa = await app.request("/some/page", { method: "GET" }, env, ctx);
ok(spa.status === 200 && (spa.headers.get("content-type") ?? "").includes("text/html"), "non-API path still serves the SPA");

if (fails.length) {
  console.error(`notFound.check: ${fails.length}/${checks} failed`);
  for (const f of fails) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`notFound.check: ${checks} checks ok`);
