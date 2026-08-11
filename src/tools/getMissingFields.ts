import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getMissingFields } from "../lib/queries";
import {
  getMissingFieldsInput,
  getMissingFieldsOutput,
  getMissingFieldsToolOutput
} from "../lib/schemas";

const VALID_FIELDS = [
  "official_website_url",
  "tournament_director",
  "tournament_director_email",
  "referee_contact",
  "referee_contact_email",
  "start_date",
  "end_date",
  "city",
  "state",
] as const;

const MCP_SCHEMA = {
  missing_any_of_json: z.string().describe(
    `JSON array string of fields to check for missingness. Valid values: ${VALID_FIELDS.join(", ")}. Example: '["official_website_url","tournament_director_email"]'`
  ),
  sport: z.string().optional().describe("Sport filter: soccer, baseball, softball, lacrosse, basketball, hockey, volleyball, futsal."),
  state: z.string().optional().describe("2-letter US state code, e.g. CA or TX."),
  limit: z.number().int().positive().max(200).optional().describe("Max rows to return."),
  offset: z.number().int().nonnegative().optional().describe("Pagination offset, 0-based."),
};

export function registerGetMissingFields(server: McpServer) {
  server.registerTool(
    "get_missing_fields",
    {
      description:
        "Return tournaments missing any of the specified fields. Pass missing_any_of_json as a JSON array string of field names. Valid fields: official_website_url, tournament_director, tournament_director_email, referee_contact, referee_contact_email, start_date, end_date, city, state.",
      inputSchema: MCP_SCHEMA,
      outputSchema: getMissingFieldsToolOutput
    },
    async (input) => {
      const raw = input as { missing_any_of_json: string; sport?: string; state?: string; limit?: number; offset?: number };
      const filters = getMissingFieldsInput.parse({
        missing_any_of: JSON.parse(raw.missing_any_of_json),
        sport: raw.sport,
        state: raw.state,
        limit: raw.limit,
        offset: raw.offset,
      });
      const data = await getMissingFields(filters);
      const parsed = getMissingFieldsOutput.parse(data);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: { data: parsed }
      };
    }
  );
}
