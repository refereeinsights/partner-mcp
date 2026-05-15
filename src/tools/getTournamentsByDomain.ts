import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getTournamentsByDomain } from "../lib/queries";
import {
  getTournamentsByDomainInput,
  getTournamentsByDomainOutput,
  getTournamentsByDomainToolOutput
} from "../lib/schemas";

export function registerGetTournamentsByDomain(server: McpServer) {
  server.registerTool(
    "get_tournaments_by_domain",
    {
      description: "List tournaments whose official_website_url hostname matches the requested root domain.",
      inputSchema: getTournamentsByDomainInput,
      outputSchema: getTournamentsByDomainToolOutput
    },
    async (input) => {
      const args = getTournamentsByDomainInput.parse(input ?? {});
      const data = await getTournamentsByDomain(args);
      const parsed = getTournamentsByDomainOutput.parse(data);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
        structuredContent: { data: parsed }
      };
    }
  );
}
