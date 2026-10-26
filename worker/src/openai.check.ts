import {
  ALLOWED_OPENAI_TOOLS,
  assertNoClientKey,
  filterClientTools,
  filterToolChoice,
  sanitizeOpenAIBody,
} from "./openai.ts";
import type { Env } from "./env.ts";

const fails: string[] = [];
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) fails.push(msg);
}

const env: Env = { OPENAI_MODEL: "gpt-5-mini" };

const body = sanitizeOpenAIBody(
  { messages: [{ role: "user", content: "hi" }], stream: true },
  env,
);
ok(body.model === "gpt-5-mini", "default model from env");
ok(body.max_completion_tokens === 4096, "default max_completion_tokens");
ok(body.stream === true, "stream passthrough");
ok(Array.isArray(body.messages), "messages kept");

const custom = sanitizeOpenAIBody(
  { messages: [{ role: "user", content: "x" }], model: "gpt-5", max_tokens: 99 },
  env,
);
ok(custom.model === "gpt-5", "stronger allowlisted model honored");
ok(custom.max_completion_tokens === 99, "client max_tokens mapped and honored when sane");

const fromCompletion = sanitizeOpenAIBody(
  { messages: [{ role: "user", content: "x" }], max_completion_tokens: 128 },
  env,
);
ok(fromCompletion.max_completion_tokens === 128, "max_completion_tokens honored");

let unknownModel = false;
try {
  sanitizeOpenAIBody({ messages: [{ role: "user", content: "x" }], model: "gpt-secret" }, env);
} catch {
  unknownModel = true;
}
ok(unknownModel, "unknown model rejected");

const capped = sanitizeOpenAIBody(
  { messages: [{ role: "user", content: "x" }], max_tokens: 99_000 },
  env,
);
ok(capped.max_completion_tokens === 8192, "tokens are capped");

const withSystem = sanitizeOpenAIBody(
  { messages: [{ role: "user", content: "x" }], system: "be brief" },
  env,
);
ok(
  (withSystem.messages[0] as { role: string; content: string }).role === "system",
  "top-level system becomes a system message",
);

let bad = false;
try {
  sanitizeOpenAIBody({ model: "gpt-5-mini" }, env);
} catch {
  bad = true;
}
ok(bad, "missing messages rejected");

let notObj = false;
try {
  sanitizeOpenAIBody(null, env);
} catch {
  notObj = true;
}
ok(notObj, "non-object body rejected");

assertNoClientKey(new Headers({ "content-type": "application/json" }));
ok(true, "no client key is fine");

let keyed = false;
try {
  assertNoClientKey(new Headers({ "x-api-key": "sk-secret" }));
} catch {
  keyed = true;
}
ok(keyed, "client x-api-key rejected");

let auth = false;
try {
  assertNoClientKey(new Headers({ authorization: "Bearer sk-secret" }));
} catch {
  auth = true;
}
ok(auth, "client Authorization rejected");

ok(ALLOWED_OPENAI_TOOLS.length === 0, "tool allowlist is empty by default");
const clientTools = [
  { type: "function", function: { name: "bash" } },
  { type: "function", function: { name: "computer" } },
];
const stripped = sanitizeOpenAIBody(
  {
    messages: [{ role: "user", content: "x" }],
    tools: clientTools,
    tool_choice: { type: "function", function: { name: "bash" } },
  },
  env,
);
ok(stripped.tools === undefined, "client tools stripped when allowlist is empty");
ok(stripped.tool_choice === undefined, "tool_choice stripped when tools are stripped");
ok(filterClientTools(clientTools) === undefined, "filterClientTools default allowlist drops all");
ok(
  filterClientTools(clientTools, ["bash"])?.length === 1,
  "explicit allowlist keeps only named tools",
);
ok(filterClientTools(clientTools, ["nope"]) === undefined, "unknown allowlist names keep nothing");
ok(
  filterToolChoice({ type: "function", function: { name: "bash" } }, [
    { type: "function", function: { name: "bash" } },
  ]) !== undefined,
  "tool_choice kept when it names an allowed tool",
);
ok(
  filterToolChoice({ type: "function", function: { name: "bash" } }, [
    { type: "function", function: { name: "other" } },
  ]) === undefined,
  "tool_choice stripped when it names a tool that was filtered out",
);
ok(filterToolChoice("auto", undefined) === undefined, "tool_choice stripped without tools");

if (fails.length) {
  console.error(`${fails.length}/${checks} failed`);
  for (const f of fails) console.error("  -", f);
  process.exit(1);
}
console.log(`openai.check: ${checks} ok`);
