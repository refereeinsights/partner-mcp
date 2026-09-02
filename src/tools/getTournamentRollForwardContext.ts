import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getTournamentRollForwardContext } from "../lib/queries";
import {
  getTournamentRollForwardContextInput,
  getTournamentRollForwardContextOutput,
} from "../lib/schemas";

const MCP_SCHEMA = {
  target_year: z.number().int().min(2020).max(2040).describe("Requested target sibling year."),
  parent_tournament_id: z.string().uuid().optional().describe("Production source tournament UUID."),
  parent_slug: z.string().optional().describe("Production source tournament slug."),
};

export function registerGetTournamentRollForwardContext(server: McpServer) {
  server.registerTool(
    "get_tournament_roll_forward_context",
    {
      description:
        "Read-only: return one production source tournament's full tournament, linked venue, " +
        "roll-forward-history, and target-year sibling-match context.",
      inputSchema: MCP_SCHEMA,
      outputSchema: getTournamentRollForwardContextOutput,
    },
    async (input) => {
      const args = getTournamentRollForwardContextInput.parse(input ?? {});
      const result = getTournamentRollForwardContextOutput.parse(
        await getTournamentRollForwardContext(args)
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );
}
