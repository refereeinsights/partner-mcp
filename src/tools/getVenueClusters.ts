import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getVenueClusters } from "../lib/queries";
import { getVenueClustersInput, getVenueClustersOutput, getVenueClustersToolOutput } from "../lib/schemas";

const MCP_SCHEMA = {
  min_tournaments: z.number().int().positive().max(100).optional().default(2).describe("Minimum tournament count to include a venue (default 2)."),
  sport: z.string().optional().describe("Sport filter: soccer, baseball, softball, lacrosse, basketball, hockey, volleyball, futsal."),
  state: z.string().optional().describe("2-letter US state code, e.g. CA or TX."),
  limit: z.number().int().positive().max(200).optional().describe("Max rows to return."),
};

export function registerGetVenueClusters(server: McpServer) {
  server.registerTool(
    "get_venue_clusters",
    {
      description: "Cluster tournaments by venue to find facilities hosting multiple events.",
      inputSchema: MCP_SCHEMA,
      outputSchema: getVenueClustersToolOutput
    },
    async (input) => {
      const filters = getVenueClustersInput.parse(input ?? {});
      const data = await getVenueClusters(filters);
      const parsed = getVenueClustersOutput.parse(data);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: { data: parsed }
      };
    }
  );
}
