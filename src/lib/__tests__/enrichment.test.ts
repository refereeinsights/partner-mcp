import { describe, expect, it } from "vitest";
import {
  parseProposedValue as pv,
  canonicalProposedValue as cpv,
  upsertTournamentEnrichmentProposalInput as upsertInput,
  enrichmentActionTypeEnum as actionEnum,
  enrichmentStatusEnum as statusEnum,
  mcpWritableStatusEnum as mcpStatusEnum,
} from "../enrichmentSchemas";
import { TOOLS } from "../../tools/listTools";

const BASE_UUID = "11111111-1111-4111-8111-111111111111";
const DUP_UUID  = "22222222-2222-4222-8222-222222222222";

// ---------------------------------------------------------------------------
// parseProposedValue
// ---------------------------------------------------------------------------

describe("parseProposedValue — add_official_source", () => {
  it("accepts a valid URL", () => {
    expect(() => pv("add_official_source", JSON.stringify({ url: "https://example.com/event" }))).not.toThrow();
  });
  it("rejects malformed JSON", () => {
    expect(() => pv("add_official_source", "not json")).toThrow("not valid JSON");
  });
  it("rejects an array", () => {
    expect(() => pv("add_official_source", "[]")).toThrow("must be a JSON object");
  });
  it("rejects a non-URL value", () => {
    expect(() => pv("add_official_source", JSON.stringify({ url: "not-a-url" }))).toThrow();
  });
  it("rejects extra keys (strict shape)", () => {
    expect(() => pv("add_official_source", JSON.stringify({ url: "https://x.com", extra: "y" }))).toThrow();
  });
});

describe("parseProposedValue — correct_dates", () => {
  it("accepts valid YYYY-MM-DD dates", () => {
    const result = pv("correct_dates", JSON.stringify({ start_date: "2027-03-01", end_date: "2027-03-03" }));
    expect(result).toMatchObject({ start_date: "2027-03-01", end_date: "2027-03-03" });
  });
  it("rejects non-ISO date format", () => {
    expect(() => pv("correct_dates", JSON.stringify({ start_date: "03/01/2027", end_date: "2027-03-03" }))).toThrow();
  });
  it("rejects missing end_date", () => {
    expect(() => pv("correct_dates", JSON.stringify({ start_date: "2027-03-01" }))).toThrow();
  });
});

describe("parseProposedValue — add_additional_venue", () => {
  const valid = { name: "Apex Sports Complex", city: "Frisco", state: "TX", zip: "75034" };
  it("accepts valid venue shape", () => {
    expect(() => pv("add_additional_venue", JSON.stringify(valid))).not.toThrow();
  });
  it("rejects state longer than 2 chars", () => {
    expect(() => pv("add_additional_venue", JSON.stringify({ ...valid, state: "TEX" }))).toThrow();
  });
  it("rejects lowercase state", () => {
    expect(() => pv("add_additional_venue", JSON.stringify({ ...valid, state: "tx" }))).toThrow();
  });
  it("rejects missing city", () => {
    expect(() => pv("add_additional_venue", JSON.stringify({ name: "X", state: "TX" }))).toThrow();
  });
});

describe("parseProposedValue — correct_venue", () => {
  it("accepts valid venue shape (venue_id comes from separate field)", () => {
    const val = { name: "Corrected Venue", city: "Dallas", state: "TX" };
    expect(() => pv("correct_venue", JSON.stringify(val))).not.toThrow();
  });
  it("rejects extra keys", () => {
    expect(() => pv("correct_venue", JSON.stringify({ name: "X", city: "Y", state: "TX", venue_id: "uuid" }))).toThrow();
  });
});

describe("parseProposedValue — merge_duplicate", () => {
  it("requires duplicate_tournament_id (uuid)", () => {
    expect(() => pv("merge_duplicate", JSON.stringify({ duplicate_tournament_id: "not-uuid" }))).toThrow();
  });
  it("accepts valid merge_duplicate shape", () => {
    const result = pv("merge_duplicate", JSON.stringify({
      duplicate_tournament_id: DUP_UUID,
      duplicate_name: "Spring Classic Duplicate",
    }));
    expect(result).toMatchObject({ duplicate_tournament_id: DUP_UUID });
  });
  it("rejects empty proposed_value_json", () => {
    expect(() => pv("merge_duplicate", JSON.stringify({}))).toThrow();
  });
});

describe("parseProposedValue — manual_review", () => {
  it("accepts a non-empty issue string", () => {
    expect(() => pv("manual_review", JSON.stringify({ issue: "Dates conflict with venue availability" }))).not.toThrow();
  });
  it("rejects empty issue", () => {
    expect(() => pv("manual_review", JSON.stringify({ issue: "" }))).toThrow();
  });
});

describe("parseProposedValue — wrong shape for action_type", () => {
  it("rejects correct_dates shape when action_type is add_official_source", () => {
    expect(() => pv("add_official_source", JSON.stringify({ start_date: "2027-01-01", end_date: "2027-01-03" }))).toThrow();
  });
  it("rejects manual_review shape when action_type is correct_dates", () => {
    expect(() => pv("correct_dates", JSON.stringify({ issue: "something" }))).toThrow();
  });
});

// ---------------------------------------------------------------------------
// canonicalProposedValue
// ---------------------------------------------------------------------------

describe("canonicalProposedValue", () => {
  it("produces the same string regardless of key insertion order", () => {
    const a = cpv({ state: "TX", city: "Dallas" });
    const b = cpv({ city: "Dallas", state: "TX" });
    expect(a).toBe(b);
  });

  it("produces different strings for different values", () => {
    const a = cpv({ url: "https://a.com" });
    const b = cpv({ url: "https://b.com" });
    expect(a).not.toBe(b);
  });

  it("is stable across repeated calls", () => {
    const val = { name: "X", city: "Y", state: "TX" };
    expect(cpv(val)).toBe(cpv(val));
  });
});

// ---------------------------------------------------------------------------
// upsertTournamentEnrichmentProposalInput schema
// ---------------------------------------------------------------------------

describe("upsertTournamentEnrichmentProposalInput", () => {
  const base = {
    tournament_id: BASE_UUID,
    action_type: "add_official_source" as const,
    proposed_value_json: JSON.stringify({ url: "https://example.com" }),
    evidence_summary: "Official organizer website confirmed via WHOIS",
    confidence: "high" as const,
  };

  it("accepts valid base input with defaults", () => {
    const result = upsertInput.parse(base);
    expect(result.status).toBe("pending_review");
    expect(result.confidence).toBe("high");
  });

  it("defaults status to pending_review", () => {
    expect(upsertInput.parse(base).status).toBe("pending_review");
  });

  it("accepts needs_verification as status", () => {
    expect(upsertInput.parse({ ...base, status: "needs_verification" }).status).toBe("needs_verification");
  });

  it("rejects approved as status (admin-only)", () => {
    expect(() => upsertInput.parse({ ...base, status: "approved" })).toThrow();
  });

  it("rejects rejected as status (admin-only)", () => {
    expect(() => upsertInput.parse({ ...base, status: "rejected" })).toThrow();
  });

  it("rejects applied as status (admin-only)", () => {
    expect(() => upsertInput.parse({ ...base, status: "applied" })).toThrow();
  });

  it("requires evidence_summary", () => {
    const { evidence_summary: _, ...without } = base;
    expect(() => upsertInput.parse(without)).toThrow();
  });

  it("requires tournament_id to be a UUID", () => {
    expect(() => upsertInput.parse({ ...base, tournament_id: "not-a-uuid" })).toThrow();
  });

  it("rejects invalid action_type", () => {
    expect(() => upsertInput.parse({ ...base, action_type: "delete_tournament" })).toThrow();
  });

  it("accepts venue_id for correct_venue", () => {
    const result = upsertInput.parse({
      ...base,
      action_type: "correct_venue",
      proposed_value_json: JSON.stringify({ name: "X", city: "Dallas", state: "TX" }),
      venue_id: DUP_UUID,
    });
    expect(result.venue_id).toBe(DUP_UUID);
  });
});

// ---------------------------------------------------------------------------
// Status enum constraints
// ---------------------------------------------------------------------------

describe("enrichmentStatusEnum", () => {
  it("accepts all 5 DB status values", () => {
    const statuses = ["pending_review", "needs_verification", "approved", "rejected", "applied"];
    for (const s of statuses) {
      expect(() => statusEnum.parse(s)).not.toThrow();
    }
  });
  it("rejects unknown status", () => {
    expect(() => statusEnum.parse("draft")).toThrow();
    expect(() => statusEnum.parse("pending")).toThrow();
  });
});

describe("mcpWritableStatusEnum", () => {
  it("accepts pending_review and needs_verification", () => {
    expect(() => mcpStatusEnum.parse("pending_review")).not.toThrow();
    expect(() => mcpStatusEnum.parse("needs_verification")).not.toThrow();
  });
  it("rejects approved, rejected, applied", () => {
    expect(() => mcpStatusEnum.parse("approved")).toThrow();
    expect(() => mcpStatusEnum.parse("rejected")).toThrow();
    expect(() => mcpStatusEnum.parse("applied")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// list_tools registration
// ---------------------------------------------------------------------------

describe("list_tools enrichment registration", () => {
  it("advertises all three enrichment tools", () => {
    const byName = new Map(TOOLS.map((t) => [t.name, t]));
    expect(byName.get("get_tournament_enrichment_context")?.access).toBe("read");
    expect(byName.get("get_tournament_enrichment_proposals")?.access).toBe("read");
    expect(byName.get("upsert_tournament_enrichment_proposal")?.access).toBe("write");
  });

  it("enrichment tools are in the enrichment category", () => {
    const enrichmentTools = TOOLS.filter((t) => t.category === "enrichment");
    const names = enrichmentTools.map((t) => t.name);
    expect(names).toContain("get_tournament_enrichment_context");
    expect(names).toContain("get_tournament_enrichment_proposals");
    expect(names).toContain("upsert_tournament_enrichment_proposal");
  });

  it("get_enrichment_worklist is NOT registered (deferred from v1)", () => {
    const byName = new Map(TOOLS.map((t) => [t.name, t]));
    expect(byName.has("get_enrichment_worklist")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Action type enum
// ---------------------------------------------------------------------------

describe("enrichmentActionTypeEnum", () => {
  it("accepts all 8 action types", () => {
    const types = [
      "add_official_source", "correct_dates", "add_venue", "add_additional_venue",
      "correct_venue", "correct_tournament_location", "merge_duplicate", "manual_review",
    ];
    for (const t of types) {
      expect(() => actionEnum.parse(t)).not.toThrow();
    }
  });
  it("rejects unknown action types", () => {
    expect(() => actionEnum.parse("delete_tournament")).toThrow();
    expect(() => actionEnum.parse("publish_tournament")).toThrow();
    expect(() => actionEnum.parse("apply_proposal")).toThrow();
  });
});
