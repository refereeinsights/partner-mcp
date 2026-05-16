import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { supabaseAdmin } from "../lib/supabaseAdmin";

interface UpdatePartnerStatusParams {
  key: string;
  status: string;
}

export async function updatePartnerStatus(params: UpdatePartnerStatusParams): Promise<object> {
  const { key, status } = params;

  const { error } = await supabaseAdmin
    .from("partners")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("key", key);

  if (error) throw new Error(error.message);
  return { success: true, key, status };
}

export function registerUpdatePartnerStatus(server: McpServer) {
  server.registerTool(
    "update_partner_status",
    {
      title: "Update Partner Status",
      description:
        "Update the status field on a partner record in public.partners by key. Also sets updated_at to now.",
      inputSchema: {
        key: z.string().describe("Partner key (slug) to update. Required."),
        status: z
          .string()
          .describe(
            "New status value (e.g. active_tracking_links_created, application_pending, paused, rejected). Required."
          ),
      },
    },
    async (input) => {
      const result = await updatePartnerStatus(input as UpdatePartnerStatusParams);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
