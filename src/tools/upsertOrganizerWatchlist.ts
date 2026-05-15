import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { upsertOrganizerWatchlist } from "../lib/queries";
import { upsertOrganizerWatchlistInput, upsertOrganizerWatchlistOutput } from "../lib/schemas";

export function registerUpsertOrganizerWatchlist(server: McpServer) {
  server.registerTool(
    "upsert_organizer_watchlist",
    {
      description:
        "Upsert an organizer into organizer_watchlists. Requires ENABLE_MCP_WRITES=true and SUPABASE_SERVICE_ROLE_KEY.",
      inputSchema: upsertOrganizerWatchlistInput,
      outputSchema: upsertOrganizerWatchlistOutput
    },
    async (input) => {
      const args = upsertOrganizerWatchlistInput.parse(input ?? {});
      const result = await upsertOrganizerWatchlist(args);
      const parsed = upsertOrganizerWatchlistOutput.parse(result);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
