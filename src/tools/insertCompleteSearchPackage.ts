import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { insertCompleteSearchPackage } from "../lib/searchHistoryQueries";
import {
  insertCompleteSearchPackageInput,
  insertCompleteSearchPackageOutput,
} from "../lib/searchHistorySchemas";

// ChatGPT's MCP client only recognizes scalar parameter types (string, boolean, number).
// Array and object parameters are rejected as UnrecognizedKwargsError regardless of
// the JSON Schema type field. Accept complex fields as JSON strings; parse server-side.
const MCP_SCHEMA = {
  run_json: z.string().describe(
    'JSON string with the search run descriptor. Required field: source_batch_id. ' +
    'Example: {"source_batch_id":"batch-001","states":["CA"],"sports":["soccer"],"searched_at":"2026-07-29T12:00:00Z"}. ' +
    'Optional fields: region_name, states (string[]), sports (string[]), date_from, date_to, ' +
    'search_method, research_agent, research_model, searched_at, searched_by, search_summary, ' +
    'unresolved_work, next_action, next_search_after, seasonality_conclusion, ' +
    'organizer_domains (string[]), organizer_names (string[]), venue_names (string[]), ' +
    'high_value_sources (string[]), search_prompt_text.'
  ),
  scopes_json: z.string().describe(
    'JSON array string of scope objects, min 1. Each scope needs state and sport. ' +
    'Example: [{"state":"CA","sport":"soccer"},{"state":"CA","sport":"baseball"}]'
  ),
  findings_json: z.string().optional().default("[]").describe(
    'JSON array string of finding objects (default []). Max 100. Each requires candidate_status. ' +
    'Example: [{"candidate_status":"Qualified","tournament_name":"CA Cup","search_scope_index":0}]. ' +
    'Optional fields per finding: search_scope_index (int, zero-based index into scopes array), ' +
    'tournament_name, sport, start_date, end_date, state, source_url (raw URL only — no markdown), ' +
    'venue_name, venue_address, venue_city, venue_state, venue_source_url, ' +
    'organizer_name, organizer_domain, notes, supersedes_finding_id.'
  ),
  organizer_intelligence_json: z.string().optional().default("[]").describe(
    'JSON array string of organizer intelligence objects (default []). Required per entry: ' +
    'organizer_domain, confidence_level (High/Medium/Low), evidence_summary. ' +
    'Example: [{"organizer_domain":"gotsoccer.com","confidence_level":"High","evidence_summary":"Runs 20+ CA events/year"}]. ' +
    'Optional fields: organizer_name, states (string[]), sports (string[]), tournament_families (string[]), ' +
    'venue_clusters (string[]), monitoring_urls (string[]), recommended_cadence, ' +
    'next_monitor_after (YYYY-MM-DD), registration_platform, scheduling_platform, notes.'
  ),
  finalize: z.boolean().optional().default(true).describe(
    "If true (default), reconcile metrics and mark run completed in the same transaction."
  ),
};

export function registerInsertCompleteSearchPackage(server: McpServer) {
  server.registerTool(
    "insert_complete_search_package",
    {
      description:
        "Atomically record a complete tournament-discovery search package (run + scopes + " +
        "findings + organizer intelligence) in one call, then optionally finalize the run. " +
        "Pass run_json and scopes_json as JSON strings; findings_json and " +
        "organizer_intelligence_json default to []. " +
        "Idempotent via source_batch_id — returns status 'created' on first call, 'reused' " +
        "if the run already exists with no conflicts, or 'conflict' if key fields differ. " +
        "Requires ENABLE_SEARCH_HISTORY_WRITES=true.",
      inputSchema: MCP_SCHEMA,
    },
    async (input) => {
      const raw = input as {
        run_json: string;
        scopes_json: string;
        findings_json: string;
        organizer_intelligence_json: string;
        finalize: boolean;
      };
      const args = insertCompleteSearchPackageInput.parse({
        run: JSON.parse(raw.run_json),
        scopes: JSON.parse(raw.scopes_json),
        findings: JSON.parse(raw.findings_json ?? "[]"),
        organizer_intelligence: JSON.parse(raw.organizer_intelligence_json ?? "[]"),
        finalize: raw.finalize,
      });
      const result = await insertCompleteSearchPackage(args);
      const parsed = insertCompleteSearchPackageOutput.parse(result);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed,
      };
    }
  );
}
