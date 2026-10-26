/** Same-origin OpenAI proxy. Session cookies authenticate. Never send a key. */
export async function completeChat(body: {
  messages: unknown[];
  model?: string;
  max_tokens?: number;
  stream?: boolean;
}): Promise<Response> {
  const res = await fetch("/api/openai", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res;
}
