import { createMcpHandler } from "mcp-handler";
import { registerGetPartnerPipeline } from "../../../tools/getPartnerPipeline";
import { registerGetPartnerLinks } from "../../../tools/getPartnerLinks";
import { registerGetPartnerClickSummary } from "../../../tools/getPartnerClickSummary";
import { registerGetFanaticsRouting } from "../../../tools/getFanaticsRouting";
import { registerGetPartnerKnowledge } from "../../../tools/getPartnerKnowledge";
import { registerGetAdminReference } from "../../../tools/getAdminReference";
import { registerGetAssociationDashboard } from "../../../tools/getAssociationDashboard";
import { registerGetDatasetHealth } from "../../../tools/getDatasetHealth";
import { registerGetEmailOutreachNumbers } from "../../../tools/getEmailOutreachNumbers";
import { registerGetMissingFields } from "../../../tools/getMissingFields";
import { registerGetMissingVenues } from "../../../tools/getMissingVenues";
import { registerGetOrganizerClusters } from "../../../tools/getOrganizerClusters";
import { registerGetStateSportCoverage } from "../../../tools/getStateSportCoverage";
import { registerGetSummaryDashboard } from "../../../tools/getSummaryDashboard";
import { registerGetTopOrganizerDomains } from "../../../tools/getTopOrganizerDomains";
import { registerGetTournamentsByDomain } from "../../../tools/getTournamentsByDomain";
import { registerGetTournamentsMissingSourceUrls } from "../../../tools/getTournamentsMissingSourceUrls";
import { registerGetTrends } from "../../../tools/getTrends";
import { registerGetUnverifiedTournaments } from "../../../tools/getUnverifiedTournaments";
import { registerGetVenueClusters } from "../../../tools/getVenueClusters";
import { registerInsertResearchNote } from "../../../tools/insertResearchNote";
import { registerInsertTournamentCandidate } from "../../../tools/insertTournamentCandidate";
import { registerMcpHealthcheck } from "../../../tools/mcpHealthcheck";
import { registerUpsertOrganizerWatchlist } from "../../../tools/upsertOrganizerWatchlist";
import { registerUpsertPartner } from "../../../tools/upsertPartner";
import { registerUpsertPartnerLink } from "../../../tools/upsertPartnerLink";
import { registerInsertPartnerNote } from "../../../tools/insertPartnerNote";
import { registerUpdatePartnerStatus } from "../../../tools/updatePartnerStatus";
import { registerUpsertPartnerPlacement } from "../../../tools/upsertPartnerPlacement";
import { registerInsertPartnerTestResult } from "../../../tools/insertPartnerTestResult";
import { registerGetTournamentVenueWorklist } from "../../../tools/getTournamentVenueWorklist";
import { registerGetRollForwardLog } from "../../../tools/getRollForwardLog";
import { registerUpsertRollForwardLog } from "../../../tools/upsertRollForwardLog";
import { registerListTools } from "../../../tools/listTools";
import { registerGetSearchRuns } from "../../../tools/getSearchRuns";
import { registerGetSearchRunFindings } from "../../../tools/getSearchRunFindings";
import { registerGetSearchCoverage } from "../../../tools/getSearchCoverage";
import { registerGetNextSearchPriorities } from "../../../tools/getNextSearchPriorities";
import { registerGetSearchOrganizerIntelligence } from "../../../tools/getSearchOrganizerIntelligence";
import { registerInsertTournamentSearchRun } from "../../../tools/insertTournamentSearchRun";
import { registerInsertTournamentSearchScope } from "../../../tools/insertTournamentSearchScope";
import { registerInsertTournamentSearchFinding } from "../../../tools/insertTournamentSearchFinding";
import { registerInsertTournamentSearchFindings } from "../../../tools/insertTournamentSearchFindings";
import { registerFinalizeTournamentSearchRun } from "../../../tools/finalizeTournamentSearchRun";
import { registerInsertSearchOrganizerIntelligence } from "../../../tools/insertSearchOrganizerIntelligence";
import { registerInsertCompleteSearchPackage } from "../../../tools/insertCompleteSearchPackage";
import { registerGetTournaments } from "../../../tools/getTournaments";

export const runtime = "nodejs";
export const maxDuration = 60;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
};

function checkAuth(request: Request): Response | null {
  const apiKey = process.env.MCP_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      // MCP_API_KEY must be set in production — fail safe
      return new Response(
        JSON.stringify({ error: "Server misconfigured: MCP_API_KEY is not set" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    // Local dev: allow unauthenticated access when MCP_API_KEY is not set
    return null;
  }

  const auth = request.headers.get("Authorization");
  if (!auth || auth !== `Bearer ${apiKey}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  return null;
}

// TODO: Replace bearer token with OAuth or Vercel-supported MCP auth flow.
const mcpHandler = createMcpHandler(
  (server) => {
    registerGetPartnerPipeline(server);
    registerGetPartnerLinks(server);
    registerGetPartnerClickSummary(server);
    registerGetFanaticsRouting(server);
    registerGetPartnerKnowledge(server);
    registerGetAdminReference(server);
    registerGetAssociationDashboard(server);
    registerGetDatasetHealth(server);
    registerGetEmailOutreachNumbers(server);
    registerGetMissingFields(server);
    registerGetMissingVenues(server);
    registerGetOrganizerClusters(server);
    registerGetStateSportCoverage(server);
    registerGetSummaryDashboard(server);
    registerGetTopOrganizerDomains(server);
    registerGetTournaments(server);
    registerGetTournamentsByDomain(server);
    registerGetTournamentsMissingSourceUrls(server);
    registerGetTrends(server);
    registerGetUnverifiedTournaments(server);
    registerGetVenueClusters(server);
    registerInsertResearchNote(server);
    registerInsertTournamentCandidate(server);
    registerMcpHealthcheck(server);
    registerUpsertOrganizerWatchlist(server);
    registerUpsertPartner(server);
    registerUpsertPartnerLink(server);
    registerInsertPartnerNote(server);
    registerUpdatePartnerStatus(server);
    registerUpsertPartnerPlacement(server);
    registerInsertPartnerTestResult(server);
    registerGetTournamentVenueWorklist(server);
    registerGetRollForwardLog(server);
    registerUpsertRollForwardLog(server);

    // Search-history reads: always registered (internal/operational data,
    // queried with the same service-role client as everything else here).
    registerGetSearchRuns(server);
    registerGetSearchRunFindings(server);
    registerGetSearchCoverage(server);
    registerGetNextSearchPriorities(server);
    registerGetSearchOrganizerIntelligence(server);

    // Search-history writes: gated behind their own flag, separate from
    // ENABLE_MCP_WRITES, since they're the routine/high-frequency write path
    // for this feature rather than a rare admin action.
    if (process.env.ENABLE_SEARCH_HISTORY_WRITES === "true") {
      registerInsertTournamentSearchRun(server);
      registerInsertTournamentSearchScope(server);
      registerInsertTournamentSearchFinding(server);
      registerInsertTournamentSearchFindings(server);
      registerFinalizeTournamentSearchRun(server);
      registerInsertSearchOrganizerIntelligence(server);
      registerInsertCompleteSearchPackage(server);
    }

    registerListTools(server);
  },
  {},
  { basePath: "/api", maxDuration: 60 }
);

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;
  return mcpHandler(request);
}

export async function POST(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;
  return mcpHandler(request);
}
