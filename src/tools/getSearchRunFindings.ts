import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSearchRunFindings } from "../lib/searchHistoryQueries";
import { getSearchRunFindingsInput, getSearchRunFindingsOutput } from "../lib/searchHistorySchemas";

export function registerGetSearchRunFindings(server: McpServer) {
  server.registerTool(
    "get_search_run_findings",
    {
      description:
        "List tournament-discovery findings. Defaults to current (non-superseded) findings only. Filter by run, scope, " +
        "state, sport, candidate_status, organizer_domain, or tournament-window (window_from/window_to).",
      inputSchema: getSearchRunFindingsInput,
      outputSchema: getSearchRunFindingsOutput
    },
    async (input) => {
      const args = getSearchRunFindingsInput.parse(input ?? {});
      const { data, total } = await getSearchRunFindings(args);
      const parsed = getSearchRunFindingsOutput.parse({ data, total, limit: args.limit, offset: args.offset });
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
