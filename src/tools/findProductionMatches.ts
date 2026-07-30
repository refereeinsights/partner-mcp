import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findProductionMatches } from "../lib/queries";
import { findProductionMatchesInput, findProductionMatchesOutput } from "../lib/schemas";

export function registerFindProductionMatches(server: McpServer) {
  server.registerTool(
    "find_production_matches",
    {
      description:
        "Batch lookup: for each candidate descriptor (name, sport, state, dates, organizer_domain) return up to max_matches_per_candidate production tournament matches. Use to classify search-history findings as New / Duplicate / Enrichment in one call instead of N sequential lookups.",
      inputSchema: findProductionMatchesInput,
      outputSchema: findProductionMatchesOutput
    },
    async (input) => {
      const args = findProductionMatchesInput.parse(input ?? {});
      const raw = await findProductionMatches(args.candidates, args.max_matches_per_candidate);
      const parsed = findProductionMatchesOutput.parse(raw);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
