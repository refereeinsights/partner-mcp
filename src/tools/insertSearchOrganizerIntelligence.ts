import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { insertSearchOrganizerIntelligence } from "../lib/searchHistoryQueries";
import {
  insertSearchOrganizerIntelligenceInput,
  insertSearchOrganizerIntelligenceOutput
} from "../lib/searchHistorySchemas";

export function registerInsertSearchOrganizerIntelligence(server: McpServer) {
  server.registerTool(
    "insert_search_organizer_intelligence",
    {
      description:
        "Record organizer ecosystem intelligence for a tournament-discovery search run. " +
        "Captures confidence level, evidence summary, tournament families, recurring venue clusters, " +
        "monitoring URLs, recommended cadence, registration/scheduling platforms, and next-monitor date. " +
        "Idempotent: re-submitting identical data returns the existing row. " +
        "Conflicts (same domain, different data) return an actionable error. " +
        "Does not create production organizer, tournament, venue, or watchlist rows. " +
        "Requires ENABLE_SEARCH_HISTORY_WRITES=true and SUPABASE_SERVICE_ROLE_KEY.",
      inputSchema: insertSearchOrganizerIntelligenceInput,
      outputSchema: insertSearchOrganizerIntelligenceOutput
    },
    async (input) => {
      const args = insertSearchOrganizerIntelligenceInput.parse(input ?? {});
      const result = await insertSearchOrganizerIntelligence(args);
      const parsed = insertSearchOrganizerIntelligenceOutput.parse(result);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
