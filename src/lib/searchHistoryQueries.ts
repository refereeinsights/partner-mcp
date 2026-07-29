import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "./supabaseAdmin";
import {
  SearchHistoryValidationError,
  hashPrompt,
  normalizeAndValidateSport,
  normalizeAndValidateState,
  normalizeOrganizerDomainsArray,
  normalizeOrganizerDomain,
  truncatePromptForStorage,
  validateHttpUrl,
  validateIsoDate,
  assertDateOrder,
  normalizeMonitoringUrlsArray,
  dedupeCaseInsensitiveArray,
  US_STATE_CODE_SET
} from "./searchHistoryValidation";
import {
  matchesWindowFilter,
  assertWindowOrder,
  buildFindingDedupeKey,
  resolveCompletedAt,
  resolveScopeForFinding,
  scorePriority,
  qualifiedYieldRate,
  computeUnresolvedCount,
  UnscopedReason
} from "./searchHistoryLogic";
import { supportedSportsSet, normalizeSport } from "./normalize";
import type {
  InsertTournamentSearchRunInput,
  InsertTournamentSearchScopeInput,
  InsertTournamentSearchFindingInput,
  FinalizeTournamentSearchRunInput,
  GetSearchRunsInput,
  GetSearchRunFindingsInput,
  GetSearchCoverageInput,
  GetNextSearchPrioritiesInput,
  TournamentSearchRun,
  TournamentSearchScope,
  TournamentSearchFinding,
  InsertSearchOrganizerIntelligenceInput,
  GetSearchOrganizerIntelligenceInput,
  SearchOrganizerIntelligenceRow,
  InsertCompleteSearchPackageInput,
  InsertCompleteSearchPackageOutput,
} from "./searchHistorySchemas";

// ---------------------------------------------------------------------------
// Ported from the main TournamentInsights MCP repo (src/db/searchHistoryQueries.ts).
//
// Write gating: mirrors the main repo's documented decision — search-history
// writes are the primary, high-frequency write path for this feature, so
// they use their own flag, ENABLE_SEARCH_HISTORY_WRITES, separate from
// ENABLE_MCP_WRITES (which gates the rarer admin write tools already in this
// repo: insert_research_note, insert_tournament_candidate,
// upsert_organizer_watchlist, and the partner_* tools).
//
// Unlike the main repo, this server has only one Supabase client
// (getSupabaseAdmin — always service-role) since it's a privileged
// server-to-server integration, not a client-facing analytics reader. So
// there's no separate "search-history client" here; both reads and writes
// just use getSupabaseAdmin directly.
// ---------------------------------------------------------------------------

export function assertSearchHistoryWritesEnabled() {
  if (process.env.ENABLE_SEARCH_HISTORY_WRITES !== "true") {
    throw new Error("Search-history write tools are disabled. Set ENABLE_SEARCH_HISTORY_WRITES=true to enable.");
  }
  if (process.env.MOCK_MODE === "true") return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Search-history write tools require SUPABASE_SERVICE_ROLE_KEY.");
  }
}

function mockMode(): boolean {
  return process.env.MOCK_MODE === "true";
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// In-memory mock store (MOCK_MODE=true) — mirrors src/lib/queries.ts's
// existing MOCK_TOURNAMENTS pattern so this feature can be exercised in
// local dev without a live Supabase connection.
// ---------------------------------------------------------------------------

const mockRuns: any[] = [];
const mockScopes: any[] = [];
const mockFindings: any[] = [];
const mockOrgIntel: any[] = [];

export function __resetSearchHistoryMockStore() {
  mockRuns.length = 0;
  mockScopes.length = 0;
  mockFindings.length = 0;
  mockOrgIntel.length = 0;
}

// ---------------------------------------------------------------------------
// Shared validation helpers
// ---------------------------------------------------------------------------

function normalizeStatesArray(states: string[]): string[] {
  const issues: string[] = [];
  const out: string[] = [];
  for (const s of states) {
    try {
      out.push(normalizeAndValidateState(s));
    } catch (err) {
      if (err instanceof SearchHistoryValidationError) issues.push(...err.issues);
      else throw err;
    }
  }
  if (issues.length > 0) throw new SearchHistoryValidationError(issues);
  return Array.from(new Set(out));
}

function normalizeSportsArray(sports: string[]): string[] {
  const issues: string[] = [];
  const out: string[] = [];
  for (const s of sports) {
    try {
      out.push(normalizeAndValidateSport(s));
    } catch (err) {
      if (err instanceof SearchHistoryValidationError) issues.push(...err.issues);
      else throw err;
    }
  }
  if (issues.length > 0) throw new SearchHistoryValidationError(issues);
  return Array.from(new Set(out));
}

function isValidStateBool(s: string): boolean {
  try {
    normalizeAndValidateState(s);
    return true;
  } catch {
    return false;
  }
}

function isValidSportBool(s: string): boolean {
  return !!normalizeSport(s);
}

// ---------------------------------------------------------------------------
// insert_tournament_search_run
// ---------------------------------------------------------------------------

export async function insertTournamentSearchRun(input: InsertTournamentSearchRunInput): Promise<TournamentSearchRun> {
  assertSearchHistoryWritesEnabled();

  const states = normalizeStatesArray(input.states ?? []);
  const sports = normalizeSportsArray(input.sports ?? []);

  if (input.date_from) validateIsoDate(input.date_from, "date_from");
  if (input.date_to) validateIsoDate(input.date_to, "date_to");
  assertDateOrder(input.date_from, input.date_to, "date_from/date_to");

  if (input.searched_at) validateIsoDate(input.searched_at.slice(0, 10), "searched_at");
  if (input.completed_at) validateIsoDate(input.completed_at.slice(0, 10), "completed_at");
  if (input.searched_at && input.completed_at && input.searched_at > input.completed_at) {
    throw new SearchHistoryValidationError(["searched_at must not be after completed_at"]);
  }
  if (input.next_search_after) validateIsoDate(input.next_search_after, "next_search_after");

  const organizerDomains = normalizeOrganizerDomainsArray(input.organizer_domains);
  const highValueSources = (input.high_value_sources ?? []).map((u) => validateHttpUrl(u, "high_value_sources[]"));

  let searchPromptText: string | null = null;
  let searchPromptHash: string | null = input.search_prompt_hash ?? null;
  let searchPromptTruncated = false;
  if (input.search_prompt_text) {
    searchPromptHash = hashPrompt(input.search_prompt_text);
    const { stored, truncated } = truncatePromptForStorage(input.search_prompt_text);
    searchPromptText = stored;
    searchPromptTruncated = truncated;
  }

  const row = {
    id: randomUUID(),
    region_name: input.region_name ?? null,
    states,
    sports,
    date_from: input.date_from ?? null,
    date_to: input.date_to ?? null,
    search_prompt_version: input.search_prompt_version ?? null,
    search_prompt_text: searchPromptText,
    search_prompt_hash: searchPromptHash,
    search_prompt_truncated: searchPromptTruncated,
    search_method: input.search_method ?? null,
    research_agent: input.research_agent ?? null,
    research_model: input.research_model ?? null,
    searched_at: input.searched_at ?? nowIso(),
    completed_at: input.completed_at ?? null,
    searched_by: input.searched_by ?? null,
    status: input.status ?? "completed",
    candidates_found: input.candidates_found ?? 0,
    qualified_rows: input.qualified_rows ?? 0,
    needs_venue_verification: input.needs_venue_verification ?? 0,
    needs_address_verification: input.needs_address_verification ?? 0,
    needs_date_verification: input.needs_date_verification ?? 0,
    duplicates_found: input.duplicates_found ?? 0,
    out_of_scope_found: input.out_of_scope_found ?? 0,
    organizer_domains: organizerDomains,
    organizer_names: Array.from(new Set((input.organizer_names ?? []).map((s) => s.trim()))),
    venue_names: Array.from(new Set((input.venue_names ?? []).map((s) => s.trim()))),
    high_value_sources: highValueSources,
    search_summary: input.search_summary ?? null,
    unresolved_work: input.unresolved_work ?? null,
    next_action: input.next_action ?? null,
    next_search_after: input.next_search_after ?? null,
    source_batch_id: input.source_batch_id ?? null,
    created_at: nowIso(),
    updated_at: nowIso()
  };

  if (mockMode()) {
    if (row.source_batch_id) {
      const existing = mockRuns.find((r) => r.source_batch_id === row.source_batch_id);
      if (existing) return existing;
    }
    mockRuns.push(row);
    return row;
  }

  const supabase = getSupabaseAdmin();

  // Case A: no source_batch_id — plain insert, no conflict clause.
  if (!row.source_batch_id) {
    const { data, error } = await supabase
      .from("tournament_search_runs")
      .insert(row)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as TournamentSearchRun;
  }

  // Case B: source_batch_id present — pre-check + insert pattern.
  // Avoids ON CONFLICT clause: the Supabase JS client generates
  // ON CONFLICT (source_batch_id) without a WHERE predicate, but the database
  // has a partial unique index (WHERE source_batch_id IS NOT NULL), and
  // PostgreSQL requires the conflict target to exactly match the index predicate.
  const { data: preExisting, error: preErr } = await supabase
    .from("tournament_search_runs")
    .select("*")
    .eq("source_batch_id", row.source_batch_id)
    .maybeSingle();
  if (preErr) throw new Error(preErr.message);
  if (preExisting) return preExisting as TournamentSearchRun;

  const { data, error } = await supabase
    .from("tournament_search_runs")
    .insert(row)
    .select()
    .single();
  if (!error) return data as TournamentSearchRun;

  // 23505: race condition — concurrent insert with the same source_batch_id
  if ((error as any).code === "23505") {
    const { data: raceWinner, error: raceErr } = await supabase
      .from("tournament_search_runs")
      .select("*")
      .eq("source_batch_id", row.source_batch_id)
      .single();
    if (raceErr) throw new Error(raceErr.message);
    return raceWinner as TournamentSearchRun;
  }

  throw new Error(error.message);
}

async function getRunById(runId: string): Promise<any | null> {
  if (mockMode()) {
    return mockRuns.find((r) => r.id === runId) ?? null;
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("tournament_search_runs").select("*").eq("id", runId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function assertRunExists(runId: string): Promise<any> {
  const run = await getRunById(runId);
  if (!run) throw new SearchHistoryValidationError([`search_run_id "${runId}" does not exist`]);
  return run;
}

// ---------------------------------------------------------------------------
// insert_tournament_search_scope
// ---------------------------------------------------------------------------

const METRIC_FIELDS = [
  "candidates_found",
  "qualified_rows",
  "needs_venue_verification",
  "needs_address_verification",
  "needs_date_verification",
  "duplicates_found",
  "out_of_scope_found"
] as const;

function metricsMatch(a: any, b: any): boolean {
  return METRIC_FIELDS.every((f) => (a[f] ?? 0) === (b[f] ?? 0));
}

export async function insertTournamentSearchScope(input: InsertTournamentSearchScopeInput): Promise<TournamentSearchScope> {
  assertSearchHistoryWritesEnabled();
  await assertRunExists(input.search_run_id);

  const state = normalizeAndValidateState(input.state);
  const sport = normalizeAndValidateSport(input.sport);

  const row = {
    id: randomUUID(),
    search_run_id: input.search_run_id,
    state,
    sport,
    candidates_found: input.candidates_found ?? 0,
    qualified_rows: input.qualified_rows ?? 0,
    needs_venue_verification: input.needs_venue_verification ?? 0,
    needs_address_verification: input.needs_address_verification ?? 0,
    needs_date_verification: input.needs_date_verification ?? 0,
    duplicates_found: input.duplicates_found ?? 0,
    out_of_scope_found: input.out_of_scope_found ?? 0,
    created_at: nowIso()
  };

  if (mockMode()) {
    const existing = mockScopes.find(
      (s) => s.search_run_id === row.search_run_id && s.state === row.state && s.sport === row.sport
    );
    if (existing) {
      if (metricsMatch(existing, row)) return existing;
      throw new SearchHistoryValidationError([
        `scope (${state}, ${sport}) already exists for this run with different metrics; use finalize_tournament_search_run to reconcile`
      ]);
    }
    mockScopes.push(row);
    return row;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("tournament_search_run_scopes").insert(row).select().single();
  if (!error) return data as TournamentSearchScope;

  if ((error as any).code === "23505") {
    const { data: existing, error: fetchErr } = await supabase
      .from("tournament_search_run_scopes")
      .select("*")
      .eq("search_run_id", row.search_run_id)
      .eq("state", state)
      .eq("sport", sport)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);
    if (metricsMatch(existing, row)) return existing as TournamentSearchScope;
    throw new SearchHistoryValidationError([
      `scope (${state}, ${sport}) already exists for this run with different metrics; use finalize_tournament_search_run to reconcile`
    ]);
  }
  throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// insert_tournament_search_finding / batch
// ---------------------------------------------------------------------------

const QUALIFIED_REQUIRED_FIELDS = [
  "tournament_name",
  "sport",
  "start_date",
  "end_date",
  "source_url",
  "venue_name",
  "venue_address",
  "venue_city",
  "venue_state",
  "venue_source_url"
] as const;

async function getScopeById(scopeId: string): Promise<any | null> {
  if (mockMode()) return mockScopes.find((s) => s.id === scopeId) ?? null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("tournament_search_run_scopes").select("*").eq("id", scopeId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function getFindingById(findingId: string): Promise<any | null> {
  if (mockMode()) return mockFindings.find((f) => f.id === findingId) ?? null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("tournament_search_run_findings").select("*").eq("id", findingId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function findCurrentFindingByDedupeKey(searchRunId: string, key: string): Promise<any | null> {
  if (mockMode()) {
    return (
      mockFindings.find((f) => f.search_run_id === searchRunId && f.is_current && buildFindingDedupeKey(f) === key) ?? null
    );
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tournament_search_run_findings")
    .select("*")
    .eq("search_run_id", searchRunId)
    .eq("is_current", true);
  if (error) throw new Error(error.message);
  return (data ?? []).find((f: any) => buildFindingDedupeKey(f) === key) ?? null;
}

/** Validates + normalizes one finding input. Throws SearchHistoryValidationError listing every issue. */
function validateAndNormalizeFinding(input: InsertTournamentSearchFindingInput & { search_run_id: string }) {
  const issues: string[] = [];
  const out: any = {
    search_scope_id: input.search_scope_id ?? null,
    supersedes_finding_id: input.supersedes_finding_id ?? null,
    tournament_name: input.tournament_name?.trim() ?? null,
    sport: null,
    start_date: null,
    end_date: null,
    state: null,
    candidate_status: input.candidate_status,
    source_url: null,
    venue_name: input.venue_name?.trim() ?? null,
    venue_address: input.venue_address?.trim() ?? null,
    venue_city: input.venue_city?.trim() ?? null,
    venue_state: null,
    venue_source_url: null,
    existing_tournament_id: input.existing_tournament_id ?? null,
    organizer_name: input.organizer_name?.trim() ?? null,
    organizer_domain: null,
    notes: input.notes ?? null
  };

  if (input.sport) {
    try {
      out.sport = normalizeAndValidateSport(input.sport);
    } catch (e) {
      if (e instanceof SearchHistoryValidationError) issues.push(...e.issues);
    }
  }
  if (input.state) {
    try {
      out.state = normalizeAndValidateState(input.state);
    } catch (e) {
      if (e instanceof SearchHistoryValidationError) issues.push(...e.issues);
    }
  }
  if (input.venue_state) {
    try {
      out.venue_state = normalizeAndValidateState(input.venue_state);
    } catch (e) {
      if (e instanceof SearchHistoryValidationError) issues.push(...e.issues);
    }
  }
  if (input.start_date) {
    try {
      out.start_date = validateIsoDate(input.start_date, "start_date");
    } catch (e) {
      if (e instanceof SearchHistoryValidationError) issues.push(...e.issues);
    }
  }
  if (input.end_date) {
    try {
      out.end_date = validateIsoDate(input.end_date, "end_date");
    } catch (e) {
      if (e instanceof SearchHistoryValidationError) issues.push(...e.issues);
    }
  }
  if (out.start_date && out.end_date && out.start_date > out.end_date) {
    issues.push(`start_date (${out.start_date}) must not be after end_date (${out.end_date})`);
  }
  if (input.source_url) {
    try {
      out.source_url = validateHttpUrl(input.source_url, "source_url");
    } catch (e) {
      if (e instanceof SearchHistoryValidationError) issues.push(...e.issues);
    }
  }
  if (input.venue_source_url) {
    try {
      out.venue_source_url = validateHttpUrl(input.venue_source_url, "venue_source_url");
    } catch (e) {
      if (e instanceof SearchHistoryValidationError) issues.push(...e.issues);
    }
  }
  if (input.organizer_domain) {
    try {
      out.organizer_domain = normalizeOrganizerDomain(input.organizer_domain);
    } catch (e) {
      if (e instanceof SearchHistoryValidationError) issues.push(...e.issues);
    }
  }

  if (out.candidate_status === "Qualified") {
    const missing = QUALIFIED_REQUIRED_FIELDS.filter((f) => !out[f]);
    if (missing.length > 0) {
      issues.push(`Qualified finding is missing required field(s): ${missing.join(", ")}`);
    }
  }

  if (issues.length > 0) throw new SearchHistoryValidationError(issues);
  return out;
}

export async function insertTournamentSearchFinding(
  input: InsertTournamentSearchFindingInput
): Promise<{ finding: TournamentSearchFinding; matched_existing: boolean }> {
  assertSearchHistoryWritesEnabled();
  await assertRunExists(input.search_run_id);

  if (input.search_scope_id) {
    const scope = await getScopeById(input.search_scope_id);
    if (!scope || scope.search_run_id !== input.search_run_id) {
      throw new SearchHistoryValidationError([`search_scope_id "${input.search_scope_id}" does not belong to run "${input.search_run_id}"`]);
    }
  }
  if (input.supersedes_finding_id) {
    const prior = await getFindingById(input.supersedes_finding_id);
    if (!prior || prior.search_run_id !== input.search_run_id) {
      throw new SearchHistoryValidationError([
        `supersedes_finding_id "${input.supersedes_finding_id}" does not belong to run "${input.search_run_id}"`
      ]);
    }
  }

  const normalized = validateAndNormalizeFinding(input);

  const dedupeKey = buildFindingDedupeKey({
    search_run_id: input.search_run_id,
    tournament_name: normalized.tournament_name,
    sport: normalized.sport,
    start_date: normalized.start_date,
    end_date: normalized.end_date,
    venue_name: normalized.venue_name,
    venue_state: normalized.venue_state
  });

  const existingCurrent = await findCurrentFindingByDedupeKey(input.search_run_id, dedupeKey);
  if (existingCurrent && !input.supersedes_finding_id) {
    return { finding: existingCurrent, matched_existing: true };
  }

  const row = {
    id: randomUUID(),
    search_run_id: input.search_run_id,
    is_current: true,
    created_at: nowIso(),
    ...normalized
  };

  if (mockMode()) {
    mockFindings.push(row);
    if (input.supersedes_finding_id) {
      const prior = mockFindings.find((f) => f.id === input.supersedes_finding_id);
      if (prior) prior.is_current = false;
    }
    return { finding: row, matched_existing: false };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("tournament_search_run_findings").insert(row).select().single();
  if (error) {
    if ((error as any).code === "23505") {
      const existing = await findCurrentFindingByDedupeKey(input.search_run_id, dedupeKey);
      if (existing) return { finding: existing as TournamentSearchFinding, matched_existing: true };
    }
    throw new Error(error.message);
  }

  // Supersession note (documented deviation, same as main repo): no
  // RPC/transaction wrapper exists yet, so insert + supersede-prior are two
  // sequential statements, not one atomic transaction.
  if (input.supersedes_finding_id) {
    const { error: supersedeErr } = await supabase
      .from("tournament_search_run_findings")
      .update({ is_current: false })
      .eq("id", input.supersedes_finding_id);
    if (supersedeErr) throw new Error(supersedeErr.message);
  }

  return { finding: data as TournamentSearchFinding, matched_existing: false };
}

export async function insertTournamentSearchFindings(input: {
  search_run_id: string;
  findings: Array<Omit<InsertTournamentSearchFindingInput, "search_run_id">>;
}): Promise<{
  inserted: TournamentSearchFinding[];
  matched_existing: TournamentSearchFinding[];
  errors: Array<{ index: number; issues: string[] }>;
}> {
  assertSearchHistoryWritesEnabled();
  await assertRunExists(input.search_run_id);

  const errors: Array<{ index: number; issues: string[] }> = [];
  const validated: any[] = [];

  input.findings.forEach((f, index) => {
    try {
      const normalized = validateAndNormalizeFinding({ ...f, search_run_id: input.search_run_id } as any);
      validated.push(normalized);
    } catch (e) {
      if (e instanceof SearchHistoryValidationError) errors.push({ index, issues: e.issues });
      else throw e;
    }
  });

  if (errors.length > 0) {
    return { inserted: [], matched_existing: [], errors };
  }

  const inserted: TournamentSearchFinding[] = [];
  const matchedExisting: TournamentSearchFinding[] = [];
  const insertedIdsThisBatch: string[] = [];

  try {
    for (const normalized of validated) {
      const dedupeKey = buildFindingDedupeKey({
        search_run_id: input.search_run_id,
        tournament_name: normalized.tournament_name,
        sport: normalized.sport,
        start_date: normalized.start_date,
        end_date: normalized.end_date,
        venue_name: normalized.venue_name,
        venue_state: normalized.venue_state
      });
      const existing = await findCurrentFindingByDedupeKey(input.search_run_id, dedupeKey);
      if (existing) {
        matchedExisting.push(existing);
        continue;
      }

      const row = {
        id: randomUUID(),
        search_run_id: input.search_run_id,
        is_current: true,
        created_at: nowIso(),
        ...normalized
      };

      if (mockMode()) {
        mockFindings.push(row);
      } else {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.from("tournament_search_run_findings").insert(row).select().single();
        if (error) throw new Error(error.message);
        Object.assign(row, data);
      }
      insertedIdsThisBatch.push(row.id);
      inserted.push(row);
    }
  } catch (err) {
    // Compensating rollback (documented deviation, same as main repo): no
    // DB transaction wrapper exists yet, so best-effort delete any rows
    // inserted earlier in this same batch call.
    if (insertedIdsThisBatch.length > 0) {
      if (mockMode()) {
        for (const id of insertedIdsThisBatch) {
          const idx = mockFindings.findIndex((f) => f.id === id);
          if (idx >= 0) mockFindings.splice(idx, 1);
        }
      } else {
        const supabase = getSupabaseAdmin();
        await supabase.from("tournament_search_run_findings").delete().in("id", insertedIdsThisBatch);
      }
    }
    throw err;
  }

  return { inserted, matched_existing: matchedExisting, errors: [] };
}

// ---------------------------------------------------------------------------
// finalize_tournament_search_run
// ---------------------------------------------------------------------------

async function getScopesForRun(runId: string): Promise<any[]> {
  if (mockMode()) return mockScopes.filter((s) => s.search_run_id === runId);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("tournament_search_run_scopes").select("*").eq("search_run_id", runId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function getCurrentFindingsForRun(runId: string): Promise<any[]> {
  if (mockMode()) return mockFindings.filter((f) => f.search_run_id === runId && f.is_current);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tournament_search_run_findings")
    .select("*")
    .eq("search_run_id", runId)
    .eq("is_current", true);
  if (error) throw new Error(error.message);
  return data ?? [];
}

function countMetricsForFindings(findings: any[]) {
  const metrics = {
    candidates_found: findings.length,
    qualified_rows: 0,
    needs_venue_verification: 0,
    needs_address_verification: 0,
    needs_date_verification: 0,
    duplicates_found: 0,
    out_of_scope_found: 0
  };
  for (const f of findings) {
    switch (f.candidate_status) {
      case "Qualified":
        metrics.qualified_rows++;
        break;
      case "Needs Venue Verification":
        metrics.needs_venue_verification++;
        break;
      case "Needs Address Verification":
        metrics.needs_address_verification++;
        break;
      case "Needs Date Verification":
        metrics.needs_date_verification++;
        break;
      case "Duplicate":
        metrics.duplicates_found++;
        break;
      default:
        metrics.out_of_scope_found++;
    }
  }
  return metrics;
}

export async function finalizeTournamentSearchRun(input: FinalizeTournamentSearchRunInput): Promise<{
  run: TournamentSearchRun;
  scopes: TournamentSearchScope[];
  unscoped_findings: Array<{ finding_id: string; reason: UnscopedReason }>;
}> {
  assertSearchHistoryWritesEnabled();

  const run = await assertRunExists(input.search_run_id);

  if (run.status === "planned" || run.status === "paused") {
    throw new SearchHistoryValidationError([
      `run "${input.search_run_id}" has status "${run.status}"; transition it to in_progress, completed, or needs_follow_up before finalizing`
    ]);
  }

  if (input.completed_at) validateIsoDate(input.completed_at.slice(0, 10), "completed_at");

  const resolution = resolveCompletedAt({
    existingCompletedAt: run.completed_at,
    searchedAt: run.searched_at,
    suppliedCompletedAt: input.completed_at
  });
  if (resolution.conflict) {
    throw new SearchHistoryValidationError([resolution.conflictReason!]);
  }

  const scopes = await getScopesForRun(input.search_run_id);
  const findings = await getCurrentFindingsForRun(input.search_run_id);

  const unscoped: Array<{ finding_id: string; reason: UnscopedReason }> = [];
  const findingsByScopeId = new Map<string, any[]>();
  const scopeIdUpdates: Array<{ findingId: string; scopeId: string }> = [];

  for (const finding of findings) {
    let scopeId: string | null = finding.search_scope_id ?? null;

    if (!scopeId) {
      const resolved = resolveScopeForFinding({
        explicitScopeId: null,
        findingState: finding.state,
        findingSport: finding.sport,
        scopesForRun: scopes.map((s) => ({ id: s.id, state: s.state, sport: s.sport })),
        isValidState: isValidStateBool,
        isValidSport: isValidSportBool
      });
      if ("unscoped" in resolved) {
        unscoped.push({ finding_id: finding.id, reason: resolved.unscoped });
        continue;
      }
      scopeId = resolved.scopeId;
      scopeIdUpdates.push({ findingId: finding.id, scopeId });
    }

    if (!findingsByScopeId.has(scopeId)) findingsByScopeId.set(scopeId, []);
    findingsByScopeId.get(scopeId)!.push(finding);
  }

  // Persist resolved scope IDs.
  for (const { findingId, scopeId } of scopeIdUpdates) {
    if (mockMode()) {
      const f = mockFindings.find((x) => x.id === findingId);
      if (f) f.search_scope_id = scopeId;
    } else {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase
        .from("tournament_search_run_findings")
        .update({ search_scope_id: scopeId })
        .eq("id", findingId);
      if (error) throw new Error(error.message);
    }
  }

  // Reconcile scope metrics authoritatively from current findings.
  const updatedScopes: TournamentSearchScope[] = [];
  for (const scope of scopes) {
    const scopeFindings = findingsByScopeId.get(scope.id) ?? [];
    const metrics = countMetricsForFindings(scopeFindings);
    const updated = { ...scope, ...metrics };
    if (mockMode()) {
      Object.assign(scope, metrics);
    } else {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.from("tournament_search_run_scopes").update(metrics).eq("id", scope.id);
      if (error) throw new Error(error.message);
    }
    updatedScopes.push(updated);
  }

  // Run-level totals reflect ALL current findings (scoped and unscoped).
  const runMetrics = countMetricsForFindings(findings);

  const status = input.status ?? (run.status === "in_progress" ? "completed" : run.status);

  const runUpdate = {
    status,
    completed_at: resolution.completedAt,
    ...runMetrics,
    search_summary: input.search_summary ?? run.search_summary,
    unresolved_work: input.unresolved_work ?? run.unresolved_work,
    next_action: input.next_action ?? run.next_action,
    next_search_after: input.next_search_after ?? run.next_search_after,
    updated_at: nowIso()
  };

  let updatedRun: TournamentSearchRun;
  if (mockMode()) {
    Object.assign(run, runUpdate);
    updatedRun = run;
  } else {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("tournament_search_runs")
      .update(runUpdate)
      .eq("id", input.search_run_id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    updatedRun = data as TournamentSearchRun;
  }

  return { run: updatedRun, scopes: updatedScopes, unscoped_findings: unscoped };
}

// ---------------------------------------------------------------------------
// get_search_runs
// ---------------------------------------------------------------------------

export async function getSearchRuns(filters: GetSearchRunsInput): Promise<{ data: TournamentSearchRun[]; total: number }> {
  assertWindowOrder(filters.window_from, filters.window_to, "window");

  const all = mockMode() ? [...mockRuns] : await (async () => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("tournament_search_runs").select("*");
    if (error) throw new Error(error.message);
    return data ?? [];
  })();

  const state = filters.state ? normalizeAndValidateState(filters.state) : undefined;
  const sport = filters.sport ? normalizeAndValidateSport(filters.sport) : undefined;

  const filtered = all.filter((run: any) => {
    if (state && !run.states.includes(state)) return false;
    if (sport && !run.sports.includes(sport)) return false;
    if (filters.region_name && run.region_name !== filters.region_name) return false;
    if (filters.status && run.status !== filters.status) return false;
    if (filters.source_batch_id && run.source_batch_id !== filters.source_batch_id) return false;
    if (filters.searched_from && run.searched_at < filters.searched_from) return false;
    if (filters.searched_to && run.searched_at > filters.searched_to) return false;
    if (
      !matchesWindowFilter(
        { from: run.date_from, to: run.date_to },
        { from: filters.window_from, to: filters.window_to }
      )
    )
      return false;
    return true;
  });

  filtered.sort((a, b) => (a.searched_at < b.searched_at ? 1 : a.searched_at > b.searched_at ? -1 : 0));

  const total = filtered.length;
  const page = filtered.slice(filters.offset, filters.offset + filters.limit);
  return { data: page, total };
}

// ---------------------------------------------------------------------------
// get_search_run_findings
// ---------------------------------------------------------------------------

export async function getSearchRunFindings(
  filters: GetSearchRunFindingsInput
): Promise<{ data: TournamentSearchFinding[]; total: number }> {
  assertWindowOrder(filters.window_from, filters.window_to, "window");

  const all = mockMode() ? [...mockFindings] : await (async () => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("tournament_search_run_findings").select("*");
    if (error) throw new Error(error.message);
    return data ?? [];
  })();

  const state = filters.state ? normalizeAndValidateState(filters.state) : undefined;
  const sport = filters.sport ? normalizeAndValidateSport(filters.sport) : undefined;

  const filtered = all.filter((f: any) => {
    if (filters.current_only && !f.is_current) return false;
    if (filters.search_run_id && f.search_run_id !== filters.search_run_id) return false;
    if (filters.search_scope_id && f.search_scope_id !== filters.search_scope_id) return false;
    if (state && f.state !== state) return false;
    if (sport && f.sport !== sport) return false;
    if (filters.candidate_status && f.candidate_status !== filters.candidate_status) return false;
    if (filters.organizer_domain && f.organizer_domain !== filters.organizer_domain) return false;
    if (
      !matchesWindowFilter(
        { from: f.start_date, to: f.end_date },
        { from: filters.window_from, to: filters.window_to }
      )
    )
      return false;
    return true;
  });

  filtered.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));

  const total = filtered.length;
  const page = filtered.slice(filters.offset, filters.offset + filters.limit);
  return { data: page, total };
}

// ---------------------------------------------------------------------------
// get_search_coverage
//
// Staged to avoid join fan-out: numeric metrics are summed from scope rows
// only (Stage B); organizer_domains/high_value_sources are gathered from
// distinct contributing runs and deduplicated separately (Stage C).
// ---------------------------------------------------------------------------

export async function getSearchCoverage(filters: GetSearchCoverageInput): Promise<any[]> {
  assertWindowOrder(filters.window_from, filters.window_to, "window");

  const allRuns = mockMode() ? [...mockRuns] : await (async () => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("tournament_search_runs").select("*");
    if (error) throw new Error(error.message);
    return data ?? [];
  })();
  const allScopes = mockMode() ? [...mockScopes] : await (async () => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("tournament_search_run_scopes").select("*");
    if (error) throw new Error(error.message);
    return data ?? [];
  })();

  const requestedStates = filters.states ? new Set(filters.states.map((s) => normalizeAndValidateState(s))) : null;
  const requestedSports = filters.sports ? new Set(filters.sports.map((s) => normalizeAndValidateSport(s))) : null;

  // Stage A: eligible runs.
  const eligibleRuns = allRuns.filter((run: any) => {
    if (filters.searched_from && run.searched_at < filters.searched_from) return false;
    if (filters.searched_to && run.searched_at > filters.searched_to) return false;
    if (
      !matchesWindowFilter(
        { from: run.date_from, to: run.date_to },
        { from: filters.window_from, to: filters.window_to }
      )
    )
      return false;
    return true;
  });
  const eligibleRunIds = new Set(eligibleRuns.map((r: any) => r.id));
  const runById = new Map(eligibleRuns.map((r: any) => [r.id, r]));

  // Stage B: scope metrics, grouped by (state, sport).
  const groups = new Map<string, any>();
  for (const scope of allScopes) {
    if (!eligibleRunIds.has(scope.search_run_id)) continue;
    if (requestedStates && !requestedStates.has(scope.state)) continue;
    if (requestedSports && !requestedSports.has(scope.sport)) continue;

    const key = `${scope.state}::${scope.sport}`;
    if (!groups.has(key)) {
      groups.set(key, {
        state: scope.state,
        sport: scope.sport,
        run_count: new Set<string>(),
        candidates_found: 0,
        qualified_rows: 0,
        needs_venue_verification: 0,
        needs_address_verification: 0,
        needs_date_verification: 0,
        duplicates_found: 0,
        out_of_scope_found: 0
      });
    }
    const g = groups.get(key);
    g.run_count.add(scope.search_run_id);
    for (const f of METRIC_FIELDS) g[f] += scope[f] ?? 0;
  }

  // Stage C: run-level arrays, deduped per group from distinct contributing runs.
  // Latest-run metadata: deterministic ordering (searched_at desc, created_at desc, id desc).
  const results: any[] = [];
  for (const g of groups.values()) {
    const contributingRunIds = Array.from(g.run_count) as string[];
    const contributingRuns = contributingRunIds.map((id) => runById.get(id)).filter(Boolean);

    const organizerDomains = new Set<string>();
    const highValueSources = new Set<string>();
    for (const run of contributingRuns) {
      for (const d of run.organizer_domains ?? []) organizerDomains.add(d);
      for (const s of run.high_value_sources ?? []) highValueSources.add(s);
    }

    const latest = [...contributingRuns].sort((a: any, b: any) => {
      if (a.searched_at !== b.searched_at) return a.searched_at < b.searched_at ? 1 : -1;
      if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    })[0];

    results.push({
      state: g.state,
      sport: g.sport,
      run_count: contributingRunIds.length,
      last_searched_at: latest?.searched_at ?? null,
      last_date_from: latest?.date_from ?? null,
      last_date_to: latest?.date_to ?? null,
      candidates_found: g.candidates_found,
      qualified_rows: g.qualified_rows,
      needs_venue_verification: g.needs_venue_verification,
      needs_address_verification: g.needs_address_verification,
      needs_date_verification: g.needs_date_verification,
      duplicates_found: g.duplicates_found,
      out_of_scope_found: g.out_of_scope_found,
      qualified_yield_rate: qualifiedYieldRate(g.qualified_rows, g.candidates_found),
      latest_next_action: latest?.next_action ?? null,
      next_search_after: latest?.next_search_after ?? null,
      organizer_domains: Array.from(organizerDomains).sort(),
      high_value_sources: Array.from(highValueSources).sort()
    });
  }

  results.sort((a, b) => (a.state === b.state ? a.sport.localeCompare(b.sport) : a.state.localeCompare(b.state)));
  return results.slice(0, filters.limit);
}

// ---------------------------------------------------------------------------
// get_next_search_priorities
//
// No canonical state-and-sport "coverage universe" exists in this codebase.
// Per the source prompt's explicit instruction not to fabricate a national
// coverage universe, this always uses the scope-table fallback: it can only
// surface combinations that have been searched at least once.
// ---------------------------------------------------------------------------

export async function getNextSearchPriorities(filters: GetNextSearchPrioritiesInput): Promise<{
  data: any[];
  universe_source: "canonical" | "scope_table_fallback";
  fallback_limitation: string | null;
}> {
  const coverage = await getSearchCoverage({
    states: filters.states,
    sports: filters.sports,
    window_from: filters.window_from,
    window_to: filters.window_to,
    limit: 100000
  } as GetSearchCoverageInput);

  const today = nowIso();
  const scored = coverage.map((row) => {
    const { score, reasons } = scorePriority(
      {
        state: row.state,
        sport: row.sport,
        run_count: row.run_count,
        last_searched_at: row.last_searched_at,
        qualified_yield_rate: row.qualified_yield_rate,
        needs_venue_verification: row.needs_venue_verification,
        needs_address_verification: row.needs_address_verification,
        needs_date_verification: row.needs_date_verification,
        next_action: row.latest_next_action,
        next_search_after: row.next_search_after,
        organizer_domains: row.organizer_domains,
        high_value_sources: row.high_value_sources
      },
      today
    );
    return {
      state: row.state,
      sport: row.sport,
      priority_score: score,
      priority_reasons: reasons,
      last_searched_at: row.last_searched_at,
      qualified_yield_rate: row.qualified_yield_rate,
      unresolved_count: computeUnresolvedCount(row),
      next_action: row.latest_next_action,
      next_search_after: row.next_search_after
    };
  });

  scored.sort((a, b) => b.priority_score - a.priority_score);

  return {
    data: scored.slice(0, filters.limit),
    universe_source: "scope_table_fallback",
    fallback_limitation:
      "Only state-and-sport combinations that already have at least one tournament_search_run_scopes row can appear here. Combinations never searched are invisible to this tool."
  };
}

// ---------------------------------------------------------------------------
// insert_search_organizer_intelligence
// ---------------------------------------------------------------------------

function orgIntelRowsMatch(a: any, b: any): boolean {
  const arrEq = (x: string[], y: string[]) =>
    JSON.stringify([...x].sort()) === JSON.stringify([...y].sort());
  return (
    a.organizer_name === b.organizer_name &&
    a.confidence_level === b.confidence_level &&
    a.evidence_summary === b.evidence_summary &&
    arrEq(a.states, b.states) &&
    arrEq(a.sports, b.sports) &&
    arrEq(a.tournament_families, b.tournament_families) &&
    arrEq(a.venue_clusters, b.venue_clusters) &&
    arrEq(a.monitoring_urls, b.monitoring_urls) &&
    a.recommended_cadence === b.recommended_cadence &&
    a.next_monitor_after === b.next_monitor_after &&
    a.registration_platform === b.registration_platform &&
    a.scheduling_platform === b.scheduling_platform &&
    a.notes === b.notes
  );
}

export async function insertSearchOrganizerIntelligence(
  input: InsertSearchOrganizerIntelligenceInput
): Promise<{ row: SearchOrganizerIntelligenceRow; inserted: boolean }> {
  assertSearchHistoryWritesEnabled();
  await assertRunExists(input.search_run_id);

  const domain = normalizeOrganizerDomain(input.organizer_domain);

  if (!input.evidence_summary?.trim()) {
    throw new SearchHistoryValidationError(["evidence_summary is required for all confidence levels"]);
  }

  const states = normalizeStatesArray(input.states ?? []);
  const sports = normalizeSportsArray(input.sports ?? []);
  const families = dedupeCaseInsensitiveArray(
    (input.tournament_families ?? []).map((s) => s.trim()).filter(Boolean)
  );
  const clusters = dedupeCaseInsensitiveArray(
    (input.venue_clusters ?? []).map((s) => s.trim()).filter(Boolean)
  );
  const monitoringUrls = normalizeMonitoringUrlsArray(input.monitoring_urls);

  if (input.next_monitor_after) {
    validateIsoDate(input.next_monitor_after, "next_monitor_after");
  }

  const row = {
    id: randomUUID(),
    search_run_id: input.search_run_id,
    organizer_name: input.organizer_name?.trim() ?? null,
    organizer_domain: domain,
    confidence_level: input.confidence_level,
    evidence_summary: input.evidence_summary.trim(),
    states,
    sports,
    tournament_families: families,
    venue_clusters: clusters,
    monitoring_urls: monitoringUrls,
    recommended_cadence: input.recommended_cadence?.trim() ?? null,
    next_monitor_after: input.next_monitor_after ?? null,
    registration_platform: input.registration_platform?.trim() ?? null,
    scheduling_platform: input.scheduling_platform?.trim() ?? null,
    notes: input.notes ?? null,
    created_at: nowIso()
  };

  if (mockMode()) {
    const existing = mockOrgIntel.find(
      (r) => r.search_run_id === row.search_run_id && r.organizer_domain === row.organizer_domain
    );
    if (existing) {
      if (orgIntelRowsMatch(existing, row)) return { row: existing, inserted: false };
      throw new SearchHistoryValidationError([
        `organizer intelligence for "${domain}" already exists for this run with different data; ` +
          `use get_search_organizer_intelligence to retrieve the existing row`
      ]);
    }
    mockOrgIntel.push(row);
    return { row, inserted: true };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tournament_search_organizer_intelligence")
    .insert(row)
    .select()
    .single();

  if (!error) return { row: data as SearchOrganizerIntelligenceRow, inserted: true };

  if ((error as any).code === "23505") {
    const { data: existing, error: fetchErr } = await supabase
      .from("tournament_search_organizer_intelligence")
      .select("*")
      .eq("search_run_id", input.search_run_id)
      .eq("organizer_domain", domain)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);
    if (orgIntelRowsMatch(existing, row)) return { row: existing as SearchOrganizerIntelligenceRow, inserted: false };
    throw new SearchHistoryValidationError([
      `organizer intelligence for "${domain}" already exists for this run with different data; ` +
        `use get_search_organizer_intelligence to retrieve the existing row`
    ]);
  }

  throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// get_search_organizer_intelligence
// ---------------------------------------------------------------------------

export async function getSearchOrganizerIntelligence(
  filters: GetSearchOrganizerIntelligenceInput
): Promise<{ data: SearchOrganizerIntelligenceRow[]; total: number; limit: number; offset: number }> {
  const domain = filters.organizer_domain ? normalizeOrganizerDomain(filters.organizer_domain) : undefined;
  const state = filters.state ? normalizeAndValidateState(filters.state) : undefined;
  const sport = filters.sport ? normalizeAndValidateSport(filters.sport) : undefined;

  if (filters.next_monitor_from) validateIsoDate(filters.next_monitor_from, "next_monitor_from");
  if (filters.next_monitor_to) validateIsoDate(filters.next_monitor_to, "next_monitor_to");
  assertDateOrder(filters.next_monitor_from, filters.next_monitor_to, "next_monitor_from/next_monitor_to");

  if (mockMode()) {
    let filtered = [...mockOrgIntel];
    if (filters.search_run_id) filtered = filtered.filter((r) => r.search_run_id === filters.search_run_id);
    if (domain) filtered = filtered.filter((r) => r.organizer_domain === domain);
    if (filters.confidence_level) filtered = filtered.filter((r) => r.confidence_level === filters.confidence_level);
    if (state) filtered = filtered.filter((r) => r.states.includes(state));
    if (sport) filtered = filtered.filter((r) => r.sports.includes(sport));
    if (filters.next_monitor_from)
      filtered = filtered.filter((r) => r.next_monitor_after && r.next_monitor_after >= filters.next_monitor_from!);
    if (filters.next_monitor_to)
      filtered = filtered.filter((r) => r.next_monitor_after && r.next_monitor_after <= filters.next_monitor_to!);
    filtered.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const total = filtered.length;
    return {
      data: filtered.slice(filters.offset, filters.offset + filters.limit),
      total,
      limit: filters.limit,
      offset: filters.offset
    };
  }

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("tournament_search_organizer_intelligence")
    .select("*", { count: "exact" });

  if (filters.search_run_id) query = query.eq("search_run_id", filters.search_run_id);
  if (domain) query = query.eq("organizer_domain", domain);
  if (filters.confidence_level) query = query.eq("confidence_level", filters.confidence_level);
  if (state) query = query.contains("states", [state]);
  if (sport) query = query.contains("sports", [sport]);
  if (filters.next_monitor_from) query = query.gte("next_monitor_after", filters.next_monitor_from);
  if (filters.next_monitor_to) query = query.lte("next_monitor_after", filters.next_monitor_to);

  query = (query as any).order("created_at", { ascending: false });
  query = (query as any).range(filters.offset, filters.offset + filters.limit - 1);

  const { data, error, count } = await (query as any);
  if (error) throw new Error(error.message);

  return {
    data: (data ?? []) as SearchOrganizerIntelligenceRow[],
    total: count ?? 0,
    limit: filters.limit,
    offset: filters.offset
  };
}

export { US_STATE_CODE_SET, supportedSportsSet };

// ---------------------------------------------------------------------------
// insert_complete_search_package
// ---------------------------------------------------------------------------

// Internal normalized shapes passed to the RPC / mock path.
interface NormalizedRpcRun {
  id: string;
  source_batch_id: string;
  region_name: string | null;
  states: string[];
  sports: string[];
  date_from: string | null;
  date_to: string | null;
  search_prompt_version: string | null;
  search_prompt_text: string | null;
  search_prompt_hash: string | null;
  search_prompt_truncated: boolean;
  search_method: string | null;
  research_agent: string | null;
  research_model: string | null;
  searched_at: string;
  searched_by: string | null;
  search_summary: string | null;
  unresolved_work: string | null;
  next_action: string | null;
  next_search_after: string | null;
  seasonality_conclusion: string | null;
  organizer_domains: string[];
  organizer_names: string[];
  venue_names: string[];
  high_value_sources: string[];
}

interface NormalizedRpcFinding {
  _input_index: number;
  resolved_scope_state: string;
  resolved_scope_sport: string;
  candidate_status: string;
  tournament_name: string | null;
  sport: string | null;
  start_date: string | null;
  end_date: string | null;
  state: string | null;
  source_url: string | null;
  venue_name: string | null;
  venue_address: string | null;
  venue_city: string | null;
  venue_state: string | null;
  venue_source_url: string | null;
  existing_tournament_id: string | null;
  organizer_name: string | null;
  organizer_domain: string | null;
  notes: string | null;
  supersedes_finding_id: string | null;
}

interface NormalizedRpcOrgIntel {
  organizer_name: string | null;
  organizer_domain: string;
  confidence_level: string;
  evidence_summary: string;
  states: string[];
  sports: string[];
  tournament_families: string[];
  venue_clusters: string[];
  monitoring_urls: string[];
  recommended_cadence: string | null;
  next_monitor_after: string | null;
  registration_platform: string | null;
  scheduling_platform: string | null;
  notes: string | null;
}

interface NormalizedRpcPayload {
  run: NormalizedRpcRun;
  scopes: Array<{ state: string; sport: string }>;
  findings: Array<Omit<NormalizedRpcFinding, "_input_index">>;
  organizer_intelligence: NormalizedRpcOrgIntel[];
  finalize: boolean;
}

// Detect markdown-formatted URLs like [text](https://...) before validateHttpUrl.
function checkMarkdownUrl(value: string | undefined, fieldPath: string, errors: string[]): void {
  if (!value) return;
  if (/^\s*\[.*\]\(.*\)\s*$/.test(value.trim())) {
    errors.push(
      `${fieldPath}: markdown link detected — provide a raw URL (e.g. https://example.com), not [text](url) syntax`
    );
  }
}

// Resolve which package scope a finding belongs to.
// Returns { resolvedState, resolvedSport } or null (and pushes to errors).
function resolvePackageScopeForFinding(
  finding: { search_scope_index?: number; state?: string; sport?: string },
  normalizedScopes: Array<{ state: string; sport: string }>,
  findingIndex: number,
  errors: string[]
): { resolvedState: string; resolvedSport: string } | null {
  const { search_scope_index } = finding;

  if (search_scope_index !== undefined) {
    if (search_scope_index < 0 || search_scope_index >= normalizedScopes.length) {
      errors.push(
        `findings[${findingIndex}].search_scope_index: ${search_scope_index} is out of range (package has ${normalizedScopes.length} scope(s), valid indices 0–${normalizedScopes.length - 1})`
      );
      return null;
    }
    const s = normalizedScopes[search_scope_index];
    return { resolvedState: s.state, resolvedSport: s.sport };
  }

  if (normalizedScopes.length === 1) {
    return { resolvedState: normalizedScopes[0].state, resolvedSport: normalizedScopes[0].sport };
  }

  // Multi-scope: state+sport fallback
  let ns: string | null = null;
  let nsp: string | null = null;
  try { if (finding.state) ns = normalizeAndValidateState(finding.state); } catch { /* caught below */ }
  try { if (finding.sport) nsp = normalizeAndValidateSport(finding.sport); } catch { /* caught below */ }

  if (!ns || !nsp) {
    errors.push(
      `findings[${findingIndex}]: multiple scopes in package — provide search_scope_index or include valid state and sport to auto-assign`
    );
    return null;
  }

  const matches = normalizedScopes.filter(s => s.state === ns && s.sport === nsp);
  if (matches.length === 1) return { resolvedState: matches[0].state, resolvedSport: matches[0].sport };
  if (matches.length === 0) {
    errors.push(
      `findings[${findingIndex}]: no package scope matches state="${ns}" sport="${nsp}" — add a matching scope or set search_scope_index`
    );
    return null;
  }
  errors.push(`findings[${findingIndex}]: ambiguous scope match for state="${ns}" sport="${nsp}" — use search_scope_index`);
  return null;
}

// Compare two sorted string arrays for set equality.
function sortedArraysEqual(a: string[], b: string[]): boolean {
  const sa = [...a].sort();
  const sb = [...b].sort();
  return JSON.stringify(sa) === JSON.stringify(sb);
}

// Detect conflicts between incoming normalized run fields and a stored run.
function detectRunConflicts(
  incoming: NormalizedRpcRun,
  stored: any
): Array<{ path: string; stored_value: unknown; incoming_value: unknown }> {
  const conflicts: Array<{ path: string; stored_value: unknown; incoming_value: unknown }> = [];

  const strField = (path: string, inc: string | null, sto: string | null | undefined) => {
    if (inc !== null && inc !== (sto ?? null)) {
      conflicts.push({ path, stored_value: sto ?? null, incoming_value: inc });
    }
  };

  strField("run.region_name", incoming.region_name, stored.region_name);
  strField("run.date_from", incoming.date_from, stored.date_from);
  strField("run.date_to", incoming.date_to, stored.date_to);
  strField("run.search_method", incoming.search_method, stored.search_method);

  if (incoming.states.length > 0 && !sortedArraysEqual(incoming.states, stored.states ?? [])) {
    conflicts.push({ path: "run.states", stored_value: stored.states, incoming_value: incoming.states });
  }
  if (incoming.sports.length > 0 && !sortedArraysEqual(incoming.sports, stored.sports ?? [])) {
    conflicts.push({ path: "run.sports", stored_value: stored.sports, incoming_value: incoming.sports });
  }

  return conflicts;
}

// Execute the complete package in mock mode (no DB required).
function executeMockPackage(payload: NormalizedRpcPayload): InsertCompleteSearchPackageOutput {
  const { run, scopes, findings, organizer_intelligence: orgIntelList, finalize } = payload;
  const now = nowIso();

  // 1. Run
  const existingRun = mockRuns.find((r: any) => r.source_batch_id === run.source_batch_id);
  let runId: string;
  let packageStatus: "created" | "reused";

  if (existingRun) {
    const conflicts = detectRunConflicts(run, existingRun);
    if (conflicts.length > 0) {
      return { status: "conflict", search_run_id: existingRun.id, source_batch_id: run.source_batch_id, conflicts };
    }
    runId = existingRun.id;
    packageStatus = "reused";
  } else {
    runId = run.id;
    const runRow: any = {
      id: runId,
      region_name: run.region_name,
      states: run.states,
      sports: run.sports,
      date_from: run.date_from,
      date_to: run.date_to,
      search_prompt_version: run.search_prompt_version,
      search_prompt_text: run.search_prompt_text,
      search_prompt_hash: run.search_prompt_hash,
      search_prompt_truncated: run.search_prompt_truncated,
      search_method: run.search_method,
      research_agent: run.research_agent,
      research_model: run.research_model,
      searched_at: run.searched_at,
      searched_by: run.searched_by,
      status: "in_progress",
      candidates_found: 0, qualified_rows: 0, needs_venue_verification: 0,
      needs_address_verification: 0, needs_date_verification: 0,
      duplicates_found: 0, out_of_scope_found: 0,
      organizer_domains: run.organizer_domains,
      organizer_names: run.organizer_names,
      venue_names: run.venue_names,
      high_value_sources: run.high_value_sources,
      search_summary: run.search_summary,
      unresolved_work: run.unresolved_work,
      next_action: run.next_action,
      next_search_after: run.next_search_after,
      seasonality_conclusion: run.seasonality_conclusion,
      source_batch_id: run.source_batch_id,
      completed_at: null,
      created_at: now,
      updated_at: now,
    };
    mockRuns.push(runRow);
    packageStatus = "created";
  }

  // 2. Scopes — insert or retrieve
  const scopeResults: Array<{ input_index: number; search_scope_id: string; state: string; sport: string }> = [];
  for (let i = 0; i < scopes.length; i++) {
    const scope = scopes[i];
    const existing = mockScopes.find(
      (s: any) => s.search_run_id === runId && s.state === scope.state && s.sport === scope.sport
    );
    let scopeId: string;
    if (existing) {
      scopeId = existing.id;
    } else {
      scopeId = randomUUID();
      mockScopes.push({
        id: scopeId, search_run_id: runId, state: scope.state, sport: scope.sport,
        candidates_found: 0, qualified_rows: 0, needs_venue_verification: 0,
        needs_address_verification: 0, needs_date_verification: 0,
        duplicates_found: 0, out_of_scope_found: 0, created_at: now,
      });
    }
    scopeResults.push({ input_index: i, search_scope_id: scopeId, state: scope.state, sport: scope.sport });
  }

  const scopeIdLookup = new Map(scopeResults.map(sr => [`${sr.state}::${sr.sport}`, sr.search_scope_id]));

  // 3. Validate supersessions
  for (const f of findings) {
    if (f.supersedes_finding_id) {
      const prior = mockFindings.find((mf: any) => mf.id === f.supersedes_finding_id);
      if (!prior) {
        throw new SearchHistoryValidationError([
          `findings[${(f as any)._input_index ?? "?"}].supersedes_finding_id: "${f.supersedes_finding_id}" does not exist`
        ]);
      }
    }
  }

  // 4. Findings
  let insertedFindings = 0;
  let reusedFindings = 0;
  let supersededFindings = 0;
  const findingIds: string[] = [];

  for (const f of findings) {
    const scopeId = scopeIdLookup.get(`${f.resolved_scope_state}::${f.resolved_scope_sport}`) ?? null;
    const dedupeKey = buildFindingDedupeKey({
      search_run_id: runId,
      tournament_name: f.tournament_name,
      sport: f.sport,
      start_date: f.start_date,
      end_date: f.end_date,
      venue_name: f.venue_name,
      venue_state: f.venue_state,
    });

    const existingFinding = f.supersedes_finding_id
      ? null
      : mockFindings.find(
          (mf: any) => mf.search_run_id === runId && mf.is_current && buildFindingDedupeKey(mf) === dedupeKey
        ) ?? null;

    if (existingFinding) {
      reusedFindings++;
      findingIds.push(existingFinding.id);
    } else {
      const findingId = randomUUID();
      mockFindings.push({
        id: findingId, search_run_id: runId, search_scope_id: scopeId,
        is_current: true, created_at: now,
        supersedes_finding_id: f.supersedes_finding_id ?? null,
        candidate_status: f.candidate_status,
        tournament_name: f.tournament_name, sport: f.sport,
        start_date: f.start_date, end_date: f.end_date, state: f.state,
        source_url: f.source_url, venue_name: f.venue_name,
        venue_address: f.venue_address, venue_city: f.venue_city,
        venue_state: f.venue_state, venue_source_url: f.venue_source_url,
        existing_tournament_id: f.existing_tournament_id,
        organizer_name: f.organizer_name, organizer_domain: f.organizer_domain,
        notes: f.notes,
      });
      if (f.supersedes_finding_id) {
        const prior: any = mockFindings.find((mf: any) => mf.id === f.supersedes_finding_id);
        if (prior) prior.is_current = false;
        supersededFindings++;
      }
      insertedFindings++;
      findingIds.push(findingId);
    }
  }

  // 5. Organizer intelligence — insert or reuse
  let insertedIntel = 0;
  let reusedIntel = 0;
  const intelRecordIds: string[] = [];

  for (const intel of orgIntelList) {
    const existing = mockOrgIntel.find(
      (r: any) => r.search_run_id === runId && r.organizer_domain === intel.organizer_domain
    );
    if (existing) {
      reusedIntel++;
      intelRecordIds.push(existing.id);
    } else {
      const intelId = randomUUID();
      mockOrgIntel.push({ id: intelId, search_run_id: runId, ...intel, created_at: now });
      insertedIntel++;
      intelRecordIds.push(intelId);
    }
  }

  // 6. Metrics from all current findings
  const allCurrentFindings = mockFindings.filter(
    (f: any) => f.search_run_id === runId && f.is_current
  );
  const runMetrics = countMetricsForFindings(allCurrentFindings);

  for (const sr of scopeResults) {
    const scopeFindings = allCurrentFindings.filter((f: any) => f.search_scope_id === sr.search_scope_id);
    const scopeMetrics = countMetricsForFindings(scopeFindings);
    const scope: any = mockScopes.find((s: any) => s.id === sr.search_scope_id);
    if (scope) Object.assign(scope, scopeMetrics);
  }

  // 7. Finalize run
  const mockRun: any = mockRuns.find((r: any) => r.id === runId);
  const completedAt = finalize ? nowIso() : null;
  Object.assign(mockRun, {
    ...runMetrics,
    status: finalize ? "completed" : mockRun.status,
    completed_at: completedAt,
    search_summary: run.search_summary ?? mockRun.search_summary,
    unresolved_work: run.unresolved_work ?? mockRun.unresolved_work,
    next_action: run.next_action ?? mockRun.next_action,
    next_search_after: run.next_search_after ?? mockRun.next_search_after,
    seasonality_conclusion: run.seasonality_conclusion ?? mockRun.seasonality_conclusion,
    updated_at: nowIso(),
  });

  return {
    status: packageStatus,
    search_run_id: runId,
    source_batch_id: run.source_batch_id,
    scope_results: scopeResults,
    finding_results: { inserted: insertedFindings, reused: reusedFindings, superseded: supersededFindings, finding_ids: findingIds },
    organizer_intelligence_results: { inserted: insertedIntel, reused: reusedIntel, record_ids: intelRecordIds },
    metrics: runMetrics,
    finalized: finalize,
    completed_at: completedAt,
  };
}

export async function insertCompleteSearchPackage(
  input: InsertCompleteSearchPackageInput
): Promise<InsertCompleteSearchPackageOutput> {
  assertSearchHistoryWritesEnabled();

  const validationErrors: string[] = [];

  // -------------------------------------------------------------------------
  // Normalize run fields
  // -------------------------------------------------------------------------
  let normalizedStates: string[] = [];
  let normalizedSports: string[] = [];
  try { normalizedStates = normalizeStatesArray(input.run.states ?? []); }
  catch (e) { if (e instanceof SearchHistoryValidationError) e.issues.forEach(i => validationErrors.push(`run.states: ${i}`)); }

  try { normalizedSports = normalizeSportsArray(input.run.sports ?? []); }
  catch (e) { if (e instanceof SearchHistoryValidationError) e.issues.forEach(i => validationErrors.push(`run.sports: ${i}`)); }

  if (input.run.date_from) {
    try { validateIsoDate(input.run.date_from, "date_from"); }
    catch (e) { if (e instanceof SearchHistoryValidationError) e.issues.forEach(i => validationErrors.push(`run.${i}`)); }
  }
  if (input.run.date_to) {
    try { validateIsoDate(input.run.date_to, "date_to"); }
    catch (e) { if (e instanceof SearchHistoryValidationError) e.issues.forEach(i => validationErrors.push(`run.${i}`)); }
  }
  if (input.run.date_from && input.run.date_to && input.run.date_from > input.run.date_to) {
    validationErrors.push("run: date_from must not be after date_to");
  }
  if (input.run.searched_at) {
    try { validateIsoDate(input.run.searched_at.slice(0, 10), "searched_at"); }
    catch (e) { if (e instanceof SearchHistoryValidationError) e.issues.forEach(i => validationErrors.push(`run.${i}`)); }
  }
  if (input.run.next_search_after) {
    try { validateIsoDate(input.run.next_search_after, "next_search_after"); }
    catch (e) { if (e instanceof SearchHistoryValidationError) e.issues.forEach(i => validationErrors.push(`run.${i}`)); }
  }

  let normalizedOrganizerDomains: string[] = [];
  try { normalizedOrganizerDomains = normalizeOrganizerDomainsArray(input.run.organizer_domains); }
  catch (e) { if (e instanceof SearchHistoryValidationError) e.issues.forEach(i => validationErrors.push(`run.organizer_domains: ${i}`)); }

  const normalizedHighValueSources: (string | null)[] = [];
  for (let j = 0; j < (input.run.high_value_sources ?? []).length; j++) {
    const u = input.run.high_value_sources![j];
    checkMarkdownUrl(u, `run.high_value_sources[${j}]`, validationErrors);
    try { normalizedHighValueSources.push(validateHttpUrl(u, `run.high_value_sources[${j}]`)); }
    catch (e) { if (e instanceof SearchHistoryValidationError) e.issues.forEach(i => validationErrors.push(i)); normalizedHighValueSources.push(null); }
  }

  let searchPromptText: string | null = null;
  let searchPromptHash: string | null = input.run.search_prompt_hash ?? null;
  let searchPromptTruncated = false;
  if (input.run.search_prompt_text) {
    searchPromptHash = hashPrompt(input.run.search_prompt_text);
    const { stored, truncated } = truncatePromptForStorage(input.run.search_prompt_text);
    searchPromptText = stored;
    searchPromptTruncated = truncated;
  }

  // -------------------------------------------------------------------------
  // Normalize scopes + detect duplicates
  // -------------------------------------------------------------------------
  const normalizedScopes: Array<{ state: string; sport: string }> = [];
  const seenScopePairs = new Map<string, number>();

  for (let i = 0; i < input.scopes.length; i++) {
    const scope = input.scopes[i];
    let state = "";
    let sport = "";
    let scopeOk = true;
    try { state = normalizeAndValidateState(scope.state); }
    catch (e) { if (e instanceof SearchHistoryValidationError) e.issues.forEach(issue => validationErrors.push(`scopes[${i}].state: ${issue}`)); scopeOk = false; }
    try { sport = normalizeAndValidateSport(scope.sport); }
    catch (e) { if (e instanceof SearchHistoryValidationError) e.issues.forEach(issue => validationErrors.push(`scopes[${i}].sport: ${issue}`)); scopeOk = false; }

    if (scopeOk) {
      const key = `${state}::${sport}`;
      if (seenScopePairs.has(key)) {
        validationErrors.push(
          `scopes[${i}] and scopes[${seenScopePairs.get(key)}] normalize to the same (${state}, ${sport}) pair — remove the duplicate`
        );
      } else {
        seenScopePairs.set(key, i);
        normalizedScopes.push({ state, sport });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Normalize findings + resolve scope
  // -------------------------------------------------------------------------
  const normalizedFindings: NormalizedRpcFinding[] = [];

  for (let i = 0; i < (input.findings ?? []).length; i++) {
    const f = input.findings[i];

    checkMarkdownUrl(f.source_url, `findings[${i}].source_url`, validationErrors);
    checkMarkdownUrl(f.venue_source_url, `findings[${i}].venue_source_url`, validationErrors);

    let normalized: any = null;
    try {
      normalized = validateAndNormalizeFinding({
        search_run_id: "package_validation_placeholder",
        search_scope_id: undefined,
        supersedes_finding_id: f.supersedes_finding_id,
        candidate_status: f.candidate_status,
        tournament_name: f.tournament_name,
        sport: f.sport,
        start_date: f.start_date,
        end_date: f.end_date,
        state: f.state,
        source_url: f.source_url,
        venue_name: f.venue_name,
        venue_address: f.venue_address,
        venue_city: f.venue_city,
        venue_state: f.venue_state,
        venue_source_url: f.venue_source_url,
        existing_tournament_id: f.existing_tournament_id,
        organizer_name: f.organizer_name,
        organizer_domain: f.organizer_domain,
        notes: f.notes,
      } as any);
    } catch (e) {
      if (e instanceof SearchHistoryValidationError) {
        e.issues.forEach(issue => validationErrors.push(`findings[${i}]: ${issue}`));
      } else throw e;
    }

    const resolvedScope = normalizedScopes.length > 0
      ? resolvePackageScopeForFinding(f, normalizedScopes, i, validationErrors)
      : null;

    if (normalized && resolvedScope) {
      normalizedFindings.push({
        _input_index: i,
        resolved_scope_state: resolvedScope.resolvedState,
        resolved_scope_sport: resolvedScope.resolvedSport,
        candidate_status: normalized.candidate_status,
        tournament_name: normalized.tournament_name,
        sport: normalized.sport,
        start_date: normalized.start_date,
        end_date: normalized.end_date,
        state: normalized.state,
        source_url: normalized.source_url,
        venue_name: normalized.venue_name,
        venue_address: normalized.venue_address,
        venue_city: normalized.venue_city,
        venue_state: normalized.venue_state,
        venue_source_url: normalized.venue_source_url,
        existing_tournament_id: normalized.existing_tournament_id,
        organizer_name: normalized.organizer_name,
        organizer_domain: normalized.organizer_domain,
        notes: normalized.notes,
        supersedes_finding_id: normalized.supersedes_finding_id,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Normalize organizer intelligence
  // -------------------------------------------------------------------------
  const normalizedOrgIntel: NormalizedRpcOrgIntel[] = [];

  for (let i = 0; i < (input.organizer_intelligence ?? []).length; i++) {
    const intel = input.organizer_intelligence[i];
    let domain = "";
    try { domain = normalizeOrganizerDomain(intel.organizer_domain); }
    catch (e) { if (e instanceof SearchHistoryValidationError) e.issues.forEach(issue => validationErrors.push(`organizer_intelligence[${i}].organizer_domain: ${issue}`)); }

    if (!intel.evidence_summary?.trim()) {
      validationErrors.push(`organizer_intelligence[${i}].evidence_summary: required and must not be empty`);
    }

    let intelStates: string[] = [];
    try { intelStates = normalizeStatesArray(intel.states ?? []); }
    catch (e) { if (e instanceof SearchHistoryValidationError) e.issues.forEach(issue => validationErrors.push(`organizer_intelligence[${i}].states: ${issue}`)); }

    let intelSports: string[] = [];
    try { intelSports = normalizeSportsArray(intel.sports ?? []); }
    catch (e) { if (e instanceof SearchHistoryValidationError) e.issues.forEach(issue => validationErrors.push(`organizer_intelligence[${i}].sports: ${issue}`)); }

    let intelMonitoringUrls: string[] = [];
    for (let j = 0; j < (intel.monitoring_urls ?? []).length; j++) {
      checkMarkdownUrl(intel.monitoring_urls![j], `organizer_intelligence[${i}].monitoring_urls[${j}]`, validationErrors);
    }
    try { intelMonitoringUrls = normalizeMonitoringUrlsArray(intel.monitoring_urls); }
    catch (e) { if (e instanceof SearchHistoryValidationError) e.issues.forEach(issue => validationErrors.push(`organizer_intelligence[${i}].monitoring_urls: ${issue}`)); }

    if (intel.next_monitor_after) {
      try { validateIsoDate(intel.next_monitor_after, "next_monitor_after"); }
      catch (e) { if (e instanceof SearchHistoryValidationError) e.issues.forEach(issue => validationErrors.push(`organizer_intelligence[${i}].${issue}`)); }
    }

    if (domain) {
      normalizedOrgIntel.push({
        organizer_name: intel.organizer_name?.trim() ?? null,
        organizer_domain: domain,
        confidence_level: intel.confidence_level,
        evidence_summary: intel.evidence_summary?.trim() ?? "",
        states: intelStates,
        sports: intelSports,
        tournament_families: dedupeCaseInsensitiveArray(
          (intel.tournament_families ?? []).map(s => s.trim()).filter(Boolean)
        ),
        venue_clusters: dedupeCaseInsensitiveArray(
          (intel.venue_clusters ?? []).map(s => s.trim()).filter(Boolean)
        ),
        monitoring_urls: intelMonitoringUrls,
        recommended_cadence: intel.recommended_cadence?.trim() ?? null,
        next_monitor_after: intel.next_monitor_after ?? null,
        registration_platform: intel.registration_platform?.trim() ?? null,
        scheduling_platform: intel.scheduling_platform?.trim() ?? null,
        notes: intel.notes ?? null,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Fail if any validation errors
  // -------------------------------------------------------------------------
  if (validationErrors.length > 0) {
    throw new SearchHistoryValidationError(validationErrors);
  }

  // -------------------------------------------------------------------------
  // Build normalized payload
  // -------------------------------------------------------------------------
  const normalizedRun: NormalizedRpcRun = {
    id: randomUUID(),
    source_batch_id: input.run.source_batch_id,
    region_name: input.run.region_name?.trim() ?? null,
    states: normalizedStates,
    sports: normalizedSports,
    date_from: input.run.date_from ?? null,
    date_to: input.run.date_to ?? null,
    search_prompt_version: input.run.search_prompt_version ?? null,
    search_prompt_text: searchPromptText,
    search_prompt_hash: searchPromptHash,
    search_prompt_truncated: searchPromptTruncated,
    search_method: input.run.search_method ?? null,
    research_agent: input.run.research_agent ?? null,
    research_model: input.run.research_model ?? null,
    searched_at: input.run.searched_at ?? nowIso(),
    searched_by: input.run.searched_by ?? null,
    search_summary: input.run.search_summary ?? null,
    unresolved_work: input.run.unresolved_work ?? null,
    next_action: input.run.next_action ?? null,
    next_search_after: input.run.next_search_after ?? null,
    seasonality_conclusion: input.run.seasonality_conclusion ?? null,
    organizer_domains: normalizedOrganizerDomains,
    organizer_names: Array.from(new Set((input.run.organizer_names ?? []).map(s => s.trim()))),
    venue_names: Array.from(new Set((input.run.venue_names ?? []).map(s => s.trim()))),
    high_value_sources: normalizedHighValueSources.filter((u): u is string => u !== null),
  };

  const normalizedPayload: NormalizedRpcPayload = {
    run: normalizedRun,
    scopes: normalizedScopes,
    findings: normalizedFindings.map(({ _input_index, ...rest }) => rest),
    organizer_intelligence: normalizedOrgIntel,
    finalize: input.finalize ?? true,
  };

  // Store input indices separately for error reporting in mock path
  const findingsWithIndices = normalizedFindings;

  // -------------------------------------------------------------------------
  // Execute: mock path
  // -------------------------------------------------------------------------
  if (mockMode()) {
    // Attach _input_index to findings for supersession error reporting in mock
    const mockPayload = {
      ...normalizedPayload,
      findings: findingsWithIndices.map(({ _input_index, ...rest }) => ({ ...rest, _input_index })),
    };
    return executeMockPackage(mockPayload as any);
  }

  // -------------------------------------------------------------------------
  // Pre-validate supersedes_finding_id references (real mode)
  // -------------------------------------------------------------------------
  const supabase = getSupabaseAdmin();
  const supersessionErrors: string[] = [];
  for (const f of findingsWithIndices) {
    if (f.supersedes_finding_id) {
      const { data: spData } = await supabase
        .from("tournament_search_run_findings")
        .select("id")
        .eq("id", f.supersedes_finding_id)
        .maybeSingle();
      if (!spData) {
        supersessionErrors.push(
          `findings[${f._input_index}].supersedes_finding_id: "${f.supersedes_finding_id}" does not exist`
        );
      }
    }
  }
  if (supersessionErrors.length > 0) {
    throw new SearchHistoryValidationError(supersessionErrors);
  }

  // -------------------------------------------------------------------------
  // Execute: RPC path
  // -------------------------------------------------------------------------
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "insert_complete_search_package_rpc",
    { payload: normalizedPayload }
  );

  if (rpcError) {
    if (
      rpcError.message?.includes("does not exist") &&
      rpcError.message?.includes("insert_complete_search_package_rpc")
    ) {
      throw new Error(
        "insert_complete_search_package_rpc is not deployed. " +
        "Apply src/db/sql/tournament_search_runs_seasonality_conclusion_v1.sql " +
        "then src/db/sql/insert_complete_search_package_rpc_v1.sql to the Supabase project."
      );
    }
    throw new Error(`RPC error (${rpcError.code ?? "unknown"}): ${rpcError.message}`);
  }

  return rpcData as InsertCompleteSearchPackageOutput;
}
