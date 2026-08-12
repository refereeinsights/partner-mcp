import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getRollForwardCandidates } from "../lib/queries";
import { getRollForwardCandidatesInput, getRollForwardCandidatesOutput } from "../lib/schemas";

// Plain MCP_SCHEMA avoids ZodEffects serialization issues with ChatGPT's MCP client.
// All fields are primitives; the real schema is applied in the callback.
const MCP_SCHEMA = {
  source_year: z.number().int().min(2020).max(2040).describe(
    "Year to find research candidates from, e.g. 2026."
  ),
  target_year: z.number().int().min(2020).max(2040).describe(
    "Year to roll forward into, e.g. 2027."
  ),
  sport: z.string().optional().describe(
    "Sport filter: soccer, baseball, softball, lacrosse, basketball, hockey, volleyball, futsal."
  ),
  state: z.string().optional().describe(
    "2-letter US state code, e.g. CA or TX."
  ),
  limit: z.number().int().positive().max(100).optional().default(25).describe(
    "Max candidates to return per page (default 25, max 100)."
  ),
  offset: z.number().int().nonnegative().optional().default(0).describe(
    "Pagination offset, 0-based. Increment by limit to fetch the next page."
  ),
};

export function registerGetRollForwardCandidates(server: McpServer) {
  server.registerTool(
    "get_roll_forward_candidates",
    {
      description:
        "Return a bounded set of published source-year tournaments that appear to lack a target-year " +
        "sibling and have not yet completed roll-forward research. Use this instead of paginating " +
        "get_tournaments across thousands of rows. " +
        "A returned candidate means TI has a source-year tournament with no detectable target-year " +
        "sibling — it does NOT confirm the target-year edition exists. External research is required. " +
        "Source-year detection: primary = slug suffix (e.g. cal-cup-2026); secondary = yearless slug " +
        "with start_date in source_year (expected_target_slug will be null for these). " +
        "Sibling detection: production tournament records are checked directly, independent of the log. " +
        "Completed log entries (status done or discontinued) are excluded. " +
        "Candidates with pending/no_dates_announced/ambiguous log rows are included with their status. " +
        "Ordered by source start_date ASC then id ASC for stable pagination. " +
        "Example: fetch 25 baseball roll-forward candidates in Texas from 2026 to 2027: " +
        "source_year=2026, target_year=2027, sport=baseball, state=TX, limit=25, offset=0.",
      inputSchema: MCP_SCHEMA,
      outputSchema: getRollForwardCandidatesOutput,
    },
    async (input) => {
      const args = getRollForwardCandidatesInput.parse(input ?? {});
      const raw = await getRollForwardCandidates(args);
      const parsed = getRollForwardCandidatesOutput.parse(raw);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed,
      };
    }
  );
}
