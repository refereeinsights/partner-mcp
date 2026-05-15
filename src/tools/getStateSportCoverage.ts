import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getStateSportCoverage } from "../lib/queries";
import {
  getStateSportCoverageInput,
  getStateSportCoverageOutput,
  getStateSportCoverageToolOutput
} from "../lib/schemas";

export function registerGetStateSportCoverage(server: McpServer) {
  server.registerTool(
    "get_state_sport_coverage",
    {
      description:
        "Grouped counts by sport and state with missing website/director email counts",
      inputSchema: getStateSportCoverageInput,
      outputSchema: getStateSportCoverageToolOutput
    },
    async (input) => {
      const filters = getStateSportCoverageInput.parse(input ?? {});
      const data = await getStateSportCoverage(filters);
      const parsed = getStateSportCoverageOutput.parse(data);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: { data: parsed }
      };
    }
  );
}
