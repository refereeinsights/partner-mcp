import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSearchOrganizerIntelligence } from "../lib/searchHistoryQueries";
import {
  getSearchOrganizerIntelligenceInput,
  getSearchOrganizerIntelligenceOutput
} from "../lib/searchHistorySchemas";

export function registerGetSearchOrganizerIntelligence(server: McpServer) {
  server.registerTool(
    "get_search_organizer_intelligence",
    {
      description:
        "Query stored organizer ecosystem intelligence attached to tournament-discovery search runs. " +
        "Filter by search run, organizer domain, confidence level, state, sport, or next-monitor date window. " +
        "Returns newest rows first. " +
        "Does not join to production organizer or tournament tables.",
      inputSchema: getSearchOrganizerIntelligenceInput,
      outputSchema: getSearchOrganizerIntelligenceOutput
    },
    async (input) => {
      const args = getSearchOrganizerIntelligenceInput.parse(input ?? {});
      const result = await getSearchOrganizerIntelligence(args);
      const parsed = getSearchOrganizerIntelligenceOutput.parse(result);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
