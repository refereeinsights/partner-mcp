import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getRollForwardLog } from "../lib/queries";
import { getRollForwardLogInput, getRollForwardLogOutput, getRollForwardLogToolOutput } from "../lib/schemas";

export function registerGetRollForwardLog(server: McpServer) {
  server.registerTool(
    "get_roll_forward_log",
    {
      description:
        "List tournament roll-forward research log entries. Returns parent tournament context (slug, address, zip, dates, sport, state) alongside each log row so a GPT researcher can identify which future-year tournaments need date research. Filterable by status, target_year, batch_label, sport, and state.",
      inputSchema: getRollForwardLogInput,
      outputSchema: getRollForwardLogToolOutput
    },
    async (input) => {
      const args = getRollForwardLogInput.parse(input ?? {});
      const data = await getRollForwardLog(args);
      const parsed = getRollForwardLogOutput.parse(data);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: { data: parsed }
      };
    }
  );
}
