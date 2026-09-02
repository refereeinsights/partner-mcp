import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const runIntegration = process.env.RUN_ROLL_FORWARD_DB_TESTS === "true";
const SOURCE_NO_MATCH = "71000000-0000-4000-8000-000000000001";
const SOURCE_EXACT = "71000000-0000-4000-8000-000000000002";
const TARGET_EXACT = "71000000-0000-4000-8000-000000000003";
const VENUE_A = "72000000-0000-4000-8000-000000000001";
const VENUE_B = "72000000-0000-4000-8000-000000000002";

describe.skipIf(!runIntegration)("roll-forward v2 RPC integration", () => {
  let supabase: SupabaseClient;

  beforeAll(async () => {
    const url = process.env.ROLL_FORWARD_TEST_SUPABASE_URL;
    const key = process.env.ROLL_FORWARD_TEST_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("ROLL_FORWARD_TEST_SUPABASE_URL and ROLL_FORWARD_TEST_SERVICE_ROLE_KEY are required");
    }
    const host = new URL(url).hostname;
    if (host !== "127.0.0.1" && host !== "localhost") {
      throw new Error("Roll-forward fixture tests are restricted to local Supabase; production is forbidden");
    }
    supabase = createClient(url, key, { auth: { persistSession: false } });

    const { error: tournamentError } = await supabase.from("tournaments").upsert([
      {
        id: SOURCE_NO_MATCH,
        name: "V2 No Match Cup 2026",
        slug: null,
        sport: "baseball",
        state: "CA",
        city: "Testville",
        start_date: "2026-01-02",
        end_date: "2026-01-03",
        status: "published",
        is_canonical: true,
      },
      {
        id: SOURCE_EXACT,
        name: "V2 Exact Cup 2026",
        slug: "v2-exact-cup-2026",
        sport: "baseball",
        state: "CA",
        city: "Testville",
        start_date: "2026-01-03",
        end_date: "2026-01-04",
        status: "published",
        is_canonical: true,
      },
      {
        id: TARGET_EXACT,
        name: "V2 Exact Cup 2027",
        slug: "v2-exact-cup-2027",
        sport: "baseball",
        state: "CA",
        city: "Testville",
        start_date: "2027-01-03",
        end_date: "2027-01-04",
        status: "published",
        is_canonical: true,
      },
    ], { onConflict: "id" });
    if (tournamentError) throw tournamentError;

    const { error: venueError } = await supabase.from("venues").upsert([
      { id: VENUE_A, name: "Alpha Fields", city: "Testville", state: "CA" },
      { id: VENUE_B, name: "Beta Fields", city: "Testville", state: "CA" },
    ], { onConflict: "id" });
    if (venueError) throw venueError;

    const { error: linkError } = await supabase.from("tournament_venues").upsert([
      { tournament_id: SOURCE_NO_MATCH, venue_id: VENUE_B, is_primary: false },
      { tournament_id: SOURCE_NO_MATCH, venue_id: VENUE_A, is_primary: true },
    ], { onConflict: "tournament_id,venue_id" });
    if (linkError) throw linkError;
  });

  afterAll(async () => {
    if (!supabase) return;
    await supabase.from("tournament_roll_forward_log").delete().in("parent_tournament_id", [SOURCE_NO_MATCH, SOURCE_EXACT]);
    await supabase.from("tournament_venues").delete().in("tournament_id", [SOURCE_NO_MATCH, SOURCE_EXACT]);
    await supabase.from("venues").delete().in("id", [VENUE_A, VENUE_B]);
    await supabase.from("tournaments").delete().in("id", [SOURCE_NO_MATCH, SOURCE_EXACT, TARGET_EXACT]);
  });

  async function fetchRows(extra: Record<string, unknown> = {}) {
    const { data, error } = await supabase.rpc("get_roll_forward_candidates_rpc_v2", {
      p_target_year: 2027,
      p_source_year: 2026,
      p_parent_start_date_from: "2026-01-01",
      p_parent_start_date_to: "2026-01-10",
      p_sport: "BASEBALL",
      p_state: "ca",
      p_organizer_domain: null,
      p_roll_forward_status: "unresearched",
      p_sibling_status: "any",
      p_batch_label: null,
      p_limit: 25,
      p_offset: 0,
      p_source_id: null,
      p_source_slug: null,
      ...extra,
    });
    if (error) throw error;
    return (data ?? []).map((row: any) => row.row_data ?? row);
  }

  it("selects null-slug unresearched parents and returns ordered full venues", async () => {
    const rows = await fetchRows();
    const source = rows.find((row: any) => row.source_id === SOURCE_NO_MATCH);
    expect(source.roll_forward_status).toBe("unresearched");
    expect(source.sibling_match_state).toBe("no_match_returned");
    expect(source.venues.map((venue: any) => venue.venue_name)).toEqual(["Alpha Fields", "Beta Fields"]);
    expect(source.venues[0].is_primary).toBe(true);
  });

  it("classifies the exact target-year slug as deterministic", async () => {
    const rows = await fetchRows({ p_sibling_status: "confirmed_match" });
    const source = rows.find((row: any) => row.source_id === SOURCE_EXACT);
    expect(source.sibling_match_state).toBe("deterministic_match");
    expect(source.sibling_matches[0].tournament_id).toBe(TARGET_EXACT);
  });

  it("applies inclusive source date boundaries", async () => {
    const rows = await fetchRows({
      p_parent_start_date_from: "2026-01-02",
      p_parent_start_date_to: "2026-01-02",
    });
    expect(rows.map((row: any) => row.source_id)).toEqual([SOURCE_NO_MATCH]);
  });
});
