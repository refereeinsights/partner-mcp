import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSummaryDashboard } from "../lib/queries";
import { summaryDashboardSchema } from "../lib/schemas";

export function registerGetSummaryDashboard(server: McpServer) {
  server.registerTool(
    "get_summary_dashboard",
    {
      description:
        "Composite dashboard: dataset health, top sports/states, top organizers and venues, and data quality summary — all in one call",
      inputSchema: z.object({}),
      outputSchema: summaryDashboardSchema
    },
    async () => {
      const data = await getSummaryDashboard();
      const parsed = summaryDashboardSchema.parse(data);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
