import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { insertCompleteSearchPackage } from "../lib/searchHistoryQueries";
import {
  insertCompleteSearchPackageInput,
  insertCompleteSearchPackageOutput,
} from "../lib/searchHistorySchemas";

export function registerInsertCompleteSearchPackage(server: McpServer) {
  server.registerTool(
    "insert_complete_search_package",
    {
      description:
        "Atomically record a complete tournament-discovery search package (run + scopes + findings + organizer intelligence) " +
        "in one call, then optionally finalize the run. Idempotent via source_batch_id — returns status 'reused' if the run " +
        "already exists with no conflicts, or status 'conflict' if key fields differ. " +
        "Requires ENABLE_SEARCH_HISTORY_WRITES=true and SUPABASE_SERVICE_ROLE_KEY. " +
        "Also requires the insert_complete_search_package_rpc migration to be applied to the Supabase project.",
      inputSchema: insertCompleteSearchPackageInput,
      outputSchema: insertCompleteSearchPackageOutput,
    },
    async (input) => {
      const args = insertCompleteSearchPackageInput.parse(input ?? {});
      const result = await insertCompleteSearchPackage(args);
      const parsed = insertCompleteSearchPackageOutput.parse(result);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed,
      };
    }
  );
}
