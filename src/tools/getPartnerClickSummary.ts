import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { supabaseAdmin, fetchAllPaginated } from "../lib/supabaseAdmin";

const EVENTS: Array<{ key: string; label: string }> = [
  { key: "tournament_detail_venue_map_clicked", label: "Tournament detail: venue map clicked" },
  { key: "tournament_detail_weekend_plan_clicked", label: "Tournament detail: weekend plan clicked" },
  { key: "tournament_detail_travel_search_clicked", label: "Tournament detail: travel search clicked" },
  { key: "tournament_map_cta_clicked", label: "Tournament map CTA clicked" },
  { key: "tournament_map_back_to_tournament_clicked", label: "Tournament map: back to tournament clicked" },
  { key: "tournament_map_weekend_plan_clicked", label: "Tournament map: weekend plan clicked" },
  { key: "tournament_map_add_to_planner_clicked", label: "Tournament map: add to planner clicked" },
  { key: "venue_map_opened", label: "Venue map opened" },
  { key: "venue_map_loaded", label: "Venue map loaded" },
  { key: "venue_map_hotels_clicked", label: "Map panel hotels clicked" },
  { key: "weekend_share_clicked", label: "Weekend share clicked" },
  { key: "weekend_share_venue_map_clicked", label: "Weekend share: venue map clicked" },
  { key: "weekend_share_travel_clicked", label: "Weekend share: travel clicked" },
  { key: "weekend_share_planner_hub_clicked", label: "Weekend share: planner hub clicked" },
  { key: "weekend_share_directions_clicked", label: "Weekend share: directions clicked" },
  { key: "weekend_share_airport_directions_clicked", label: "Weekend share: airport directions clicked" },
  { key: "weekend_share_owls_eye_directions_clicked", label: "Weekend share: Owl's Eye directions clicked" },
  { key: "weekend_planner_saved_tournament_clicked", label: "Weekend planner: saved open tournament clicked" },
  { key: "weekend_planner_saved_weekend_plan_clicked", label: "Weekend planner: saved weekend plan clicked" },
  { key: "weekend_planner_saved_venue_map_clicked", label: "Weekend planner: saved venue map clicked" },
  { key: "weekend_planner_saved_travel_clicked", label: "Weekend planner: saved travel clicked" },
  { key: "partner_click_clicked", label: "Partner click: outbound clicked" },
  { key: "premium_modal_viewed", label: "Premium modal viewed" },
  { key: "premium_cta_clicked", label: "Premium CTA clicked" },
  { key: "owls_eye_unlock_prompt_shown", label: "Owl's Eye unlock prompt shown" },
  { key: "owls_eye_full_opened", label: "Owl's Eye full opened" },
  { key: "owls_eye_category_expanded", label: "Owl's Eye category expanded" },
  { key: "owls_eye_category_pins_enabled", label: "Owl's Eye category pins enabled" },
  { key: "owls_eye_result_selected", label: "Owl's Eye result selected" },
  { key: "owls_eye_directions_clicked", label: "Owl's Eye directions clicked" },
];

const EVENT_KEYS = EVENTS.map((e) => e.key);

async function queryClickCounts(params: {
  start_date?: string;
  end_date?: string;
}): Promise<object> {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (params.start_date || params.end_date) {
    // Custom date range — return a single count per event for the window
    const start = params.start_date ?? new Date(todayStart.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    const end = params.end_date ?? todayStart.toISOString().slice(0, 10);

    const rows = await fetchAllPaginated((from, to) =>
      supabaseAdmin
        .from("ti_map_events")
        .select("event_name")
        .in("event_name", EVENT_KEYS)
        .gte("created_at", `${start}T00:00:00Z`)
        .lte("created_at", `${end}T23:59:59Z`)
        .range(from, to) as any
    );

    const counts: Record<string, number> = {};
    for (const row of rows) counts[(row as any).event_name] = (counts[(row as any).event_name] ?? 0) + 1;

    return {
      mode: "custom_range",
      period: { start, end },
      total_events: rows.length,
      events: EVENTS.map((e) => ({ key: e.key, label: e.label, count: counts[e.key] ?? 0 })),
    };
  }

  // Default — yesterday + last 30d, matching the admin /admin/ti/clicks view
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const window30dStart = new Date(todayStart.getTime() - 30 * 86400000);
  const yesterdayIso = yesterdayStart.toISOString();

  const rows = await fetchAllPaginated((from, to) =>
    supabaseAdmin
      .from("ti_map_events")
      .select("event_name,created_at")
      .in("event_name", EVENT_KEYS)
      .gte("created_at", window30dStart.toISOString())
      .lt("created_at", todayStart.toISOString())
      .range(from, to) as any
  );

  const last30d: Record<string, number> = {};
  const yesterday: Record<string, number> = {};

  for (const row of rows) {
    const name: string = (row as any).event_name;
    last30d[name] = (last30d[name] ?? 0) + 1;
    if ((row as any).created_at >= yesterdayIso) {
      yesterday[name] = (yesterday[name] ?? 0) + 1;
    }
  }

  return {
    mode: "default",
    period: {
      yesterday: yesterdayStart.toISOString().slice(0, 10),
      last_30d_start: window30dStart.toISOString().slice(0, 10),
    },
    events: EVENTS.map((e) => ({
      key: e.key,
      label: e.label,
      yesterday: yesterday[e.key] ?? 0,
      last_30d: last30d[e.key] ?? 0,
    })),
  };
}

export async function fetchPartnerClickSummary(params: {
  start_date?: string;
  end_date?: string;
  partner_id?: string;
}): Promise<object> {
  return queryClickCounts(params);
}

export function registerGetPartnerClickSummary(server: McpServer) {
  server.registerTool(
    "get_partner_click_summary",
    {
      title: "Get Click Summary",
      description:
        "Count user engagement and partner clicks from public.ti_map_events. Default (no params) returns yesterday + last 30d counts for all 30 tracked events, matching the /admin/ti/clicks view. Pass start_date and/or end_date (YYYY-MM-DD) for a custom range.",
      inputSchema: {
        startDate: z.string().optional().describe("Start date YYYY-MM-DD for custom range"),
        endDate: z.string().optional().describe("End date YYYY-MM-DD for custom range"),
      },
    },
    async ({ startDate, endDate }) => {
      const result = await queryClickCounts({ start_date: startDate, end_date: endDate });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
