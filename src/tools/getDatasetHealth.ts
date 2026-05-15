import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDatasetHealth } from "../lib/queries";
import { getDatasetHealthOutput } from "../lib/schemas";

export function registerGetDatasetHealth(server: McpServer) {
  server.registerTool(
    "get_dataset_health",
    {
      description: "Return overall dataset health metrics for tournaments",
      inputSchema: z.object({}),
      outputSchema: getDatasetHealthOutput
    },
    async () => {
      try {
        const data = await getDatasetHealth();
        console.error("raw get_dataset_health:", JSON.stringify(data, null, 2));
        const parsed = getDatasetHealthOutput.parse(data);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(parsed, null, 2)
            }
          ],
          structuredContent: parsed
        };
      } catch (error) {
        console.error("get_dataset_health error:", error);
        throw error;
      }
    }
  );
}
