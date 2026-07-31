import { NextResponse } from "next/server";
import {
  getDatasetHealth,
  getSummaryDashboard,
  getTrends,
  getStateSportCoverage,
  getMissingFields,
  getOrganizerClusters,
  getVenueClusters,
  getMissingVenues,
  getTournamentVenueWorklist,
  getAssociationDashboard,
  getEmailOutreachNumbers,
  getTopOrganizerDomains,
  getTournamentsByDomain,
  getUnverifiedTournaments,
  getTournamentsMissingSourceUrls,
  insertResearchNote,
  insertTournamentCandidate,
  upsertOrganizerWatchlist,
} from "../../../lib/queries";
import { getTournamentVenueWorklistInput } from "../../../lib/schemas";
import { fetchPartnerPipeline } from "../../../tools/getPartnerPipeline";
import { fetchPartnerLinks } from "../../../tools/getPartnerLinks";
import { fetchPartnerClickSummary } from "../../../tools/getPartnerClickSummary";
import { fetchFanaticsRouting } from "../../../tools/getFanaticsRouting";
import { findSections } from "../../../tools/getPartnerKnowledge";
import { findAdminReference } from "../../../tools/getAdminReference";
import { upsertPartner } from "../../../tools/upsertPartner";
import { upsertPartnerLink } from "../../../tools/upsertPartnerLink";
import { insertPartnerNote } from "../../../tools/insertPartnerNote";
import { updatePartnerStatus } from "../../../tools/updatePartnerStatus";
import { upsertPartnerPlacement } from "../../../tools/upsertPartnerPlacement";
import { insertPartnerTestResult } from "../../../tools/insertPartnerTestResult";
import { getTournaments, findProductionMatches } from "../../../lib/queries";
import { getTournamentsInput, findProductionMatchesInput } from "../../../lib/schemas";
import {
  getSearchRuns,
  getSearchRunFindings,
  getSearchCoverage,
  getNextSearchPriorities,
  insertTournamentSearchRun,
  insertTournamentSearchScope,
  insertTournamentSearchFinding,
  insertTournamentSearchFindings,
  finalizeTournamentSearchRun
} from "../../../lib/searchHistoryQueries";
import {
  getSearchRunsInput,
  getSearchRunFindingsInput,
  getSearchCoverageInput,
  getNextSearchPrioritiesInput,
  insertTournamentSearchRunInput,
  insertTournamentSearchScopeInput,
  insertTournamentSearchFindingInput,
  insertTournamentSearchFindingsInput,
  finalizeTournamentSearchRunInput
} from "../../../lib/searchHistorySchemas";
import { getRollForwardLog, upsertRollForwardLog } from "../../../lib/queries";
import { getRollForwardLogInput, upsertRollForwardLogInput } from "../../../lib/schemas";
import { TOOLS } from "../../../tools/listTools";
import { insertSearchOrganizerIntelligence, getSearchOrganizerIntelligence, insertCompleteSearchPackage } from "../../../lib/searchHistoryQueries";
import {
  insertSearchOrganizerIntelligenceInput,
  getSearchOrganizerIntelligenceInput,
  insertCompleteSearchPackageInput,
} from "../../../lib/searchHistorySchemas";

export const runtime = "nodejs";
export const maxDuration = 60;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function checkAuth(request: Request): Response | null {
  const apiKey = process.env.MCP_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
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

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;

  let rawBody: Record<string, unknown>;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const tool = rawBody.tool as string;
  const explicitParams = rawBody.params as Record<string, unknown> | undefined;
  // Fallback: if params weren't nested under "params", collect any extra top-level keys.
  const { tool: _t, params: _p, ...flatParams } = rawBody;
  const params: Record<string, unknown> =
    explicitParams && Object.keys(explicitParams).length > 0 ? explicitParams : flatParams;

  try {
    let result: unknown;

    switch (tool) {
      case "get_dataset_health":
        result = await getDatasetHealth();
        break;

      case "get_summary_dashboard":
        result = await getSummaryDashboard();
        break;

      case "get_trends":
        result = await getTrends(params as any);
        break;

      case "get_state_sport_coverage":
        result = await getStateSportCoverage(params as any);
        break;

      case "get_missing_fields":
        result = await getMissingFields(params as any);
        break;

      case "get_organizer_clusters":
        result = await getOrganizerClusters(params as any);
        break;

      case "get_venue_clusters":
        result = await getVenueClusters(params as any);
        break;

      case "get_missing_venues":
        result = await getMissingVenues(params as any);
        break;

      case "get_tournament_venue_worklist":
        result = await getTournamentVenueWorklist(getTournamentVenueWorklistInput.parse(params));
        break;

      case "get_association_dashboard":
        result = await getAssociationDashboard(params as any);
        break;

      case "get_email_outreach_numbers":
        result = await getEmailOutreachNumbers();
        break;

      case "get_top_organizer_domains":
        result = await getTopOrganizerDomains(params as any);
        break;

      case "get_tournaments":
        result = await getTournaments(getTournamentsInput.parse(params));
        break;

      case "find_production_matches": {
        const rawCandidates =
          typeof (params as any).candidates_json === "string"
            ? JSON.parse((params as any).candidates_json)
            : (params as any).candidates;
        const args = findProductionMatchesInput.parse({
          candidates: rawCandidates,
          max_matches_per_candidate: (params as any).max_matches_per_candidate,
        });
        result = await findProductionMatches(args.candidates, args.max_matches_per_candidate);
        break;
      }

      case "get_tournaments_by_domain":
        result = await getTournamentsByDomain(params as any);
        break;

      case "get_unverified_tournaments":
        result = await getUnverifiedTournaments(params as any);
        break;

      case "get_tournaments_missing_source_urls":
        result = await getTournamentsMissingSourceUrls(params as any);
        break;

      case "insert_research_note":
        result = await insertResearchNote(params as any);
        break;

      case "insert_tournament_candidate":
        result = await insertTournamentCandidate(params as any);
        break;

      case "upsert_organizer_watchlist":
        result = await upsertOrganizerWatchlist(params as any);
        break;

      case "get_partner_pipeline":
        result = await fetchPartnerPipeline();
        break;

      case "get_partner_links":
        result = await fetchPartnerLinks(params as any);
        break;

      case "get_partner_click_summary":
        result = await fetchPartnerClickSummary(params as any);
        break;

      case "get_fanatics_routing":
        result = await fetchFanaticsRouting(params as any);
        break;

      case "get_partner_knowledge": {
        const text = findSections(
          params?.query as string | undefined,
          params?.section as string | undefined
        );
        result = { result: text };
        break;
      }

      case "get_admin_reference": {
        const text = findAdminReference((params?.query as string) ?? "");
        result = { result: text };
        break;
      }

      case "upsert_partner":
        result = await upsertPartner(params as any);
        break;

      case "upsert_partner_link":
        result = await upsertPartnerLink(params as any);
        break;

      case "insert_partner_note":
        result = await insertPartnerNote(params as any);
        break;

      case "update_partner_status":
        result = await updatePartnerStatus(params as any);
        break;

      case "upsert_partner_placement":
        result = await upsertPartnerPlacement(params as any);
        break;

      case "insert_partner_test_result":
        result = await insertPartnerTestResult(params as any);
        break;

      case "get_search_runs":
        result = await getSearchRuns(getSearchRunsInput.parse(params));
        break;

      case "get_search_run_findings":
        result = await getSearchRunFindings(getSearchRunFindingsInput.parse(params));
        break;

      case "get_search_coverage":
        result = await getSearchCoverage(getSearchCoverageInput.parse(params));
        break;

      case "get_next_search_priorities":
        result = await getNextSearchPriorities(getNextSearchPrioritiesInput.parse(params));
        break;

      case "insert_tournament_search_run":
        result = await insertTournamentSearchRun(insertTournamentSearchRunInput.parse(params));
        break;

      case "insert_tournament_search_scope":
        result = await insertTournamentSearchScope(insertTournamentSearchScopeInput.parse(params));
        break;

      case "insert_tournament_search_finding":
        result = await insertTournamentSearchFinding(insertTournamentSearchFindingInput.parse(params));
        break;

      case "insert_tournament_search_findings":
        result = await insertTournamentSearchFindings(insertTournamentSearchFindingsInput.parse(params));
        break;

      case "finalize_tournament_search_run":
        result = await finalizeTournamentSearchRun(finalizeTournamentSearchRunInput.parse(params));
        break;

      case "insert_search_organizer_intelligence":
        result = await insertSearchOrganizerIntelligence(insertSearchOrganizerIntelligenceInput.parse(params));
        break;

      case "get_search_organizer_intelligence":
        result = await getSearchOrganizerIntelligence(getSearchOrganizerIntelligenceInput.parse(params));
        break;

      case "insert_complete_search_package":
        result = await insertCompleteSearchPackage(insertCompleteSearchPackageInput.parse(params));
        break;

      case "mcp_healthcheck":
        result = {
          status: "ok",
          writes_enabled: process.env.ENABLE_MCP_WRITES === "true",
          search_history_writes_enabled: process.env.ENABLE_SEARCH_HISTORY_WRITES === "true",
          mock_mode: process.env.MOCK_MODE === "true",
          supabase_url_present: !!process.env.SUPABASE_URL,
          anon_key_present: !!process.env.SUPABASE_ANON_KEY,
          service_role_key_present: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          ts: new Date().toISOString()
        };
        break;

      case "list_tools": {
        const writesEnabled = process.env.ENABLE_MCP_WRITES === "true";
        const searchHistoryWritesEnabled = process.env.ENABLE_SEARCH_HISTORY_WRITES === "true";
        result = {
          total: TOOLS.length,
          writes_enabled: writesEnabled,
          search_history_writes_enabled: searchHistoryWritesEnabled,
          tools: TOOLS.map((t) => ({ ...t }))
        };
        break;
      }

      case "get_roll_forward_log":
        result = await getRollForwardLog(getRollForwardLogInput.parse(params));
        break;

      case "upsert_roll_forward_log":
        result = await upsertRollForwardLog(upsertRollForwardLogInput.parse(params));
        break;

      default:
        return NextResponse.json(
          { error: "Unknown tool" },
          { status: 400, headers: CORS_HEADERS }
        );
    }

    return NextResponse.json({ result }, { headers: CORS_HEADERS });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as any).message)
          : JSON.stringify(err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
