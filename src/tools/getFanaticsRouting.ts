import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { supabaseAdmin } from "../lib/supabaseAdmin";

const SPORT_TO_SUB_ID3: Array<{ keywords: string[]; subId3: string }> = [
  { keywords: ["baseball", "softball"], subId3: "baseball_softball" },
  { keywords: ["basketball"], subId3: "basketball" },
  { keywords: ["soccer"], subId3: "soccer" },
  { keywords: ["hockey"], subId3: "hockey" },
  { keywords: ["lacrosse"], subId3: "lacrosse" },
];

export async function fetchFanaticsRouting(params: { sport?: string }): Promise<object> {
  const sport = params.sport;
  const { data: links, error } = await supabaseAdmin
    .from("partner_links")
    .select("id,label,url,shared_id,sub_id_1,sub_id_2,sub_id_3,partners(name)")
    .eq("partner_key", "fanatics")
    .eq("is_active", true);

  if (error) throw error;
  if (!links || links.length === 0) {
    return { error: "No active Fanatics links found in database." };
  }

  let matchedSubId3: string | null = null;
  let matchedSport: string | null = null;

  if (sport) {
    const sportLower = sport.toLowerCase();
    for (const { keywords, subId3 } of SPORT_TO_SUB_ID3) {
      if (keywords.some((k) => sportLower.includes(k))) {
        matchedSubId3 = subId3;
        matchedSport = subId3;
        break;
      }
    }
  }

  let link = matchedSubId3
    ? links.find((l: any) => l.sub_id_3 === matchedSubId3)
    : null;

  const fallbackUsed = !link;

  if (!link) {
    link = links.find(
      (l: any) => l.sub_id_3 === "all_sports" && l.sub_id_1 === "tournament_page"
    ) ?? links.find((l: any) => l.sub_id_3 === "all_sports") ?? links[0];
  }

  if (!link) {
    return { error: "Could not resolve a Fanatics link." };
  }

  return {
    input_sport: sport ?? null,
    matched_sport: matchedSport,
    fallback_used: fallbackUsed,
    partner_key: "fanatics",
    partner_name: (link as any).partners?.name ?? "Fanatics",
    partner_link_id: (link as any).id,
    label: (link as any).label,
    url: (link as any).url,
    disclosure: "Affiliate link — TournamentInsights may earn a commission on qualifying purchases.",
    shared_id: (link as any).shared_id,
    sub_id_1: (link as any).sub_id_1,
    sub_id_2: (link as any).sub_id_2,
    sub_id_3: (link as any).sub_id_3,
  };
}

export function registerGetFanaticsRouting(server: McpServer) {
  server.registerTool(
    "get_fanatics_routing",
    {
      title: "Get Fanatics Routing",
      description:
        "Return the active Fanatics affiliate link for a given sport. Falls back to the all-sports tournament page link if no sport-specific link exists.",
      inputSchema: {
        sport: z.string().optional().describe("Sport name (e.g. 'baseball', 'soccer'). Omit for all-sports fallback."),
      },
    },
    async ({ sport }) => {
      const { data: links, error } = await supabaseAdmin
        .from("partner_links")
        .select("id,label,url,shared_id,sub_id_1,sub_id_2,sub_id_3,partners(name)")
        .eq("partner_key", "fanatics")
        .eq("is_active", true);

      if (error) throw error;
      if (!links || links.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ error: "No active Fanatics links found in database." }, null, 2),
          }],
        };
      }

      let matchedSubId3: string | null = null;
      let matchedSport: string | null = null;

      if (sport) {
        const sportLower = sport.toLowerCase();
        for (const { keywords, subId3 } of SPORT_TO_SUB_ID3) {
          if (keywords.some((k) => sportLower.includes(k))) {
            matchedSubId3 = subId3;
            matchedSport = subId3;
            break;
          }
        }
      }

      // Find the matching link from DB
      let link = matchedSubId3
        ? links.find((l: any) => l.sub_id_3 === matchedSubId3)
        : null;

      const fallbackUsed = !link;

      // Fall back to all-sports tournament page link
      if (!link) {
        link = links.find(
          (l: any) => l.sub_id_3 === "all_sports" && l.sub_id_1 === "tournament_page"
        ) ?? links.find((l: any) => l.sub_id_3 === "all_sports") ?? links[0];
      }

      if (!link) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ error: "Could not resolve a Fanatics link." }, null, 2),
          }],
        };
      }

      const result = {
        input_sport: sport ?? null,
        matched_sport: matchedSport,
        fallback_used: fallbackUsed,
        partner_key: "fanatics",
        partner_name: (link as any).partners?.name ?? "Fanatics",
        partner_link_id: (link as any).id,
        label: (link as any).label,
        url: (link as any).url,
        disclosure: "Affiliate link — TournamentInsights may earn a commission on qualifying purchases.",
        shared_id: (link as any).shared_id,
        sub_id_1: (link as any).sub_id_1,
        sub_id_2: (link as any).sub_id_2,
        sub_id_3: (link as any).sub_id_3,
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
