import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getTopOrganizerDomains } from "../lib/queries";
import {
  getTopOrganizerDomainsInput,
  getTopOrganizerDomainsOutput,
  getTopOrganizerDomainsToolOutput
} from "../lib/schemas";

export function registerGetTopOrganizerDomains(server: McpServer) {
  server.registerTool(
    "get_top_organizer_domains",
    {
      description: "Return organizer domains ranked by tournament count (derived from official_website_url hostnames).",
      inputSchema: getTopOrganizerDomainsInput,
      outputSchema: getTopOrganizerDomainsToolOutput
    },
    async (input) => {
      const filters = getTopOrganizerDomainsInput.parse(input ?? {});
      const data = await getTopOrganizerDomains(filters);
      const parsed = getTopOrganizerDomainsOutput.parse(data);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: { data: parsed }
      };
    }
  );
}
