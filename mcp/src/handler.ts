import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { applyTimeZone, mcpConfig, readBearer, readPathToken, tokenMatches } from "./config.js";
import { registerMeetingTools } from "./tools/meetings.js";
import { registerPeopleTools } from "./tools/people.js";
import { registerPlannerTools } from "./tools/planner.js";
import { registerReadTools } from "./tools/read.js";

const tz = applyTimeZone();

const INSTRUCTIONS = `LeadWell is Phil's leadership system: the people and teams he leads, the leaders he reports to, and the meetings he runs with them.

Start with get_overview — it gives today's date and every meeting with its cadence, rows and next occurrence.

How meetings work:
- A meeting is a calendar series: a rhythm (weekly, biweekly, monthly, quarterly, as needed) on a weekday. Occurrences are projected from it; putting something on a projected week books it. Single weeks can be skipped, moved, or added as one-offs without changing the series.
- Rows are a meeting's standing agenda (its template), e.g. Prayer → Training → Discussion. Each row is backed by a workspace tag, so a topic tagged #prayer lands in the Prayer row.
- Topics are things to talk about. A topic is on a specific occurrence's agenda, or in ideas (the meeting's backlog), or parked, or unassigned on the Ideas board.
- Follow-ups are commitments that outlive a meeting; they open the next one as "Since last time".

Refer to meetings, people, tags and rows by name or id; occurrences by "next", "last", a date or a weekday. Every record shows its id in [brackets].

Health ratings, prayer marks and deletions are Phil's calls — only make them when he asks. Tracker links point at notes kept elsewhere (e.g. Notion); read those with their own tools.`;

const handler = createMcpHandler(() => {
  const server = new McpServer(
    { name: "leadwell", version: "1.0.0" },
    { instructions: INSTRUCTIONS }
  );
  registerReadTools(server, tz);
  registerPlannerTools(server);
  registerMeetingTools(server);
  registerPeopleTools(server);
  return server;
});

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Mcp-Method, Mcp-Name, Last-Event-ID",
    "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
  };
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders())) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** The token may come as a bearer header, a `/mcp/<token>` path, or `?key=`. */
function providedToken(request: Request): string | null {
  const url = new URL(request.url);
  return (
    readBearer(request.headers.get("authorization")) ??
    readPathToken(url.pathname) ??
    url.searchParams.get("key")
  );
}

/** Fetch handler shared by the local server and the Vercel function. */
export async function handleLeadwellMcp(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  try {
    const { token } = mcpConfig();
    if (!tokenMatches(providedToken(request), token)) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { ...corsHeaders(), "WWW-Authenticate": 'Bearer realm="leadwell"' },
      });
    }
    return withCors(await handler.fetch(request));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(message, { status: 500, headers: corsHeaders() });
  }
}
