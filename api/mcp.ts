/**
 * LeadWell MCP on Vercel. `/mcp` and `/mcp/<token>` rewrite here (vercel.json).
 * Web-standard handlers: Vercel's Node runtime passes a Request through.
 */
import { handleLeadwellMcp } from "../mcp/src/handler.js";

export const GET = handleLeadwellMcp;
export const POST = handleLeadwellMcp;
export const DELETE = handleLeadwellMcp;
export const OPTIONS = handleLeadwellMcp;
