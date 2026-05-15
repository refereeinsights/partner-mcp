import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getMissingFields } from "../lib/queries";
import {
  getMissingFieldsInput,
  getMissingFieldsOutput,
  getMissingFieldsToolOutput
} from "../lib/schemas";

export function registerGetMissingFields(server: McpServer) {
  server.registerTool(
    "get_missing_fields",
    {
      description: "Return tournaments missing specified fields",
      inputSchema: getMissingFieldsInput,
      outputSchema: getMissingFieldsToolOutput
    },
    async (input) => {
      const filters = getMissingFieldsInput.parse(input ?? {});
      const data = await getMissingFields(filters);
      const parsed = getMissingFieldsOutput.parse(data);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: { data: parsed }
      };
    }
  );
}
