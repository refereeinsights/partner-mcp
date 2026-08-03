import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findProductionMatches } from "../lib/queries";
import { findProductionMatchesInput, findProductionMatchesOutput } from "../lib/schemas";

const MCP_SCHEMA = {
  candidates_json: z.string().describe(
    'JSON array string of candidate descriptors (min 1, max 25). Each item: { candidate_index?: number, name?: string, sport?: string, state?: string, start_date_from?: string, start_date_to?: string, organizer_domain?: string }. Example: \'[{"candidate_index":0,"name":"Cal Cup","sport":"soccer","state":"CA"}]\''
  ),
  max_matches_per_candidate: z.number().int().positive().max(10).optional().default(5).describe(
    "Maximum production matches to return per candidate (default 5, max 10)."
  ),
};

export function registerFindProductionMatches(server: McpServer) {
  server.registerTool(
    "find_production_matches",
    {
      description:
        "Batch duplicate lookup: pass up to 25 candidate descriptors as a JSON string and get production tournament matches for each in one call. Use to classify search-history findings as New / Duplicate / Enrichment. Pass candidates_json as a JSON array string — ChatGPT MCP rejects native array parameters.",
      inputSchema: MCP_SCHEMA,
      outputSchema: findProductionMatchesOutput
    },
    async (input) => {
      const raw = input as { candidates_json: string; max_matches_per_candidate: number };
      const args = findProductionMatchesInput.parse({
        candidates: JSON.parse(raw.candidates_json),
        max_matches_per_candidate: raw.max_matches_per_candidate,
      });
      const result = await findProductionMatches(args.candidates, args.max_matches_per_candidate);
      const parsed = findProductionMatchesOutput.parse(result);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
