import { anthropicModel, type Env } from "./env.ts";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const FORBIDDEN_CLIENT_HEADERS = [
  "x-api-key",
  "authorization",
  "anthropic-api-key",
];

export const ALLOWED_ANTHROPIC_MODELS = ["claude-sonnet-4-20250514"] as const;
export type AllowedAnthropicModel = (typeof ALLOWED_ANTHROPIC_MODELS)[number];
export const MAX_ANTHROPIC_TOKENS = 8192;
export const DEFAULT_ANTHROPIC_TOKENS = 4096;

export type AnthropicBody = {
  model?: string;
  messages?: unknown;
  system?: unknown;
  max_tokens?: number;
  stream?: boolean;
  temperature?: number;
  tools?: unknown;
  tool_choice?: unknown;
  metadata?: unknown;
  stop_sequences?: unknown;
  top_k?: number;
  top_p?: number;
};

export function isAllowedAnthropicModel(model: string): model is AllowedAnthropicModel {
  return (ALLOWED_ANTHROPIC_MODELS as readonly string[]).includes(model);
}

export function resolveAnthropicModel(env: Env, requested?: string): AllowedAnthropicModel {
  const fromClient = requested?.trim() ?? "";
  if (fromClient) {
    if (!isAllowedAnthropicModel(fromClient)) {
      throw new Error("model is not allowed");
    }
    return fromClient;
  }
  const fromEnv = anthropicModel(env);
  if (isAllowedAnthropicModel(fromEnv)) return fromEnv;
  return ALLOWED_ANTHROPIC_MODELS[0];
}

export function sanitizeAnthropicBody(input: unknown, env: Env): AnthropicBody {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("body must be a JSON object");
  }
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.messages)) {
    throw new Error("messages must be an array");
  }
  const maxTokens = Number(raw.max_tokens);
  const capped =
    Number.isFinite(maxTokens) && maxTokens > 0
      ? Math.min(maxTokens, MAX_ANTHROPIC_TOKENS)
      : DEFAULT_ANTHROPIC_TOKENS;
  return {
    model: resolveAnthropicModel(env, typeof raw.model === "string" ? raw.model : undefined),
    messages: raw.messages,
    system: raw.system,
    max_tokens: capped,
    stream: raw.stream === true,
    temperature: typeof raw.temperature === "number" ? raw.temperature : undefined,
    tools: raw.tools,
    tool_choice: raw.tool_choice,
    metadata: raw.metadata,
    stop_sequences: raw.stop_sequences,
    top_k: typeof raw.top_k === "number" ? raw.top_k : undefined,
    top_p: typeof raw.top_p === "number" ? raw.top_p : undefined,
  };
}

export function assertNoClientKey(headers: Headers): void {
  for (const name of FORBIDDEN_CLIENT_HEADERS) {
    if (headers.get(name)) {
      throw new Error("client must not send an Anthropic API key");
    }
  }
}

export async function proxyAnthropic(env: Env, body: AnthropicBody): Promise<Response> {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY is not set" }), {
      status: 501,
      headers: { "Content-Type": "application/json" },
    });
  }
  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });
  const headers = new Headers();
  const contentType = upstream.headers.get("content-type") ?? "application/json";
  headers.set("content-type", contentType);
  headers.set("cache-control", "no-store");
  // Never leak the upstream key or request id that might identify the account.
  return new Response(upstream.body, { status: upstream.status, headers });
}

export { ANTHROPIC_URL };
