import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { supabaseAdmin } from "../lib/supabaseAdmin";

interface InsertPartnerTestResultParams {
  partner_key: string;
  experiment_name: string;
  ctr?: number;
  clicks?: number;
  conversions?: number;
  notes?: string;
  tested_at?: string;
}

export async function insertPartnerTestResult(params: InsertPartnerTestResultParams): Promise<object> {
  const {
    partner_key,
    experiment_name,
    ctr,
    clicks,
    conversions,
    notes,
    tested_at = new Date().toISOString().slice(0, 10),
  } = params;

  const { data, error } = await supabaseAdmin
    .from("partner_test_results")
    .insert({ partner_key, experiment_name, ctr, clicks, conversions, notes, tested_at })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return { success: true, id: data?.id };
}

export function registerInsertPartnerTestResult(server: McpServer) {
  server.registerTool(
    "insert_partner_test_result",
    {
      title: "Insert Partner Test Result",
      description:
        "Record an A/B or placement test result in public.partner_test_results. Requires the partner_test_results table to exist (see partner_write_tables.sql).",
      inputSchema: {
        partner_key: z.string().describe("Partner key (slug) from public.partners. Required."),
        experiment_name: z.string().describe("Name of the experiment or test. Required."),
        ctr: z.number().optional().describe("Click-through rate (decimal, e.g. 0.032 for 3.2%)"),
        clicks: z.number().int().optional().describe("Total clicks recorded"),
        conversions: z.number().int().optional().describe("Total conversions recorded"),
        notes: z.string().optional().describe("Qualitative observations or context"),
        tested_at: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Test date in YYYY-MM-DD format (default: today)"),
      },
    },
    async (input) => {
      const result = await insertPartnerTestResult(input as InsertPartnerTestResultParams);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
