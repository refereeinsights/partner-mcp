import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSearchCoverage } from "../lib/searchHistoryQueries";
import { getSearchCoverageInput, getSearchCoverageOutput } from "../lib/searchHistorySchemas";

const MCP_SCHEMA = {
  sport: z.string().optional().describe("Single sport filter: soccer, baseball, softball, lacrosse, basketball, hockey, volleyball, futsal."),
  state: z.string().optional().describe("Single 2-letter US state code, e.g. CA or TX."),
  window_from: z.string().optional().describe("Tournament window start date, YYYY-MM-DD."),
  window_to: z.string().optional().describe("Tournament window end date, YYYY-MM-DD."),
  searched_from: z.string().optional().describe("Search timestamp range start, ISO 8601."),
  searched_to: z.string().optional().describe("Search timestamp range end, ISO 8601."),
  limit: z.number().int().positive().max(500).optional().describe("Max rows to return (default 100)."),
};

export function registerGetSearchCoverage(server: McpServer) {
  server.registerTool(
    "get_search_coverage",
    {
      description:
        "State-and-sport search coverage rolled up from tournament_search_run_scopes (the coverage source of truth): " +
        "run counts, qualified yield rate, unresolved-verification counts, known organizer domains, and next-search hints.",
      inputSchema: MCP_SCHEMA,
      outputSchema: getSearchCoverageOutput
    },
    async (input) => {
      const raw = input as { sport?: string; state?: string; window_from?: string; window_to?: string; searched_from?: string; searched_to?: string; limit?: number };
      const args = getSearchCoverageInput.parse({
        sports: raw.sport ? [raw.sport] : undefined,
        states: raw.state ? [raw.state] : undefined,
        window_from: raw.window_from,
        window_to: raw.window_to,
        searched_from: raw.searched_from,
        searched_to: raw.searched_to,
        limit: raw.limit,
      });
      const data = await getSearchCoverage(args);
      const parsed = getSearchCoverageOutput.parse({ data });
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
