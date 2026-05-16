import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { supabaseAdmin, fetchAllPaginated } from "../lib/supabaseAdmin";

const BOOK_TRAVEL_EVENTS = [
  "book_travel_viewed",
  "book_travel_add_event_clicked",
  "book_travel_shared",
];

const ALL_TRACKED_EVENTS = [
  ...BOOK_TRAVEL_EVENTS,
  "tournament_detail_more_in_state_clicked",
  "venue_page_viewed",
  "map_viewed",
  "map_state_clicked",
  "homepage_cta_clicked",
  "homepage_sport_chip_clicked",
  "map_filter_changed",
];

async function fetchEngagementSummary(params: {
  start_date?: string;
  end_date?: string;
}): Promise<object> {
  const end = params.end_date ?? new Date().toISOString().slice(0, 10);
  const start = params.start_date ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  })();

  const rows = await fetchAllPaginated((from, to) =>
    supabaseAdmin
      .from("ti_map_events")
      .select("event_name,properties,created_at")
      .in("event_name", ALL_TRACKED_EVENTS)
      .gte("created_at", `${start}T00:00:00Z`)
      .lte("created_at", `${end}T23:59:59Z`)
      .range(from, to) as any
  );

  const byEvent: Record<string, number> = {};
  const bookTravel: Record<string, number> = {};
  let lastEventAt: string | null = null;
  let total = 0;

  for (const row of rows) {
    const name: string = (row as any).event_name;
    total += 1;
    byEvent[name] = (byEvent[name] ?? 0) + 1;
    if (BOOK_TRAVEL_EVENTS.includes(name)) {
      bookTravel[name] = (bookTravel[name] ?? 0) + 1;
    }
    const ts: string = (row as any).created_at;
    if (ts && (!lastEventAt || ts > lastEventAt)) lastEventAt = ts;
  }

  return {
    period: { start, end },
    total_events: total,
    by_event: byEvent,
    book_travel_events: bookTravel,
    last_event_at: lastEventAt,
    note: "partner_click_clicked events will appear here once affiliate link tracking is instrumented in the frontend",
  };
}

export async function fetchPartnerClickSummary(params: {
  start_date?: string;
  end_date?: string;
  partner_id?: string;
}): Promise<object> {
  return fetchEngagementSummary(params);
}

export function registerGetPartnerClickSummary(server: McpServer) {
  server.registerTool(
    "get_partner_click_summary",
    {
      title: "Get Engagement Summary",
      description:
        "Aggregate user engagement events from public.ti_map_events over a date range. Covers book_travel actions (monetization signal), map activity, venue views, and homepage CTAs. Partner affiliate click events (partner_click_clicked) will appear here once instrumented.",
      inputSchema: {
        startDate: z.string().optional().describe("Start date YYYY-MM-DD (default: 30 days ago)"),
        endDate: z.string().optional().describe("End date YYYY-MM-DD (default: today)"),
      },
    },
    async ({ startDate, endDate }) => {
      const result = await fetchEngagementSummary({
        start_date: startDate,
        end_date: endDate,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
