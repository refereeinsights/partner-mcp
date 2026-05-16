import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { supabaseAdmin } from "../lib/supabaseAdmin";

interface InsertPartnerNoteParams {
  partner_key: string;
  note: string;
  note_type?: string;
  created_by?: string;
}

export async function insertPartnerNote(params: InsertPartnerNoteParams): Promise<object> {
  const { partner_key, note, note_type = "general", created_by } = params;

  const { data, error } = await supabaseAdmin
    .from("partner_notes")
    .insert({ partner_key, note_type, note, created_by })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return { success: true, id: data?.id };
}

export function registerInsertPartnerNote(server: McpServer) {
  server.registerTool(
    "insert_partner_note",
    {
      title: "Insert Partner Note",
      description:
        "Append a note to public.partner_notes for a given partner key. Requires the partner_notes table to exist (see partner_write_tables.sql).",
      inputSchema: {
        partner_key: z.string().describe("Partner key (slug) from public.partners. Required."),
        note: z.string().describe("Note text to record. Required."),
        note_type: z
          .enum(["general", "outreach", "negotiation", "implementation", "qa"])
          .optional()
          .default("general")
          .describe("Note category (default: general)"),
        created_by: z.string().optional().describe("Author identifier (name or email)"),
      },
    },
    async (input) => {
      const result = await insertPartnerNote(input as InsertPartnerNoteParams);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
