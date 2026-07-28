import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mcpHealthcheckInput, mcpHealthcheckOutput } from "../lib/schemas";

export function registerMcpHealthcheck(server: McpServer) {
  server.registerTool(
    "mcp_healthcheck",
    {
      description: "Healthcheck for MCP server configuration (does not reveal secrets).",
      inputSchema: mcpHealthcheckInput,
      outputSchema: mcpHealthcheckOutput
    },
    async (input) => {
      const args = mcpHealthcheckInput.parse(input ?? {});
      const result = {
        status: "ok" as const,
        writes_enabled: process.env.ENABLE_MCP_WRITES === "true",
        search_history_writes_enabled: process.env.ENABLE_SEARCH_HISTORY_WRITES === "true",
        mock_mode: process.env.MOCK_MODE === "true",
        supabase_url_present: !!process.env.SUPABASE_URL,
        anon_key_present: !!process.env.SUPABASE_ANON_KEY,
        service_role_key_present: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        ts: new Date().toISOString()
      };
      const parsed = mcpHealthcheckOutput.parse(result);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
