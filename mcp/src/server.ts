/**
 * Local MCP server: `npm run mcp`, then point a client at
 * http://localhost:3847/mcp with the bearer token.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { handleLeadwellMcp } from "./handler.js";

const port = Number(process.env.LEADWELL_MCP_PORT ?? 3847);

async function toRequest(req: IncomingMessage): Promise<Request> {
  const url = `http://${req.headers.host ?? `localhost:${port}`}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  const method = req.method ?? "GET";
  if (method === "GET" || method === "HEAD") return new Request(url, { method, headers });
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return new Request(url, { method, headers, body: Buffer.concat(chunks) });
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (!response.body) {
    res.end();
    return;
  }
  // Stream, so SSE responses flush as they're written.
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}

createServer(async (req, res) => {
  try {
    await send(res, await handleLeadwellMcp(await toRequest(req)));
  } catch (err) {
    res.statusCode = 500;
    res.end(err instanceof Error ? err.message : String(err));
  }
}).listen(port, () => {
  console.log(`LeadWell MCP listening on http://localhost:${port}/mcp`);
});
