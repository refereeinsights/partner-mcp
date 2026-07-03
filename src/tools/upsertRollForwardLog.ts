import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { upsertRollForwardLog } from "../lib/queries";
import { upsertRollForwardLogInput, upsertRollForwardLogOutput } from "../lib/schemas";

export function registerUpsertRollForwardLog(server: McpServer) {
  server.registerTool(
    "upsert_roll_forward_log",
    {
      description:
        "Insert or update a tournament roll-forward log entry. Upserts on (parent_tournament_id, target_year). Use this to record research outcomes: set status to 'done' when future dates are confirmed, 'no_dates_announced' when no announcement found, 'discontinued' when the tournament series is no longer running, or 'ambiguous' when results are unclear. Requires ENABLE_MCP_WRITES=true.",
      inputSchema: upsertRollForwardLogInput,
      outputSchema: upsertRollForwardLogOutput
    },
    async (input) => {
      const args = upsertRollForwardLogInput.parse(input ?? {});
      const result = await upsertRollForwardLog(args);
      const parsed = upsertRollForwardLogOutput.parse(result);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
