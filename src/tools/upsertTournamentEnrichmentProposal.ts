import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { upsertTournamentEnrichmentProposal } from "../lib/enrichmentQueries";
import {
  upsertTournamentEnrichmentProposalInput,
  upsertTournamentEnrichmentProposalOutput,
} from "../lib/enrichmentSchemas";

const PROPOSED_VALUE_DESCRIPTION = `
JSON string (object) with shape determined by action_type:

add_official_source      → {"url": "https://..."}
correct_dates            → {"start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD"}
add_venue / add_additional_venue / correct_venue
                         → {"name": "...", "address": "...", "city": "...", "state": "TX", "zip": "...", "sport": "..."}
correct_tournament_location → {"city": "...", "state": "TX"}
merge_duplicate          → {"duplicate_tournament_id": "uuid", "duplicate_name": "...", "duplicate_slug": "..."}
manual_review            → {"issue": "description of issue requiring human review"}

For correct_venue, also supply venue_id (separate field).
For merge_duplicate, duplicate_tournament_id is required.
`.trim();

const MCP_SCHEMA = {
  tournament_id: z.string().uuid().describe("Production tournament UUID to enrich."),
  action_type: z.enum([
    "add_official_source",
    "correct_dates",
    "add_venue",
    "add_additional_venue",
    "correct_venue",
    "correct_tournament_location",
    "merge_duplicate",
    "manual_review",
  ]).describe("Type of enrichment proposal."),
  proposed_value_json: z.string().min(1).describe(PROPOSED_VALUE_DESCRIPTION),
  status: z.enum(["pending_review", "needs_verification"]).optional()
    .describe("Proposal status. Default: pending_review. Use needs_verification when evidence is unresolved."),
  venue_id: z.string().uuid().optional()
    .describe("Required when action_type is correct_venue. Must be a venue already linked to this tournament."),
  source_url: z.string().optional()
    .describe("URL of the event/tournament page used as evidence."),
  venue_source_url: z.string().optional()
    .describe("URL of the venue evidence page (for venue actions). Stored separately from source_url."),
  confidence: z.enum(["high", "medium", "low"]).optional()
    .describe("Research confidence level. Default: medium."),
  evidence_summary: z.string().min(1)
    .describe("Explain why this proposed change is correct and why the source is authoritative."),
  research_notes: z.string().optional()
    .describe("Additional notes for human reviewer."),
  source_batch_id: z.string().optional()
    .describe("Stable batch label e.g. enrichment-2026-09-03-batch-01 or search-run-abc123."),
  proposed_by: z.string().optional()
    .describe("Free-text agent/tool identity e.g. ti-organizer-intelligence, partner-mcp."),
  researched_at: z.string().optional()
    .describe("ISO 8601 datetime when research was completed."),
  field_name: z.string().optional()
    .describe("Optional field name for single-field proposals. Null for multi-field actions."),
};

export function registerUpsertTournamentEnrichmentProposal(server: McpServer) {
  server.registerTool(
    "upsert_tournament_enrichment_proposal",
    {
      description:
        "Stage an enrichment proposal for a production tournament. " +
        "Writes ONLY to tournament_enrichment_proposals — never mutates production tournaments or venue links. " +
        "current_value is captured from production at write time. " +
        "Duplicate active proposals are detected and updated in place rather than duplicated. " +
        "Applied/rejected history is never overwritten. " +
        "Requires ENABLE_MCP_WRITES=true.",
      inputSchema: MCP_SCHEMA,
      outputSchema: upsertTournamentEnrichmentProposalOutput,
    },
    async (input) => {
      const args = upsertTournamentEnrichmentProposalInput.parse(input ?? {});
      const result = upsertTournamentEnrichmentProposalOutput.parse(
        await upsertTournamentEnrichmentProposal(args),
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );
}
