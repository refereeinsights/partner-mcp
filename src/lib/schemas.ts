import { z } from "zod";
import { supportedSportsSet } from "./normalize";
import { isIsoDate } from "./rollForwardV2";

export const sportSchema = z
  .string()
  .transform((s) => s.toLowerCase())
  .refine((s) => supportedSportsSet.has(s as any), {
    message: "unsupported sport"
  });

export const stateSchema = z
  .string()
  .length(2)
  .transform((s) => s.toUpperCase());

export const datasetHealthSchema = z.object({
  total_tournaments: z.number(),
  tournaments_by_sport: z.record(z.number()),
  tournaments_by_state: z.record(z.number()),
  pct_missing_website: z.number(),
  pct_missing_director_email: z.number(),
  pct_missing_start_date: z.number(),
  pct_missing_end_date: z.number(),
  generated_at: z.string()
});

export const getDatasetHealthOutput = datasetHealthSchema;

export const getStateSportCoverageInput = z.object({
  sports: z.array(sportSchema).optional(),
  states: z.array(stateSchema).optional(),
  limit: z.number().int().positive().max(200).optional()
});

export const stateSportCoverageRow = z.object({
  sport: z.string(),
  state: z.string(),
  tournament_count: z.number(),
  missing_website_count: z.number(),
  missing_director_email_count: z.number()
});

export const getStateSportCoverageOutput = z.array(stateSportCoverageRow);
export const getStateSportCoverageToolOutput = z.object({
  data: getStateSportCoverageOutput
});

export const missingFieldEnum = z.enum([
  "official_website_url",
  "tournament_director",
  "tournament_director_email",
  "referee_contact",
  "referee_contact_email",
  "start_date",
  "end_date",
  "city",
  "state"
]);

export const getMissingFieldsInput = z.object({
  missing_any_of: z.array(missingFieldEnum).min(1),
  sport: sportSchema.optional(),
  state: stateSchema.optional(),
  limit: z.number().int().positive().max(200).optional(),
  offset: z.number().int().nonnegative().optional()
});

export const tournamentRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().optional().nullable(),
  sport: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  zip: z.string().optional().nullable(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  official_website_url: z.string().optional().nullable(),
  tournament_director: z.string().optional().nullable(),
  tournament_director_email: z.string().optional().nullable(),
  referee_contact: z.string().optional().nullable(),
  referee_contact_email: z.string().optional().nullable()
});

export const getMissingFieldsOutput = z.array(tournamentRowSchema);
export const getMissingFieldsToolOutput = z.object({
  data: getMissingFieldsOutput
});

export const getOrganizerClustersInput = z.object({
  min_tournaments: z.number().int().positive().max(100).default(3),
  sport: sportSchema.optional(),
  state: stateSchema.optional(),
  limit: z.number().int().positive().max(200).optional()
});

export const organizerClusterSchema = z.object({
  host_org: z.string().nullable(),
  organizer_confidence: z.enum(["high", "medium", "low"]).optional(),
  tournament_count: z.number(),
  sports: z.array(z.string()),
  states: z.array(z.string()),
  tournaments: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      city: z.string().nullable(),
      state: z.string().nullable(),
      start_date: z.string().nullable()
    })
  ),
  missing_director_email_count: z.number(),
  missing_website_count: z.number()
});

export const getOrganizerClustersOutput = z.array(organizerClusterSchema);
export const getOrganizerClustersToolOutput = z.object({
  data: getOrganizerClustersOutput
});

export const getVenueClustersInput = z.object({
  min_tournaments: z.number().int().positive().max(100).default(2),
  sport: sportSchema.optional(),
  state: stateSchema.optional(),
  limit: z.number().int().positive().max(200).optional()
});

export const venueClusterSchema = z.object({
  venue_id: z.string(),
  venue_name: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  tournament_count: z.number(),
  tournaments: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      sport: z.string().nullable(),
      start_date: z.string().nullable(),
      end_date: z.string().nullable()
    })
  )
});

export const getVenueClustersOutput = z.array(venueClusterSchema);
export const getVenueClustersToolOutput = z.object({
  data: getVenueClustersOutput
});

export const exportResearchBatchInput = z.object({
  priority_mode: z.enum([
    "missing_websites",
    "missing_director_emails",
    "missing_dates",
    "organizer_scale",
    "venue_scale"
  ]),
  sport: sportSchema.optional(),
  state: stateSchema.optional(),
  batch_size: z.number().int().positive().max(500).default(100)
});

export const exportResearchBatchRow = z.object({
  id: z.string(),
  name: z.string(),
  sport: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  official_website_url: z.string().nullable(),
  priority_reason: z.string()
});

export const exportResearchBatchOutput = z.array(exportResearchBatchRow);
export const exportResearchBatchToolOutput = z.object({
  data: exportResearchBatchOutput
});

export type DatasetHealth = z.infer<typeof datasetHealthSchema>;
export type StateSportCoverageRow = z.infer<typeof stateSportCoverageRow>;
export type MissingFieldsFilters = z.infer<typeof getMissingFieldsInput>;
export type OrganizerCluster = z.infer<typeof organizerClusterSchema>;
export type VenueCluster = z.infer<typeof venueClusterSchema>;
export type ResearchBatchRow = z.infer<typeof exportResearchBatchRow>;

// Summary Dashboard
export const organizerSummarySchema = z.object({
  host_org: z.string().nullable(),
  tournament_count: z.number(),
  sports: z.array(z.string()),
  states: z.array(z.string()),
  organizer_confidence: z.enum(["high", "medium", "low"]).optional()
});

export const venueSummarySchema = z.object({
  venue_id: z.string(),
  venue_name: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  tournament_count: z.number()
});

export const summaryDashboardSchema = z.object({
  health: datasetHealthSchema,
  top_sports: z.array(z.object({ sport: z.string(), count: z.number() })),
  top_states: z.array(z.object({ state: z.string(), count: z.number() })),
  top_organizers: z.array(organizerSummarySchema),
  top_venues: z.array(venueSummarySchema),
  data_quality_summary: z.object({
    pct_fully_complete: z.number(),
    worst_field: z.string(),
    worst_field_pct_missing: z.number()
  }),
  generated_at: z.string()
});

export type SummaryDashboard = z.infer<typeof summaryDashboardSchema>;

// Trends
export const trendPeriodEnum = z.enum(["week", "month", "quarter"]);

export const trendRowSchema = z.object({
  period: z.string(),
  tournaments_added: z.number(),
  pct_with_website: z.number(),
  pct_with_director_email: z.number(),
  pct_with_dates: z.number(),
  cumulative_total: z.number()
});

export const getTrendsInput = z.object({
  period: trendPeriodEnum.default("month"),
  lookback_periods: z.number().int().positive().max(52).optional()
});

export const getTrendsOutput = z.object({ data: z.array(trendRowSchema) });

export type TrendRow = z.infer<typeof trendRowSchema>;

// Missing Venues
export const getMissingVenuesInput = z.object({
  sport: sportSchema.optional(),
  state: stateSchema.optional(),
  limit: z.number().int().positive().max(500).optional()
});

export const missingVenuesTournamentSchema = z.object({
  id: z.string(),
  name: z.string(),
  sport: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  official_website_url: z.string().nullable().optional()
});

export const getMissingVenuesOutput = z.object({
  total_missing: z.number(),
  total_tournaments: z.number(),
  pct_missing_venue: z.number(),
  missing_by_sport: z.record(z.number()),
  missing_by_state: z.record(z.number()),
  tournaments: z.array(missingVenuesTournamentSchema)
});

export type MissingVenuesFilters = z.infer<typeof getMissingVenuesInput>;
export type MissingVenuesResult = z.infer<typeof getMissingVenuesOutput>;

// Association Dashboard
export const getAssociationDashboardInput = z.object({
  limit: z.number().int().positive().max(200).optional().default(25)
});

export const associationDashboardSchema = z.object({
  totals: z.object({
    total_published_canonical: z.number(),
    with_association: z.number(),
    pct_with_association: z.number()
  }),
  top_associations: z.array(z.object({ association: z.string(), tournaments: z.number() })),
  association_column_present: z.boolean(),
  generated_at: z.string()
});

export const getAssociationDashboardOutput = associationDashboardSchema;

export type AssociationDashboardFilters = z.infer<typeof getAssociationDashboardInput>;
export type AssociationDashboard = z.infer<typeof associationDashboardSchema>;

// Outreach Dashboard
export const emailOutreachNumbersSchema = z.object({
  draft: z.number(),
  sent: z.number(),
  replies: z.number(),
  followups_sent: z.number(),
  generated_at: z.string()
});

export const getEmailOutreachNumbersOutput = emailOutreachNumbersSchema;

export type EmailOutreachNumbers = z.infer<typeof emailOutreachNumbersSchema>;

// Organizer Intelligence (read tools)
export const domainLikeSchema = z
  .string()
  .min(1)
  .transform((s) => s.trim())
  .transform((s) => {
    try {
      if (s.startsWith("http://") || s.startsWith("https://")) return new URL(s).hostname.toLowerCase();
      if (s.includes("/")) return new URL(`https://${s}`).hostname.toLowerCase();
      return s.toLowerCase();
    } catch {
      return s.toLowerCase();
    }
  })
  .refine((h) => !!h && !h.includes(" ") && !h.includes("/") && h.includes("."), {
    message: "invalid domain"
  });

export const getTopOrganizerDomainsInput = z.object({
  min_tournaments: z.number().int().positive().max(100).default(3),
  sport: sportSchema.optional(),
  state: stateSchema.optional(),
  limit: z.number().int().positive().max(200).optional().default(50)
});

export const organizerDomainRowSchema = z.object({
  organizer_domain: z.string(),
  tournament_count: z.number(),
  sports: z.array(z.string()),
  states: z.array(z.string()),
  missing_website_count: z.number(),
  missing_director_email_count: z.number()
});

export const getTopOrganizerDomainsOutput = z.array(organizerDomainRowSchema);
export const getTopOrganizerDomainsToolOutput = z.object({ data: getTopOrganizerDomainsOutput });

export const getTournamentsByDomainInput = z.object({
  domain: domainLikeSchema,
  limit: z.number().int().positive().max(200).optional().default(100),
  offset: z.number().int().nonnegative().optional().default(0)
});

export const getTournamentsByDomainOutput = z.array(tournamentRowSchema);
export const getTournamentsByDomainToolOutput = z.object({ data: getTournamentsByDomainOutput });

export const getTournamentsInput = z.object({
  name: z.string().optional(),
  sport: sportSchema.optional(),
  state: stateSchema.optional(),
  start_date_from: z.string().optional(),
  start_date_to: z.string().optional(),
  organizer_domain: z.string().optional(),
  status: z.string().optional(),
  limit: z.number().int().positive().max(100).optional().default(25),
  offset: z.number().int().nonnegative().optional().default(0),
});

export const getTournamentsOutput = z.object({
  data: z.array(tournamentRowSchema),
  total: z.number(),
});
export const getTournamentsToolOutput = getTournamentsOutput;

const findProductionMatchesCandidateInput = z.object({
  candidate_index: z.number().int().nonnegative().optional(),
  name: z.string().optional(),
  sport: z.string().optional(),
  state: z.string().optional(),
  start_date_from: z.string().optional(),
  start_date_to: z.string().optional(),
  organizer_domain: z.string().optional(),
});

export const findProductionMatchesInput = z.object({
  candidates: z.array(findProductionMatchesCandidateInput).min(1).max(25),
  max_matches_per_candidate: z.number().int().positive().max(10).optional().default(5),
});

export const findProductionMatchesOutput = z.object({
  results: z.array(z.object({
    candidate_index: z.number(),
    matches: z.array(tournamentRowSchema),
    match_count: z.number(),
  })),
});

export const getUnverifiedTournamentsInput = z.object({
  sport: sportSchema.optional(),
  state: stateSchema.optional(),
  limit: z.number().int().positive().max(200).optional().default(100),
  offset: z.number().int().nonnegative().optional().default(0)
});

export const unverifiedTournamentRowSchema = tournamentRowSchema.extend({
  source_url: z.string().nullable().optional(),
  source_urls: z.array(z.string()).optional(),
  verified_at: z.string().nullable().optional(),
  is_verified: z.boolean().optional(),
  verification_status: z.string().nullable().optional()
});

export const getUnverifiedTournamentsOutput = z.array(unverifiedTournamentRowSchema);
export const getUnverifiedTournamentsToolOutput = z.object({ data: getUnverifiedTournamentsOutput });

export const getTournamentsMissingSourceUrlsInput = z.object({
  sport: sportSchema.optional(),
  state: stateSchema.optional(),
  limit: z.number().int().positive().max(200).optional().default(100),
  offset: z.number().int().nonnegative().optional().default(0)
});

export const getTournamentsMissingSourceUrlsOutput = z.array(unverifiedTournamentRowSchema);
export const getTournamentsMissingSourceUrlsToolOutput = z.object({
  data: getTournamentsMissingSourceUrlsOutput
});

// Organizer Intelligence (write tools; gated behind ENABLE_MCP_WRITES=true)
export const upsertOrganizerWatchlistInput = z.object({
  organizer_domain: domainLikeSchema,
  reason: z.string().min(1).max(2000),
  tags: z.array(z.string().min(1).max(50)).optional().default([]),
  status: z.enum(["active", "muted"]).optional().default("active")
});

export const upsertOrganizerWatchlistOutput = z.object({
  ok: z.literal(true),
  organizer_domain: z.string()
});

export const insertTournamentCandidateInput = z.object({
  source_url: z.string().url(),
  sport: sportSchema.optional(),
  state: stateSchema.optional(),
  name: z.string().min(1).max(300).optional(),
  notes: z.string().max(5000).optional()
});

export const insertTournamentCandidateOutput = z.object({ ok: z.literal(true) });

export const insertResearchNoteInput = z.object({
  entity_type: z.enum(["organizer", "tournament", "venue", "other"]).default("other"),
  entity_id: z.string().min(1).max(200).optional(),
  title: z.string().min(1).max(300),
  note: z.string().min(1).max(20000),
  source_url: z.string().url().optional()
});

export const insertResearchNoteOutput = z.object({ ok: z.literal(true) });

// Tool inventory
export const listToolsInput = z.object({});

export const toolEntrySchema = z.object({
  name: z.string(),
  category: z.string(),
  access: z.enum(["read", "write"]),
  description: z.string()
});

export const listToolsOutput = z.object({
  total: z.number(),
  writes_enabled: z.boolean(),
  search_history_writes_enabled: z.boolean(),
  tools: z.array(toolEntrySchema)
});

// Health tool
export const mcpHealthcheckInput = z.object({});
export const mcpHealthcheckOutput = z.object({
  status: z.literal("ok"),
  writes_enabled: z.boolean(),
  search_history_writes_enabled: z.boolean(),
  mock_mode: z.boolean(),
  supabase_url_present: z.boolean(),
  anon_key_present: z.boolean(),
  service_role_key_present: z.boolean(),
  ts: z.string()
});

// Tournament Venue Worklist
export const getTournamentVenueWorklistInput = z.object({
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
    .optional(),
  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
    .optional(),
  weeks_from_now_start: z.number().int().min(0).max(52).optional(),
  weeks_from_now_end: z.number().int().min(0).max(52).optional(),
  states: z.array(stateSchema).optional(),
  sports: z.array(sportSchema).optional(),
  venue_status: z
    .enum(["missing", "incomplete", "missing_or_incomplete", "complete", "any"])
    .optional()
    .default("any"),
  limit: z.number().int().positive().max(500).optional().default(100),
  offset: z.number().int().nonnegative().optional().default(0)
});

export const tournamentVenueWorklistRowSchema = z.object({
  tournament_id: z.string(),
  tournament_name: z.string(),
  sport: z.string().nullable(),
  tournament_city: z.string().nullable(),
  tournament_state: z.string().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  host_org: z.string().nullable(),
  official_website_url: z.string().nullable(),
  has_director_email: z.boolean(),
  venue_id: z.string().nullable(),
  venue_name: z.string().nullable(),
  venue_city: z.string().nullable(),
  venue_state: z.string().nullable(),
  missing_venue_fields: z.array(z.string()),
  venue_status: z.enum(["missing", "incomplete", "complete"]),
  priority_score: z.number()
});

export const getTournamentVenueWorklistOutput = z.object({
  date_window: z.object({ from: z.string(), to: z.string() }),
  total_matched: z.number(),
  returned: z.number(),
  venue_status_summary: z.object({
    missing: z.number(),
    incomplete: z.number(),
    complete: z.number()
  }),
  tournaments: z.array(tournamentVenueWorklistRowSchema),
  generated_at: z.string()
});

export type TournamentVenueWorklistFilters = z.infer<typeof getTournamentVenueWorklistInput>;
export type TournamentVenueWorklistRow = z.infer<typeof tournamentVenueWorklistRowSchema>;
export type TournamentVenueWorklistResult = z.infer<typeof getTournamentVenueWorklistOutput>;

// Tournament Roll Forward Log
export const rollForwardStatusEnum = z.enum([
  "pending",
  "no_dates_announced",
  "discontinued",
  "done",
  "ambiguous"
]);

// V2 research status enum — declared here so it can be used in both V1 log/upsert
// schemas below and the V2 candidate schemas further down.
export const rollForwardResearchStatusEnum = z.enum([
  "unresearched",
  "pending",
  "no_dates_announced",
  "discontinued",
  "done",
  "ambiguous",
  "ready_to_create",
  "linked_existing",
]);

export const getRollForwardLogInput = z.object({
  status: rollForwardResearchStatusEnum.optional(),
  target_year: z.number().int().min(2020).max(2040).optional(),
  batch_label: z.string().optional(),
  sport: sportSchema.optional(),
  state: stateSchema.optional(),
  limit: z.number().int().positive().max(500).optional().default(100),
  offset: z.number().int().nonnegative().optional().default(0)
});

export const rollForwardLogRowSchema = z.object({
  id: z.string(),
  parent_tournament_id: z.string(),
  parent_name: z.string().nullable(),
  parent_slug: z.string().nullable(),
  parent_sport: z.string().nullable(),
  parent_state: z.string().nullable(),
  parent_city: z.string().nullable(),
  parent_address: z.string().nullable(),
  parent_zip: z.string().nullable(),
  parent_start_date: z.string().nullable(),
  parent_end_date: z.string().nullable(),
  target_year: z.number(),
  status: rollForwardResearchStatusEnum,
  batch_label: z.string().nullable(),
  sibling_id: z.string().nullable(),
  sibling_slug: z.string().nullable(),
  notes: z.string().nullable(),
  researched_at: z.string().nullable(),
  target_name: z.string().nullable(),
  target_start_date: z.string().nullable(),
  target_end_date: z.string().nullable(),
  target_source_url: z.string().nullable(),
  target_venue_name: z.string().nullable(),
  target_venue_address: z.string().nullable(),
  target_venue_city: z.string().nullable(),
  target_venue_state: z.string().nullable(),
  target_venue_source_url: z.string().nullable(),
  target_organizer_domain: z.string().nullable(),
  production_match_id: z.string().nullable(),
  match_confidence: z.enum(["explicit", "deterministic", "likely"]).nullable(),
  recommended_action: z.enum(["link_existing", "create_new", "manual_review"]).nullable(),
  verified_dates: z.boolean().nullable(),
  verified_source: z.boolean().nullable(),
  verified_venue: z.boolean().nullable(),
  verified_youth_scope: z.boolean().nullable(),
  last_checked_at: z.string().nullable(),
  next_check_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string()
});

export const getRollForwardLogOutput = z.array(rollForwardLogRowSchema);
export const getRollForwardLogToolOutput = z.object({ data: getRollForwardLogOutput });

export const upsertRollForwardLogInput = z.object({
  parent_tournament_id: z.string().uuid("parent_tournament_id must be a valid UUID"),
  target_year: z.number().int().min(2020).max(2040),
  status: rollForwardResearchStatusEnum,
  batch_label: z.string().max(200).optional(),
  notes: z.string().max(10000).optional(),
  sibling_id: z.string().uuid("sibling_id must be a valid UUID").optional(),
  researched_at: z.string().datetime().optional(),
  // Target-year staging fields (all optional; only provided fields are updated)
  target_name: z.string().max(500).optional(),
  target_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD").optional(),
  target_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD").optional(),
  target_source_url: z.string().url("must be a valid URL").optional(),
  target_venue_name: z.string().max(500).optional(),
  target_venue_address: z.string().max(500).optional(),
  target_venue_city: z.string().max(200).optional(),
  target_venue_state: z.string().length(2, "must be a 2-letter state code").optional(),
  target_venue_source_url: z.string().url("must be a valid URL").optional(),
  target_organizer_domain: z.string().max(253).optional(),
  production_match_id: z.string().uuid("production_match_id must be a valid UUID").optional(),
  match_confidence: z.enum(["explicit", "deterministic", "likely"]).optional(),
  recommended_action: z.enum(["link_existing", "create_new", "manual_review"]).optional(),
  verified_dates: z.boolean().optional(),
  verified_source: z.boolean().optional(),
  verified_venue: z.boolean().optional(),
  verified_youth_scope: z.boolean().optional(),
  last_checked_at: z.string().datetime().optional(),
  next_check_at: z.string().datetime().optional(),
});

export const upsertRollForwardLogOutput = z.object({
  ok: z.literal(true),
  id: z.string()
});

export type RollForwardLogRow = z.infer<typeof rollForwardLogRowSchema>;
export type UpsertRollForwardLogInput = z.infer<typeof upsertRollForwardLogInput>;

// Roll-forward candidates (read-only; returned by get_roll_forward_candidates_rpc)
export const rollForwardCandidateRowSchema = z.object({
  source_id: z.string(),
  source_name: z.string(),
  source_slug: z.string().nullable(),
  source_sport: z.string().nullable(),
  source_state: z.string().nullable(),
  source_city: z.string().nullable(),
  source_address: z.string().nullable(),
  source_zip: z.string().nullable(),
  source_start_date: z.string().nullable(),
  source_end_date: z.string().nullable(),
  source_status: z.string().nullable(),
  source_official_website_url: z.string().nullable(),
  source_tournament_director: z.string().nullable(),
  source_tournament_director_email: z.string().nullable(),
  year_source: z.enum(["slug", "start_date"]),
  expected_target_slug: z.string().nullable(),
  log_id: z.string().nullable(),
  log_status: z.string().nullable(),
  log_batch_label: z.string().nullable(),
  venue_count: z.number(),
  venue_names: z.array(z.string()),
});

export const getRollForwardCandidatesInput = z.object({
  source_year: z.number().int().min(2020).max(2040),
  target_year: z.number().int().min(2020).max(2040),
  sport: z.string().optional(),
  state: z.string().optional(),
  limit: z.number().int().positive().max(100).optional().default(25),
  offset: z.number().int().nonnegative().optional().default(0),
});

export const getRollForwardCandidatesOutput = z.object({
  candidates: z.array(rollForwardCandidateRowSchema),
  returned_count: z.number(),
  source_year: z.number(),
  target_year: z.number(),
  offset: z.number(),
});

// Roll-forward candidates v2. This is intentionally separate from the v1
// schemas above: v1 is a published compatibility contract.
// rollForwardResearchStatusEnum is declared earlier in this file (after rollForwardStatusEnum).

export const siblingStatusFilterEnum = z.enum([
  "no_confirmed_match",
  "confirmed_match",
  "any",
]);

export const siblingMatchStateEnum = z.enum([
  "explicitly_linked",
  "deterministic_match",
  "likely_match_returned",
  "no_match_returned",
]);

const optionalIsoDateSchema = z.string().refine(isIsoDate, {
  message: "must be a valid date in YYYY-MM-DD format",
});

const getRollForwardCandidatesV2InputBase = z.object({
  target_year: z.number().int().min(2020).max(2040),
  source_year: z.number().int().min(2020).max(2040).optional(),
  parent_start_date_from: optionalIsoDateSchema.optional(),
  parent_start_date_to: optionalIsoDateSchema.optional(),
  sport: sportSchema.optional(),
  state: stateSchema.optional(),
  organizer_domain: z.string().min(1).optional(),
  roll_forward_status: z.union([rollForwardResearchStatusEnum, z.literal("any")]).optional(),
  sibling_status: siblingStatusFilterEnum.optional().default("any"),
  batch_label: z.string().min(1).max(200).optional(),
  limit: z.number().int().positive().max(100).optional().default(25),
  offset: z.number().int().nonnegative().optional().default(0),
});

export const getRollForwardCandidatesV2Input = getRollForwardCandidatesV2InputBase
  .superRefine((value, ctx) => {
    const sourceYear = value.source_year ?? value.target_year - 1;
    if (value.target_year <= sourceYear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target_year"],
        message: "target_year must be greater than source_year",
      });
    }
    if (
      value.parent_start_date_from &&
      value.parent_start_date_to &&
      value.parent_start_date_from > value.parent_start_date_to
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["parent_start_date_to"],
        message: "parent_start_date_to must be on or after parent_start_date_from",
      });
    }
    if (value.roll_forward_status === "unresearched" && value.batch_label) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["batch_label"],
        message: "batch_label cannot be combined with roll_forward_status=unresearched",
      });
    }
  })
  .transform((value) => ({
    ...value,
    source_year: value.source_year ?? value.target_year - 1,
  }));

export const rollForwardVenueV2Schema = z.object({
  venue_id: z.string(),
  venue_name: z.string().nullable(),
  venue_address: z.string().nullable(),
  venue_city: z.string().nullable(),
  venue_state: z.string().nullable(),
  venue_zip: z.string().nullable(),
  is_primary: z.boolean().nullable(),
});

export const rollForwardSiblingMatchV2Schema = z.object({
  tournament_id: z.string(),
  slug: z.string().nullable(),
  name: z.string().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  state: z.string().nullable(),
  city: z.string().nullable(),
  official_website_url: z.string().nullable(),
  confidence: z.enum(["explicit", "deterministic", "likely"]),
  match_reasons: z.array(z.string()),
  integrity_warnings: z.array(z.string()).optional(),
});

export const rollForwardCandidateV2Schema = z.object({
  source_id: z.string(),
  source_slug: z.string().nullable(),
  source_name: z.string().nullable(),
  source_sport: z.string().nullable(),
  source_state: z.string().nullable(),
  source_city: z.string().nullable(),
  source_address: z.string().nullable(),
  source_zip: z.string().nullable(),
  source_start_date: z.string().nullable(),
  source_end_date: z.string().nullable(),
  source_official_website_url: z.string().nullable(),
  organizer_domain: z.string().nullable(),
  tournament_director: z.string().nullable(),
  tournament_director_email: z.string().nullable(),
  source_year: z.number().int().nullable(),
  target_year: z.number().int(),
  roll_forward_status: rollForwardResearchStatusEnum,
  roll_forward_log_id: z.string().nullable(),
  roll_forward_batch_label: z.string().nullable(),
  roll_forward_notes: z.string().nullable(),
  roll_forward_researched_at: z.string().nullable(),
  sibling_match_state: siblingMatchStateEnum,
  sibling_matches: z.array(rollForwardSiblingMatchV2Schema),
  parent_venue_count: z.number().int().nonnegative(),
  venues: z.array(rollForwardVenueV2Schema),
  venue_roll_forward_policy: z.literal("inherit_parent_unless_changed"),
  data_quality_warnings: z.array(z.string()),
});

export const getRollForwardCandidatesV2Output = z.object({
  rows: z.array(rollForwardCandidateV2Schema),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  has_more: z.boolean(),
});

export const getTournamentRollForwardContextInput = z
  .object({
    target_year: z.number().int().min(2020).max(2040),
    parent_tournament_id: z.string().uuid().optional(),
    parent_slug: z.string().min(1).optional(),
  })
  .refine((value) => value.parent_tournament_id || value.parent_slug, {
    message: "parent_tournament_id or parent_slug is required",
  });

export const rollForwardHistoryRowV2Schema = z.object({
  id: z.string(),
  target_year: z.number().int(),
  status: rollForwardResearchStatusEnum,
  batch_label: z.string().nullable(),
  sibling_id: z.string().nullable(),
  notes: z.string().nullable(),
  researched_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const getTournamentRollForwardContextOutput = z.object({
  source: z.object({
    source_id: z.string(),
    source_slug: z.string().nullable(),
    source_name: z.string().nullable(),
    source_sport: z.string().nullable(),
    source_state: z.string().nullable(),
    source_city: z.string().nullable(),
    source_address: z.string().nullable(),
    source_zip: z.string().nullable(),
    source_start_date: z.string().nullable(),
    source_end_date: z.string().nullable(),
    source_official_website_url: z.string().nullable(),
    organizer_domain: z.string().nullable(),
    tournament_director: z.string().nullable(),
    tournament_director_email: z.string().nullable(),
    source_year: z.number().int().nullable(),
  }),
  venues: z.array(rollForwardVenueV2Schema),
  parent_venue_count: z.number().int().nonnegative(),
  venue_roll_forward_policy: z.literal("inherit_parent_unless_changed"),
  data_quality_warnings: z.array(z.string()),
  roll_forward_history: z.array(rollForwardHistoryRowV2Schema),
  target_year_state: z.object({
    target_year: z.number().int(),
    roll_forward_status: rollForwardResearchStatusEnum,
    roll_forward_log_id: z.string().nullable(),
    roll_forward_batch_label: z.string().nullable(),
    roll_forward_notes: z.string().nullable(),
    roll_forward_researched_at: z.string().nullable(),
    sibling_match_state: siblingMatchStateEnum,
    sibling_matches: z.array(rollForwardSiblingMatchV2Schema),
  }),
});

export type GetRollForwardCandidatesV2Input = z.infer<typeof getRollForwardCandidatesV2Input>;
export type RollForwardCandidateV2 = z.infer<typeof rollForwardCandidateV2Schema>;
export type GetRollForwardCandidatesV2Output = z.infer<typeof getRollForwardCandidatesV2Output>;
export type GetTournamentRollForwardContextInput = z.infer<typeof getTournamentRollForwardContextInput>;
export type GetTournamentRollForwardContextOutput = z.infer<typeof getTournamentRollForwardContextOutput>;

// --- upload_tournaments_csv ---

const uploadSourceEnum = z.enum([
  "us_club_soccer", "cal_south", "gotsoccer", "soccerwire", "external_crawl", "public_submission",
]);

const uploadSportEnum = z.enum([
  "soccer", "baseball", "softball", "lacrosse", "basketball", "hockey", "volleyball", "futsal",
]);

export const uploadTournamentsCsvInput = z.object({
  csv_content: z.string().min(1),
  source: uploadSourceEnum.optional().default("external_crawl"),
  status: z.enum(["draft", "published"]).optional().default("draft"),
  fallback_sport: uploadSportEnum.optional(),
  fallback_state: z.string().length(2).toUpperCase().optional(),
  fallback_city: z.string().optional(),
});

export const uploadTournamentsCsvOutput = z.object({
  ok: z.boolean(),
  total_rows: z.number().int(),
  accepted: z.number().int(),
  failed: z.number().int(),
  new_count: z.number().int(),
  existing_count: z.number().int(),
  dropped_by_cleaner: z.number().int(),
  venue_links_created: z.number().int(),
  venue_links_attempted: z.number().int(),
  venue_link_errors: z.number().int(),
  errors: z.array(z.object({ name: z.string(), error: z.string() })).optional(),
  dropped_rows: z.array(z.object({ name: z.string(), reason: z.string() })).optional(),
});

export type UploadTournamentsCsvInput = z.infer<typeof uploadTournamentsCsvInput>;
export type UploadTournamentsCsvOutput = z.infer<typeof uploadTournamentsCsvOutput>;
