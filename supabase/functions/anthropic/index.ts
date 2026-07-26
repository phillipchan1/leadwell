// LeadWell AI proxy (Supabase Edge Function).
//
// Holds the Anthropic API key server-side (never exposed to the browser) and
// streams Claude's response back as plain-text deltas.
//
// Auth: verify_jwt is OFF at the gateway so browser CORS preflight (OPTIONS)
// can succeed — OPTIONS has no Authorization header. We verify the caller's
// user JWT inside the function before calling Anthropic.
//
// Deploy:   supabase functions deploy anthropic
// Secret:   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Config:   supabase/config.toml → [functions.anthropic] verify_jwt = false
//
// Request body: { system?: string, messages: {role, content}[], model?, max_tokens? }
// Response:     a text/plain stream of the assistant's output.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const textResponse = (body: string, status: number) =>
  new Response(body, {
    status,
    headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" },
  });

async function requireUser(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return textResponse("Sign in to use AI.", 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return textResponse("Server misconfigured (missing Supabase env).", 500);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return textResponse("Session expired — sign in again.", 401);
  }
  return null;
}

Deno.serve(async (req: Request) => {
  // Must succeed without JWT — browsers don't send Authorization on preflight.
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS });
  }
  if (req.method !== "POST") return textResponse("Method not allowed", 405);

  const authError = await requireUser(req);
  if (authError) return authError;

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return textResponse(
      "ANTHROPIC_API_KEY is not set on the server. Run: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...",
      500
    );
  }

  let body: {
    system?: string;
    messages?: { role: string; content: string }[];
    model?: string;
    max_tokens?: number;
  };
  try {
    body = await req.json();
  } catch {
    return textResponse("Invalid JSON body", 400);
  }

  const { system, messages, model = "claude-sonnet-5", max_tokens = 2048 } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return textResponse("messages[] is required", 400);
  }

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens, system, stream: true, messages }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return textResponse(`Anthropic error (${upstream.status}): ${detail}`, 502);
  }

  // Re-emit Anthropic's SSE stream as plain-text deltas the client can append.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const evt of events) {
            for (const line of evt.split("\n")) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const data = trimmed.slice(5).trim();
              if (!data || data === "[DONE]") continue;
              try {
                const json = JSON.parse(data);
                if (
                  json.type === "content_block_delta" &&
                  json.delta?.type === "text_delta"
                ) {
                  controller.enqueue(encoder.encode(json.delta.text));
                }
              } catch {
                // Ignore keep-alives / partial frames.
              }
            }
          }
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
});
