import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { insertTournamentCandidate } from "../lib/queries";
import { insertTournamentCandidateInput, insertTournamentCandidateOutput } from "../lib/schemas";

const MCP_SCHEMA = {
  source_url: z.string().describe("URL of the source page where this tournament was found."),
  sport: z.string().optional().describe("Sport: soccer, baseball, softball, lacrosse, basketball, hockey, volleyball, futsal."),
  state: z.string().optional().describe("2-letter US state code, e.g. CA or TX."),
  name: z.string().optional().describe("Tournament name (max 300 chars)."),
  notes: z.string().optional().describe("Research notes (max 5000 chars)."),
};

export function registerInsertTournamentCandidate(server: McpServer) {
  server.registerTool(
    "insert_tournament_candidate",
    {
      description:
        "Insert a tournament candidate for later review. Requires ENABLE_MCP_WRITES=true and SUPABASE_SERVICE_ROLE_KEY.",
      inputSchema: MCP_SCHEMA,
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
