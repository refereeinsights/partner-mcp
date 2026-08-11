import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOrganizerClusters } from "../lib/queries";
import { getOrganizerClustersInput, getOrganizerClustersOutput, getOrganizerClustersToolOutput } from "../lib/schemas";

const MCP_SCHEMA = {
  min_tournaments: z.number().int().positive().max(100).optional().default(3).describe("Minimum tournament count to include an organizer (default 3)."),
  sport: z.string().optional().describe("Sport filter: soccer, baseball, softball, lacrosse, basketball, hockey, volleyball, futsal."),
  state: z.string().optional().describe("2-letter US state code, e.g. CA or TX."),
  limit: z.number().int().positive().max(200).optional().describe("Max rows to return."),
};

export function registerGetOrganizerClusters(server: McpServer) {
  server.registerTool(
    "get_organizer_clusters",
    {
      description: "Group tournaments by host_org (or inferred domain) to find organizers operating multiple events.",
      inputSchema: MCP_SCHEMA,
      outputSchema: getOrganizerClustersToolOutput
    },
    async (input) => {
      const filters = getOrganizerClustersInput.parse(input ?? {});
      const data = await getOrganizerClusters(filters);
      const parsed = getOrganizerClustersOutput.parse(data);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: { data: parsed }
      };
    }
  );
}
