import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { supabaseAdmin } from "../lib/supabaseAdmin";

interface UpsertPartnerPlacementParams {
  partner_key: string;
  placement_type: string;
  label?: string;
  is_active?: boolean;
  config?: Record<string, unknown>;
}

export async function upsertPartnerPlacement(params: UpsertPartnerPlacementParams): Promise<object> {
  const { partner_key, placement_type, label, is_active, config } = params;

  const { error } = await supabaseAdmin
    .from("partner_placements")
    .upsert(
      { partner_key, placement_type, label, is_active, config, updated_at: new Date().toISOString() },
      { onConflict: "partner_key,placement_type" }
    );

  if (error) throw new Error(error.message);
  return { success: true, partner_key, placement_type };
}

export function registerUpsertPartnerPlacement(server: McpServer) {
  server.registerTool(
    "upsert_partner_placement",
    {
      title: "Upsert Partner Placement",
      description:
        "Insert or update a partner placement record in public.partner_placements. Uses (partner_key, placement_type) as the conflict target. Requires the partner_placements table to exist (see partner_write_tables.sql).",
      inputSchema: {
        partner_key: z.string().describe("Partner key (slug) from public.partners. Required."),
        placement_type: z
          .string()
          .describe("Placement type identifier (e.g. sidebar_banner, email_footer). Required."),
        label: z.string().optional().describe("Human-readable label for this placement"),
        is_active: z.boolean().optional().describe("Whether the placement is active (default true)"),
        config: z
          .record(z.unknown())
          .optional()
          .describe("Arbitrary placement configuration as a JSON object"),
      },
    },
    async (input) => {
      const result = await upsertPartnerPlacement(input as UpsertPartnerPlacementParams);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
