import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAssociationDashboard } from "../lib/queries";
import {
  getAssociationDashboardInput,
  getAssociationDashboardOutput
} from "../lib/schemas";

export function registerGetAssociationDashboard(server: McpServer) {
  server.registerTool(
    "get_association_dashboard",
    {
      description:
        "Association coverage for published canonical tournaments: totals (with/without association) and top associations",
      inputSchema: getAssociationDashboardInput,
      outputSchema: getAssociationDashboardOutput
    },
    async (input) => {
      const filters = getAssociationDashboardInput.parse(input ?? {});
      const data = await getAssociationDashboard({ limit: filters.limit });
      const parsed = getAssociationDashboardOutput.parse(data);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
