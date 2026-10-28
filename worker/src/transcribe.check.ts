/**
 * Prove the transcribe route's own rules, with OpenAI mocked:
 * - the form is refused without audio, when empty, too large, or not audio
 * - the codec parameter is dropped and the file is named for its container
 * - the prompt is capped from the end (the recent lines are the useful ones)
 * - the model comes from the allowlist, never from the client
 * - no key → 501; OpenAI's error status passes through; text comes back trimmed
 */
import {
  MAX_AUDIO_BYTES,
  MAX_PROMPT_CHARS,
  TRANSCRIBE_MODELS,
  readTranscribeForm,
  transcribe,
  transcribeConfigured,
  transcribeModel,
} from "./transcribe.ts";
import type { Env } from "./env.ts";

const fails: string[] = [];
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) fails.push(msg);
}

function form(parts: Record<string, Blob | string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(parts)) f.append(k, v);
  return f;
}

function throws(fn: () => unknown, match: string): boolean {
  try {
    fn();
    return false;
  } catch (err) {
    return err instanceof Error && err.message.includes(match);
  }
}

const env: Env = { OPENAI_API_KEY: "sk-test" };
const opus = new Blob([new Uint8Array(2048)], { type: "audio/webm;codecs=opus" });

// ── The form ───────────────────────────────────────────────────────────────
ok(throws(() => readTranscribeForm(form({}), env), "audio is required"), "no audio refused");
ok(throws(() => readTranscribeForm(form({ audio: "text" }), env), "audio is required"), "a string is not audio");
ok(
  throws(() => readTranscribeForm(form({ audio: new Blob([], { type: "audio/webm" }) }), env), "empty"),
  "empty audio refused",
);
ok(
  throws(
    () => readTranscribeForm(form({ audio: new Blob([new Uint8Array(MAX_AUDIO_BYTES + 1)], { type: "audio/webm" }) }), env),
    "too large",
  ),
  "oversized audio refused",
);
ok(
  throws(() => readTranscribeForm(form({ audio: new Blob(["x"], { type: "text/html" }) }), env), "not supported"),
  "non-audio refused",
);

const longPrompt = "a".repeat(MAX_PROMPT_CHARS) + "THE END";
const input = readTranscribeForm(form({ audio: opus, prompt: longPrompt, model: "whisper-1" }), env);
ok(input.type === "audio/webm", "codec parameter dropped");
ok(input.prompt.length === MAX_PROMPT_CHARS && input.prompt.endsWith("THE END"), "prompt capped from the end");
ok(input.model === TRANSCRIBE_MODELS[0], "client cannot pick the model");

ok(transcribeModel({ OPENAI_TRANSCRIBE_MODEL: "gpt-4o-mini-transcribe" }) === "gpt-4o-mini-transcribe", "env picks an allowed model");
ok(transcribeModel({ OPENAI_TRANSCRIBE_MODEL: "gpt-5" }) === TRANSCRIBE_MODELS[0], "env cannot pick a model outside the list");
ok(transcribeConfigured(env) && !transcribeConfigured({}), "configured follows the key");

// ── Talking to OpenAI ──────────────────────────────────────────────────────
{
  const res = await transcribe({}, input);
  ok(res.status === 501, "no key → 501");
}

{
  let sent: FormData | null = null;
  let auth = "";
  const fake = (async (_url: string, init: RequestInit) => {
    sent = init.body as FormData;
    auth = new Headers(init.headers).get("authorization") ?? "";
    return new Response(JSON.stringify({ text: "  Meghan sends the budget Monday.  " }), { status: 200 });
  }) as unknown as typeof fetch;
  const res = await transcribe(env, input, fake);
  const data = (await res.json()) as { text: string };
  ok(res.status === 200 && data.text === "Meghan sends the budget Monday.", "text comes back trimmed");
  ok(auth === "Bearer sk-test", "key sent server-side");
  const file = (sent as FormData | null)?.get("file");
  ok(file instanceof Blob && (file as File).name === "segment.webm", "file named for its container");
  ok((sent as FormData | null)?.get("model") === TRANSCRIBE_MODELS[0], "allowlisted model sent");
  ok(((sent as FormData | null)?.get("prompt") as string).endsWith("THE END"), "prompt forwarded");
}

{
  const fake = (async () => new Response("rate limited", { status: 429 })) as unknown as typeof fetch;
  const res = await transcribe(env, input, fake);
  ok(res.status === 429, "OpenAI's status passes through");
}

{
  const fake = (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
  const res = await transcribe(env, input, fake);
  ok(res.status === 502, "unreachable → 502");
}

if (fails.length) {
  console.error(`transcribe.check: ${fails.length} of ${checks} failed`);
  for (const f of fails) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`transcribe.check: ${checks} checks passed`);
