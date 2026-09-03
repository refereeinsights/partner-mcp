import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getTournamentEnrichmentContext } from "../lib/enrichmentQueries";
import {
  getTournamentEnrichmentContextInput,
  getTournamentEnrichmentContextOutput,
} from "../lib/enrichmentSchemas";

const MCP_SCHEMA = {
  tournament_id: z.string().uuid().describe("Production tournament UUID."),
};

export function registerGetTournamentEnrichmentContext(server: McpServer) {
  server.registerTool(
    "get_tournament_enrichment_context",
    {
      description:
        "Read full production context for a tournament before staging an enrichment proposal: " +
        "tournament fields, linked venues, and existing enrichment proposals. " +
        "Read-only. Does not mutate production.",
      inputSchema: MCP_SCHEMA,
      outputSchema: getTournamentEnrichmentContextOutput,
    },
    async (input) => {
      const args = getTournamentEnrichmentContextInput.parse(input ?? {});
      const result = getTournamentEnrichmentContextOutput.parse(
        await getTournamentEnrichmentContext(args),
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );
}
