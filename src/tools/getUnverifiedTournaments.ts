import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getUnverifiedTournaments } from "../lib/queries";
import {
  getUnverifiedTournamentsInput,
  getUnverifiedTournamentsOutput,
  getUnverifiedTournamentsToolOutput
} from "../lib/schemas";

export function registerGetUnverifiedTournaments(server: McpServer) {
  server.registerTool(
    "get_unverified_tournaments",
    {
      description:
        "List tournaments that appear unverified (supports verified_at/is_verified/verification_status when present; returns [] if none exist).",
      inputSchema: getUnverifiedTournamentsInput,
      outputSchema: getUnverifiedTournamentsToolOutput
    },
    async (input) => {
      const args = getUnverifiedTournamentsInput.parse(input ?? {});
      const data = await getUnverifiedTournaments(args);
      const parsed = getUnverifiedTournamentsOutput.parse(data);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: { data: parsed }
      };
    }
  );
}
