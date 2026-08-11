import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getTournamentsMissingSourceUrls } from "../lib/queries";
import { getTournamentsMissingSourceUrlsInput, getTournamentsMissingSourceUrlsOutput, getTournamentsMissingSourceUrlsToolOutput } from "../lib/schemas";

const MCP_SCHEMA = {
  sport: z.string().optional().describe("Sport filter: soccer, baseball, softball, lacrosse, basketball, hockey, volleyball, futsal."),
  state: z.string().optional().describe("2-letter US state code, e.g. CA or TX."),
  limit: z.number().int().positive().max(200).optional().describe("Max rows to return."),
  offset: z.number().int().nonnegative().optional().describe("Pagination offset, 0-based."),
};

export function registerGetTournamentsMissingSourceUrls(server: McpServer) {
  server.registerTool(
    "get_tournaments_missing_source_urls",
    {
      description: "List tournaments with no source URL recorded.",
      inputSchema: MCP_SCHEMA,
      outputSchema: getTournamentsMissingSourceUrlsToolOutput
    },
    async (input) => {
      const args = getTournamentsMissingSourceUrlsInput.parse(input ?? {});
      const data = await getTournamentsMissingSourceUrls(args);
      const parsed = getTournamentsMissingSourceUrlsOutput.parse(data);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: { data: parsed }
      };
    }
  );
}
