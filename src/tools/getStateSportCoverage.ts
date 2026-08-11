import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getStateSportCoverage } from "../lib/queries";
import { getStateSportCoverageOutput, getStateSportCoverageToolOutput } from "../lib/schemas";

const MCP_SCHEMA = {
  sport: z.string().optional().describe("Single sport filter: soccer, baseball, softball, lacrosse, basketball, hockey, volleyball, futsal."),
  state: z.string().optional().describe("Single 2-letter US state code, e.g. CA or TX."),
  limit: z.number().int().positive().max(200).optional().describe("Max rows to return."),
};

export function registerGetStateSportCoverage(server: McpServer) {
  server.registerTool(
    "get_state_sport_coverage",
    {
      description: "Grouped tournament counts by sport and state with missing website/director email counts.",
      inputSchema: MCP_SCHEMA,
      outputSchema: getStateSportCoverageToolOutput
    },
    async (input) => {
      const raw = input as { sport?: string; state?: string; limit?: number };
      const data = await getStateSportCoverage({
        sports: raw.sport ? [raw.sport] : undefined,
        states: raw.state ? [raw.state] : undefined,
        limit: raw.limit,
      });
      const parsed = getStateSportCoverageOutput.parse(data);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: { data: parsed }
      };
    }
  );
}
