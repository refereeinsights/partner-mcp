import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { finalizeTournamentSearchRun } from "../lib/searchHistoryQueries";
import { finalizeTournamentSearchRunInput, finalizeTournamentSearchRunOutput } from "../lib/searchHistorySchemas";

export function registerFinalizeTournamentSearchRun(server: McpServer) {
  server.registerTool(
    "finalize_tournament_search_run",
    {
      description:
        "Reconcile a search run: recalculates scope and run-level metrics from current (non-superseded) findings, " +
        "resolves unscoped findings by (state, sport), and sets completed_at/status. Idempotent. " +
        "Requires ENABLE_SEARCH_HISTORY_WRITES=true and SUPABASE_SERVICE_ROLE_KEY.",
      inputSchema: finalizeTournamentSearchRunInput,
      outputSchema: finalizeTournamentSearchRunOutput
    },
    async (input) => {
      const args = finalizeTournamentSearchRunInput.parse(input ?? {});
      const result = await finalizeTournamentSearchRun(args);
      const parsed = finalizeTournamentSearchRunOutput.parse(result);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
