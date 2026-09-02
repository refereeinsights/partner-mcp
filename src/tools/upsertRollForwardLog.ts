import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { upsertRollForwardLog } from "../lib/queries";
import { upsertRollForwardLogInput, upsertRollForwardLogOutput } from "../lib/schemas";

// Plain MCP_SCHEMA — no ZodEffects; full validation happens in the callback.
const MCP_SCHEMA = {
  parent_tournament_id: z.string().uuid().describe("Production parent tournament UUID."),
  target_year: z.number().int().min(2020).max(2040).describe("Target roll-forward year, e.g. 2027."),
  status: z.enum([
    "unresearched", "pending", "no_dates_announced", "discontinued",
    "done", "ambiguous", "ready_to_create", "linked_existing",
  ]).describe(
    "Research status. Transitions are validated server-side. " +
    "done and discontinued are terminal for the target-year cycle. " +
    "ready_to_create: verified target staged, no production child found. " +
    "linked_existing: confirmed production child identified."
  ),
  batch_label: z.string().optional().describe("Research batch label, max 200 chars."),
  notes: z.string().optional().describe("Research notes, max 10 000 chars."),
  sibling_id: z.string().uuid().optional().describe(
    "UUID of the confirmed production target-year tournament. " +
    "Cannot replace an existing confirmed sibling without explicit review."
  ),
  researched_at: z.string().optional().describe("ISO 8601 datetime of research completion."),
  // Target-year staging fields — only provided fields are updated on an existing row.
  target_name: z.string().optional().describe("Verified target-year tournament name."),
  target_start_date: z.string().optional().describe("Verified target start date, YYYY-MM-DD."),
  target_end_date: z.string().optional().describe("Verified target end date, YYYY-MM-DD."),
  target_source_url: z.string().optional().describe("Source URL confirming target-year event."),
  target_venue_name: z.string().optional().describe("Verified target venue name."),
  target_venue_address: z.string().optional().describe("Verified target venue street address."),
  target_venue_city: z.string().optional().describe("Verified target venue city."),
  target_venue_state: z.string().optional().describe("Verified target venue 2-letter state code."),
  target_venue_source_url: z.string().optional().describe("Source URL for venue information."),
  target_organizer_domain: z.string().optional().describe("Normalized organizer website hostname."),
  production_match_id: z.string().uuid().optional().describe("UUID of candidate production match (pre-confirmation staging)."),
  match_confidence: z.enum(["explicit", "deterministic", "likely"]).optional().describe("Confidence level of the production match."),
  recommended_action: z.enum(["link_existing", "create_new", "manual_review"]).optional().describe("Recommended next action based on research outcome."),
  verified_dates: z.boolean().optional().describe("Dates confirmed from an authoritative source."),
  verified_source: z.boolean().optional().describe("Source URL confirmed and accessible."),
  verified_venue: z.boolean().optional().describe("Venue confirmed for target year."),
  verified_youth_scope: z.boolean().optional().describe("Youth scope (age groups/divisions) confirmed."),
  last_checked_at: z.string().optional().describe("ISO 8601 datetime of most recent check."),
  next_check_at: z.string().optional().describe("ISO 8601 datetime to recheck (for no_dates_announced)."),
};

export function registerUpsertRollForwardLog(server: McpServer) {
  server.registerTool(
    "upsert_roll_forward_log",
    {
      description:
        "Stage or update a tournament roll-forward research entry on (parent_tournament_id, target_year). " +
        "Validates status transitions server-side — done and discontinued are terminal for the target-year cycle. " +
        "Only provided fields are updated on existing rows; sibling_id is protected against silent replacement. " +
        "Write target-year staging fields (name, dates, venue, source URL) and verification flags as research progresses. " +
        "Statuses: unresearched → pending → no_dates_announced / ambiguous / ready_to_create / linked_existing / done / discontinued. " +
        "Requires ENABLE_MCP_WRITES=true.",
      inputSchema: MCP_SCHEMA,
      outputSchema: upsertRollForwardLogOutput,
    },
    async (input) => {
      const args = upsertRollForwardLogInput.parse(input ?? {});
      const result = await upsertRollForwardLog(args);
      const parsed = upsertRollForwardLogOutput.parse(result);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed,
      };
    }
  );
}
