import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { insertTournamentSearchScope } from "../lib/searchHistoryQueries";
import { insertTournamentSearchScopeInput, insertTournamentSearchScopeOutput } from "../lib/searchHistorySchemas";

export function registerInsertTournamentSearchScope(server: McpServer) {
  server.registerTool(
    "insert_tournament_search_scope",
    {
      description:
        "Record a (state, sport) scope covered by a search run. Source of truth for state-and-sport coverage metrics. " +
        "Requires ENABLE_SEARCH_HISTORY_WRITES=true and SUPABASE_SERVICE_ROLE_KEY.",
      inputSchema: insertTournamentSearchScopeInput,
      outputSchema: insertTournamentSearchScopeOutput
    },
    async (input) => {
      const args = insertTournamentSearchScopeInput.parse(input ?? {});
      const scope = await insertTournamentSearchScope(args);
      const parsed = insertTournamentSearchScopeOutput.parse(scope);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
