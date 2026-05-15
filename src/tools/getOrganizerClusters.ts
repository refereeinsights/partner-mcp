import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOrganizerClusters } from "../lib/queries";
import {
  getOrganizerClustersInput,
  getOrganizerClustersOutput,
  getOrganizerClustersToolOutput
} from "../lib/schemas";

export function registerGetOrganizerClusters(server: McpServer) {
  server.registerTool(
    "get_organizer_clusters",
    {
      description:
        "Group tournaments by host_org (or inferred domain) to find organizers operating multiple events",
      inputSchema: getOrganizerClustersInput,
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
