import {
  ALLOWED_ANTHROPIC_TOOLS,
  assertNoClientKey,
  filterClientTools,
  filterToolChoice,
  sanitizeAnthropicBody,
} from "./anthropic.ts";
import type { Env } from "./env.ts";

const fails: string[] = [];
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) fails.push(msg);
}

const env: Env = { ANTHROPIC_MODEL: "claude-sonnet-4-20250514" };

const body = sanitizeAnthropicBody(
  { messages: [{ role: "user", content: "hi" }], stream: true },
  env,
);
ok(body.model === "claude-sonnet-4-20250514", "default model from env");
ok(body.max_tokens === 4096, "default max_tokens");
ok(body.stream === true, "stream passthrough");
ok(Array.isArray(body.messages), "messages kept");

const custom = sanitizeAnthropicBody(
  { messages: [{ role: "user", content: "x" }], model: "claude-sonnet-4-20250514", max_tokens: 99 },
  env,
);
ok(custom.model === "claude-sonnet-4-20250514", "allowlisted model honored");
ok(custom.max_tokens === 99, "client max_tokens honored when sane");

let unknownModel = false;
try {
  sanitizeAnthropicBody(
    { messages: [{ role: "user", content: "x" }], model: "claude-opus-secret" },
    env,
  );
} catch {
  unknownModel = true;
}
ok(unknownModel, "unknown model rejected");

const capped = sanitizeAnthropicBody(
  { messages: [{ role: "user", content: "x" }], max_tokens: 99_000 },
  env,
);
ok(capped.max_tokens === 8192, "max_tokens is capped");

let bad = false;
try {
  sanitizeAnthropicBody({ model: "x" }, env);
} catch {
  bad = true;
}
ok(bad, "missing messages rejected");

let notObj = false;
try {
  sanitizeAnthropicBody(null, env);
} catch {
  notObj = true;
}
ok(notObj, "non-object body rejected");

assertNoClientKey(new Headers({ "content-type": "application/json" }));
ok(true, "no client key is fine");

let keyed = false;
try {
  assertNoClientKey(new Headers({ "x-api-key": "sk-ant-secret" }));
} catch {
  keyed = true;
}
ok(keyed, "client x-api-key rejected");

let auth = false;
try {
  assertNoClientKey(new Headers({ authorization: "Bearer sk-ant-secret" }));
} catch {
  auth = true;
}
ok(auth, "client Authorization rejected");

ok(ALLOWED_ANTHROPIC_TOOLS.length === 0, "tool allowlist is empty by default");
const clientTools = [
  { name: "bash", input_schema: { type: "object" } },
  { name: "computer", input_schema: { type: "object" } },
];
const stripped = sanitizeAnthropicBody(
  {
    messages: [{ role: "user", content: "x" }],
    tools: clientTools,
    tool_choice: { type: "tool", name: "bash" },
  },
  env,
);
ok(stripped.tools === undefined, "client tools stripped when allowlist is empty");
ok(stripped.tool_choice === undefined, "tool_choice stripped when tools are stripped");
ok(filterClientTools(clientTools) === undefined, "filterClientTools default allowlist drops all");
ok(
  filterClientTools(clientTools, ["bash"])?.length === 1 &&
    (filterClientTools(clientTools, ["bash"])?.[0] as { name: string }).name === "bash",
  "explicit allowlist keeps only named tools",
);
ok(filterClientTools(clientTools, ["nope"]) === undefined, "unknown allowlist names keep nothing");
ok(
  filterToolChoice({ type: "tool", name: "bash" }, [{ name: "bash" }]) !== undefined,
  "tool_choice kept when it names an allowed tool",
);
ok(
  filterToolChoice({ type: "tool", name: "bash" }, [{ name: "other" }]) === undefined,
  "tool_choice stripped when it names a tool that was filtered out",
);
ok(filterToolChoice({ type: "auto" }, undefined) === undefined, "tool_choice stripped without tools");

if (fails.length) {
  console.error(`${fails.length}/${checks} failed`);
  for (const f of fails) console.error("  -", f);
  process.exit(1);
}
console.log(`anthropic.check: ${checks} ok`);
