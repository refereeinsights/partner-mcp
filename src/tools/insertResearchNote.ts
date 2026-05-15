import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { insertResearchNote } from "../lib/queries";
import { insertResearchNoteInput, insertResearchNoteOutput } from "../lib/schemas";

export function registerInsertResearchNote(server: McpServer) {
  server.registerTool(
    "insert_research_note",
    {
      description:
        "Insert a research note (freeform). Requires ENABLE_MCP_WRITES=true and SUPABASE_SERVICE_ROLE_KEY.",
      inputSchema: insertResearchNoteInput,
      outputSchema: insertResearchNoteOutput
    },
    async (input) => {
      const args = insertResearchNoteInput.parse(input ?? {});
      const result = await insertResearchNote(args);
      const parsed = insertResearchNoteOutput.parse(result);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
