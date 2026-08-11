import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getRollForwardLog } from "../lib/queries";
import { getRollForwardLogInput, getRollForwardLogOutput, getRollForwardLogToolOutput } from "../lib/schemas";

const MCP_SCHEMA = {
  status: z.enum(["pending", "no_dates_announced", "discontinued", "done", "ambiguous"]).optional().describe("Filter by roll-forward status."),
  target_year: z.number().int().min(2020).max(2040).optional().describe("Year being rolled forward into."),
  batch_label: z.string().optional().describe("Batch label to filter by."),
  sport: z.string().optional().describe("Sport filter: soccer, baseball, softball, lacrosse, basketball, hockey, volleyball, futsal."),
  state: z.string().optional().describe("2-letter US state code, e.g. CA or TX."),
  limit: z.number().int().positive().max(500).optional().describe("Max rows to return (default 100)."),
  offset: z.number().int().nonnegative().optional().describe("Pagination offset, 0-based."),
};

export function registerGetRollForwardLog(server: McpServer) {
  server.registerTool(
    "get_roll_forward_log",
    {
      description:
        "List tournament roll-forward research log entries. Returns parent tournament context (slug, address, zip, dates, sport, state) alongside each log row so a GPT researcher can identify which future-year tournaments need date research. Filterable by status, target_year, batch_label, sport, and state.",
      inputSchema: MCP_SCHEMA,
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
