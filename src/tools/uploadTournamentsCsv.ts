import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { uploadTournamentsCsvInput, uploadTournamentsCsvOutput } from "../lib/schemas";

const MCP_SCHEMA = {
  csv_content: z.string().min(1).describe(
    "Raw CSV text to import. Required columns: name, state or city, source_url. " +
    "Include a sport column or set fallback_sport. " +
    "Optional columns: level, start_date, end_date, venue, address, zip, notes, " +
    "tournament_director, tournament_director_email, source_event_id."
  ),
  source: z.enum([
    "us_club_soccer", "cal_south", "gotsoccer", "soccerwire", "external_crawl", "public_submission",
  ]).optional().describe("Import source identifier. Default: external_crawl."),
  status: z.enum(["draft", "published"]).optional().describe(
    "Tournament status applied to imported rows. Default: draft."
  ),
  fallback_sport: z.enum([
    "soccer", "baseball", "softball", "lacrosse", "basketball", "hockey", "volleyball", "futsal",
  ]).optional().describe("Sport applied to rows that have no sport column."),
  fallback_state: z.string().optional().describe("2-letter state code applied to rows missing a state column."),
  fallback_city: z.string().optional().describe("City applied to rows missing a city column."),
};

const IMPORT_URL = "https://www.refereeinsights.com/api/internal/tournaments/import";

async function callImportEndpoint(input: z.infer<typeof uploadTournamentsCsvInput>) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) throw new Error("INTERNAL_API_SECRET is not set.");

  const body: Record<string, unknown> = { csv: input.csv_content };
  if (input.source !== undefined) body.source = input.source;
  if (input.status !== undefined) body.status = input.status;
  if (input.fallback_sport !== undefined) body.fallback_sport = input.fallback_sport;
  if (input.fallback_state !== undefined) body.fallback_state = input.fallback_state;
  if (input.fallback_city !== undefined) body.fallback_city = input.fallback_city;

  const res = await fetch(IMPORT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": secret,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json() as Record<string, unknown>;

  if (!res.ok) {
    throw new Error(`Import endpoint returned ${res.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

export async function uploadTournamentsCsv(input: z.infer<typeof uploadTournamentsCsvInput>) {
  if (process.env.ENABLE_MCP_WRITES !== "true") {
    throw new Error("Write tools are disabled. Set ENABLE_MCP_WRITES=true to enable.");
  }

  const raw = await callImportEndpoint(input);

  return uploadTournamentsCsvOutput.parse({
    ok: raw.ok ?? true,
    total_rows: raw.original_row_count ?? 0,
    accepted: raw.success ?? 0,
    failed: raw.failed ?? 0,
    new_count: raw.new_count ?? 0,
    existing_count: raw.existing_count ?? 0,
    dropped_by_cleaner: raw.dropped_by_cleaner ?? 0,
    venue_links_created: raw.venue_links_created ?? 0,
    venue_links_attempted: raw.venue_links_attempted ?? 0,
    venue_link_errors: raw.venue_link_errors ?? 0,
    errors: raw.errors,
    dropped_rows: raw.dropped_rows,
  });
}

export function registerUploadTournamentsCsv(server: McpServer) {
  server.registerTool(
    "upload_tournaments_csv",
    {
      description:
        "Submit a CSV of tournaments through the TournamentInsights import pipeline. " +
        "Validates, deduplicates, and enriches each row using the same path as the admin Upload form. " +
        "Required CSV columns: name, state or city, source_url (plus sport column or fallback_sport). " +
        "Returns aggregate counts and row-level errors/rejections. " +
        "Requires ENABLE_MCP_WRITES=true and INTERNAL_API_SECRET.",
      inputSchema: MCP_SCHEMA,
      outputSchema: uploadTournamentsCsvOutput,
    },
    async (input) => {
      const args = uploadTournamentsCsvInput.parse(input ?? {});
      const result = await uploadTournamentsCsv(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );
}
