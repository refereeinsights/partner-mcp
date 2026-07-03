import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listToolsInput, listToolsOutput } from "../lib/schemas";

const TOOLS = [
  // Dataset / analytics
  { name: "get_summary_dashboard", category: "dataset", access: "read", description: "Overall dataset health plus top sports, states, organizers, and venues." },
  { name: "get_dataset_health", category: "dataset", access: "read", description: "Tournament count and percentage missing key fields (website, email, dates)." },
  { name: "get_trends", category: "dataset", access: "read", description: "Tournament additions by week, month, or quarter with cumulative totals." },
  { name: "get_state_sport_coverage", category: "dataset", access: "read", description: "Tournament counts broken down by state and sport." },
  { name: "get_email_outreach_numbers", category: "dataset", access: "read", description: "Outreach email totals: drafts, sent, replies, and followups sent." },
  { name: "get_association_dashboard", category: "dataset", access: "read", description: "Tournament coverage by tournament association." },
  { name: "get_admin_reference", category: "dataset", access: "read", description: "Internal reference data for admin workflows." },

  // Tournament discovery
  { name: "get_missing_fields", category: "tournament_discovery", access: "read", description: "Tournaments missing specified fields. Returns slug, address, zip." },
  { name: "get_missing_venues", category: "tournament_discovery", access: "read", description: "Tournaments with no linked venue." },
  { name: "get_tournament_venue_worklist", category: "tournament_discovery", access: "read", description: "Tournaments needing venue work, scored by proximity and data completeness." },
  { name: "get_unverified_tournaments", category: "tournament_discovery", access: "read", description: "Unverified tournaments. Returns id, name, slug, sport, city, state, address, zip, dates, website, contact fields." },
  { name: "get_tournaments_by_domain", category: "tournament_discovery", access: "read", description: "Tournaments whose official_website_url matches a root domain. Returns slug, address, zip." },
  { name: "get_tournaments_missing_source_urls", category: "tournament_discovery", access: "read", description: "Tournaments with no source URL. Returns slug, address, zip." },
  { name: "get_top_organizer_domains", category: "tournament_discovery", access: "read", description: "Organizer domains ranked by tournament count." },
  { name: "get_organizer_clusters", category: "tournament_discovery", access: "read", description: "Tournaments grouped by organizer with sport and state breakdown." },
  { name: "get_venue_clusters", category: "tournament_discovery", access: "read", description: "Tournaments grouped by venue with counts." },

  // Roll-forward research
  { name: "get_roll_forward_log", category: "roll_forward", access: "read", description: "Roll-forward research log entries with full parent tournament context: parent_slug, parent_address, parent_zip, parent_sport, parent_state, parent_city, parent_start_date, parent_end_date. Filterable by status, target_year, batch_label, sport, state." },
  { name: "upsert_roll_forward_log", category: "roll_forward", access: "write", description: "Insert or update a roll-forward log entry on (parent_tournament_id, target_year). Statuses: pending, no_dates_announced, discontinued, done, ambiguous. Requires ENABLE_MCP_WRITES=true." },

  // Partner / commercial
  { name: "get_partner_pipeline", category: "partner", access: "read", description: "Partner pipeline status and stage breakdown." },
  { name: "get_partner_links", category: "partner", access: "read", description: "Affiliate and tracking links for a given partner key." },
  { name: "get_partner_click_summary", category: "partner", access: "read", description: "Click analytics summarised by partner." },
  { name: "get_partner_knowledge", category: "partner", access: "read", description: "Partner knowledge base entries." },
  { name: "get_fanatics_routing", category: "partner", access: "read", description: "Affiliate and tracking link routing rules for Fanatics." },

  // Write tools
  { name: "upsert_organizer_watchlist", category: "write", access: "write", description: "Add or update an organizer watchlist entry. Requires ENABLE_MCP_WRITES=true." },
  { name: "upsert_partner", category: "write", access: "write", description: "Add or update a partner record. Requires ENABLE_MCP_WRITES=true." },
  { name: "upsert_partner_link", category: "write", access: "write", description: "Add or update a partner affiliate link. Requires ENABLE_MCP_WRITES=true." },
  { name: "upsert_partner_placement", category: "write", access: "write", description: "Add or update a partner placement entry. Requires ENABLE_MCP_WRITES=true." },
  { name: "update_partner_status", category: "write", access: "write", description: "Update a partner's pipeline status. Requires ENABLE_MCP_WRITES=true." },
  { name: "insert_tournament_candidate", category: "write", access: "write", description: "Submit a new tournament URL for review. Requires ENABLE_MCP_WRITES=true." },
  { name: "insert_research_note", category: "write", access: "write", description: "Attach a freeform research note to any entity (organizer, tournament, venue, other). Requires ENABLE_MCP_WRITES=true." },
  { name: "insert_partner_note", category: "write", access: "write", description: "Attach a note to a partner record. Requires ENABLE_MCP_WRITES=true." },
  { name: "insert_partner_test_result", category: "write", access: "write", description: "Record a partner integration test result. Requires ENABLE_MCP_WRITES=true." },

  // Utility
  { name: "mcp_healthcheck", category: "utility", access: "read", description: "Confirm server configuration: writes enabled, mock mode, key presence. Does not reveal secret values." },
  { name: "list_tools", category: "utility", access: "read", description: "Return the full inventory of available MCP tools with category, access level, and description." }
] as const;

export function registerListTools(server: McpServer) {
  server.registerTool(
    "list_tools",
    {
      description:
        "Return the full inventory of available MCP tools with category, access level, and description. Call this first in any new session to understand what queries and writes are available.",
      inputSchema: listToolsInput,
      outputSchema: listToolsOutput
    },
    async () => {
      const writesEnabled = process.env.ENABLE_MCP_WRITES === "true";
      const result = {
        total: TOOLS.length,
        writes_enabled: writesEnabled,
        tools: TOOLS.map((t) => ({ ...t }))
      };
      const parsed = listToolsOutput.parse(result);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
