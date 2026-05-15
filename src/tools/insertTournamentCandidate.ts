import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { insertTournamentCandidate } from "../lib/queries";
import { insertTournamentCandidateInput, insertTournamentCandidateOutput } from "../lib/schemas";

export function registerInsertTournamentCandidate(server: McpServer) {
  server.registerTool(
    "insert_tournament_candidate",
    {
      description:
        "Insert a tournament candidate for later review. Requires ENABLE_MCP_WRITES=true and SUPABASE_SERVICE_ROLE_KEY.",
      inputSchema: insertTournamentCandidateInput,
      outputSchema: insertTournamentCandidateOutput
    },
    async (input) => {
      const args = insertTournamentCandidateInput.parse(input ?? {});
      const result = await insertTournamentCandidate(args);
      const parsed = insertTournamentCandidateOutput.parse(result);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
