import { openaiModel, type Env } from "./env.ts";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const FORBIDDEN_CLIENT_HEADERS = [
  "x-api-key",
  "authorization",
  "openai-api-key",
  "anthropic-api-key",
];

export const ALLOWED_OPENAI_MODELS = ["gpt-5-mini", "gpt-5"] as const;
export type AllowedOpenAIModel = (typeof ALLOWED_OPENAI_MODELS)[number];
export const MAX_OPENAI_TOKENS = 8192;
export const DEFAULT_OPENAI_TOKENS = 4096;
/** Client-supplied tools are dropped unless named here. Default: none. */
export const ALLOWED_OPENAI_TOOLS: readonly string[] = [];

export type OpenAIBody = {
  model: AllowedOpenAIModel;
  messages: unknown[];
  max_completion_tokens: number;
  stream?: boolean;
  temperature?: number;
  tools?: unknown[];
  tool_choice?: unknown;
};

export function isAllowedOpenAIModel(model: string): model is AllowedOpenAIModel {
  return (ALLOWED_OPENAI_MODELS as readonly string[]).includes(model);
}

export function resolveOpenAIModel(env: Env, requested?: string): AllowedOpenAIModel {
  const fromClient = requested?.trim() ?? "";
  if (fromClient) {
    if (!isAllowedOpenAIModel(fromClient)) {
      throw new Error("model is not allowed");
    }
    return fromClient;
  }
  const fromEnv = openaiModel(env);
  if (isAllowedOpenAIModel(fromEnv)) return fromEnv;
  return ALLOWED_OPENAI_MODELS[0];
}

export function filterClientTools(
  tools: unknown,
  allowlist: readonly string[] = ALLOWED_OPENAI_TOOLS,
): unknown[] | undefined {
  if (!Array.isArray(tools) || allowlist.length === 0) return undefined;
  const allowed = new Set(allowlist);
  const kept: unknown[] = [];
  for (const tool of tools) {
    if (!tool || typeof tool !== "object" || Array.isArray(tool)) continue;
    const name =
      (tool as { function?: { name?: unknown } }).function?.name ??
      (tool as { name?: unknown }).name;
    if (typeof name === "string" && allowed.has(name)) kept.push(tool);
  }
  return kept.length ? kept : undefined;
}

export function filterToolChoice(
  choice: unknown,
  tools: unknown[] | undefined,
): unknown {
  if (!tools?.length || choice == null) return undefined;
  if (choice === "auto" || choice === "none" || choice === "required") return choice;
  if (typeof choice !== "object" || Array.isArray(choice)) return undefined;
  const name =
    (choice as { function?: { name?: unknown } }).function?.name ??
    (choice as { name?: unknown }).name;
  if (typeof name !== "string") return undefined;
  const allowed = tools.some((tool) => {
    if (!tool || typeof tool !== "object" || Array.isArray(tool)) return false;
    const toolName =
      (tool as { function?: { name?: unknown } }).function?.name ??
      (tool as { name?: unknown }).name;
    return toolName === name;
  });
  return allowed ? choice : undefined;
}

function asMessages(raw: Record<string, unknown>): unknown[] {
  const messages = Array.isArray(raw.messages) ? [...raw.messages] : null;
  if (!messages) throw new Error("messages must be an array");
  if (typeof raw.system === "string" && raw.system.trim()) {
    messages.unshift({ role: "system", content: raw.system });
  }
  return messages;
}

export function sanitizeOpenAIBody(input: unknown, env: Env): OpenAIBody {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("body must be a JSON object");
  }
  const raw = input as Record<string, unknown>;
  const messages = asMessages(raw);
  const requested =
    typeof raw.max_completion_tokens === "number"
      ? raw.max_completion_tokens
      : Number(raw.max_tokens);
  const capped =
    Number.isFinite(requested) && requested > 0
      ? Math.min(requested, MAX_OPENAI_TOKENS)
      : DEFAULT_OPENAI_TOKENS;
  const tools = filterClientTools(raw.tools);
  const toolChoice = filterToolChoice(raw.tool_choice, tools);
  return {
    model: resolveOpenAIModel(env, typeof raw.model === "string" ? raw.model : undefined),
    messages,
    max_completion_tokens: capped,
    stream: raw.stream === true,
    temperature: typeof raw.temperature === "number" ? raw.temperature : undefined,
    ...(tools ? { tools, ...(toolChoice ? { tool_choice: toolChoice } : {}) } : {}),
  };
}

export function assertNoClientKey(headers: Headers): void {
  for (const name of FORBIDDEN_CLIENT_HEADERS) {
    if (headers.get(name)) {
      throw new Error("client must not send an OpenAI API key");
    }
  }
}

export async function proxyOpenAI(env: Env, body: OpenAIBody): Promise<Response> {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY is not set" }), {
      status: 501,
      headers: { "Content-Type": "application/json" },
    });
  }
  const upstream = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  const headers = new Headers();
  const contentType = upstream.headers.get("content-type") ?? "application/json";
  headers.set("content-type", contentType);
  headers.set("cache-control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers });
}

export { OPENAI_URL };
