import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { supabaseAdmin } from "../lib/supabaseAdmin";

export async function fetchPartnerLinks(params: { partner_id?: string }): Promise<object> {
  let query = supabaseAdmin
    .from("partner_links")
    .select(
      "id,partner_key,label,url,destination_type,page_type,placement,sport,campaign,shared_id,sub_id_1,sub_id_2,sub_id_3,is_active,partners(name)"
    )
    .eq("is_active", true);

  if (params.partner_id) query = (query as any).eq("partner_key", params.partner_id);
  query = query.order("label");

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    partner_key: row.partner_key,
    partner_name: row.partners?.name ?? null,
    id: row.id,
    label: row.label,
    url: row.url,
    destination_type: row.destination_type,
    page_type: row.page_type,
    placement: row.placement,
    sport: row.sport,
    campaign: row.campaign,
    shared_id: row.shared_id,
    sub_id_1: row.sub_id_1,
    sub_id_2: row.sub_id_2,
    sub_id_3: row.sub_id_3,
    is_active: row.is_active,
  }));
}

export function registerGetPartnerLinks(server: McpServer) {
  server.registerTool(
    "get_partner_links",
    {
      title: "Get Partner Links",
      description: "Return affiliate/tracking links for a given partner key.",
      inputSchema: {
        partnerKey: z.string().describe("Partner key (e.g. 'fanatics', 'opentable')"),
        activeOnly: z.boolean().optional().default(true).describe("Return only active links (default true)"),
      },
    },
    async ({ partnerKey, activeOnly = true }) => {
      let query = supabaseAdmin
        .from("partner_links")
        .select(
          "id,partner_key,label,url,destination_type,page_type,placement,sport,campaign,shared_id,sub_id_1,sub_id_2,sub_id_3,is_active,partners(name)"
        )
        .eq("partner_key", partnerKey);

      if (activeOnly) query = query.eq("is_active", true);
      query = query.order("label");

      const { data, error } = await query;
      if (error) throw error;

      const result = (data ?? []).map((row: any) => ({
        partner_key: row.partner_key,
        partner_name: row.partners?.name ?? null,
        id: row.id,
        label: row.label,
        url: row.url,
        destination_type: row.destination_type,
        page_type: row.page_type,
        placement: row.placement,
        sport: row.sport,
        campaign: row.campaign,
        shared_id: row.shared_id,
        sub_id_1: row.sub_id_1,
        sub_id_2: row.sub_id_2,
        sub_id_3: row.sub_id_3,
        is_active: row.is_active,
      }));

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
