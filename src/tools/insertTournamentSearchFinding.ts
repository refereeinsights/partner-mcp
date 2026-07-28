import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { insertTournamentSearchFinding } from "../lib/searchHistoryQueries";
import { insertTournamentSearchFindingInput, insertTournamentSearchFindingOutput } from "../lib/searchHistorySchemas";

export function registerInsertTournamentSearchFinding(server: McpServer) {
  server.registerTool(
    "insert_tournament_search_finding",
    {
      description:
        "Record a single tournament-discovery finding (Qualified, Needs Verification, Duplicate, Out of Scope, etc.). " +
        "Never creates or updates production tournament rows. Supports supersession via supersedes_finding_id. " +
        "Requires ENABLE_SEARCH_HISTORY_WRITES=true and SUPABASE_SERVICE_ROLE_KEY.",
      inputSchema: insertTournamentSearchFindingInput,
      outputSchema: insertTournamentSearchFindingOutput
    },
    async (input) => {
      const args = insertTournamentSearchFindingInput.parse(input ?? {});
      const result = await insertTournamentSearchFinding(args);
      const parsed = insertTournamentSearchFindingOutput.parse(result);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
