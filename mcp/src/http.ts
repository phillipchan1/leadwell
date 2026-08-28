import type { IncomingMessage, ServerResponse } from "node:http";

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Accept, MCP-Session-Id, MCP-Protocol-Version, Last-Event-ID",
    "Access-Control-Expose-Headers": "MCP-Session-Id, MCP-Protocol-Version",
  };
}

export async function nodeToFetchRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? "localhost";
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "http";
  const url = `${proto}://${host}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  const method = req.method ?? "GET";
  if (method === "GET" || method === "HEAD") {
    return new Request(url, { method, headers });
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return new Request(url, {
    method,
    headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined,
  });
}

export async function writeFetchResponse(
  res: ServerResponse,
  response: Response
): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  if (!response.body) {
    res.end();
    return;
  }
  const buf = Buffer.from(await response.arrayBuffer());
  res.end(buf);
}
