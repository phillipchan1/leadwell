import { createMcpHandler } from "mcp-handler";
import { mcpConfig, readToken, tokenMatches } from "./config";
import { corsHeaders } from "./http";
import { registerTools } from "./tools";

const mcp = createMcpHandler(
  (server) => {
    registerTools(server);
  },
  {
    serverInfo: { name: "leadwell", version: "0.1.0" },
    instructions:
      "LeadWell is Phil's leadership system of record. Call get_purview first. Capture uses the same grammar as the app: `#tag` `@meeting` `!` urgent, one topic per line. Do not invent health ratings, prayer marks, or org edits. Tracker URLs are pointers — leave Notion write-ups to Notion MCP.",
  }
);

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders())) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

/** Fetch handler used by the local server and the Vercel function. */
export async function handleLeadwellMcp(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    const { token } = mcpConfig();
    const provided = readToken(request.headers.get("authorization"));
    if (!tokenMatches(provided, token)) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { ...corsHeaders(), "WWW-Authenticate": "Bearer" },
      });
    }
    return withCors(await mcp(request));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(message, { status: 500, headers: corsHeaders() });
  }
}
