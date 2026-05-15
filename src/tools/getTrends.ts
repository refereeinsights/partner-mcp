import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getTrends } from "../lib/queries";
import { getTrendsInput, getTrendsOutput } from "../lib/schemas";

export function registerGetTrends(server: McpServer) {
  server.registerTool(
    "get_trends",
    {
      description:
        "Tournament ingestion and data-quality trends over time, bucketed by week, month, or quarter. Shows tournaments added per period, fill rates for key fields, and running cumulative total.",
      inputSchema: getTrendsInput,
      outputSchema: getTrendsOutput
    },
    async (input) => {
      const filters = getTrendsInput.parse(input ?? {});
      const data = await getTrends(filters);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        structuredContent: { data }
      };
    }
  );
}
