import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getTournaments } from "../lib/queries";
import { getTournamentsInput, getTournamentsOutput, getTournamentsToolOutput } from "../lib/schemas";

const MCP_SCHEMA = {
  name: z.string().optional().describe("Partial tournament name to search (case-insensitive)."),
  sport: z.string().optional().describe("Sport filter: soccer, baseball, softball, lacrosse, basketball, hockey, volleyball, futsal."),
  state: z.string().optional().describe("2-letter US state code, e.g. CA or TX."),
  start_date_from: z.string().optional().describe("Filter tournaments with start_date on or after this date, YYYY-MM-DD."),
  start_date_to: z.string().optional().describe("Filter tournaments with start_date on or before this date, YYYY-MM-DD."),
  organizer_domain: z.string().optional().describe("Root domain to match against official_website_url, e.g. gotsoccer.com."),
  limit: z.number().int().positive().max(100).optional().default(25).describe("Max rows to return (default 25, max 100)."),
  offset: z.number().int().nonnegative().optional().default(0).describe("Pagination offset, 0-based."),
};

export function registerGetTournaments(server: McpServer) {
  server.registerTool(
    "get_tournaments",
    {
      description:
        "Search production tournaments by name, sport, state, date range, or organizer domain. Use this to detect duplicates before inserting a new tournament candidate.",
      inputSchema: MCP_SCHEMA,
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
