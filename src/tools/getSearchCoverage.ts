import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSearchCoverage } from "../lib/searchHistoryQueries";
import { getSearchCoverageInput, getSearchCoverageOutput } from "../lib/searchHistorySchemas";

export function registerGetSearchCoverage(server: McpServer) {
  server.registerTool(
    "get_search_coverage",
    {
      description:
        "State-and-sport search coverage rolled up from tournament_search_run_scopes (the coverage source of truth): " +
        "run counts, qualified yield rate, unresolved-verification counts, known organizer domains, and next-search hints.",
      inputSchema: getSearchCoverageInput,
      outputSchema: getSearchCoverageOutput
    },
    async (input) => {
      const args = getSearchCoverageInput.parse(input ?? {});
      const data = await getSearchCoverage(args);
      const parsed = getSearchCoverageOutput.parse({ data });
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
