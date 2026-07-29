import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { insertCompleteSearchPackage } from "../lib/searchHistoryQueries";
import {
  insertCompleteSearchPackageInput,
  insertCompleteSearchPackageOutput,
} from "../lib/searchHistorySchemas";

// Explicit JSON Schema for the MCP inputSchema — the SDK cannot reliably
// convert deeply nested Zod schemas (z.object inside z.object) to valid
// JSON Schema, which causes the Python MCP client to report all top-level
// parameters as "unrecognized kwargs". Zod is still used for runtime
// validation inside the callback.
const PACKAGE_INPUT_SCHEMA = {
  type: "object" as const,
  required: ["run", "scopes"],
  additionalProperties: false,
  properties: {
    run: {
      type: "object",
      description: "Search run descriptor. source_batch_id is required.",
      required: ["source_batch_id"],
      additionalProperties: true,
      properties: {
        source_batch_id: { type: "string", description: "Stable idempotency key for this search run (required)." },
        region_name: { type: "string", description: "Free-text region label, e.g. Southern California." },
        states: { type: "array", items: { type: "string" }, description: "2-letter US state codes covered." },
        sports: { type: "array", items: { type: "string" }, description: "Sports covered (soccer, baseball, softball, lacrosse, basketball, hockey, volleyball, futsal)." },
        date_from: { type: "string", description: "Tournament window start searched, YYYY-MM-DD." },
        date_to: { type: "string", description: "Tournament window end searched, YYYY-MM-DD." },
        search_method: { type: "string", description: "Free-text description of the search methodology." },
        research_agent: { type: "string", description: "Name or identifier of the agent that performed the search." },
        research_model: { type: "string", description: "Model identifier used for the search." },
        searched_at: { type: "string", description: "ISO 8601 timestamp when the search was performed." },
        searched_by: { type: "string", description: "Identifier of who or what ran the search." },
        search_prompt_version: { type: "string", description: "Version label of the research prompt used." },
        search_prompt_text: { type: "string", description: "Full research prompt text." },
        search_summary: { type: "string", description: "Freeform summary of the search run." },
        unresolved_work: { type: "string", description: "Freeform description of unresolved follow-up work." },
        next_action: { type: "string", description: "Recommended next action for this state/sport." },
        next_search_after: { type: "string", description: "Date (YYYY-MM-DD) after which this should be searched again." },
        seasonality_conclusion: { type: "string", description: "Freeform note on seasonal patterns observed." },
        organizer_domains: { type: "array", items: { type: "string" }, description: "Organizer domains discovered." },
        organizer_names: { type: "array", items: { type: "string" }, description: "Organizer display names discovered." },
        venue_names: { type: "array", items: { type: "string" }, description: "Venue names discovered." },
        high_value_sources: { type: "array", items: { type: "string" }, description: "High-value monitoring URLs discovered." },
      },
    },
    scopes: {
      type: "array",
      description: "One entry per (state, sport) combination searched. Minimum 1.",
      minItems: 1,
      items: {
        type: "object",
        required: ["state", "sport"],
        additionalProperties: false,
        properties: {
          state: { type: "string", description: "2-letter US state code, e.g. CA or TX." },
          sport: { type: "string", description: "Sport name (soccer, baseball, softball, lacrosse, basketball, hockey, volleyball, futsal)." },
        },
      },
    },
    findings: {
      type: "array",
      description: "Tournament-discovery findings. Max 100. For single-scope packages, scope is auto-assigned. For multi-scope packages, set search_scope_index.",
      maxItems: 100,
      items: {
        type: "object",
        required: ["candidate_status"],
        additionalProperties: true,
        properties: {
          search_scope_index: { type: "integer", description: "Zero-based index into the scopes array. Required when there are multiple scopes." },
          candidate_status: {
            type: "string",
            enum: [
              "Qualified",
              "Needs Venue Verification",
              "Needs Address Verification",
              "Needs Date Verification",
              "Out of Scope - State",
              "Out of Scope - Date",
              "Out of Scope - Sport",
              "Not a Tournament",
              "Duplicate",
              "Other Exclusion",
            ],
          },
          tournament_name: { type: "string" },
          sport: { type: "string" },
          start_date: { type: "string", description: "YYYY-MM-DD" },
          end_date: { type: "string", description: "YYYY-MM-DD" },
          state: { type: "string", description: "2-letter US state code." },
          source_url: { type: "string", description: "Raw HTTP/HTTPS URL — not markdown [text](url) syntax." },
          venue_name: { type: "string" },
          venue_address: { type: "string" },
          venue_city: { type: "string" },
          venue_state: { type: "string", description: "2-letter US state code." },
          venue_source_url: { type: "string", description: "Raw HTTP/HTTPS URL verifying the venue." },
          existing_tournament_id: { type: "string", description: "UUID of a production tournament this finding may correspond to." },
          organizer_name: { type: "string" },
          organizer_domain: { type: "string" },
          notes: { type: "string" },
          supersedes_finding_id: { type: "string", description: "UUID of the prior finding this one replaces." },
        },
      },
    },
    organizer_intelligence: {
      type: "array",
      description: "Per-organizer ecosystem intelligence. organizer_domain, confidence_level, and evidence_summary are required per entry.",
      items: {
        type: "object",
        required: ["organizer_domain", "confidence_level", "evidence_summary"],
        additionalProperties: true,
        properties: {
          organizer_domain: { type: "string", description: "Root domain, e.g. gotsoccer.com." },
          organizer_name: { type: "string", description: "Display name of the organizer." },
          confidence_level: { type: "string", enum: ["High", "Medium", "Low"] },
          evidence_summary: { type: "string", description: "Summary of evidence supporting this entry (required)." },
          states: { type: "array", items: { type: "string" }, description: "States where this organizer operates." },
          sports: { type: "array", items: { type: "string" }, description: "Sports this organizer runs." },
          tournament_families: { type: "array", items: { type: "string" }, description: "Recurring tournament name families." },
          venue_clusters: { type: "array", items: { type: "string" }, description: "Facilities this organizer recurringly uses." },
          monitoring_urls: { type: "array", items: { type: "string" }, description: "HTTP/HTTPS URLs to monitor." },
          recommended_cadence: { type: "string", description: "Free-text monitoring cadence, e.g. Monthly." },
          next_monitor_after: { type: "string", description: "YYYY-MM-DD date to check again." },
          registration_platform: { type: "string" },
          scheduling_platform: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
    finalize: {
      type: "boolean",
      description: "If true (default), reconcile metrics and mark the run completed in the same transaction.",
    },
  },
};

export function registerInsertCompleteSearchPackage(server: McpServer) {
  server.registerTool(
    "insert_complete_search_package",
    {
      description:
        "Atomically record a complete tournament-discovery search package (run + scopes + findings + organizer intelligence) " +
        "in one call, then optionally finalize the run. Idempotent via source_batch_id — returns status 'created' on first " +
        "call, 'reused' if the run already exists with no conflicts, or 'conflict' if key fields differ. " +
        "Requires ENABLE_SEARCH_HISTORY_WRITES=true. Also requires the insert_complete_search_package_rpc migration.",
      inputSchema: PACKAGE_INPUT_SCHEMA as any,
    },
    async (input: Record<string, unknown>) => {
      const args = insertCompleteSearchPackageInput.parse(input ?? {});
      const result = await insertCompleteSearchPackage(args);
      const parsed = insertCompleteSearchPackageOutput.parse(result);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed,
      };
    }
  );
}
