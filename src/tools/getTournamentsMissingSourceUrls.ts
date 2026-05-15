import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getTournamentsMissingSourceUrls } from "../lib/queries";
import {
  getTournamentsMissingSourceUrlsInput,
  getTournamentsMissingSourceUrlsOutput,
  getTournamentsMissingSourceUrlsToolOutput
} from "../lib/schemas";

export function registerGetTournamentsMissingSourceUrls(server: McpServer) {
  server.registerTool(
    "get_tournaments_missing_source_urls",
    {
      description:
        "List tournaments missing source URLs (supports source_url/source_urls when present; returns [] if neither exists).",
      inputSchema: getTournamentsMissingSourceUrlsInput,
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
