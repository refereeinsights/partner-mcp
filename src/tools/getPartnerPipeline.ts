import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { supabaseAdmin } from "../lib/supabaseAdmin";

export function registerGetPartnerPipeline(server: McpServer) {
  server.registerTool(
    "get_partner_pipeline",
    {
      title: "Get Partner Pipeline",
      description:
        "Return current partner pipeline from public.partners. Filters by status, category, and active state.",
      inputSchema: {
        status: z.string().optional().describe("Filter by partner status (e.g. active_tracking_links_created, application_pending)"),
        category: z.string().optional().describe("Filter by category (e.g. sporting_goods_affiliate, team_travel_room_blocks)"),
        activeOnly: z.boolean().optional().default(true).describe("Return only active partners (default true)"),
      },
    },
    async ({ status, category, activeOnly = true }) => {
      let query = supabaseAdmin
        .from("partners")
        .select(
          "key,name,category,status,priority,partner_type,website_url,application_url,contact_email,revenue_tracking_status,revenue_source,notes,is_active"
        );

      if (activeOnly) query = query.eq("is_active", true);
      if (status) query = query.eq("status", status);
      if (category) query = query.eq("category", category);

      query = query.order("priority").order("name");

      const { data, error } = await query;
      if (error) {
        // Gracefully retry without optional columns that may not exist yet
        const missingCol = /column "([^"]+)" does not exist/i.exec(String(error));
        if (missingCol) {
          const safe = "key,name,category,status,priority,partner_type,website_url,notes,is_active";
          const { data: fallback, error: fallbackError } = await supabaseAdmin
            .from("partners")
            .select(safe)
            .order("priority")
            .order("name");
          if (fallbackError) throw fallbackError;
          return { content: [{ type: "text" as const, text: JSON.stringify(fallback ?? [], null, 2) }] };
        }
        throw error;
      }

      return { content: [{ type: "text" as const, text: JSON.stringify(data ?? [], null, 2) }] };
    }
  );
}
