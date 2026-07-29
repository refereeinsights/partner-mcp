import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { insertCompleteSearchPackage } from "../lib/searchHistoryQueries";
import {
  insertCompleteSearchPackageInput,
  insertCompleteSearchPackageOutput,
} from "../lib/searchHistorySchemas";

// mcp-handler requires real Zod types for inputSchema — passing a plain JSON
// Schema object (even as `any`) causes it to produce an empty inputSchema at
// the MCP protocol level, so the Python client rejects all nested parameters
// as UnrecognizedKwargsError.
//
// Use z.any() for the complex nested fields so the SDK converts the schema
// cleanly (each field appears as a recognized parameter). Real validation
// runs inside the callback via insertCompleteSearchPackageInput.parse().
const MCP_SCHEMA = {
  run: z.any().describe(
    "Search run descriptor (required). Must include source_batch_id. Optional: " +
    "region_name, states (string[]), sports (string[]), date_from, date_to, " +
    "search_method, research_agent, research_model, searched_at, searched_by, " +
    "search_summary, unresolved_work, next_action, next_search_after, " +
    "seasonality_conclusion, organizer_domains (string[]), organizer_names (string[]), " +
    "venue_names (string[]), high_value_sources (string[]), search_prompt_text."
  ),
  scopes: z.array(z.any()).min(1).describe(
    "Array of scope objects, min 1. Each: { state: string, sport: string }."
  ),
  findings: z.array(z.any()).max(100).optional().default([]).describe(
    "Array of finding objects, max 100. Each requires candidate_status. Optional: " +
    "search_scope_index (int, zero-based index into scopes), tournament_name, sport, " +
    "start_date, end_date, state, source_url (raw URL), venue_name, venue_address, " +
    "venue_city, venue_state, venue_source_url, organizer_name, organizer_domain, " +
    "notes, supersedes_finding_id."
  ),
  organizer_intelligence: z.array(z.any()).optional().default([]).describe(
    "Array of organizer intelligence objects. Each requires: organizer_domain, " +
    "confidence_level (High/Medium/Low), evidence_summary. Optional: organizer_name, " +
    "states (string[]), sports (string[]), tournament_families (string[]), " +
    "venue_clusters (string[]), monitoring_urls (string[]), recommended_cadence, " +
    "next_monitor_after (YYYY-MM-DD), registration_platform, scheduling_platform, notes."
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
        "Idempotent via source_batch_id — returns status 'created' on first call, 'reused' " +
        "if the run already exists with no conflicts, or 'conflict' if key fields differ. " +
        "Requires ENABLE_SEARCH_HISTORY_WRITES=true. Also requires the " +
        "insert_complete_search_package_rpc migration to be applied.",
      inputSchema: MCP_SCHEMA,
    },
    async (input) => {
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
