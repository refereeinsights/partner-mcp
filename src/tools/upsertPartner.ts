import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { supabaseAdmin } from "../lib/supabaseAdmin";

interface UpsertPartnerParams {
  key: string;
  name: string;
  category?: string;
  status?: string;
  priority?: number;
  partner_type?: string;
  website_url?: string;
  application_url?: string;
  contact_email?: string;
  disclosure_text?: string;
  notes?: string;
  is_active?: boolean;
}

export async function upsertPartner(params: UpsertPartnerParams): Promise<object> {
  const { key, name, ...rest } = params;
  const { data, error } = await supabaseAdmin
    .from("partners")
    .upsert({ key, name, ...rest }, { onConflict: "key" })
    .select("key")
    .single();

  if (error) throw new Error(error.message);
  return { success: true, key: data?.key ?? key };
}

export function registerUpsertPartner(server: McpServer) {
  server.registerTool(
    "upsert_partner",
    {
      title: "Upsert Partner",
      description:
        "Insert or update a partner record in public.partners. Uses key as the conflict target.",
      inputSchema: {
        key: z.string().describe("Unique partner key (slug). Required."),
        name: z.string().describe("Partner display name. Required."),
        category: z.string().optional().describe("Partner category (e.g. sporting_goods_affiliate)"),
        status: z.string().optional().describe("Partner status (e.g. active_tracking_links_created)"),
        priority: z.number().int().optional().describe("Sort priority (lower = higher priority)"),
        partner_type: z.string().optional().describe("Partner type (e.g. affiliate, direct)"),
        website_url: z.string().url().optional().describe("Partner website URL"),
        application_url: z.string().url().optional().describe("Affiliate application URL"),
        contact_email: z.string().email().optional().describe("Primary contact email"),
        disclosure_text: z.string().optional().describe("FTC disclosure text for partner"),
        notes: z.string().optional().describe("Internal notes"),
        is_active: z.boolean().optional().describe("Whether the partner is active (default true)"),
      },
    },
    async (input) => {
      const result = await upsertPartner(input as UpsertPartnerParams);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
