import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getMissingVenues } from "../lib/queries";
import { getMissingVenuesInput, getMissingVenuesOutput } from "../lib/schemas";

const MCP_SCHEMA = {
  sport: z.string().optional().describe("Sport filter: soccer, baseball, softball, lacrosse, basketball, hockey, volleyball, futsal."),
  state: z.string().optional().describe("2-letter US state code, e.g. CA or TX."),
  limit: z.number().int().positive().max(500).optional().describe("Max rows to return."),
};

export function registerGetMissingVenues(server: McpServer) {
  server.registerTool(
    "get_missing_venues",
    {
      description: "Published canonical tournaments with no linked venue. Returns summary counts plus the list of unlinked tournaments.",
      inputSchema: MCP_SCHEMA,
      outputSchema: getMissingVenuesOutput
    },
    async (input) => {
      const filters = getMissingVenuesInput.parse(input ?? {});
      const data = await getMissingVenues(filters);
      const parsed = getMissingVenuesOutput.parse(data);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
