import { z } from "zod";

export const searchRunStatusEnum = z.enum([
  "planned",
  "in_progress",
  "completed",
  "needs_follow_up",
  "paused"
]);

export const candidateStatusEnum = z.enum([
  "Qualified",
  "Needs Venue Verification",
  "Needs Address Verification",
  "Needs Date Verification",
  "Out of Scope - State",
  "Out of Scope - Date",
  "Out of Scope - Sport",
  "Not a Tournament",
  "Duplicate",
  "Other Exclusion"
]);

const nonNegativeInt = z.number().int().nonnegative();

const metricsShape = {
  candidates_found: nonNegativeInt.optional(),
  qualified_rows: nonNegativeInt.optional(),
  needs_venue_verification: nonNegativeInt.optional(),
  needs_address_verification: nonNegativeInt.optional(),
  needs_date_verification: nonNegativeInt.optional(),
  duplicates_found: nonNegativeInt.optional(),
  out_of_scope_found: nonNegativeInt.optional()
};

// ---------------------------------------------------------------------------
// insert_tournament_search_run
// ---------------------------------------------------------------------------

export const insertTournamentSearchRunInput = z.object({
  region_name: z.string().trim().min(1).max(200).optional(),

  states: z.array(z.string()).default([]),
  sports: z.array(z.string()).default([]),

  date_from: z.string().optional(),
  date_to: z.string().optional(),

  search_prompt_version: z.string().trim().max(100).optional(),
  search_prompt_text: z.string().optional(),
  search_prompt_hash: z.string().optional(),

  search_method: z.string().trim().max(1000).optional(),
  research_agent: z.string().trim().max(200).optional(),
  research_model: z.string().trim().max(200).optional(),

  searched_at: z.string().optional(),
  completed_at: z.string().optional(),
  searched_by: z.string().trim().max(200).optional(),

  status: searchRunStatusEnum.optional().default("completed"),

  ...metricsShape,

  organizer_domains: z.array(z.string()).optional().default([]),
  organizer_names: z.array(z.string().trim().min(1)).optional().default([]),
  venue_names: z.array(z.string().trim().min(1)).optional().default([]),
  high_value_sources: z.array(z.string()).optional().default([]),

  search_summary: z.string().max(5000).optional(),
  unresolved_work: z.string().max(5000).optional(),
  next_action: z.string().max(5000).optional(),
  next_search_after: z.string().optional(),

  source_batch_id: z.string().trim().min(1).max(300).optional()
});

export const tournamentSearchRunSchema = z.object({
  id: z.string(),
  region_name: z.string().nullable(),
  states: z.array(z.string()),
  sports: z.array(z.string()),
  date_from: z.string().nullable(),
  date_to: z.string().nullable(),
  search_prompt_version: z.string().nullable(),
  search_prompt_text: z.string().nullable(),
  search_prompt_hash: z.string().nullable(),
  search_prompt_truncated: z.boolean(),
  search_method: z.string().nullable(),
  research_agent: z.string().nullable(),
  research_model: z.string().nullable(),
  searched_at: z.string(),
  completed_at: z.string().nullable(),
  searched_by: z.string().nullable(),
  status: searchRunStatusEnum,
  candidates_found: z.number(),
  qualified_rows: z.number(),
  needs_venue_verification: z.number(),
  needs_address_verification: z.number(),
  needs_date_verification: z.number(),
  duplicates_found: z.number(),
  out_of_scope_found: z.number(),
  organizer_domains: z.array(z.string()),
  organizer_names: z.array(z.string()),
  venue_names: z.array(z.string()),
  high_value_sources: z.array(z.string()),
  search_summary: z.string().nullable(),
  unresolved_work: z.string().nullable(),
  next_action: z.string().nullable(),
  next_search_after: z.string().nullable(),
  source_batch_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string()
});

export const insertTournamentSearchRunOutput = tournamentSearchRunSchema;

// ---------------------------------------------------------------------------
// insert_tournament_search_scope
// ---------------------------------------------------------------------------

export const insertTournamentSearchScopeInput = z.object({
  search_run_id: z.string().min(1),
  state: z.string().min(1),
  sport: z.string().min(1),
  ...metricsShape
});

export const tournamentSearchScopeSchema = z.object({
  id: z.string(),
  search_run_id: z.string(),
  state: z.string(),
  sport: z.string(),
  candidates_found: z.number(),
  qualified_rows: z.number(),
  needs_venue_verification: z.number(),
  needs_address_verification: z.number(),
  needs_date_verification: z.number(),
  duplicates_found: z.number(),
  out_of_scope_found: z.number(),
  created_at: z.string()
});

export const insertTournamentSearchScopeOutput = tournamentSearchScopeSchema;

// ---------------------------------------------------------------------------
// insert_tournament_search_finding / batch
// ---------------------------------------------------------------------------

const findingInputShape = {
  search_scope_id: z.string().min(1).optional(),
  supersedes_finding_id: z.string().min(1).optional(),

  tournament_name: z.string().trim().max(300).optional(),
  sport: z.string().min(1).optional(),

  start_date: z.string().optional(),
  end_date: z.string().optional(),

  state: z.string().min(1).optional(),

  candidate_status: candidateStatusEnum,

  source_url: z.string().optional(),

  venue_name: z.string().trim().max(300).optional(),
  venue_address: z.string().trim().max(500).optional(),
  venue_city: z.string().trim().max(200).optional(),
  venue_state: z.string().min(1).optional(),
  venue_source_url: z.string().optional(),

  existing_tournament_id: z.string().min(1).optional(),

  organizer_name: z.string().trim().max(300).optional(),
  organizer_domain: z.string().optional(),

  notes: z.string().max(5000).optional()
};

export const insertTournamentSearchFindingInput = z.object({
  search_run_id: z.string().min(1),
  ...findingInputShape
});

export const tournamentSearchFindingSchema = z.object({
  id: z.string(),
  search_run_id: z.string(),
  search_scope_id: z.string().nullable(),
  supersedes_finding_id: z.string().nullable(),
  is_current: z.boolean(),
  tournament_name: z.string().nullable(),
  sport: z.string().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  state: z.string().nullable(),
  candidate_status: candidateStatusEnum,
  source_url: z.string().nullable(),
  venue_name: z.string().nullable(),
  venue_address: z.string().nullable(),
  venue_city: z.string().nullable(),
  venue_state: z.string().nullable(),
  venue_source_url: z.string().nullable(),
  existing_tournament_id: z.string().nullable(),
  organizer_name: z.string().nullable(),
  organizer_domain: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string()
});

export const insertTournamentSearchFindingOutput = z.object({
  finding: tournamentSearchFindingSchema,
  matched_existing: z.boolean()
});

export const insertTournamentSearchFindingsInput = z.object({
  search_run_id: z.string().min(1),
  findings: z.array(z.object(findingInputShape)).min(1).max(100)
});

export const insertTournamentSearchFindingsOutput = z.object({
  inserted: z.array(tournamentSearchFindingSchema),
  matched_existing: z.array(tournamentSearchFindingSchema),
  errors: z.array(z.object({ index: z.number(), issues: z.array(z.string()) }))
});

// ---------------------------------------------------------------------------
// finalize_tournament_search_run
// ---------------------------------------------------------------------------

export const finalizeTournamentSearchRunInput = z.object({
  search_run_id: z.string().min(1),
  status: z.enum(["completed", "needs_follow_up"]).optional(),
  completed_at: z.string().optional(),
  search_summary: z.string().max(5000).optional(),
  unresolved_work: z.string().max(5000).optional(),
  next_action: z.string().max(5000).optional(),
  next_search_after: z.string().optional()
});

export const unscopedFindingReasonEnum = z.enum([
  "missing_state",
  "missing_sport",
  "invalid_state",
  "invalid_sport",
  "no_matching_scope"
]);

export const finalizeTournamentSearchRunOutput = z.object({
  run: tournamentSearchRunSchema,
  scopes: z.array(tournamentSearchScopeSchema),
  unscoped_findings: z.array(
    z.object({
      finding_id: z.string(),
      reason: unscopedFindingReasonEnum
    })
  )
});

// ---------------------------------------------------------------------------
// get_search_runs
// ---------------------------------------------------------------------------

export const getSearchRunsInput = z.object({
  state: z.string().optional(),
  sport: z.string().optional(),
  region_name: z.string().optional(),
  status: z.string().optional(),

  window_from: z.string().optional(),
  window_to: z.string().optional(),

  searched_from: z.string().optional(),
  searched_to: z.string().optional(),

  source_batch_id: z.string().optional(),

  limit: z.number().int().positive().max(200).optional().default(50),
  offset: z.number().int().nonnegative().optional().default(0)
});

export const getSearchRunsOutput = z.object({
  data: z.array(tournamentSearchRunSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number()
});

// ---------------------------------------------------------------------------
// get_search_run_findings
// ---------------------------------------------------------------------------

export const getSearchRunFindingsInput = z.object({
  search_run_id: z.string().optional(),
  search_scope_id: z.string().optional(),

  state: z.string().optional(),
  sport: z.string().optional(),

  candidate_status: z.string().optional(),
  organizer_domain: z.string().optional(),

  window_from: z.string().optional(),
  window_to: z.string().optional(),

  current_only: z.boolean().optional().default(true),

  limit: z.number().int().positive().max(200).optional().default(50),
  offset: z.number().int().nonnegative().optional().default(0)
});

export const getSearchRunFindingsOutput = z.object({
  data: z.array(tournamentSearchFindingSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number()
});

// ---------------------------------------------------------------------------
// get_search_coverage
// ---------------------------------------------------------------------------

export const getSearchCoverageInput = z.object({
  states: z.array(z.string()).optional(),
  sports: z.array(z.string()).optional(),

  window_from: z.string().optional(),
  window_to: z.string().optional(),

  searched_from: z.string().optional(),
  searched_to: z.string().optional(),

  limit: z.number().int().positive().max(500).optional().default(100)
});

export const searchCoverageRowSchema = z.object({
  state: z.string(),
  sport: z.string(),
  run_count: z.number(),
  last_searched_at: z.string().nullable(),
  last_date_from: z.string().nullable(),
  last_date_to: z.string().nullable(),
  candidates_found: z.number(),
  qualified_rows: z.number(),
  needs_venue_verification: z.number(),
  needs_address_verification: z.number(),
  needs_date_verification: z.number(),
  duplicates_found: z.number(),
  out_of_scope_found: z.number(),
  qualified_yield_rate: z.number(),
  latest_next_action: z.string().nullable(),
  next_search_after: z.string().nullable(),
  organizer_domains: z.array(z.string()),
  high_value_sources: z.array(z.string())
});

export const getSearchCoverageOutput = z.object({ data: z.array(searchCoverageRowSchema) });

// ---------------------------------------------------------------------------
// get_next_search_priorities
// ---------------------------------------------------------------------------

export const getNextSearchPrioritiesInput = z.object({
  states: z.array(z.string()).optional(),
  sports: z.array(z.string()).optional(),

  window_from: z.string().optional(),
  window_to: z.string().optional(),

  limit: z.number().int().positive().max(200).optional().default(50)
});

export const nextSearchPriorityRowSchema = z.object({
  state: z.string(),
  sport: z.string(),
  priority_score: z.number(),
  priority_reasons: z.array(z.string()),
  last_searched_at: z.string().nullable(),
  qualified_yield_rate: z.number(),
  unresolved_count: z.number(),
  next_action: z.string().nullable(),
  next_search_after: z.string().nullable()
});

export const getNextSearchPrioritiesOutput = z.object({
  data: z.array(nextSearchPriorityRowSchema),
  universe_source: z.enum(["canonical", "scope_table_fallback"]),
  fallback_limitation: z.string().nullable()
});

// ---------------------------------------------------------------------------
// insert_search_organizer_intelligence / get_search_organizer_intelligence
// ---------------------------------------------------------------------------

export const orgIntelConfidenceLevelEnum = z.enum(["High", "Medium", "Low"]);

export const insertSearchOrganizerIntelligenceInput = z.object({
  search_run_id: z.string().min(1),
  organizer_name: z.string().trim().max(300).optional(),
  organizer_domain: z.string().min(1),
  confidence_level: orgIntelConfidenceLevelEnum,
  evidence_summary: z.string().max(3000).optional(),
  states: z.array(z.string()).optional().default([]),
  sports: z.array(z.string()).optional().default([]),
  tournament_families: z.array(z.string()).optional().default([]),
  venue_clusters: z.array(z.string()).optional().default([]),
  monitoring_urls: z.array(z.string()).optional().default([]),
  recommended_cadence: z.string().trim().max(500).optional(),
  next_monitor_after: z.string().optional(),
  registration_platform: z.string().trim().max(200).optional(),
  scheduling_platform: z.string().trim().max(200).optional(),
  notes: z.string().max(3000).optional()
});

export const searchOrganizerIntelligenceRowSchema = z.object({
  id: z.string(),
  search_run_id: z.string(),
  organizer_name: z.string().nullable(),
  organizer_domain: z.string(),
  confidence_level: orgIntelConfidenceLevelEnum,
  evidence_summary: z.string().nullable(),
  states: z.array(z.string()),
  sports: z.array(z.string()),
  tournament_families: z.array(z.string()),
  venue_clusters: z.array(z.string()),
  monitoring_urls: z.array(z.string()),
  recommended_cadence: z.string().nullable(),
  next_monitor_after: z.string().nullable(),
  registration_platform: z.string().nullable(),
  scheduling_platform: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string()
});

export const insertSearchOrganizerIntelligenceOutput = z.object({
  row: searchOrganizerIntelligenceRowSchema,
  inserted: z.boolean()
});

export const getSearchOrganizerIntelligenceInput = z.object({
  search_run_id: z.string().optional(),
  organizer_domain: z.string().optional(),
  confidence_level: orgIntelConfidenceLevelEnum.optional(),
  state: z.string().optional(),
  sport: z.string().optional(),
  next_monitor_from: z.string().optional(),
  next_monitor_to: z.string().optional(),
  limit: z.number().int().positive().max(200).optional().default(50),
  offset: z.number().int().nonnegative().optional().default(0)
});

export const getSearchOrganizerIntelligenceOutput = z.object({
  data: z.array(searchOrganizerIntelligenceRowSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number()
});

export type SearchOrganizerIntelligenceRow = z.infer<typeof searchOrganizerIntelligenceRowSchema>;
export type InsertSearchOrganizerIntelligenceInput = z.infer<typeof insertSearchOrganizerIntelligenceInput>;
export type GetSearchOrganizerIntelligenceInput = z.infer<typeof getSearchOrganizerIntelligenceInput>;

export type TournamentSearchRun = z.infer<typeof tournamentSearchRunSchema>;
export type TournamentSearchScope = z.infer<typeof tournamentSearchScopeSchema>;
export type TournamentSearchFinding = z.infer<typeof tournamentSearchFindingSchema>;
export type InsertTournamentSearchRunInput = z.infer<typeof insertTournamentSearchRunInput>;
export type InsertTournamentSearchScopeInput = z.infer<typeof insertTournamentSearchScopeInput>;
export type InsertTournamentSearchFindingInput = z.infer<typeof insertTournamentSearchFindingInput>;
export type InsertTournamentSearchFindingsInput = z.infer<typeof insertTournamentSearchFindingsInput>;
export type FinalizeTournamentSearchRunInput = z.infer<typeof finalizeTournamentSearchRunInput>;
export type GetSearchRunsInput = z.infer<typeof getSearchRunsInput>;
export type GetSearchRunFindingsInput = z.infer<typeof getSearchRunFindingsInput>;
export type GetSearchCoverageInput = z.infer<typeof getSearchCoverageInput>;
export type GetNextSearchPrioritiesInput = z.infer<typeof getNextSearchPrioritiesInput>;

// ---------------------------------------------------------------------------
// insert_complete_search_package
// ---------------------------------------------------------------------------

const insertCompleteSearchPackageRunInput = z.object({
  source_batch_id: z.string().trim().min(1).max(300),
  region_name: z.string().trim().min(1).max(200).optional(),
  states: z.array(z.string()).optional().default([]),
  sports: z.array(z.string()).optional().default([]),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  search_prompt_version: z.string().trim().max(100).optional(),
  search_prompt_text: z.string().optional(),
  search_prompt_hash: z.string().optional(),
  search_method: z.string().trim().max(1000).optional(),
  research_agent: z.string().trim().max(200).optional(),
  research_model: z.string().trim().max(200).optional(),
  searched_at: z.string().optional(),
  searched_by: z.string().trim().max(200).optional(),
  search_summary: z.string().max(5000).optional(),
  unresolved_work: z.string().max(5000).optional(),
  next_action: z.string().max(5000).optional(),
  next_search_after: z.string().optional(),
  seasonality_conclusion: z.string().max(5000).optional(),
  organizer_domains: z.array(z.string()).optional().default([]),
  organizer_names: z.array(z.string().trim().min(1)).optional().default([]),
  venue_names: z.array(z.string().trim().min(1)).optional().default([]),
  high_value_sources: z.array(z.string()).optional().default([]),
});

const insertCompleteSearchPackageScopeInput = z.object({
  state: z.string().min(1),
  sport: z.string().min(1),
});

const insertCompleteSearchPackageFindingInput = z.object({
  search_scope_index: z.number().int().nonnegative().optional(),
  candidate_status: candidateStatusEnum,
  tournament_name: z.string().trim().max(300).optional(),
  sport: z.string().min(1).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  state: z.string().min(1).optional(),
  source_url: z.string().optional(),
  venue_name: z.string().trim().max(300).optional(),
  venue_address: z.string().trim().max(500).optional(),
  venue_city: z.string().trim().max(200).optional(),
  venue_state: z.string().min(1).optional(),
  venue_source_url: z.string().optional(),
  existing_tournament_id: z.string().min(1).optional(),
  organizer_name: z.string().trim().max(300).optional(),
  organizer_domain: z.string().optional(),
  notes: z.string().max(5000).optional(),
  supersedes_finding_id: z.string().min(1).optional(),
});

const insertCompleteSearchPackageOrgIntelInput = z.object({
  organizer_name: z.string().trim().max(300).optional(),
  organizer_domain: z.string().min(1),
  confidence_level: orgIntelConfidenceLevelEnum,
  evidence_summary: z.string().max(3000),
  states: z.array(z.string()).optional().default([]),
  sports: z.array(z.string()).optional().default([]),
  tournament_families: z.array(z.string()).optional().default([]),
  venue_clusters: z.array(z.string()).optional().default([]),
  monitoring_urls: z.array(z.string()).optional().default([]),
  recommended_cadence: z.string().trim().max(500).optional(),
  registration_platform: z.string().trim().max(200).optional(),
  scheduling_platform: z.string().trim().max(200).optional(),
  next_monitor_after: z.string().optional(),
  notes: z.string().max(3000).optional(),
});

export const insertCompleteSearchPackageInput = z.object({
  run: insertCompleteSearchPackageRunInput,
  scopes: z.array(insertCompleteSearchPackageScopeInput).min(1),
  findings: z.array(insertCompleteSearchPackageFindingInput).max(100).optional().default([]),
  organizer_intelligence: z.array(insertCompleteSearchPackageOrgIntelInput).optional().default([]),
  finalize: z.boolean().optional().default(true),
});

const completePackageMetricsSchema = z.object({
  candidates_found: z.number(),
  qualified_rows: z.number(),
  needs_venue_verification: z.number(),
  needs_address_verification: z.number(),
  needs_date_verification: z.number(),
  duplicates_found: z.number(),
  out_of_scope_found: z.number(),
});

export const insertCompleteSearchPackageOutput = z.union([
  z.object({
    status: z.enum(["created", "reused"]),
    search_run_id: z.string(),
    source_batch_id: z.string(),
    scope_results: z.array(z.object({
      input_index: z.number(),
      search_scope_id: z.string(),
      state: z.string(),
      sport: z.string(),
    })),
    finding_results: z.object({
      inserted: z.number(),
      reused: z.number(),
      superseded: z.number(),
      finding_ids: z.array(z.string()),
    }),
    organizer_intelligence_results: z.object({
      inserted: z.number(),
      reused: z.number(),
      record_ids: z.array(z.string()),
    }),
    metrics: completePackageMetricsSchema,
    finalized: z.boolean(),
    completed_at: z.string().nullable(),
  }),
  z.object({
    status: z.literal("conflict"),
    search_run_id: z.string(),
    source_batch_id: z.string(),
    conflicts: z.array(z.object({
      path: z.string(),
      stored_value: z.unknown(),
      incoming_value: z.unknown(),
    })),
  }),
]);

export type InsertCompleteSearchPackageInput = z.infer<typeof insertCompleteSearchPackageInput>;
export type InsertCompleteSearchPackageOutput = z.infer<typeof insertCompleteSearchPackageOutput>;
