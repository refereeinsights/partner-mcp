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
  TournamentSearchFinding
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

export function __resetSearchHistoryMockStore() {
  mockRuns.length = 0;
  mockScopes.length = 0;
  mockFindings.length = 0;
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
  const { data, error } = await supabase
    .from("tournament_search_runs")
    .upsert(row, { onConflict: "source_batch_id", ignoreDuplicates: true })
    .select();
  if (error) throw new Error(error.message);

  if (data && data.length > 0) return data[0] as TournamentSearchRun;

  if (row.source_batch_id) {
    const { data: existing, error: fetchErr } = await supabase
      .from("tournament_search_runs")
      .select("*")
      .eq("source_batch_id", row.source_batch_id)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);
    return existing as TournamentSearchRun;
  }

  throw new Error("insert_tournament_search_run: no row returned and no source_batch_id to resolve conflict");
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

export { US_STATE_CODE_SET, supportedSportsSet };
