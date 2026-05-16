import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { supabaseAdmin } from "../lib/supabaseAdmin";

interface UpsertPartnerLinkParams {
  id?: string;
  partner_id: string;
  label: string;
  url: string;
  destination_type?: string;
  page_type?: string;
  placement?: string;
  sport?: string;
  campaign?: string;
  shared_id?: string;
  sub_id_1?: string;
  sub_id_2?: string;
  sub_id_3?: string;
  is_active?: boolean;
  sort_order?: number;
}

export async function upsertPartnerLink(params: UpsertPartnerLinkParams): Promise<object> {
  const { id, ...fields } = params;

  let data: { id: string } | null = null;
  let error: { message: string } | null = null;

  if (id) {
    const result = await supabaseAdmin
      .from("partner_links")
      .upsert({ id, ...fields }, { onConflict: "id" })
      .select("id")
      .single();
    data = result.data as { id: string } | null;
    error = result.error;
  } else {
    const result = await supabaseAdmin
      .from("partner_links")
      .insert(fields)
      .select("id")
      .single();
    data = result.data as { id: string } | null;
    error = result.error;
  }

  if (error) throw new Error(error.message);
  return { success: true, id: data?.id };
}

export function registerUpsertPartnerLink(server: McpServer) {
  server.registerTool(
    "upsert_partner_link",
    {
      title: "Upsert Partner Link",
      description:
        "Insert or update a partner link in public.partner_links. Provide id to update an existing link; omit to insert a new one.",
      inputSchema: {
        id: z.string().uuid().optional().describe("Existing link UUID — provide to update, omit to insert"),
        partner_id: z.string().uuid().describe("Partner UUID (from public.partners.id). Required."),
        label: z.string().describe("Display label for the link. Required."),
        url: z.string().url().describe("Full affiliate/tracking URL. Required."),
        destination_type: z.string().optional().describe("Destination type (e.g. affiliate, direct)"),
        page_type: z.string().optional().describe("Page type where the link appears"),
        placement: z.string().optional().describe("Placement slot (e.g. sidebar, banner)"),
        sport: z.string().optional().describe("Sport this link is targeted to"),
        campaign: z.string().optional().describe("Campaign identifier"),
        shared_id: z.string().optional().describe("Shared tracking ID"),
        sub_id_1: z.string().optional().describe("Sub ID 1 for tracking"),
        sub_id_2: z.string().optional().describe("Sub ID 2 for tracking"),
        sub_id_3: z.string().optional().describe("Sub ID 3 for tracking"),
        is_active: z.boolean().optional().describe("Whether the link is active"),
        sort_order: z.number().int().optional().describe("Display sort order"),
      },
    },
    async (input) => {
      const result = await upsertPartnerLink(input as UpsertPartnerLinkParams);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
