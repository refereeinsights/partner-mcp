import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getUnverifiedTournaments } from "../lib/queries";
import { getUnverifiedTournamentsInput, getUnverifiedTournamentsOutput, getUnverifiedTournamentsToolOutput } from "../lib/schemas";

const MCP_SCHEMA = {
  sport: z.string().optional().describe("Sport filter: soccer, baseball, softball, lacrosse, basketball, hockey, volleyball, futsal."),
  state: z.string().optional().describe("2-letter US state code, e.g. CA or TX."),
  limit: z.number().int().positive().max(200).optional().default(100).describe("Max rows to return (default 100)."),
  offset: z.number().int().nonnegative().optional().default(0).describe("Pagination offset, 0-based."),
};

export function registerGetUnverifiedTournaments(server: McpServer) {
  server.registerTool(
    "get_unverified_tournaments",
    {
      description: "List tournaments that appear unverified. Returns id, name, slug, sport, city, state, address, zip, dates, website, and contact fields.",
      inputSchema: MCP_SCHEMA,
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
