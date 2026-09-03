import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const enrichmentActionTypeEnum = z.enum([
  "add_official_source",
  "correct_dates",
  "add_venue",
  "add_additional_venue",
  "correct_venue",
  "correct_tournament_location",
  "merge_duplicate",
  "manual_review",
]);
export type EnrichmentActionType = z.infer<typeof enrichmentActionTypeEnum>;

export const enrichmentStatusEnum = z.enum([
  "pending_review",
  "needs_verification",
  "approved",
  "rejected",
  "applied",
]);

export const enrichmentConfidenceEnum = z.enum(["high", "medium", "low"]);

// MCP-writable statuses — MCP must never set approved/rejected/applied
export const mcpWritableStatusEnum = z.enum(["pending_review", "needs_verification"]);
export type McpWritableStatus = z.infer<typeof mcpWritableStatusEnum>;

// ---------------------------------------------------------------------------
// Proposed-value shapes per action_type
// ---------------------------------------------------------------------------

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const statePattern = /^[A-Z]{2}$/;

const venueProposedShape = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  city: z.string().min(1),
  state: z.string().regex(statePattern, "state must be 2 uppercase letters e.g. TX"),
  zip: z.string().optional(),
  sport: z.string().optional(),
}).strict();

export const proposedValueSchemas: Record<EnrichmentActionType, z.ZodTypeAny> = {
  add_official_source: z.object({ url: z.string().url() }).strict(),
  correct_dates: z.object({
    start_date: z.string().regex(isoDatePattern, "start_date must be YYYY-MM-DD"),
    end_date: z.string().regex(isoDatePattern, "end_date must be YYYY-MM-DD"),
  }).strict(),
  add_venue: venueProposedShape,
  add_additional_venue: venueProposedShape,
  correct_venue: venueProposedShape,
  correct_tournament_location: z.object({
    city: z.string().min(1),
    state: z.string().regex(statePattern, "state must be 2 uppercase letters e.g. TX"),
  }).strict(),
  merge_duplicate: z.object({
    duplicate_tournament_id: z.string().uuid(),
    duplicate_name: z.string().optional(),
    duplicate_slug: z.string().optional(),
  }).strict(),
  manual_review: z.object({ issue: z.string().min(1) }).strict(),
};

export function parseProposedValue(
  actionType: EnrichmentActionType,
  json: string,
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("proposed_value_json is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("proposed_value_json must be a JSON object, not an array or primitive");
  }
  const schema = proposedValueSchemas[actionType];
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `proposed_value_json shape is invalid for action_type "${actionType}": ${result.error.message}`,
    );
  }
  return result.data as Record<string, unknown>;
}

// Deterministic key-sorted serialization for idempotency fingerprinting
function sortKeysRecursive(val: unknown): unknown {
  if (Array.isArray(val)) return val.map(sortKeysRecursive);
  if (typeof val === "object" && val !== null) {
    return Object.fromEntries(
      Object.entries(val as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeysRecursive(v)]),
    );
  }
  return val;
}

export function canonicalProposedValue(value: Record<string, unknown>): string {
  return JSON.stringify(sortKeysRecursive(value));
}

// ---------------------------------------------------------------------------
// Shared proposal row shape (used in both context and proposals list)
// ---------------------------------------------------------------------------

export const enrichmentProposalRowSchema = z.object({
  id: z.string(),
  status: enrichmentStatusEnum,
  action_type: enrichmentActionTypeEnum,
  field_name: z.string().nullable(),
  current_value: z.unknown().nullable(),
  proposed_value: z.unknown().nullable(),
  source_url: z.string().nullable(),
  venue_source_url: z.string().nullable(),
  confidence: enrichmentConfidenceEnum,
  evidence_summary: z.string(),
  research_notes: z.string().nullable(),
  proposed_by: z.string().nullable(),
  source_batch_id: z.string().nullable(),
  researched_at: z.string().nullable(),
  reviewed_at: z.string().nullable(),
  applied_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// ---------------------------------------------------------------------------
// get_tournament_enrichment_context
// ---------------------------------------------------------------------------

export const getTournamentEnrichmentContextInput = z.object({
  tournament_id: z.string().uuid(),
});

export const getTournamentEnrichmentContextOutput = z.object({
  tournament: z.object({
    id: z.string(),
    name: z.string().nullable(),
    slug: z.string().nullable(),
    sport: z.string().nullable(),
    status: z.string().nullable(),
    start_date: z.string().nullable(),
    end_date: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    official_website_url: z.string().nullable(),
    tournament_director: z.string().nullable(),
    tournament_director_email: z.string().nullable(),
  }),
  venues: z.array(z.object({
    venue_id: z.string(),
    name: z.string().nullable(),
    address: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    zip: z.string().nullable(),
    is_primary: z.boolean().nullable(),
  })),
  proposals: z.array(enrichmentProposalRowSchema),
});

// ---------------------------------------------------------------------------
// get_tournament_enrichment_proposals
// ---------------------------------------------------------------------------

export const getTournamentEnrichmentProposalsInput = z.object({
  tournament_id: z.string().uuid().optional(),
  status: enrichmentStatusEnum.optional(),
  action_type: enrichmentActionTypeEnum.optional(),
  sport: z.string().optional(),
  state: z.string().optional(),
  source_batch_id: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).default(0),
});

export const getTournamentEnrichmentProposalsOutput = z.object({
  rows: z.array(z.object({
    proposal_id: z.string(),
    tournament_id: z.string(),
    tournament_name: z.string().nullable(),
    tournament_slug: z.string().nullable(),
    tournament_sport: z.string().nullable(),
    tournament_city: z.string().nullable(),
    tournament_state: z.string().nullable(),
    status: enrichmentStatusEnum,
    action_type: enrichmentActionTypeEnum,
    field_name: z.string().nullable(),
    current_value: z.unknown().nullable(),
    proposed_value: z.unknown().nullable(),
    confidence: enrichmentConfidenceEnum,
    evidence_summary: z.string(),
    source_url: z.string().nullable(),
    venue_source_url: z.string().nullable(),
    source_batch_id: z.string().nullable(),
    proposed_by: z.string().nullable(),
    researched_at: z.string().nullable(),
    reviewed_at: z.string().nullable(),
    applied_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
  has_more: z.boolean(),
});

// ---------------------------------------------------------------------------
// upsert_tournament_enrichment_proposal
// ---------------------------------------------------------------------------

export const upsertTournamentEnrichmentProposalInput = z.object({
  tournament_id: z.string().uuid(),
  action_type: enrichmentActionTypeEnum,
  proposed_value_json: z.string().min(1),
  status: mcpWritableStatusEnum.default("pending_review"),
  venue_id: z.string().uuid().optional(),
  source_url: z.string().url().optional(),
  venue_source_url: z.string().url().optional(),
  confidence: enrichmentConfidenceEnum.default("medium"),
  evidence_summary: z.string().min(1),
  research_notes: z.string().optional(),
  source_batch_id: z.string().optional(),
  proposed_by: z.string().optional(),
  researched_at: z.string().datetime().optional(),
  field_name: z.string().optional(),
});

export const upsertTournamentEnrichmentProposalOutput = z.object({
  ok: z.literal(true),
  proposal_id: z.string(),
  tournament_id: z.string(),
  status: enrichmentStatusEnum,
  action_type: enrichmentActionTypeEnum,
  created_new: z.boolean(),
  matched_existing_active_proposal: z.boolean(),
  source_batch_id: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type GetTournamentEnrichmentContextInput = z.infer<typeof getTournamentEnrichmentContextInput>;
export type GetTournamentEnrichmentProposalsInput = z.infer<typeof getTournamentEnrichmentProposalsInput>;
export type UpsertTournamentEnrichmentProposalInput = z.infer<typeof upsertTournamentEnrichmentProposalInput>;
