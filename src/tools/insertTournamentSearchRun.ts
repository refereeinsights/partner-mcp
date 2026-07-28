import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { insertTournamentSearchRun } from "../lib/searchHistoryQueries";
import { insertTournamentSearchRunInput, insertTournamentSearchRunOutput } from "../lib/searchHistorySchemas";

export function registerInsertTournamentSearchRun(server: McpServer) {
  server.registerTool(
    "insert_tournament_search_run",
    {
      description:
        "Record a tournament-discovery search run (operational research data, kept separate from production tournament rows). " +
        "Idempotent via source_batch_id. Requires ENABLE_SEARCH_HISTORY_WRITES=true and SUPABASE_SERVICE_ROLE_KEY.",
      inputSchema: insertTournamentSearchRunInput,
      outputSchema: insertTournamentSearchRunOutput
    },
    async (input) => {
      const args = insertTournamentSearchRunInput.parse(input ?? {});
      const run = await insertTournamentSearchRun(args);
      const parsed = insertTournamentSearchRunOutput.parse(run);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
