import { z } from "zod";
import { supportedSportsSet } from "./normalize";

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

// Health tool
export const mcpHealthcheckInput = z.object({});
export const mcpHealthcheckOutput = z.object({
  status: z.literal("ok"),
  writes_enabled: z.boolean(),
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

export const getRollForwardLogInput = z.object({
  status: rollForwardStatusEnum.optional(),
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
  status: rollForwardStatusEnum,
  batch_label: z.string().nullable(),
  sibling_id: z.string().nullable(),
  sibling_slug: z.string().nullable(),
  notes: z.string().nullable(),
  researched_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string()
});

export const getRollForwardLogOutput = z.array(rollForwardLogRowSchema);
export const getRollForwardLogToolOutput = z.object({ data: getRollForwardLogOutput });

export const upsertRollForwardLogInput = z.object({
  parent_tournament_id: z.string().uuid("parent_tournament_id must be a valid UUID"),
  target_year: z.number().int().min(2020).max(2040),
  status: rollForwardStatusEnum,
  batch_label: z.string().max(200).optional(),
  notes: z.string().max(10000).optional(),
  sibling_id: z.string().uuid("sibling_id must be a valid UUID").optional(),
  researched_at: z.string().datetime().optional()
});

export const upsertRollForwardLogOutput = z.object({
  ok: z.literal(true),
  id: z.string()
});

export type RollForwardLogRow = z.infer<typeof rollForwardLogRowSchema>;
