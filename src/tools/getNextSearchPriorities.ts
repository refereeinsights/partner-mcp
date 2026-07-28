import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getNextSearchPriorities } from "../lib/searchHistoryQueries";
import { getNextSearchPrioritiesInput, getNextSearchPrioritiesOutput } from "../lib/searchHistorySchemas";

export function registerGetNextSearchPriorities(server: McpServer) {
  server.registerTool(
    "get_next_search_priorities",
    {
      description:
        "Recommend next state-and-sport search targets, scored by no-prior-coverage, staleness, low qualified yield, " +
        "unresolved verifications, and next_search_after. Only surfaces combinations already present in " +
        "tournament_search_run_scopes — it cannot identify combinations that have never been searched.",
      inputSchema: getNextSearchPrioritiesInput,
      outputSchema: getNextSearchPrioritiesOutput
    },
    async (input) => {
      const args = getNextSearchPrioritiesInput.parse(input ?? {});
      const result = await getNextSearchPriorities(args);
      const parsed = getNextSearchPrioritiesOutput.parse(result);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
