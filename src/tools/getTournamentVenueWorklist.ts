import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getTournamentVenueWorklist } from "../lib/queries";
import { getTournamentVenueWorklistInput, getTournamentVenueWorklistOutput } from "../lib/schemas";

export function registerGetTournamentVenueWorklist(server: McpServer) {
  server.registerTool(
    "get_tournament_venue_worklist",
    {
      description:
        "Returns near-term tournaments joined to their venue data, with venue status (missing / incomplete / complete) and a priority score. Defaults to tournaments starting 2–6 weeks from today — no date math needed by the caller. Use venue_status='missing_or_incomplete' to focus an ops worklist. Supports sport[], state[], and explicit date_from/date_to overrides.",
      inputSchema: getTournamentVenueWorklistInput,
      outputSchema: getTournamentVenueWorklistOutput
    },
    async (input) => {
      const filters = getTournamentVenueWorklistInput.parse(input ?? {});
      const data = await getTournamentVenueWorklist(filters);
      const parsed = getTournamentVenueWorklistOutput.parse(data);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
