import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { supabaseAdmin, fetchAllPaginated } from "../lib/supabaseAdmin";

export async function fetchPartnerClickSummary(params: {
  start_date?: string;
  end_date?: string;
  partner_id?: string;
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
      .select("properties,created_at")
      .eq("event_name", "partner_click_clicked")
      .gte("created_at", `${start}T00:00:00Z`)
      .lte("created_at", `${end}T23:59:59Z`)
      .range(from, to) as any
  );

  const clicksByPartner: Record<string, number> = {};
  const clicksBySport: Record<string, number> = {};
  const clicksByPageType: Record<string, number> = {};
  const clicksByPlacement: Record<string, number> = {};
  let lastClickAt: string | null = null;
  let total = 0;

  for (const row of rows) {
    const p = (row as any).properties ?? {};
    const rPartnerKey = p.partner_key ?? "unknown";
    const rSport = p.sport ?? "unknown";
    const rPageType = p.page_type ?? "unknown";
    const rPlacement = p.placement ?? "unknown";

    if (params.partner_id && rPartnerKey !== params.partner_id) continue;

    total += 1;
    clicksByPartner[rPartnerKey] = (clicksByPartner[rPartnerKey] ?? 0) + 1;
    clicksBySport[rSport] = (clicksBySport[rSport] ?? 0) + 1;
    clicksByPageType[rPageType] = (clicksByPageType[rPageType] ?? 0) + 1;
    clicksByPlacement[rPlacement] = (clicksByPlacement[rPlacement] ?? 0) + 1;

    const ts = (row as any).created_at;
    if (ts && (!lastClickAt || ts > lastClickAt)) lastClickAt = ts;
  }

  return {
    period: { start, end },
    total_clicks: total,
    clicks_by_partner: clicksByPartner,
    clicks_by_sport: clicksBySport,
    clicks_by_page_type: clicksByPageType,
    clicks_by_placement: clicksByPlacement,
    last_click_at: lastClickAt,
  };
}

export function registerGetPartnerClickSummary(server: McpServer) {
  server.registerTool(
    "get_partner_click_summary",
    {
      title: "Get Partner Click Summary",
      description:
        "Aggregate partner click counts from public.ti_map_events (event_name = partner_click_clicked) over a date range.",
      inputSchema: {
        startDate: z.string().optional().describe("Start date YYYY-MM-DD (default: 30 days ago)"),
        endDate: z.string().optional().describe("End date YYYY-MM-DD (default: today)"),
        partnerKey: z.string().optional().describe("Filter to a specific partner key"),
        sport: z.string().optional().describe("Filter by sport in event properties"),
        pageType: z.string().optional().describe("Filter by page_type in event properties"),
        placement: z.string().optional().describe("Filter by placement in event properties"),
      },
    },
    async ({ startDate, endDate, partnerKey, sport, pageType, placement }) => {
      const end = endDate ?? new Date().toISOString().slice(0, 10);
      const start = startDate ?? (() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().slice(0, 10);
      })();

      const rows = await fetchAllPaginated((from, to) =>
        supabaseAdmin
          .from("ti_map_events")
          .select("properties,created_at")
          .eq("event_name", "partner_click_clicked")
          .gte("created_at", `${start}T00:00:00Z`)
          .lte("created_at", `${end}T23:59:59Z`)
          .range(from, to) as any
      );

      // Filter and aggregate in JS from JSONB properties column
      const clicksByPartner: Record<string, number> = {};
      const clicksBySport: Record<string, number> = {};
      const clicksByPageType: Record<string, number> = {};
      const clicksByPlacement: Record<string, number> = {};
      let lastClickAt: string | null = null;
      let total = 0;

      for (const row of rows) {
        const p = (row as any).properties ?? {};
        const rPartnerKey = p.partner_key ?? "unknown";
        const rSport = p.sport ?? "unknown";
        const rPageType = p.page_type ?? "unknown";
        const rPlacement = p.placement ?? "unknown";

        if (partnerKey && rPartnerKey !== partnerKey) continue;
        if (sport && rSport !== sport) continue;
        if (pageType && rPageType !== pageType) continue;
        if (placement && rPlacement !== placement) continue;

        total += 1;
        clicksByPartner[rPartnerKey] = (clicksByPartner[rPartnerKey] ?? 0) + 1;
        clicksBySport[rSport] = (clicksBySport[rSport] ?? 0) + 1;
        clicksByPageType[rPageType] = (clicksByPageType[rPageType] ?? 0) + 1;
        clicksByPlacement[rPlacement] = (clicksByPlacement[rPlacement] ?? 0) + 1;

        const ts = (row as any).created_at;
        if (ts && (!lastClickAt || ts > lastClickAt)) lastClickAt = ts;
      }

      const result = {
        period: { start, end },
        total_clicks: total,
        clicks_by_partner: clicksByPartner,
        clicks_by_sport: clicksBySport,
        clicks_by_page_type: clicksByPageType,
        clicks_by_placement: clicksByPlacement,
        last_click_at: lastClickAt,
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
