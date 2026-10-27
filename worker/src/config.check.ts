/**
 * wrangler.jsonc guard. `keep_vars` only keeps dashboard vars that are NOT in
 * the config, so a config AUTH_EMAIL_FROM would overwrite prod's Resend
 * fallback sender on every deploy. polarch.day is not verified in Resend and
 * _dmarc.polarch.day is p=reject, so that would silently kill the fallback.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(here, "../../wrangler.jsonc"), "utf8");
// Strip // comments outside strings, then trailing commas.
const json = raw
  .split("\n")
  .map((line) => {
    let inStr = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && line[i - 1] !== "\\") inStr = !inStr;
      if (!inStr && c === "/" && line[i + 1] === "/") return line.slice(0, i);
    }
    return line;
  })
  .join("\n")
  .replace(/,(\s*[}\]])/g, "$1");
type Vars = Record<string, string>;
type Cfg = {
  keep_vars?: boolean;
  vars?: Vars;
  send_email?: { name: string; allowed_sender_addresses?: string[] }[];
  hyperdrive?: { binding: string; id: string }[];
  env?: Record<string, { vars?: Vars; send_email?: Cfg["send_email"] }>;
};
const cfg = JSON.parse(json) as Cfg;

let checks = 0;
const fails: string[] = [];
function ok(cond: unknown, msg: string) {
  checks++;
  if (!cond) fails.push(msg);
}

ok(cfg.keep_vars === true, "top-level keep_vars is true");
const blocks: [string, Vars | undefined][] = [["top-level", cfg.vars]];
for (const [name, e] of Object.entries(cfg.env ?? {})) blocks.push([`env.${name}`, e.vars]);
for (const [name, vars] of blocks) {
  // Absent, full stop: any config value would override the dashboard
  // Resend sender on every deploy (keep_vars does not protect config vars).
  ok(!Object.prototype.hasOwnProperty.call(vars ?? {}, "AUTH_EMAIL_FROM"), `${name} vars must not contain AUTH_EMAIL_FROM (dashboard-only)`);
  ok(!/RESEND_API_KEY|BETTER_AUTH_SECRET|OPENAI_API_KEY|DATABASE_URL/.test(Object.keys(vars ?? {}).join(",")), `${name} vars hold no secrets`);
}
const senders = [cfg.send_email, ...Object.values(cfg.env ?? {}).map((e) => e.send_email)];
for (const s of senders) {
  ok(s?.length === 1 && s[0].name === "EMAIL", "send_email EMAIL binding present");
  ok(JSON.stringify(s?.[0]?.allowed_sender_addresses) === '["login@polarch.day"]', "EMAIL sender locked to login@polarch.day");
}
ok(cfg.hyperdrive?.[0]?.id === "c18a2c83cf664a8d9fc9f40bcba47718", "prod Hyperdrive is leadwell-neon, not the placeholder");

if (fails.length) {
  console.error(`${fails.length}/${checks} failed`);
  for (const f of fails) console.error("  -", f);
  process.exit(1);
}
console.log(`config.check: ${checks} ok`);
