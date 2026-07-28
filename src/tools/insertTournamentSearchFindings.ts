import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { insertTournamentSearchFindings } from "../lib/searchHistoryQueries";
import { insertTournamentSearchFindingsInput, insertTournamentSearchFindingsOutput } from "../lib/searchHistorySchemas";

export function registerInsertTournamentSearchFindings(server: McpServer) {
  server.registerTool(
    "insert_tournament_search_findings",
    {
      description:
        "Batch-insert tournament-discovery findings (max 100 per call). Validates every row before writing; " +
        "if any row is invalid, rejects the full batch and returns every row-level error, writing nothing. " +
        "Requires ENABLE_SEARCH_HISTORY_WRITES=true and SUPABASE_SERVICE_ROLE_KEY.",
      inputSchema: insertTournamentSearchFindingsInput,
      outputSchema: insertTournamentSearchFindingsOutput
    },
    async (input) => {
      const args = insertTournamentSearchFindingsInput.parse(input ?? {});
      const result = await insertTournamentSearchFindings(args);
      const parsed = insertTournamentSearchFindingsOutput.parse(result);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
