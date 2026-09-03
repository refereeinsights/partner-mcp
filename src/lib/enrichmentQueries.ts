import { getSupabaseAdmin as getSupabaseClient } from "./supabaseAdmin";
import {
  parseProposedValue,
  canonicalProposedValue,
  type EnrichmentActionType,
  type GetTournamentEnrichmentContextInput,
  type GetTournamentEnrichmentProposalsInput,
  type UpsertTournamentEnrichmentProposalInput,
} from "./enrichmentSchemas";

function assertWritesEnabled() {
  if (process.env.ENABLE_MCP_WRITES !== "true") {
    throw new Error("Write tools are disabled. Set ENABLE_MCP_WRITES=true to enable.");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Write tools require SUPABASE_SERVICE_ROLE_KEY.");
  }
}

const TOURNAMENT_CONTEXT_COLS =
  "id,name,slug,sport,status,start_date,end_date,city,state,official_website_url,tournament_director,tournament_director_email";

const PROPOSAL_COLS =
  "id,status,action_type,field_name,current_value,proposed_value,source_url,venue_source_url," +
  "confidence,evidence_summary,research_notes,proposed_by,source_batch_id," +
  "researched_at,reviewed_at,applied_at,created_at,updated_at";

// ---------------------------------------------------------------------------
// get_tournament_enrichment_context
// ---------------------------------------------------------------------------

export async function getTournamentEnrichmentContext(input: GetTournamentEnrichmentContextInput) {
  const supabase = getSupabaseClient();

  const [tournamentResult, venueResult, proposalResult] = await Promise.all([
    supabase
      .from("tournaments")
      .select(TOURNAMENT_CONTEXT_COLS)
      .eq("id", input.tournament_id)
      .single(),

    supabase
      .from("tournament_venues")
      .select("venue_id, is_primary, venues:venue_id(id,name,address,city,state,zip)")
      .eq("tournament_id", input.tournament_id),

    supabase
      .from("tournament_enrichment_proposals")
      .select(PROPOSAL_COLS)
      .eq("tournament_id", input.tournament_id)
      .order("created_at", { ascending: false }),
  ]);

  if (tournamentResult.error || !tournamentResult.data) {
    throw new Error(`Tournament ${input.tournament_id} not found`);
  }

  const t = tournamentResult.data as Record<string, unknown>;
  const venues = ((venueResult.data ?? []) as any[]).map((row) => {
    const v = row.venues ?? {};
    return {
      venue_id: row.venue_id,
      name: v.name ?? null,
      address: v.address ?? null,
      city: v.city ?? null,
      state: v.state ?? null,
      zip: v.zip ?? null,
      is_primary: row.is_primary ?? null,
    };
  });

  const proposals = ((proposalResult.data ?? []) as any[]).map((row) => ({
    id: row.id,
    status: row.status,
    action_type: row.action_type,
    field_name: row.field_name ?? null,
    current_value: row.current_value ?? null,
    proposed_value: row.proposed_value ?? null,
    source_url: row.source_url ?? null,
    venue_source_url: row.venue_source_url ?? null,
    confidence: row.confidence,
    evidence_summary: row.evidence_summary,
    research_notes: row.research_notes ?? null,
    proposed_by: row.proposed_by ?? null,
    source_batch_id: row.source_batch_id ?? null,
    researched_at: row.researched_at ?? null,
    reviewed_at: row.reviewed_at ?? null,
    applied_at: row.applied_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  return {
    tournament: {
      id: t.id,
      name: t.name ?? null,
      slug: t.slug ?? null,
      sport: t.sport ?? null,
      status: t.status ?? null,
      start_date: t.start_date ?? null,
      end_date: t.end_date ?? null,
      city: t.city ?? null,
      state: t.state ?? null,
      official_website_url: t.official_website_url ?? null,
      tournament_director: t.tournament_director ?? null,
      tournament_director_email: t.tournament_director_email ?? null,
    },
    venues,
    proposals,
  };
}

// ---------------------------------------------------------------------------
// get_tournament_enrichment_proposals
// ---------------------------------------------------------------------------

export async function getTournamentEnrichmentProposals(input: GetTournamentEnrichmentProposalsInput) {
  const supabase = getSupabaseClient();

  // Resolve tournament IDs when sport/state filter is requested
  let tournamentIdFilter: string[] | null = null;
  if (input.sport || input.state) {
    let tq = supabase.from("tournaments").select("id");
    if (input.sport) tq = (tq as any).eq("sport", input.sport);
    if (input.state) tq = (tq as any).eq("state", input.state);
    const { data: ts } = await tq;
    tournamentIdFilter = ((ts ?? []) as any[]).map((t: any) => t.id);
    if (tournamentIdFilter.length === 0) {
      return { rows: [], total: 0, limit: input.limit, offset: input.offset, has_more: false };
    }
  }

  let query = supabase
    .from("tournament_enrichment_proposals")
    .select(
      `${PROPOSAL_COLS}, tournament:tournament_id(id,name,slug,sport,city,state)`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(input.offset, input.offset + input.limit - 1);

  if (input.tournament_id) query = (query as any).eq("tournament_id", input.tournament_id);
  if (input.status) query = (query as any).eq("status", input.status);
  if (input.action_type) query = (query as any).eq("action_type", input.action_type);
  if (input.source_batch_id) query = (query as any).eq("source_batch_id", input.source_batch_id);
  if (tournamentIdFilter) query = (query as any).in("tournament_id", tournamentIdFilter);

  const { data, error, count } = await (query as any);
  if (error) throw error;

  const total = count ?? 0;
  const rows = ((data ?? []) as any[]).map((row) => {
    const t = row.tournament ?? {};
    return {
      proposal_id: row.id,
      tournament_id: row.tournament_id,
      tournament_name: t.name ?? null,
      tournament_slug: t.slug ?? null,
      tournament_sport: t.sport ?? null,
      tournament_city: t.city ?? null,
      tournament_state: t.state ?? null,
      status: row.status,
      action_type: row.action_type,
      field_name: row.field_name ?? null,
      current_value: row.current_value ?? null,
      proposed_value: row.proposed_value ?? null,
      confidence: row.confidence,
      evidence_summary: row.evidence_summary,
      source_url: row.source_url ?? null,
      venue_source_url: row.venue_source_url ?? null,
      source_batch_id: row.source_batch_id ?? null,
      proposed_by: row.proposed_by ?? null,
      researched_at: row.researched_at ?? null,
      reviewed_at: row.reviewed_at ?? null,
      applied_at: row.applied_at ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });

  return { rows, total, limit: input.limit, offset: input.offset, has_more: input.offset + input.limit < total };
}

// ---------------------------------------------------------------------------
// current_value capture (internal)
// ---------------------------------------------------------------------------

async function captureCurrentValue(
  supabase: ReturnType<typeof getSupabaseClient>,
  actionType: EnrichmentActionType,
  tournament: Record<string, unknown>,
  venueId?: string,
): Promise<Record<string, unknown>> {
  switch (actionType) {
    case "add_official_source":
      return { url: (tournament.official_website_url as string | null) ?? null };

    case "correct_dates":
      return {
        start_date: (tournament.start_date as string | null) ?? null,
        end_date: (tournament.end_date as string | null) ?? null,
      };

    case "correct_tournament_location":
      return {
        city: (tournament.city as string | null) ?? null,
        state: (tournament.state as string | null) ?? null,
      };

    case "correct_venue": {
      if (!venueId) throw new Error("venue_id is required for action_type correct_venue");
      const { data: link } = await supabase
        .from("tournament_venues")
        .select("venue_id, venues:venue_id(id,name,address,city,state,zip)")
        .eq("tournament_id", tournament.id as string)
        .eq("venue_id", venueId)
        .maybeSingle();
      if (!link || !(link as any).venues) {
        throw new Error(
          `venue_id ${venueId} is not linked to tournament ${tournament.id}. ` +
          "Use get_tournament_enrichment_context to see linked venues."
        );
      }
      const v = (link as any).venues;
      return {
        venue_id: v.id,
        name: v.name ?? null,
        address: v.address ?? null,
        city: v.city ?? null,
        state: v.state ?? null,
        zip: v.zip ?? null,
      };
    }

    case "add_venue":
    case "add_additional_venue": {
      const { data: links } = await supabase
        .from("tournament_venues")
        .select("venue_id")
        .eq("tournament_id", tournament.id as string);
      const ids = ((links ?? []) as any[]).map((l) => l.venue_id);
      return { existing_venue_ids: ids, venue_count: ids.length };
    }

    case "merge_duplicate":
      return {
        tournament_id: tournament.id,
        name: (tournament.name as string | null) ?? null,
        slug: (tournament.slug as string | null) ?? null,
      };

    case "manual_review":
      return {
        tournament_id: tournament.id,
        name: (tournament.name as string | null) ?? null,
      };
  }
}

// ---------------------------------------------------------------------------
// upsert_tournament_enrichment_proposal
// ---------------------------------------------------------------------------

const ACTIVE_STATUSES = ["pending_review", "needs_verification", "approved"] as const;

export async function upsertTournamentEnrichmentProposal(
  input: UpsertTournamentEnrichmentProposalInput,
) {
  assertWritesEnabled();
  const supabase = getSupabaseClient();

  // 1. Parse and validate proposed_value_json for this action_type
  const proposedValue = parseProposedValue(input.action_type, input.proposed_value_json);

  // 2. Validate action-specific prerequisites at input level
  if (input.action_type === "correct_venue" && !input.venue_id) {
    throw new Error("venue_id is required when action_type is correct_venue");
  }

  // 3. Fetch the tournament — confirms it exists and gives us data for current_value
  const { data: tournament, error: tErr } = await supabase
    .from("tournaments")
    .select(TOURNAMENT_CONTEXT_COLS)
    .eq("id", input.tournament_id)
    .single();
  if (tErr || !tournament) {
    throw new Error(`Tournament ${input.tournament_id} not found`);
  }

  // 4. For merge_duplicate: verify the target duplicate tournament exists
  if (input.action_type === "merge_duplicate") {
    const dupId = (proposedValue as any).duplicate_tournament_id as string;
    const { data: dup } = await supabase
      .from("tournaments")
      .select("id")
      .eq("id", dupId)
      .single();
    if (!dup) {
      throw new Error(
        `duplicate_tournament_id ${dupId} does not exist in production. ` +
        "No match was returned by the available lookup."
      );
    }
  }

  // 5. Capture current_value from production
  const currentValue = await captureCurrentValue(
    supabase,
    input.action_type,
    tournament as Record<string, unknown>,
    input.venue_id,
  );

  // 6. Idempotency: check for an equivalent active proposal
  const canonical = canonicalProposedValue(proposedValue);
  const { data: activeProposals } = await supabase
    .from("tournament_enrichment_proposals")
    .select("id, proposed_value, status")
    .eq("tournament_id", input.tournament_id)
    .eq("action_type", input.action_type)
    .in("status", ACTIVE_STATUSES);

  const existingMatch = ((activeProposals ?? []) as any[]).find((p) => {
    try {
      return canonicalProposedValue(p.proposed_value as Record<string, unknown>) === canonical;
    } catch {
      return false;
    }
  });

  if (existingMatch) {
    // Update research metadata only — preserve status, current_value, proposed_value
    const { error: upErr } = await supabase
      .from("tournament_enrichment_proposals")
      .update({
        confidence: input.confidence,
        evidence_summary: input.evidence_summary,
        research_notes: input.research_notes ?? null,
        source_url: input.source_url ?? null,
        venue_source_url: input.venue_source_url ?? null,
        source_batch_id: input.source_batch_id ?? null,
        proposed_by: input.proposed_by ?? null,
        researched_at: input.researched_at ?? null,
      })
      .eq("id", existingMatch.id);
    if (upErr) throw upErr;

    return {
      ok: true as const,
      proposal_id: existingMatch.id as string,
      tournament_id: input.tournament_id,
      status: existingMatch.status as string,
      action_type: input.action_type,
      created_new: false,
      matched_existing_active_proposal: true,
      source_batch_id: input.source_batch_id ?? null,
    };
  }

  // 7. Insert new proposal
  const { data: inserted, error: insErr } = await supabase
    .from("tournament_enrichment_proposals")
    .insert({
      tournament_id: input.tournament_id,
      action_type: input.action_type,
      field_name: input.field_name ?? null,
      status: input.status,
      current_value: currentValue,
      proposed_value: proposedValue,
      source_url: input.source_url ?? null,
      venue_source_url: input.venue_source_url ?? null,
      confidence: input.confidence,
      evidence_summary: input.evidence_summary,
      research_notes: input.research_notes ?? null,
      proposed_by: input.proposed_by ?? null,
      researched_at: input.researched_at ?? null,
      source_batch_id: input.source_batch_id ?? null,
    })
    .select("id")
    .single();
  if (insErr) throw insErr;

  return {
    ok: true as const,
    proposal_id: (inserted as any).id as string,
    tournament_id: input.tournament_id,
    status: input.status,
    action_type: input.action_type,
    created_new: true,
    matched_existing_active_proposal: false,
    source_batch_id: input.source_batch_id ?? null,
  };
}
