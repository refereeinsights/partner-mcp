import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSearchRuns } from "../lib/searchHistoryQueries";
import { getSearchRunsInput, getSearchRunsOutput } from "../lib/searchHistorySchemas";

export function registerGetSearchRuns(server: McpServer) {
  server.registerTool(
    "get_search_runs",
    {
      description:
        "List tournament-discovery search runs (operational research data), newest first. Filter by state, sport, " +
        "region, status, tournament-window (window_from/window_to), or search timestamp (searched_from/searched_to).",
      inputSchema: getSearchRunsInput,
      outputSchema: getSearchRunsOutput
    },
    async (input) => {
      const args = getSearchRunsInput.parse(input ?? {});
      const { data, total } = await getSearchRuns(args);
      const parsed = getSearchRunsOutput.parse({ data, total, limit: args.limit, offset: args.offset });
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
