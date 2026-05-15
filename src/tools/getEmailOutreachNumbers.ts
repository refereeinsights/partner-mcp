import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getEmailOutreachNumbers } from "../lib/queries";
import { getEmailOutreachNumbersOutput } from "../lib/schemas";

export function registerGetEmailOutreachNumbers(server: McpServer) {
  server.registerTool(
    "get_email_outreach_numbers",
    {
      description: "Outreach email totals: drafts, sent, replies, followups sent",
      inputSchema: z.object({}),
      outputSchema: getEmailOutreachNumbersOutput
    },
    async () => {
      const data = await getEmailOutreachNumbers();
      const parsed = getEmailOutreachNumbersOutput.parse(data);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
  );
}
