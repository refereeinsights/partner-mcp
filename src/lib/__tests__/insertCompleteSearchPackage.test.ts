import { beforeEach, describe, expect, it } from "vitest";
import { insertCompleteSearchPackage, __resetSearchHistoryMockStore } from "../searchHistoryQueries";

// All tests run with the mock DB + writes enabled.
process.env.MOCK_MODE = "true";
process.env.ENABLE_SEARCH_HISTORY_WRITES = "true";

const BASE_RUN = {
  source_batch_id: "test-batch-001",
  region_name: "Test Region",
  states: ["CA"],
  sports: ["soccer"],
  date_from: "2025-06-01",
  date_to: "2025-08-31",
  search_method: "web-search",
  searched_at: "2025-07-01T12:00:00Z",
};

const BASE_SCOPE = { state: "CA", sport: "soccer" };

const BASE_FINDING = {
  candidate_status: "Qualified",
  tournament_name: "Test Cup",
  sport: "soccer",
  start_date: "2025-07-15",
  end_date: "2025-07-17",
  state: "CA",
  source_url: "https://example.com/test-cup",
};

const BASE_INTEL = {
  organizer_domain: "example.com",
  confidence_level: "High" as const,
  evidence_summary: "Verified via website and social media.",
};

function makeBatch(suffix: string) {
  return { ...BASE_RUN, source_batch_id: `test-batch-${suffix}` };
}

beforeEach(() => {
  __resetSearchHistoryMockStore();
});

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

describe("authorization", () => {
  it("rejects when ENABLE_SEARCH_HISTORY_WRITES is not set", async () => {
    const saved = process.env.ENABLE_SEARCH_HISTORY_WRITES;
    process.env.ENABLE_SEARCH_HISTORY_WRITES = "false";
    await expect(
      insertCompleteSearchPackage({ run: BASE_RUN, scopes: [BASE_SCOPE] })
    ).rejects.toThrow("disabled");
    process.env.ENABLE_SEARCH_HISTORY_WRITES = saved;
  });
});

// ---------------------------------------------------------------------------
// Happy path — created
// ---------------------------------------------------------------------------

describe("happy path", () => {
  it("returns status created on first call", async () => {
    const result = await insertCompleteSearchPackage({
      run: makeBatch("hp-1"),
      scopes: [BASE_SCOPE],
    });
    expect(result.status).toBe("created");
  });

  it("returns a valid search_run_id UUID", async () => {
    const result = await insertCompleteSearchPackage({
      run: makeBatch("hp-2"),
      scopes: [BASE_SCOPE],
    });
    if (result.status === "conflict") throw new Error("unexpected conflict");
    expect(result.search_run_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it("echoes source_batch_id in receipt", async () => {
    const result = await insertCompleteSearchPackage({
      run: makeBatch("hp-3"),
      scopes: [BASE_SCOPE],
    });
    if (result.status === "conflict") throw new Error("unexpected conflict");
    expect(result.source_batch_id).toBe("test-batch-hp-3");
  });

  it("returns one scope_result per scope", async () => {
    const result = await insertCompleteSearchPackage({
      run: makeBatch("hp-4"),
      scopes: [BASE_SCOPE, { state: "TX", sport: "baseball" }],
    });
    if (result.status === "conflict") throw new Error("unexpected conflict");
    expect(result.scope_results).toHaveLength(2);
  });

  it("finalizes by default (finalized=true, completed_at set)", async () => {
    const result = await insertCompleteSearchPackage({
      run: makeBatch("hp-5"),
      scopes: [BASE_SCOPE],
    });
    if (result.status === "conflict") throw new Error("unexpected conflict");
    expect(result.finalized).toBe(true);
    expect(result.completed_at).not.toBeNull();
  });

  it("does not finalize when finalize=false", async () => {
    const result = await insertCompleteSearchPackage({
      run: makeBatch("hp-6"),
      scopes: [BASE_SCOPE],
      finalize: false,
    });
    if (result.status === "conflict") throw new Error("unexpected conflict");
    expect(result.finalized).toBe(false);
    expect(result.completed_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

describe("findings", () => {
  it("inserts a finding and returns its id", async () => {
    const result = await insertCompleteSearchPackage({
      run: makeBatch("f-1"),
      scopes: [BASE_SCOPE],
      findings: [BASE_FINDING],
    });
    if (result.status === "conflict") throw new Error("unexpected conflict");
    expect(result.finding_results.inserted).toBe(1);
    expect(result.finding_results.finding_ids).toHaveLength(1);
  });

  it("auto-assigns to the only scope in a single-scope package", async () => {
    const result = await insertCompleteSearchPackage({
      run: makeBatch("f-2"),
      scopes: [BASE_SCOPE],
      findings: [{ ...BASE_FINDING }],
    });
    if (result.status === "conflict") throw new Error("unexpected conflict");
    expect(result.finding_results.inserted).toBe(1);
  });

  it("assigns finding by search_scope_index in a multi-scope package", async () => {
    const result = await insertCompleteSearchPackage({
      run: makeBatch("f-3"),
      scopes: [BASE_SCOPE, { state: "TX", sport: "baseball" }],
      findings: [{ ...BASE_FINDING, search_scope_index: 1, state: "TX", sport: "baseball" }],
    });
    if (result.status === "conflict") throw new Error("unexpected conflict");
    expect(result.finding_results.inserted).toBe(1);
  });

  it("rejects an out-of-range search_scope_index", async () => {
    await expect(
      insertCompleteSearchPackage({
        run: makeBatch("f-4"),
        scopes: [BASE_SCOPE],
        findings: [{ ...BASE_FINDING, search_scope_index: 99 }],
      })
    ).rejects.toThrow("out of range");
  });

  it("deduplicates identical findings within the same run", async () => {
    const batch = makeBatch("f-5");
    const r1 = await insertCompleteSearchPackage({
      run: batch,
      scopes: [BASE_SCOPE],
      findings: [BASE_FINDING],
    });
    if (r1.status === "conflict") throw new Error("unexpected conflict");

    const r2 = await insertCompleteSearchPackage({
      run: batch,
      scopes: [BASE_SCOPE],
      findings: [BASE_FINDING],
    });
    if (r2.status === "conflict") throw new Error("unexpected conflict");

    expect(r2.finding_results.reused).toBe(1);
    expect(r2.finding_results.inserted).toBe(0);
  });

  it("computes metrics from current findings", async () => {
    const result = await insertCompleteSearchPackage({
      run: makeBatch("f-6"),
      scopes: [BASE_SCOPE],
      findings: [
        BASE_FINDING,
        { ...BASE_FINDING, tournament_name: "Cup 2", candidate_status: "Duplicate" },
      ],
    });
    if (result.status === "conflict") throw new Error("unexpected conflict");
    expect(result.metrics.candidates_found).toBe(2);
    expect(result.metrics.qualified_rows).toBe(1);
    expect(result.metrics.duplicates_found).toBe(1);
  });

  it("normalizes candidate_status case (Qualified not QUALIFIED)", async () => {
    await expect(
      insertCompleteSearchPackage({
        run: makeBatch("f-7"),
        scopes: [BASE_SCOPE],
        findings: [{ ...BASE_FINDING, candidate_status: "INVALID_STATUS" }],
      })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Organizer intelligence
// ---------------------------------------------------------------------------

describe("organizer intelligence", () => {
  it("inserts org intel and returns record id", async () => {
    const result = await insertCompleteSearchPackage({
      run: makeBatch("oi-1"),
      scopes: [BASE_SCOPE],
      organizer_intelligence: [BASE_INTEL],
    });
    if (result.status === "conflict") throw new Error("unexpected conflict");
    expect(result.organizer_intelligence_results.inserted).toBe(1);
    expect(result.organizer_intelligence_results.record_ids).toHaveLength(1);
  });

  it("reuses org intel on second call (same run, same domain)", async () => {
    const batch = makeBatch("oi-2");
    await insertCompleteSearchPackage({
      run: batch,
      scopes: [BASE_SCOPE],
      organizer_intelligence: [BASE_INTEL],
    });
    const r2 = await insertCompleteSearchPackage({
      run: batch,
      scopes: [BASE_SCOPE],
      organizer_intelligence: [BASE_INTEL],
    });
    if (r2.status === "conflict") throw new Error("unexpected conflict");
    expect(r2.organizer_intelligence_results.reused).toBe(1);
    expect(r2.organizer_intelligence_results.inserted).toBe(0);
  });

  it("rejects org intel with missing evidence_summary", async () => {
    await expect(
      insertCompleteSearchPackage({
        run: makeBatch("oi-3"),
        scopes: [BASE_SCOPE],
        organizer_intelligence: [{ ...BASE_INTEL, evidence_summary: "" }],
      })
    ).rejects.toThrow("evidence_summary");
  });
});

// ---------------------------------------------------------------------------
// Idempotency — reused
// ---------------------------------------------------------------------------

describe("idempotency", () => {
  it("returns status reused on second call with matching fields", async () => {
    const batch = makeBatch("idem-1");
    await insertCompleteSearchPackage({ run: batch, scopes: [BASE_SCOPE] });
    const r2 = await insertCompleteSearchPackage({ run: batch, scopes: [BASE_SCOPE] });
    expect(r2.status).toBe("reused");
  });

  it("returns same search_run_id on reused call", async () => {
    const batch = makeBatch("idem-2");
    const r1 = await insertCompleteSearchPackage({ run: batch, scopes: [BASE_SCOPE] });
    const r2 = await insertCompleteSearchPackage({ run: batch, scopes: [BASE_SCOPE] });
    if (r1.status === "conflict" || r2.status === "conflict") throw new Error("unexpected conflict");
    expect(r1.search_run_id).toBe(r2.search_run_id);
  });
});

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

describe("conflict detection", () => {
  it("returns status conflict when search_method differs", async () => {
    const batch = makeBatch("conf-1");
    await insertCompleteSearchPackage({ run: batch, scopes: [BASE_SCOPE] });
    const r2 = await insertCompleteSearchPackage({
      run: { ...batch, search_method: "different-method" },
      scopes: [BASE_SCOPE],
    });
    expect(r2.status).toBe("conflict");
  });

  it("includes the conflicting path in the conflict response", async () => {
    const batch = makeBatch("conf-2");
    await insertCompleteSearchPackage({ run: batch, scopes: [BASE_SCOPE] });
    const r2 = await insertCompleteSearchPackage({
      run: { ...batch, search_method: "different-method" },
      scopes: [BASE_SCOPE],
    });
    if (r2.status !== "conflict") throw new Error("expected conflict");
    expect(r2.conflicts.some(c => c.path === "run.search_method")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("validation", () => {
  it("rejects duplicate scopes (same state+sport)", async () => {
    await expect(
      insertCompleteSearchPackage({
        run: makeBatch("val-1"),
        scopes: [BASE_SCOPE, BASE_SCOPE],
      })
    ).rejects.toThrow("duplicate");
  });

  it("rejects invalid state code", async () => {
    await expect(
      insertCompleteSearchPackage({
        run: makeBatch("val-2"),
        scopes: [{ state: "ZZ", sport: "soccer" }],
      })
    ).rejects.toThrow();
  });

  it("rejects invalid sport", async () => {
    await expect(
      insertCompleteSearchPackage({
        run: makeBatch("val-3"),
        scopes: [{ state: "CA", sport: "underwater-polo" }],
      })
    ).rejects.toThrow();
  });

  it("rejects markdown-formatted source_url", async () => {
    await expect(
      insertCompleteSearchPackage({
        run: makeBatch("val-4"),
        scopes: [BASE_SCOPE],
        findings: [{ ...BASE_FINDING, source_url: "[example](https://example.com)" }],
      })
    ).rejects.toThrow("markdown");
  });

  it("rejects date_from after date_to", async () => {
    await expect(
      insertCompleteSearchPackage({
        run: { ...makeBatch("val-5"), date_from: "2025-09-01", date_to: "2025-08-01" },
        scopes: [BASE_SCOPE],
      })
    ).rejects.toThrow("date_from");
  });
});
