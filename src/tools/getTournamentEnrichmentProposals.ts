import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getTournamentEnrichmentProposals } from "../lib/enrichmentQueries";
import {
  getTournamentEnrichmentProposalsInput,
  getTournamentEnrichmentProposalsOutput,
} from "../lib/enrichmentSchemas";

const MCP_SCHEMA = {
  tournament_id: z.string().uuid().optional().describe("Filter to a specific tournament UUID."),
  status: z.enum(["pending_review", "needs_verification", "approved", "rejected", "applied"])
    .optional().describe("Filter by proposal status."),
  action_type: z.enum([
    "add_official_source", "correct_dates", "add_venue", "add_additional_venue",
    "correct_venue", "correct_tournament_location", "merge_duplicate", "manual_review",
  ]).optional().describe("Filter by proposal action type."),
  sport: z.string().optional().describe("Filter by tournament sport."),
  state: z.string().optional().describe("Filter by tournament state (2-letter code)."),
  source_batch_id: z.string().optional().describe("Filter by research batch label."),
  limit: z.number().int().min(1).max(100).optional().describe("Max results (default 25, max 100)."),
  offset: z.number().int().min(0).optional().describe("Pagination offset (default 0)."),
};

export function registerGetTournamentEnrichmentProposals(server: McpServer) {
  server.registerTool(
    "get_tournament_enrichment_proposals",
    {
      description:
        "List enrichment proposals with tournament context. " +
        "Filterable by tournament_id, status, action_type, sport, state, source_batch_id. " +
        "Read-only. Does not mutate production.",
      inputSchema: MCP_SCHEMA,
      outputSchema: getTournamentEnrichmentProposalsOutput,
    },
    async (input) => {
      const args = getTournamentEnrichmentProposalsInput.parse(input ?? {});
      const result = getTournamentEnrichmentProposalsOutput.parse(
        await getTournamentEnrichmentProposals(args),
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );
}
