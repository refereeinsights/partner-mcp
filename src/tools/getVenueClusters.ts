import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getVenueClusters } from "../lib/queries";
import {
  getVenueClustersInput,
  getVenueClustersOutput,
  getVenueClustersToolOutput
} from "../lib/schemas";

export function registerGetVenueClusters(server: McpServer) {
  server.registerTool(
    "get_venue_clusters",
    {
      description: "Cluster tournaments by venue",
      inputSchema: getVenueClustersInput,
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
