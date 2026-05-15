import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getMissingVenues } from "../lib/queries";
import { getMissingVenuesInput, getMissingVenuesOutput } from "../lib/schemas";

export function registerGetMissingVenues(server: McpServer) {
  server.registerTool(
    "get_missing_venues",
    {
      description:
        "Published canonical tournaments with no linked venue (no tournament_venues rows). Returns a summary (total missing, % missing, breakdown by sport and state) plus the list of unlinked tournaments.",
      inputSchema: getMissingVenuesInput,
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
