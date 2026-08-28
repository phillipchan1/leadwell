import { createServer } from "node:http";
import { handleLeadwellMcp } from "./handler";
import { nodeToFetchRequest, writeFetchResponse } from "./http";

const port = Number(process.env.LEADWELL_MCP_PORT ?? 3847);

const server = createServer(async (req, res) => {
  try {
    const request = await nodeToFetchRequest(req);
    const response = await handleLeadwellMcp(request);
    await writeFetchResponse(res, response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.statusCode = 500;
    res.end(message);
  }
});

server.listen(port, () => {
  console.log(`LeadWell MCP listening on http://localhost:${port}/mcp`);
});
