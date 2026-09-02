import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getRollForwardCandidatesV2 } from "../lib/queries";
import {
  getRollForwardCandidatesV2Input,
  getRollForwardCandidatesV2Output,
} from "../lib/schemas";

// Keep the MCP-facing schema effect-free; cross-field validation/defaulting is
// performed by getRollForwardCandidatesV2Input in the callback.
const MCP_SCHEMA = {
  target_year: z.number().int().min(2020).max(2040).describe("Target sibling year, e.g. 2027."),
  source_year: z.number().int().min(2020).max(2040).optional().describe(
    "Source tournament year. Defaults to target_year - 1."
  ),
  parent_start_date_from: z.string().optional().describe("Inclusive source start-date lower bound, YYYY-MM-DD."),
  parent_start_date_to: z.string().optional().describe("Inclusive source start-date upper bound, YYYY-MM-DD."),
  sport: z.string().optional().describe("Canonical sport filter."),
  state: z.string().optional().describe("Two-letter state code."),
  organizer_domain: z.string().optional().describe("Normalized organizer website hostname filter."),
  roll_forward_status: z.enum([
    "unresearched", "pending", "no_dates_announced", "discontinued", "done",
    "ambiguous", "ready_to_create", "linked_existing", "any",
  ]).optional().describe("Target-year log state filter. Omit for all statuses."),
  sibling_status: z.enum(["no_confirmed_match", "confirmed_match", "any"])
    .optional().default("any")
    .describe("Filter by classified sibling state; likely matches are not confirmed."),
  batch_label: z.string().optional().describe("Exact target-year log batch label."),
  limit: z.number().int().positive().max(100).optional().default(25),
  offset: z.number().int().nonnegative().optional().default(0),
};

export function registerGetRollForwardCandidatesV2(server: McpServer) {
  server.registerTool(
    "get_roll_forward_candidates_v2",
    {
      description:
        "Read-only: select production source tournaments for target-year roll-forward research " +
        "with full linked-venue context, target-year roll-forward status, and classified sibling matches. " +
        "No match means only that the available lookup returned no match; it does not prove absence.",
      inputSchema: MCP_SCHEMA,
      outputSchema: getRollForwardCandidatesV2Output,
    },
    async (input) => {
      const args = getRollForwardCandidatesV2Input.parse(input ?? {});
      const result = getRollForwardCandidatesV2Output.parse(
        await getRollForwardCandidatesV2(args)
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );
}
