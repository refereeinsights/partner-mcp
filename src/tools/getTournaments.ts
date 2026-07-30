import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getTournaments } from "../lib/queries";
import {
  getTournamentsInput,
  getTournamentsOutput,
  getTournamentsToolOutput
} from "../lib/schemas";

export function registerGetTournaments(server: McpServer) {
  server.registerTool(
    "get_tournaments",
    {
      description:
        "Search production tournaments by name, sport, state, date range, or organizer domain. Use this to detect duplicates before inserting a new tournament candidate.",
      inputSchema: getTournamentsInput,
      outputSchema: getTournamentsToolOutput
    },
    async (input) => {
      const args = getTournamentsInput.parse(input ?? {});
      const raw = await getTournaments(args);
      const parsed = getTournamentsOutput.parse(raw);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
