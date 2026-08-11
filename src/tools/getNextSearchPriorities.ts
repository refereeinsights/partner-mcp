import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getNextSearchPriorities } from "../lib/searchHistoryQueries";
import { getNextSearchPrioritiesInput, getNextSearchPrioritiesOutput } from "../lib/searchHistorySchemas";

const MCP_SCHEMA = {
  sport: z.string().optional().describe("Single sport filter: soccer, baseball, softball, lacrosse, basketball, hockey, volleyball, futsal."),
  state: z.string().optional().describe("Single 2-letter US state code, e.g. CA or TX."),
  window_from: z.string().optional().describe("Tournament window start date, YYYY-MM-DD."),
  window_to: z.string().optional().describe("Tournament window end date, YYYY-MM-DD."),
  limit: z.number().int().positive().max(200).optional().describe("Max rows to return (default 50)."),
};

export function registerGetNextSearchPriorities(server: McpServer) {
  server.registerTool(
    "get_next_search_priorities",
    {
      description:
        "Recommend next state-and-sport search targets, scored by no-prior-coverage, staleness, low qualified yield, " +
        "unresolved verifications, and next_search_after. Only surfaces combinations already present in " +
        "tournament_search_run_scopes — it cannot identify combinations that have never been searched.",
      inputSchema: MCP_SCHEMA,
      outputSchema: getNextSearchPrioritiesOutput
    },
    async (input) => {
      const raw = input as { sport?: string; state?: string; window_from?: string; window_to?: string; limit?: number };
      const args = getNextSearchPrioritiesInput.parse({
        sports: raw.sport ? [raw.sport] : undefined,
        states: raw.state ? [raw.state] : undefined,
        window_from: raw.window_from,
        window_to: raw.window_to,
        limit: raw.limit,
      });
      const result = await getNextSearchPriorities(args);
      const parsed = getNextSearchPrioritiesOutput.parse(result);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
