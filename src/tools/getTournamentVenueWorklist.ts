import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getTournamentVenueWorklist } from "../lib/queries";
import { getTournamentVenueWorklistInput, getTournamentVenueWorklistOutput } from "../lib/schemas";

const MCP_SCHEMA = {
  date_from: z.string().optional().describe("Explicit start date filter, YYYY-MM-DD (overrides weeks_from_now_start)."),
  date_to: z.string().optional().describe("Explicit end date filter, YYYY-MM-DD (overrides weeks_from_now_end)."),
  weeks_from_now_start: z.number().int().min(0).max(52).optional().describe("Window start as weeks from today (default 2)."),
  weeks_from_now_end: z.number().int().min(0).max(52).optional().describe("Window end as weeks from today (default 6)."),
  sport: z.string().optional().describe("Single sport filter: soccer, baseball, softball, lacrosse, basketball, hockey, volleyball, futsal."),
  state: z.string().optional().describe("Single 2-letter US state code, e.g. CA or TX."),
  venue_status: z.enum(["missing", "incomplete", "missing_or_incomplete", "complete", "any"]).optional().describe("Filter by venue completeness (default 'any')."),
  limit: z.number().int().positive().max(500).optional().describe("Max rows to return (default 100)."),
  offset: z.number().int().nonnegative().optional().describe("Pagination offset, 0-based."),
};

export function registerGetTournamentVenueWorklist(server: McpServer) {
  server.registerTool(
    "get_tournament_venue_worklist",
    {
      description:
        "Returns near-term tournaments joined to their venue data, with venue status (missing / incomplete / complete) and a priority score. Defaults to tournaments starting 2–6 weeks from today — no date math needed by the caller. Use venue_status='missing_or_incomplete' to focus an ops worklist. Supports sport and state filters.",
      inputSchema: MCP_SCHEMA,
      outputSchema: getTournamentVenueWorklistOutput
    },
    async (input) => {
      const raw = input as {
        date_from?: string; date_to?: string;
        weeks_from_now_start?: number; weeks_from_now_end?: number;
        sport?: string; state?: string;
        venue_status?: "missing" | "incomplete" | "missing_or_incomplete" | "complete" | "any";
        limit?: number; offset?: number;
      };
      const filters = getTournamentVenueWorklistInput.parse({
        date_from: raw.date_from,
        date_to: raw.date_to,
        weeks_from_now_start: raw.weeks_from_now_start,
        weeks_from_now_end: raw.weeks_from_now_end,
        sports: raw.sport ? [raw.sport] : undefined,
        states: raw.state ? [raw.state] : undefined,
        venue_status: raw.venue_status,
        limit: raw.limit,
        offset: raw.offset,
      });
      const data = await getTournamentVenueWorklist(filters);
      const parsed = getTournamentVenueWorklistOutput.parse(data);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
