import type { IncomingMessage, ServerResponse } from "node:http";
import { handleLeadwellMcp } from "../mcp/src/handler";
import { nodeToFetchRequest, writeFetchResponse } from "../mcp/src/http";

export const config = {
  maxDuration: 60,
};

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const request = await nodeToFetchRequest(req);
  const response = await handleLeadwellMcp(request);
  await writeFetchResponse(res, response);
}
