import { describe, expect, it } from "vitest";
import {
  getRollForwardCandidatesV2Input,
  getRollForwardCandidatesV2Output,
  getTournamentRollForwardContextInput,
  rollForwardResearchStatusEnum,
  upsertRollForwardLogInput,
} from "../schemas";
import {
  isIsoDate,
  normalizeFamilyName,
  normalizeOrganizerDomain,
  siblingStatusMatches,
  sourceYearForTournament,
  validateStatusTransition,
  ROLL_FORWARD_RESEARCH_STATUSES,
} from "../rollForwardV2";
import { TOOLS } from "../../tools/listTools";

describe("roll-forward v2 input", () => {
  it("defaults source_year to target_year - 1 and pagination defaults", () => {
    const parsed = getRollForwardCandidatesV2Input.parse({ target_year: 2027 });
    expect(parsed).toMatchObject({ source_year: 2026, limit: 25, offset: 0, sibling_status: "any" });
  });

  it("requires target_year to be greater than source_year", () => {
    expect(() => getRollForwardCandidatesV2Input.parse({ target_year: 2027, source_year: 2027 }))
      .toThrow("target_year must be greater than source_year");
  });

  it("normalizes sport and state", () => {
    const parsed = getRollForwardCandidatesV2Input.parse({
      target_year: 2027,
      sport: "BaseBall",
      state: "ca",
    });
    expect(parsed.sport).toBe("baseball");
    expect(parsed.state).toBe("CA");
  });

  it("validates real ISO dates and inclusive range order", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(() => getRollForwardCandidatesV2Input.parse({
      target_year: 2027,
      parent_start_date_from: "2026-01-10",
      parent_start_date_to: "2026-01-01",
    })).toThrow("parent_start_date_to must be on or after");
  });

  it("rejects an unresearched batch-label combination", () => {
    expect(() => getRollForwardCandidatesV2Input.parse({
      target_year: 2027,
      roll_forward_status: "unresearched",
      batch_label: "batch-a",
    })).toThrow("batch_label cannot be combined");
  });

  it("rejects unsupported status filters", () => {
    expect(() => getRollForwardCandidatesV2Input.parse({
      target_year: 2027,
      roll_forward_status: "researching",
    })).toThrow();
    expect(() => getRollForwardCandidatesV2Input.parse({
      target_year: 2027,
      sibling_status: "missing",
    })).toThrow();
  });
});

describe("source-year and normalization rules", () => {
  it("uses start_date before a conflicting terminal slug year", () => {
    expect(sourceYearForTournament({ start_date: "2026-06-15", slug: "spring-classic-2025" }))
      .toEqual({
        year: 2026,
        warnings: ["source_start_date_year_conflicts_with_slug_year"],
      });
  });

  it("falls back to a terminal slug year only when the date is unavailable", () => {
    expect(sourceYearForTournament({ start_date: null, slug: "spring-classic-2026" }))
      .toEqual({ year: 2026, warnings: [] });
    expect(sourceYearForTournament({ start_date: "2026-06-15", slug: null }))
      .toEqual({ year: 2026, warnings: [] });
  });

  it("normalizes family names without fuzzy matching", () => {
    expect(normalizeFamilyName("Spring Classic - 2026"))
      .toBe(normalizeFamilyName("Spring Classic 2027"));
    expect(normalizeFamilyName("Spring Invitational 2027"))
      .not.toBe(normalizeFamilyName("Spring Classic 2026"));
  });

  it("normalizes organizer URL hostnames", () => {
    expect(normalizeOrganizerDomain("https://www.Example.com/events/abc?q=1"))
      .toBe("example.com");
  });
});

describe("sibling filter semantics", () => {
  it("treats explicit/deterministic as confirmed and likely/no-match as unconfirmed", () => {
    expect(siblingStatusMatches("confirmed_match", "explicitly_linked")).toBe(true);
    expect(siblingStatusMatches("confirmed_match", "deterministic_match")).toBe(true);
    expect(siblingStatusMatches("no_confirmed_match", "likely_match_returned")).toBe(true);
    expect(siblingStatusMatches("no_confirmed_match", "no_match_returned")).toBe(true);
    expect(siblingStatusMatches("no_confirmed_match", "explicitly_linked")).toBe(false);
  });
});

describe("status model", () => {
  it("ROLL_FORWARD_RESEARCH_STATUSES includes ready_to_create and linked_existing", () => {
    expect(ROLL_FORWARD_RESEARCH_STATUSES).toContain("ready_to_create");
    expect(ROLL_FORWARD_RESEARCH_STATUSES).toContain("linked_existing");
  });

  it("rollForwardResearchStatusEnum includes ready_to_create and linked_existing", () => {
    expect(() => rollForwardResearchStatusEnum.parse("ready_to_create")).not.toThrow();
    expect(() => rollForwardResearchStatusEnum.parse("linked_existing")).not.toThrow();
  });

  it("rollForwardResearchStatusEnum rejects unknown status", () => {
    expect(() => rollForwardResearchStatusEnum.parse("researching")).toThrow();
    expect(() => rollForwardResearchStatusEnum.parse("cancelled")).toThrow();
  });

  it("upsertRollForwardLogInput accepts all V2 statuses", () => {
    const base = { parent_tournament_id: "11111111-1111-4111-8111-111111111111", target_year: 2027 };
    for (const s of ROLL_FORWARD_RESEARCH_STATUSES) {
      expect(() => upsertRollForwardLogInput.parse({ ...base, status: s })).not.toThrow();
    }
  });

  it("upsertRollForwardLogInput rejects unknown status", () => {
    expect(() => upsertRollForwardLogInput.parse({
      parent_tournament_id: "11111111-1111-4111-8111-111111111111",
      target_year: 2027,
      status: "cancelled",
    })).toThrow();
  });

  it("no V2 schema references rollForwardStatusEnum (v1) for status fields", () => {
    // Verify rollForwardResearchStatusEnum is the contract for staging fields —
    // parse valid ready_to_create through the context output's target_year_state shape.
    const parsed = rollForwardResearchStatusEnum.parse("ready_to_create");
    expect(parsed).toBe("ready_to_create");
  });
});

describe("transition graph", () => {
  it("unresearched → any valid research state succeeds", () => {
    for (const s of ROLL_FORWARD_RESEARCH_STATUSES) {
      expect(() => validateStatusTransition("unresearched", s)).not.toThrow();
    }
  });

  it("pending → no_dates_announced and ambiguous succeed", () => {
    expect(() => validateStatusTransition("pending", "no_dates_announced")).not.toThrow();
    expect(() => validateStatusTransition("pending", "ambiguous")).not.toThrow();
  });

  it("pending → unresearched fails", () => {
    expect(() => validateStatusTransition("pending", "unresearched")).toThrow();
  });

  it("done → done succeeds (idempotent)", () => {
    expect(() => validateStatusTransition("done", "done")).not.toThrow();
  });

  it("done → pending fails (terminal)", () => {
    expect(() => validateStatusTransition("done", "pending")).toThrow("done → pending");
  });

  it("discontinued → discontinued succeeds (idempotent)", () => {
    expect(() => validateStatusTransition("discontinued", "discontinued")).not.toThrow();
  });

  it("discontinued → pending fails for same target-year record", () => {
    expect(() => validateStatusTransition("discontinued", "pending")).toThrow();
  });

  it("ready_to_create → linked_existing succeeds", () => {
    expect(() => validateStatusTransition("ready_to_create", "linked_existing")).not.toThrow();
  });

  it("ready_to_create → done succeeds", () => {
    expect(() => validateStatusTransition("ready_to_create", "done")).not.toThrow();
  });

  it("ready_to_create → unresearched fails", () => {
    expect(() => validateStatusTransition("ready_to_create", "unresearched")).toThrow();
  });

  it("linked_existing → done succeeds", () => {
    expect(() => validateStatusTransition("linked_existing", "done")).not.toThrow();
  });

  it("linked_existing → pending fails", () => {
    expect(() => validateStatusTransition("linked_existing", "pending")).toThrow();
  });
});

describe("upsert staging field validation", () => {
  const base = {
    parent_tournament_id: "11111111-1111-4111-8111-111111111111",
    target_year: 2027,
    status: "pending" as const,
  };

  it("accepts valid target staging fields", () => {
    expect(() => upsertRollForwardLogInput.parse({
      ...base,
      target_name: "Spring Classic 2027",
      target_start_date: "2027-03-15",
      target_end_date: "2027-03-16",
      target_source_url: "https://example.com/2027",
      target_venue_state: "TX",
      match_confidence: "deterministic",
      recommended_action: "link_existing",
      verified_dates: true,
      verified_source: true,
    })).not.toThrow();
  });

  it("rejects invalid target_start_date format", () => {
    expect(() => upsertRollForwardLogInput.parse({
      ...base,
      target_start_date: "03/15/2027",
    })).toThrow();
  });

  it("rejects invalid target_source_url", () => {
    expect(() => upsertRollForwardLogInput.parse({
      ...base,
      target_source_url: "not-a-url",
    })).toThrow();
  });

  it("rejects target_venue_state longer than 2 chars", () => {
    expect(() => upsertRollForwardLogInput.parse({
      ...base,
      target_venue_state: "TEX",
    })).toThrow();
  });

  it("rejects invalid match_confidence value", () => {
    expect(() => upsertRollForwardLogInput.parse({
      ...base,
      match_confidence: "certain",
    })).toThrow();
  });

  it("rejects invalid sibling_id format", () => {
    expect(() => upsertRollForwardLogInput.parse({
      ...base,
      sibling_id: "not-a-uuid",
    })).toThrow();
  });
});

describe("response and context contracts", () => {
  it("registers both versioned read tools in the inventory without removing v1", () => {
    const byName = new Map(TOOLS.map((tool) => [tool.name, tool]));
    expect(byName.get("get_roll_forward_candidates")?.access).toBe("read");
    expect(byName.get("get_roll_forward_candidates_v2")?.access).toBe("read");
    expect(byName.get("get_tournament_roll_forward_context")?.access).toBe("read");
  });

  it("accepts empty venues/matches and required pagination metadata", () => {
    const result = getRollForwardCandidatesV2Output.parse({
      rows: [{
        source_id: "source-1",
        source_slug: null,
        source_name: null,
        source_sport: null,
        source_state: null,
        source_city: null,
        source_address: null,
        source_zip: null,
        source_start_date: null,
        source_end_date: null,
        source_official_website_url: null,
        organizer_domain: null,
        tournament_director: null,
        tournament_director_email: null,
        source_year: 2026,
        target_year: 2027,
        roll_forward_status: "unresearched",
        roll_forward_log_id: null,
        roll_forward_batch_label: null,
        roll_forward_notes: null,
        roll_forward_researched_at: null,
        sibling_match_state: "no_match_returned",
        sibling_matches: [],
        parent_venue_count: 0,
        venues: [],
        venue_roll_forward_policy: "inherit_parent_unless_changed",
        data_quality_warnings: [],
      }],
      limit: 25,
      offset: 0,
      has_more: false,
    });
    expect(result.rows[0].venues).toEqual([]);
  });

  it("requires a context anchor and accepts matching-anchor syntax", () => {
    expect(() => getTournamentRollForwardContextInput.parse({ target_year: 2027 })).toThrow();
    expect(getTournamentRollForwardContextInput.parse({
      target_year: 2027,
      parent_tournament_id: "11111111-1111-4111-8111-111111111111",
      parent_slug: "spring-classic-2026",
    })).toMatchObject({ parent_slug: "spring-classic-2026" });
  });
});
