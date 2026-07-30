import { getSupabaseAdmin as getSupabaseClient } from "./supabaseAdmin";
import {
  AssociationDashboard,
  DatasetHealth,
  MissingFieldsFilters,
  MissingVenuesFilters,
  MissingVenuesResult,
  OrganizerCluster,
  ResearchBatchRow,
  RollForwardLogRow,
  StateSportCoverageRow,
  SummaryDashboard,
  TournamentVenueWorklistFilters,
  TournamentVenueWorklistResult,
  TournamentVenueWorklistRow,
  TrendRow,
  VenueCluster
} from "./schemas";
const MOCK_TOURNAMENTS = [
  {
    id: "mock-tournament-1",
    name: "Mock Cup",
    sport: "soccer",
    city: "Austin",
    state: "TX",
    start_date: "2024-05-01",
    end_date: "2024-05-03",
    official_website_url: null,
    tournament_director: "Jane Doe",
    tournament_director_email: null,
    referee_contact: null,
    referee_contact_email: null,
    host_org: "Mock Org",
    tournament_association: "AYSO"
  },
  {
    id: "mock-tournament-2",
    name: "Test Showcase",
    sport: "baseball",
    city: "Dallas",
    state: "TX",
    start_date: null,
    end_date: null,
    official_website_url: "https://example.com",
    tournament_director: null,
    tournament_director_email: "td@example.com",
    referee_contact: "Ref Ria",
    referee_contact_email: null,
    host_org: "Mock Org",
    tournament_association: "USSSA Baseball"
  }
];

const MOCK_VENUES = [
  { id: "mock-venue-1", name: "Mock Park", city: "Austin", state: "TX", zip: "78701", venue_url: null }
];

const MOCK_TOURNAMENT_VENUES = [{ tournament_id: "mock-tournament-1", venue_id: "mock-venue-1" }];

function mockMode() {
  return process.env.MOCK_MODE === "true";
}

type QueryBuilder = any;

async function fetchAllPaginated(
  factory: (from: number, to: number) => QueryBuilder,
  chunkSize = 1000
) {
  const rows: any[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await factory(offset, offset + chunkSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < chunkSize) break;
    offset += chunkSize;
  }
  return rows;
}

function applyCommonFilters<T extends { sport?: string | null; state?: string | null }>(
  query: QueryBuilder,
  filters: { sport?: string; state?: string }
) {
  if (filters.sport) {
    query = query.eq("sport", filters.sport);
  }
  if (filters.state) {
    query = query.eq("state", filters.state);
  }
  return query;
}

export async function getDatasetHealth(): Promise<DatasetHealth> {
  if (mockMode()) {
    const total = MOCK_TOURNAMENTS.length;
    const bySport: Record<string, number> = {};
    const byState: Record<string, number> = {};
    let missingWebsite = 0;
    let missingDirectorEmail = 0;
    let missingStart = 0;
    let missingEnd = 0;
    for (const t of MOCK_TOURNAMENTS) {
      bySport[t.sport] = (bySport[t.sport] || 0) + 1;
      if (t.state) byState[t.state] = (byState[t.state] || 0) + 1;
      if (!t.official_website_url) missingWebsite++;
      if (!t.tournament_director_email) missingDirectorEmail++;
      if (!t.start_date) missingStart++;
      if (!t.end_date) missingEnd++;
    }
    return {
      total_tournaments: total,
      tournaments_by_sport: bySport,
      tournaments_by_state: byState,
      pct_missing_website: total ? missingWebsite / total : 0,
      pct_missing_director_email: total ? missingDirectorEmail / total : 0,
      pct_missing_start_date: total ? missingStart / total : 0,
      pct_missing_end_date: total ? missingEnd / total : 0,
      generated_at: new Date().toISOString()
    };
  }

  const supabase = getSupabaseClient();

  const baseSelect = "id,sport,state,official_website_url,tournament_director_email,start_date,end_date";
  const data = await fetchAllPaginated((from, to) =>
    supabase.from("tournaments").select(baseSelect).range(from, to)
  );
  const total = data.length;
  const bySport: Record<string, number> = {};
  const byState: Record<string, number> = {};
  let missingWebsite = 0;
  let missingDirectorEmail = 0;
  let missingStart = 0;
  let missingEnd = 0;

  for (const t of data ?? []) {
    if (t.sport) bySport[t.sport] = (bySport[t.sport] || 0) + 1;
    if (t.state) byState[t.state] = (byState[t.state] || 0) + 1;
    if (!t.official_website_url) missingWebsite++;
    if (!t.tournament_director_email) missingDirectorEmail++;
    if (!t.start_date) missingStart++;
    if (!t.end_date) missingEnd++;
  }

  return {
    total_tournaments: total,
    tournaments_by_sport: bySport,
    tournaments_by_state: byState,
    pct_missing_website: total ? missingWebsite / total : 0,
    pct_missing_director_email: total ? missingDirectorEmail / total : 0,
    pct_missing_start_date: total ? missingStart / total : 0,
    pct_missing_end_date: total ? missingEnd / total : 0,
    generated_at: new Date().toISOString()
  };
}

export async function getStateSportCoverage(filters: {
  sports?: string[];
  states?: string[];
  limit?: number;
}): Promise<StateSportCoverageRow[]> {
  if (mockMode()) {
    return [
      {
        sport: "soccer",
        state: "TX",
        tournament_count: 1,
        missing_website_count: 1,
        missing_director_email_count: 1
      }
    ];
  }
  const supabase = getSupabaseClient();
  const data = await fetchAllPaginated((from, to) => {
    let query = supabase.from("tournaments").select("sport,state,official_website_url,tournament_director_email");
    if (filters.sports?.length) query = query.in("sport", filters.sports);
    if (filters.states?.length) query = query.in("state", filters.states);
    return query.range(from, to);
  });

  const map = new Map<string, StateSportCoverageRow>();
  for (const row of (data || []) as any[]) {
    const key = `${row.sport || "unknown"}-${row.state || ""}`;
    const existing = map.get(key) || {
      sport: row.sport,
      state: row.state,
      tournament_count: 0,
      missing_website_count: 0,
      missing_director_email_count: 0
    };
    existing.tournament_count += 1;
    if (!row.official_website_url) existing.missing_website_count += 1;
    if (!row.tournament_director_email) existing.missing_director_email_count += 1;
    map.set(key, existing);
  }

  const rows = Array.from(map.values());
  rows.sort((a, b) => a.tournament_count - b.tournament_count);
  return filters.limit ? rows.slice(0, filters.limit) : rows;
}

export async function getMissingFields(filters: MissingFieldsFilters) {
  if (mockMode()) {
    return MOCK_TOURNAMENTS.filter((t) =>
      filters.missing_any_of.some((field) => !t[field as keyof typeof t])
    );
  }
  const supabase = getSupabaseClient();

  const requiredColumns = ["id", "name"];
  const optionalColumns = [
    "slug",
    "sport",
    "city",
    "state",
    "address",
    "zip",
    "start_date",
    "end_date",
    "official_website_url",
    "tournament_director",
    "tournament_director_email",
    "referee_contact",
    "referee_contact_email"
  ];

  const buildQuery =
    (cols: string[]) =>
    (from?: number, to?: number): QueryBuilder => {
      let query: QueryBuilder = supabase.from("tournaments").select(cols.join(","));
      query = applyCommonFilters(query, filters);
      if (typeof from === "number" && typeof to === "number") {
        query = query.range(from, to);
      } else if (filters.limit) {
        const start = filters.offset ?? 0;
        const end = start + filters.limit - 1;
        query = query.range(start, end);
      }
      return query;
    };

  let columns = [...requiredColumns, ...optionalColumns];

  while (true) {
    try {
      const rows =
        filters.limit !== undefined
          ? (() => {
              const execute = async () => {
                const { data, error } = await buildQuery(columns)();
                if (error) throw error;
                return data || [];
              };
              return execute();
            })()
          : await fetchAllPaginated((from, to) => buildQuery(columns)(from, to));

      const resolvedRows = Array.isArray(rows) ? rows : await rows;

      return (resolvedRows || []).filter((row: any) =>
        filters.missing_any_of.some((field) => !row[field as keyof typeof row])
      );
    } catch (error: any) {
      const missingMatch =
        error?.message?.match(/column ["']?([\w\.]+)["']? does not exist/i) ||
        error?.details?.match(/column ["']?([\w\.]+)["']? does not exist/i);
      const missingCol = missingMatch?.[1]?.split(".").pop();

      if (missingCol && columns.includes(missingCol) && !requiredColumns.includes(missingCol)) {
        columns = columns.filter((c) => c !== missingCol);
        console.error(JSON.stringify({ missingCol }), "get_missing_fields_missing_column");
        continue;
      }

      throw error;
    }
  }
}

export async function getOrganizerClusters(filters: {
  min_tournaments: number;
  sport?: string;
  state?: string;
  limit?: number;
}): Promise<OrganizerCluster[]> {
  if (mockMode()) {
    return [
      {
        host_org: "Mock Org",
        organizer_confidence: "high",
        tournament_count: 2,
        sports: ["soccer", "baseball"],
        states: ["TX"],
        tournaments: MOCK_TOURNAMENTS.map((t) => ({
          id: t.id,
          name: t.name,
          city: t.city,
          state: t.state,
          start_date: t.start_date
        })),
        missing_director_email_count: 1,
        missing_website_count: 1
      }
    ];
  }

  const supabase = getSupabaseClient();
  const requiredColumns = ["id", "name"];
  const optionalColumns = [
    "sport",
    "city",
    "state",
    "start_date",
    "official_website_url",
    "tournament_director_email",
    "host_org"
  ];

  const buildQuery = (cols: string[]) => {
    let query = supabase.from("tournaments").select(cols.join(","));
    query = applyCommonFilters(query, filters);
    return query;
  };

  let columns = [...requiredColumns, ...optionalColumns];
  let data: any[] | null = null;

  while (true) {
    try {
      data = await fetchAllPaginated((from, to) => buildQuery(columns).range(from, to));
      break;
    } catch (error: any) {
      const missingMatch =
        error?.message?.match(/column ["']?([\w\.]+)["']? does not exist/i) ||
        error?.details?.match(/column ["']?([\w\.]+)["']? does not exist/i);
      const missingCol = missingMatch?.[1]?.split(".").pop();

      if (missingCol && columns.includes(missingCol) && !requiredColumns.includes(missingCol)) {
        columns = columns.filter((c) => c !== missingCol);
        console.error(JSON.stringify({ missingCol }), "get_organizer_clusters_missing_column");
        continue;
      }

      throw error;
    }
  }

  const groups = new Map<string, OrganizerCluster>();

  for (const row of data as any[]) {
    let inferredOrg: string | null = null;
    if (row.official_website_url) {
      try {
        inferredOrg = new URL(row.official_website_url).hostname;
      } catch (err) {
        console.error(JSON.stringify({ err, url: row.official_website_url }), "invalid_organizer_url");
      }
    }

    const org = row.host_org || inferredOrg || "unknown";
    const organizer_confidence = row.host_org ? "high" : row.official_website_url ? "medium" : "low";
    const current: OrganizerCluster =
      groups.get(org) ||
      ({
        host_org: row.host_org ?? org,
        organizer_confidence,
        tournament_count: 0,
        sports: [] as string[],
        states: [] as string[],
        tournaments: [] as OrganizerCluster["tournaments"],
        missing_director_email_count: 0,
        missing_website_count: 0
      } as OrganizerCluster);
    current.tournament_count += 1;
    if (row.sport && !current.sports.includes(row.sport)) current.sports.push(row.sport);
    if (row.state && !current.states.includes(row.state)) current.states.push(row.state);
    current.tournaments.push({
      id: row.id,
      name: row.name,
      city: row.city,
      state: row.state,
      start_date: row.start_date
    });
    if (!row.tournament_director_email) current.missing_director_email_count += 1;
    if (!row.official_website_url) current.missing_website_count += 1;
    groups.set(org, current);
  }

  const result = Array.from(groups.values()).filter((g) => g.tournament_count >= filters.min_tournaments);
  result.sort((a, b) => b.tournament_count - a.tournament_count);
  return filters.limit ? result.slice(0, filters.limit) : result;
}

export async function getVenueClusters(filters: {
  min_tournaments: number;
  sport?: string;
  state?: string;
  limit?: number;
}): Promise<VenueCluster[]> {
  if (mockMode()) {
    return [
      {
        venue_id: "mock-venue-1",
        venue_name: "Mock Park",
        city: "Austin",
        state: "TX",
        tournament_count: 1,
        tournaments: MOCK_TOURNAMENTS.filter((t) => t.id === "mock-tournament-1").map((t) => ({
          id: t.id,
          name: t.name,
          sport: t.sport,
          start_date: t.start_date,
          end_date: t.end_date
        }))
      }
    ];
  }

  const supabase = getSupabaseClient();
  const joins = await fetchAllPaginated((from, to) =>
    supabase
      .from("tournament_venues")
      .select(
        "tournament_id, venues:venue_id(id,name,city,state), tournaments:tournament_id(id,name,sport,start_date,end_date,state)"
      )
      .range(from, to)
  );

  const grouped = new Map<number, VenueCluster>();

  for (const row of (joins || []) as any[]) {
    const venue = row.venues;
    const tour = row.tournaments;
    if (!venue || !tour) continue;

    if (filters.sport && tour.sport !== filters.sport) continue;
    if (filters.state && tour.state !== filters.state && venue.state !== filters.state) continue;

    const existing = grouped.get(venue.id) || {
      venue_id: venue.id,
      venue_name: venue.name,
      city: venue.city,
      state: venue.state,
      tournament_count: 0,
      tournaments: [] as VenueCluster["tournaments"]
    };

    existing.tournament_count += 1;
    existing.tournaments.push({
      id: tour.id,
      name: tour.name,
      sport: tour.sport,
      start_date: tour.start_date,
      end_date: tour.end_date
    });
    grouped.set(venue.id, existing);
  }

  const result = Array.from(grouped.values()).filter((g) => g.tournament_count >= filters.min_tournaments);
  result.sort((a, b) => b.tournament_count - a.tournament_count);
  return filters.limit ? result.slice(0, filters.limit) : result;
}

export async function getSummaryDashboard(): Promise<SummaryDashboard> {
  const [health, , organizers, venues] = await Promise.all([
    getDatasetHealth(),
    getStateSportCoverage({}),
    getOrganizerClusters({ min_tournaments: 3, limit: 10 }),
    getVenueClusters({ min_tournaments: 2, limit: 10 })
  ]);

  const top_sports = Object.entries(health.tournaments_by_sport)
    .map(([sport, count]) => ({ sport, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const top_states = Object.entries(health.tournaments_by_state)
    .map(([state, count]) => ({ state, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const top_organizers = organizers.slice(0, 10).map((o) => ({
    host_org: o.host_org,
    tournament_count: o.tournament_count,
    sports: o.sports,
    states: o.states,
    organizer_confidence: o.organizer_confidence
  }));

  const top_venues = venues.slice(0, 10).map((v) => ({
    venue_id: v.venue_id,
    venue_name: v.venue_name,
    city: v.city,
    state: v.state,
    tournament_count: v.tournament_count
  }));

  const fields = [
    { field: "official_website_url", pct: health.pct_missing_website },
    { field: "tournament_director_email", pct: health.pct_missing_director_email },
    { field: "start_date", pct: health.pct_missing_start_date },
    { field: "end_date", pct: health.pct_missing_end_date }
  ];
  const worst = fields.reduce((a, b) => (a.pct > b.pct ? a : b));
  const pct_fully_complete =
    (1 - health.pct_missing_website) *
    (1 - health.pct_missing_director_email) *
    (1 - health.pct_missing_start_date) *
    (1 - health.pct_missing_end_date);

  return {
    health,
    top_sports,
    top_states,
    top_organizers,
    top_venues,
    data_quality_summary: {
      pct_fully_complete,
      worst_field: worst.field,
      worst_field_pct_missing: worst.pct
    },
    generated_at: new Date().toISOString()
  };
}

function bucketPeriod(date: Date, period: "week" | "month" | "quarter"): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  if (period === "month") {
    return `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  if (period === "quarter") {
    return `${y}-Q${Math.floor(m / 3) + 1}`;
  }
  // ISO week number
  const d = new Date(Date.UTC(y, m, date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function getTrends(filters: {
  period: "week" | "month" | "quarter";
  lookback_periods?: number;
}): Promise<TrendRow[]> {
  if (mockMode()) {
    return [
      { period: "2024-10", tournaments_added: 12, pct_with_website: 0.42, pct_with_director_email: 0.35, pct_with_dates: 0.67, cumulative_total: 12 },
      { period: "2024-11", tournaments_added: 18, pct_with_website: 0.44, pct_with_director_email: 0.38, pct_with_dates: 0.70, cumulative_total: 30 },
      { period: "2024-12", tournaments_added: 9,  pct_with_website: 0.45, pct_with_director_email: 0.40, pct_with_dates: 0.72, cumulative_total: 39 }
    ];
  }

  const supabase = getSupabaseClient();
  const data = await fetchAllPaginated((from, to) =>
    supabase
      .from("tournaments")
      .select("created_at,official_website_url,tournament_director_email,start_date,end_date")
      .not("created_at", "is", null)
      .order("created_at", { ascending: true })
      .range(from, to)
  );

  const buckets = new Map<string, { added: number; with_website: number; with_email: number; with_dates: number }>();

  for (const row of data ?? []) {
    const bucket = bucketPeriod(new Date(row.created_at), filters.period);
    const existing = buckets.get(bucket) ?? { added: 0, with_website: 0, with_email: 0, with_dates: 0 };
    existing.added += 1;
    if (row.official_website_url) existing.with_website += 1;
    if (row.tournament_director_email) existing.with_email += 1;
    if (row.start_date && row.end_date) existing.with_dates += 1;
    buckets.set(bucket, existing);
  }

  let cumulative = 0;
  const allRows = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, stats]) => {
      cumulative += stats.added;
      return {
        period,
        tournaments_added: stats.added,
        pct_with_website: stats.added ? stats.with_website / stats.added : 0,
        pct_with_director_email: stats.added ? stats.with_email / stats.added : 0,
        pct_with_dates: stats.added ? stats.with_dates / stats.added : 0,
        cumulative_total: cumulative
      };
    });

  return filters.lookback_periods ? allRows.slice(-filters.lookback_periods) : allRows;
}

export async function getMissingVenues(filters: MissingVenuesFilters): Promise<MissingVenuesResult> {
  if (mockMode()) {
    const linkedIds = new Set(MOCK_TOURNAMENT_VENUES.map((tv) => tv.tournament_id));
    let base = MOCK_TOURNAMENTS;
    if (filters.sport) base = base.filter((t) => t.sport === filters.sport);
    if (filters.state) base = base.filter((t) => t.state === filters.state);
    const missing = base.filter((t) => !linkedIds.has(t.id));
    const total = base.length;
    const by_sport: Record<string, number> = {};
    const by_state: Record<string, number> = {};
    for (const t of missing) {
      if (t.sport) by_sport[t.sport] = (by_sport[t.sport] || 0) + 1;
      if (t.state) by_state[t.state] = (by_state[t.state] || 0) + 1;
    }
    return {
      total_missing: missing.length,
      total_tournaments: total,
      pct_missing_venue: total ? missing.length / total : 0,
      missing_by_sport: by_sport,
      missing_by_state: by_state,
      tournaments: missing.slice(0, filters.limit ?? 100).map((t) => ({
        id: t.id,
        name: t.name,
        sport: t.sport,
        city: t.city,
        state: t.state,
        start_date: t.start_date,
        end_date: t.end_date
      }))
    };
  }

  const supabase = getSupabaseClient();

  // Fetch all published canonical tournaments (filtered) with pagination to avoid the 1000-row cap.
  const tournaments = await fetchAllPaginated((from, to) =>
    applyCommonFilters(
      supabase
        .from("tournaments")
        .select("id,sport,state,start_date")
        .eq("status", "published")
        .eq("is_canonical", true)
        .range(from, to),
      filters
    )
  );
  const total = tournaments.length;

  const tournamentIds = tournaments.map((t: any) => t.id).filter(Boolean);
  const linkedIds = new Set<string>();

  // Pull tournament_venues only for the tournaments we're considering (batched to respect API limits).
  // Keep chunks small to avoid oversized PostgREST URLs.
  const idChunkSize = 200;
  for (let i = 0; i < tournamentIds.length; i += idChunkSize) {
    const chunk = tournamentIds.slice(i, i + idChunkSize);
    const rows = await fetchAllPaginated((from, to) =>
      supabase.from("tournament_venues").select("tournament_id").in("tournament_id", chunk).range(from, to)
    );
    for (const row of rows ?? []) {
      if (row?.tournament_id) linkedIds.add(row.tournament_id);
    }
  }

  const missing = tournaments.filter((t: any) => !linkedIds.has(t.id));
  const total_missing = missing.length;
  const by_sport: Record<string, number> = {};
  const by_state: Record<string, number> = {};
  for (const t of missing as any[]) {
    if (t.sport) by_sport[t.sport] = (by_sport[t.sport] || 0) + 1;
    if (t.state) by_state[t.state] = (by_state[t.state] || 0) + 1;
  }

  const listLimit = filters.limit ?? 100;
  const missingListIds = (missing as any[])
    .slice()
    .sort((a, b) => {
      const ad = a.start_date ?? "";
      const bd = b.start_date ?? "";
      // Desc by start_date, then stable by id.
      if (ad !== bd) return bd.localeCompare(ad);
      return String(a.id).localeCompare(String(b.id));
    })
    .slice(0, listLimit)
    .map((t) => t.id)
    .filter(Boolean);

  const missingListRows: any[] = [];
  const detailChunkSize = 200;
  for (let i = 0; i < missingListIds.length; i += detailChunkSize) {
    const chunk = missingListIds.slice(i, i + detailChunkSize);
    const { data, error } = await applyCommonFilters(
      supabase
        .from("tournaments")
        .select("id,name,sport,city,state,start_date,end_date,official_website_url")
        .eq("status", "published")
        .eq("is_canonical", true)
        .in("id", chunk),
      filters
    );
    if (error) throw error;
    missingListRows.push(...(data ?? []));
  }

  const byId = new Map(missingListRows.map((t) => [t.id, t]));
  const missingList = missingListIds.map((id) => byId.get(id)).filter(Boolean);

  return {
    total_missing,
    total_tournaments: total,
    pct_missing_venue: total ? total_missing / total : 0,
    missing_by_sport: by_sport,
    missing_by_state: by_state,
    tournaments: (missingList ?? []).map((t: any) => ({
      id: t.id,
      name: t.name,
      sport: t.sport ?? null,
      city: t.city ?? null,
      state: t.state ?? null,
      start_date: t.start_date ?? null,
      end_date: t.end_date ?? null,
      official_website_url: t.official_website_url ?? null
    }))
  };
}

export async function getAssociationDashboard(filters: { limit: number }): Promise<AssociationDashboard> {
  const normalizeAssociation = (raw: unknown, sport: unknown): string => {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s) return "";

    const upper = s.toUpperCase();
    if (upper.includes("USSSA") || /U\s*S\s*S\s*A/.test(upper)) return "USSSA";

    const isSoccer = typeof sport === "string" && sport.toLowerCase() === "soccer";
    if (isSoccer) {
      const host = extractHostname(s);
      if (host) {
        const root = rootDomain(host);
        if (root === "gotsoccer.com" || root === "gotournament.com") return "GOTSOCCER";
        return root.toUpperCase();
      }
    }

    return upper;
  };

  if (mockMode()) {
    const total = MOCK_TOURNAMENTS.length;
    let withAssociation = 0;
    const counts = new Map<string, number>();
    for (const t of MOCK_TOURNAMENTS as any[]) {
      const assoc = normalizeAssociation(t.tournament_association, t.sport);
      if (!assoc) continue;
      withAssociation += 1;
      counts.set(assoc, (counts.get(assoc) || 0) + 1);
    }

    const top = Array.from(counts.entries())
      .map(([association, tournaments]) => ({ association, tournaments }))
      .sort((a, b) => b.tournaments - a.tournaments || a.association.localeCompare(b.association))
      .slice(0, filters.limit);

    return {
      totals: {
        total_published_canonical: total,
        with_association: withAssociation,
        pct_with_association: total ? Math.round((10000 * withAssociation) / total) / 100 : 0
      },
      top_associations: top,
      association_column_present: true,
      generated_at: new Date().toISOString()
    };
  }

  const supabase = getSupabaseClient();

  const baseFactory = (select: string) => (from: number, to: number) =>
    supabase
      .from("tournaments")
      .select(select)
      .eq("status", "published")
      .eq("is_canonical", true)
      .range(from, to);

  let association_column_present = true;
  let rows: any[] = [];

  try {
    rows = await fetchAllPaginated(baseFactory("id,sport,tournament_association"));
  } catch (error: any) {
    const missingMatch =
      error?.message?.match(/column ["']?([\w\.]+)["']? does not exist/i) ||
      error?.details?.match(/column ["']?([\w\.]+)["']? does not exist/i);
    const missingCol = missingMatch?.[1]?.split(".").pop();

    if (missingCol === "tournament_association") {
      association_column_present = false;
      console.error(JSON.stringify({ missingCol }), "get_association_dashboard_missing_column");
      rows = await fetchAllPaginated(baseFactory("id"));
    } else {
      throw error;
    }
  }

  const total = rows.length;
  let withAssociation = 0;
  const counts = new Map<string, number>();

  if (association_column_present) {
    for (const row of rows ?? []) {
      const assoc = normalizeAssociation(row?.tournament_association, row?.sport);
      if (!assoc) continue;
      withAssociation += 1;
      counts.set(assoc, (counts.get(assoc) || 0) + 1);
    }
  }

  const top = Array.from(counts.entries())
    .map(([association, tournaments]) => ({ association, tournaments }))
    .sort((a, b) => b.tournaments - a.tournaments || a.association.localeCompare(b.association))
    .slice(0, filters.limit);

  return {
    totals: {
      total_published_canonical: total,
      with_association: withAssociation,
      pct_with_association: total ? Math.round((10000 * withAssociation) / total) / 100 : 0
    },
    top_associations: top,
    association_column_present,
    generated_at: new Date().toISOString()
  };
}

export async function getEmailOutreachNumbers(): Promise<{
  draft: number;
  sent: number;
  replies: number;
  followups_sent: number;
  generated_at: string;
}> {
  const generated_at = new Date().toISOString();

  if (mockMode()) {
    return { draft: 0, sent: 0, replies: 0, followups_sent: 0, generated_at };
  }

  const supabase = getSupabaseClient();

  // Prefer a server-side view for performance.
  try {
    const { data, error } = await supabase
      .from("outreach_dashboard")
      .select("draft,sent,replies,followups_sent")
      .maybeSingle();
    if (error) throw error;

    if (data) {
      return {
        draft: Number((data as any).draft ?? 0),
        sent: Number((data as any).sent ?? 0),
        replies: Number((data as any).replies ?? 0),
        followups_sent: Number((data as any).followups_sent ?? 0),
        generated_at
      };
    }
  } catch (error: any) {
    const message = String(error?.message || error);
    // Fall back to counting from the underlying table if the view is missing.
    if (!/outreach_dashboard/i.test(message) && !/does not exist/i.test(message)) {
      throw error;
    }
  }

  const countExact = async (builder: any) => {
    const { count, error } = await builder;
    if (error) throw error;
    return count ?? 0;
  };

  const countFromOutreach = () => supabase.from("tournament_outreach").select("id", { count: "exact", head: true });

  const [draft, sent, replies, followups_sent] = await Promise.all([
    countExact(countFromOutreach().eq("status", "draft")),
    countExact(countFromOutreach().not("sent_at", "is", null)),
    countExact(countFromOutreach().not("replied_at", "is", null)),
    countExact(countFromOutreach().not("followup_sent_at", "is", null))
  ]);

  return { draft, sent, replies, followups_sent, generated_at };
}

function extractHostname(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  try {
    if (s.startsWith("http://") || s.startsWith("https://")) return new URL(s).hostname.toLowerCase();
    if (s.includes("/")) return new URL(`https://${s}`).hostname.toLowerCase();
    if (s.includes(".")) return new URL(`https://${s}`).hostname.toLowerCase();
    return null;
  } catch {
    return null;
  }
}

function rootDomain(hostname: string): string {
  const h = hostname.toLowerCase().replace(/^\.+|\.+$/g, "");
  const parts = h.split(".").filter(Boolean);
  if (parts.length <= 2) return h;
  return parts.slice(-2).join(".");
}

export async function getTopOrganizerDomains(filters: {
  min_tournaments: number;
  sport?: string;
  state?: string;
  limit: number;
}): Promise<
  {
    organizer_domain: string;
    tournament_count: number;
    sports: string[];
    states: string[];
    missing_website_count: number;
    missing_director_email_count: number;
  }[]
> {
  const toDomain = (url: string | null | undefined) => {
    if (!url) return null;
    const host = extractHostname(url);
    if (!host) return null;
    return rootDomain(host);
  };

  if (mockMode()) {
    const grouped = new Map<string, any>();
    for (const t of MOCK_TOURNAMENTS) {
      if (filters.sport && t.sport !== filters.sport) continue;
      if (filters.state && t.state !== filters.state) continue;
      const domain = toDomain(t.official_website_url);
      if (!domain) continue;
      const cur =
        grouped.get(domain) ||
        ({
          organizer_domain: domain,
          tournament_count: 0,
          sports: [] as string[],
          states: [] as string[],
          missing_website_count: 0,
          missing_director_email_count: 0
        } as any);
      cur.tournament_count += 1;
      if (t.sport && !cur.sports.includes(t.sport)) cur.sports.push(t.sport);
      if (t.state && !cur.states.includes(t.state)) cur.states.push(t.state);
      if (!t.official_website_url) cur.missing_website_count += 1;
      if (!t.tournament_director_email) cur.missing_director_email_count += 1;
      grouped.set(domain, cur);
    }
    return Array.from(grouped.values())
      .filter((r) => r.tournament_count >= filters.min_tournaments)
      .sort((a, b) => b.tournament_count - a.tournament_count)
      .slice(0, filters.limit);
  }

  const supabase = getSupabaseClient();
  const columns = ["id", "sport", "state", "official_website_url", "tournament_director_email"];
  const rows = await fetchAllPaginated((from, to) => {
    let query: QueryBuilder = supabase.from("tournaments").select(columns.join(","));
    query = applyCommonFilters(query, filters);
    return query.range(from, to);
  });

  const grouped = new Map<string, any>();
  for (const row of (rows || []) as any[]) {
    const domain = toDomain(row.official_website_url);
    if (!domain) continue;
    const cur =
      grouped.get(domain) ||
      ({
        organizer_domain: domain,
        tournament_count: 0,
        sports: [] as string[],
        states: [] as string[],
        missing_website_count: 0,
        missing_director_email_count: 0
      } as any);
    cur.tournament_count += 1;
    if (row.sport && !cur.sports.includes(row.sport)) cur.sports.push(row.sport);
    if (row.state && !cur.states.includes(row.state)) cur.states.push(row.state);
    if (!row.official_website_url) cur.missing_website_count += 1;
    if (!row.tournament_director_email) cur.missing_director_email_count += 1;
    grouped.set(domain, cur);
  }

  return Array.from(grouped.values())
    .filter((r) => r.tournament_count >= filters.min_tournaments)
    .sort((a, b) => b.tournament_count - a.tournament_count)
    .slice(0, filters.limit);
}

export async function getTournamentsByDomain(filters: {
  domain: string;
  limit: number;
  offset: number;
}): Promise<any[]> {
  const want = rootDomain(filters.domain);
  const matchesDomain = (url: string | null | undefined) => {
    const host = url ? extractHostname(url) : null;
    if (!host) return false;
    return rootDomain(host) === want;
  };

  if (mockMode()) {
    return MOCK_TOURNAMENTS.filter((t) => matchesDomain(t.official_website_url))
      .slice(filters.offset, filters.offset + filters.limit)
      .map((t) => ({ ...t }));
  }

  const supabase = getSupabaseClient();
  const cols = [
    "id",
    "name",
    "slug",
    "sport",
    "city",
    "state",
    "address",
    "zip",
    "start_date",
    "end_date",
    "official_website_url",
    "tournament_director",
    "tournament_director_email",
    "referee_contact",
    "referee_contact_email"
  ];

  // Narrow server-side first (safe due to strict domain schema) then verify client-side via rootDomain().
  const pattern = `%${want}%`;
  const { data, error } = await supabase
    .from("tournaments")
    .select(cols.join(","))
    .ilike("official_website_url", pattern)
    .range(filters.offset, filters.offset + filters.limit - 1);
  if (error) throw error;

  return (data || []).filter((row: any) => matchesDomain(row.official_website_url));
}

export async function getTournaments(filters: {
  name?: string;
  sport?: string;
  state?: string;
  start_date_from?: string;
  start_date_to?: string;
  organizer_domain?: string;
  limit: number;
  offset: number;
}): Promise<{ data: any[]; total: number }> {
  if (mockMode()) {
    let results = [...MOCK_TOURNAMENTS] as any[];
    if (filters.name) {
      const q = filters.name.toLowerCase();
      results = results.filter((t) => t.name?.toLowerCase().includes(q));
    }
    if (filters.sport) results = results.filter((t) => t.sport === filters.sport);
    if (filters.state) results = results.filter((t) => t.state === filters.state);
    return { data: results.slice(filters.offset, filters.offset + filters.limit), total: results.length };
  }

  const cols = [
    "id", "name", "slug", "sport", "city", "state", "address", "zip",
    "start_date", "end_date", "official_website_url",
    "tournament_director", "tournament_director_email",
    "referee_contact", "referee_contact_email",
  ];

  const supabase = getSupabaseClient();
  let query = supabase.from("tournaments").select(cols.join(","), { count: "exact" });

  if (filters.name) query = query.ilike("name", `%${filters.name}%`);
  if (filters.sport) query = query.eq("sport", filters.sport);
  if (filters.state) query = query.eq("state", filters.state);
  if (filters.start_date_from) query = query.gte("start_date", filters.start_date_from);
  if (filters.start_date_to) query = query.lte("start_date", filters.start_date_to);
  if (filters.organizer_domain) {
    const want = rootDomain(filters.organizer_domain);
    query = query.ilike("official_website_url", `%${want}%`);
  }

  query = query
    .order("start_date", { ascending: true, nullsFirst: false })
    .range(filters.offset, filters.offset + filters.limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  let results = data || [];
  if (filters.organizer_domain) {
    const want = rootDomain(filters.organizer_domain);
    results = results.filter((r: any) => {
      const host = r.official_website_url ? extractHostname(r.official_website_url) : null;
      return host ? rootDomain(host) === want : false;
    });
  }

  return { data: results, total: count ?? results.length };
}

export async function findProductionMatches(
  candidates: Array<{
    candidate_index?: number;
    name?: string;
    sport?: string;
    state?: string;
    start_date_from?: string;
    start_date_to?: string;
    organizer_domain?: string;
  }>,
  maxMatchesPerCandidate: number
): Promise<{ results: Array<{ candidate_index: number; matches: any[]; match_count: number }> }> {
  const results = await Promise.all(
    candidates.map(async (c, i) => {
      const { data } = await getTournaments({
        name: c.name,
        sport: c.sport,
        state: c.state,
        start_date_from: c.start_date_from,
        start_date_to: c.start_date_to,
        organizer_domain: c.organizer_domain,
        limit: maxMatchesPerCandidate,
        offset: 0,
      });
      return {
        candidate_index: c.candidate_index ?? i,
        matches: data,
        match_count: data.length,
      };
    })
  );
  return { results };
}

async function trySelectTournamentsWithFallback(selectCols: string[], builder: (q: any) => any) {
  const supabase = getSupabaseClient();
  let columns = [...selectCols];
  while (true) {
    try {
      const { data, error } = await builder(supabase.from("tournaments").select(columns.join(",")));
      if (error) throw error;
      return { data: data || [], columnsUsed: columns };
    } catch (error: any) {
      const missingMatch =
        error?.message?.match(/column ["']?([\w\.]+)["']? does not exist/i) ||
        error?.details?.match(/column ["']?([\w\.]+)["']? does not exist/i);
      const missingCol = missingMatch?.[1]?.split(".").pop();
      if (missingCol && columns.includes(missingCol) && missingCol !== "id" && missingCol !== "name") {
        columns = columns.filter((c) => c !== missingCol);
        console.error(JSON.stringify({ missingCol }), "tournaments_missing_column");
        continue;
      }
      throw error;
    }
  }
}

export async function getUnverifiedTournaments(filters: {
  sport?: string;
  state?: string;
  limit: number;
  offset: number;
}): Promise<any[]> {
  if (mockMode()) return [];

  const baseCols = [
    "id",
    "name",
    "slug",
    "sport",
    "city",
    "state",
    "address",
    "zip",
    "start_date",
    "end_date",
    "official_website_url",
    "tournament_director",
    "tournament_director_email",
    "referee_contact",
    "referee_contact_email",
    // optional verification/source fields (dropped if missing)
    "verified_at",
    "is_verified",
    "verification_status",
    "source_url",
    "source_urls"
  ];

  const strategies: Array<{
    label: string;
    apply: (q: any) => any;
  }> = [
    { label: "verified_at", apply: (q) => q.is("verified_at", null) },
    { label: "is_verified", apply: (q) => q.or("is_verified.eq.false,is_verified.is.null") },
    { label: "verification_status", apply: (q) => q.or("verification_status.neq.verified,verification_status.is.null") }
  ];

  for (const s of strategies) {
    try {
      const { data } = await trySelectTournamentsWithFallback(baseCols, (query) => {
        query = applyCommonFilters(query, filters);
        query = s.apply(query);
        return query.range(filters.offset, filters.offset + filters.limit - 1);
      });
      return data;
    } catch (error: any) {
      const msg = String(error?.message || error);
      if (/does not exist/i.test(msg) && /column/i.test(msg)) {
        console.error(JSON.stringify({ strategy: s.label }), "get_unverified_tournaments_missing_column");
        continue;
      }
      throw error;
    }
  }

  return [];
}

export async function getTournamentsMissingSourceUrls(filters: {
  sport?: string;
  state?: string;
  limit: number;
  offset: number;
}): Promise<any[]> {
  if (mockMode()) return [];

  const baseCols = [
    "id",
    "name",
    "slug",
    "sport",
    "city",
    "state",
    "address",
    "zip",
    "start_date",
    "end_date",
    "official_website_url",
    "tournament_director",
    "tournament_director_email",
    "referee_contact",
    "referee_contact_email",
    "source_url",
    "source_urls",
    "verified_at",
    "is_verified",
    "verification_status"
  ];

  const strategies: Array<{
    label: string;
    apply: (q: any) => any;
  }> = [
    { label: "source_url", apply: (q) => q.or("source_url.is.null,source_url.eq.") },
    { label: "source_urls", apply: (q) => q.or("source_urls.is.null,source_urls.eq.{}") }
  ];

  for (const s of strategies) {
    try {
      const { data, columnsUsed } = await trySelectTournamentsWithFallback(baseCols, (query) => {
        query = applyCommonFilters(query, filters);
        query = s.apply(query);
        return query.range(filters.offset, filters.offset + filters.limit - 1);
      });
      const ok = columnsUsed.includes(s.label);
      return ok ? data : [];
    } catch (error: any) {
      const msg = String(error?.message || error);
      if (/does not exist/i.test(msg) && /column/i.test(msg)) {
        console.error(JSON.stringify({ strategy: s.label }), "get_tournaments_missing_source_urls_missing_column");
        continue;
      }
      throw error;
    }
  }

  return [];
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function assertWritesEnabled() {
  if (process.env.ENABLE_MCP_WRITES !== "true") {
    throw new Error("Write tools are disabled. Set ENABLE_MCP_WRITES=true to enable.");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Write tools require SUPABASE_SERVICE_ROLE_KEY (do not use anon key for writes).");
  }
}

export async function upsertOrganizerWatchlist(input: {
  organizer_domain: string;
  reason: string;
  tags: string[];
  status: "active" | "muted";
}) {
  assertWritesEnabled();
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("organizer_watchlists")
    .upsert(
      {
        organizer_domain: input.organizer_domain,
        reason: input.reason,
        tags: input.tags,
        status: input.status,
        updated_at: new Date().toISOString()
      },
      { onConflict: "organizer_domain" }
    );
  if (error) throw error;
  return { ok: true as const, organizer_domain: input.organizer_domain };
}

export async function insertTournamentCandidate(input: {
  source_url: string;
  sport?: string;
  state?: string;
  name?: string;
  notes?: string;
}) {
  assertWritesEnabled();
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("tournament_candidates").insert({
    source_url: input.source_url,
    sport: input.sport ?? null,
    state: input.state ?? null,
    name: input.name ?? null,
    notes: input.notes ?? null,
    created_at: new Date().toISOString()
  });
  if (error) throw error;
  return { ok: true as const };
}

export async function insertResearchNote(input: {
  entity_type: "organizer" | "tournament" | "venue" | "other";
  entity_id?: string;
  title: string;
  note: string;
  source_url?: string;
}) {
  assertWritesEnabled();
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("research_notes").insert({
    entity_type: input.entity_type,
    entity_id: input.entity_id ?? null,
    title: input.title,
    note: input.note,
    source_url: input.source_url ?? null,
    created_at: new Date().toISOString()
  });
  if (error) throw error;
  return { ok: true as const };
}

export async function exportResearchBatch(filters: {
  priority_mode: "missing_websites" | "missing_director_emails" | "missing_dates" | "organizer_scale" | "venue_scale";
  sport?: string;
  state?: string;
  batch_size: number;
}): Promise<ResearchBatchRow[]> {
  const reason = (row: any): string => {
    switch (filters.priority_mode) {
      case "missing_websites":
        return row.official_website_url ? "has website" : "missing official website";
      case "missing_director_emails":
        return row.tournament_director_email ? "has director email" : "missing director email";
      case "missing_dates":
        return !row.start_date || !row.end_date ? "missing dates" : "has dates";
      case "organizer_scale":
        return "organizer info unavailable";
      case "venue_scale":
        return "prioritize venue clustering";
    }
  };

  if (mockMode()) {
    const filtered = (() => {
      switch (filters.priority_mode) {
        case "missing_websites":
          return MOCK_TOURNAMENTS.filter((t) => !t.official_website_url);
        case "missing_director_emails":
          return MOCK_TOURNAMENTS.filter((t) => !t.tournament_director_email);
        case "missing_dates":
          return MOCK_TOURNAMENTS.filter((t) => !t.start_date || !t.end_date);
        case "organizer_scale":
        case "venue_scale":
          return MOCK_TOURNAMENTS;
      }
    })();

    return filtered.slice(0, filters.batch_size).map((t) => ({
      id: t.id,
      name: t.name,
      sport: t.sport,
      city: t.city,
      state: t.state,
      start_date: t.start_date,
      end_date: t.end_date,
      official_website_url: t.official_website_url,
      priority_reason: reason(t)
    }));
  }

  const supabase = getSupabaseClient();
  const requiredColumns = ["id", "name"];
  const optionalColumns = [
    "sport",
    "city",
    "state",
    "start_date",
    "end_date",
    "official_website_url",
    "tournament_director_email"
  ];

  const applyPriorityFilters = (query: QueryBuilder) => {
    switch (filters.priority_mode) {
      case "missing_websites":
        return query.or("official_website_url.is.null,official_website_url.eq.");
      case "missing_director_emails":
        return query.or("tournament_director_email.is.null,tournament_director_email.eq.");
      case "missing_dates":
        // Dates are typed columns; comparing to empty string can fail in Postgres.
        // Treat missing dates as NULL only (do not infer or coerce empty strings).
        return query.or("start_date.is.null,end_date.is.null");
      case "organizer_scale":
      case "venue_scale":
        return query;
    }
  };

  const buildQuery = (cols: string[]) => {
    let query = supabase
      .from("tournaments")
      .select(cols.join(","))
      .limit(filters.batch_size);
    query = applyCommonFilters(query, filters);
    query = applyPriorityFilters(query);
    return query;
  };

  let columns = [...requiredColumns, ...optionalColumns];
  let data: any[] = [];

  while (true) {
    const { data: rows, error } = await buildQuery(columns);
    if (!error) {
      data = rows || [];
      break;
    }

    const missingMatch =
      error?.message?.match(/column ["']?([\w\.]+)["']? does not exist/i) ||
      error?.details?.match(/column ["']?([\w\.]+)["']? does not exist/i);
    const missingCol = missingMatch?.[1]?.split(".").pop();

    if (missingCol && columns.includes(missingCol) && !requiredColumns.includes(missingCol)) {
      if (
        (filters.priority_mode === "missing_websites" && missingCol === "official_website_url") ||
        (filters.priority_mode === "missing_director_emails" && missingCol === "tournament_director_email") ||
        (filters.priority_mode === "missing_dates" && (missingCol === "start_date" || missingCol === "end_date"))
      ) {
        throw new Error(
          `export_research_batch cannot run in mode '${filters.priority_mode}' because required column '${missingCol}' does not exist`
        );
      }
      columns = columns.filter((c) => c !== missingCol);
      console.error(JSON.stringify({ missingCol }), "export_research_batch_missing_column");
      continue;
    }

    throw error;
  }

  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    sport: row.sport,
    city: row.city,
    state: row.state,
    start_date: row.start_date,
    end_date: row.end_date,
    official_website_url: row.official_website_url,
    priority_reason: reason(row)
  }));
}

export async function getTournamentVenueWorklist(
  filters: TournamentVenueWorklistFilters
): Promise<TournamentVenueWorklistResult> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  const weeksStart = filters.weeks_from_now_start ?? 2;
  const weeksEnd = filters.weeks_from_now_end ?? 6;

  const dateFrom = filters.date_from ?? toISODate(new Date(todayMs + weeksStart * 7 * 86_400_000));
  const dateTo = filters.date_to ?? toISODate(new Date(todayMs + weeksEnd * 7 * 86_400_000));

  if (dateFrom > dateTo) {
    throw new Error(`date_from (${dateFrom}) must be ≤ date_to (${dateTo})`);
  }

  const generated_at = new Date().toISOString();

  if (mockMode()) {
    return {
      date_window: { from: dateFrom, to: dateTo },
      total_matched: 0,
      returned: 0,
      venue_status_summary: { missing: 0, incomplete: 0, complete: 0 },
      tournaments: [],
      generated_at
    };
  }

  const supabase = getSupabaseClient();

  // Fetch all published canonical tournaments in the date window.
  const requiredTournamentCols = ["id", "name", "sport", "city", "state", "start_date", "end_date", "official_website_url", "tournament_director_email"];
  const optionalTournamentCols = ["host_org"];
  let tournamentCols = [...requiredTournamentCols, ...optionalTournamentCols];
  let tournaments: any[] = [];

  while (true) {
    try {
      tournaments = await fetchAllPaginated((from, to) => {
        let query = supabase
          .from("tournaments")
          .select(tournamentCols.join(","))
          .gte("start_date", dateFrom)
          .lte("start_date", dateTo)
          .eq("status", "published")
          .eq("is_canonical", true);
        if (filters.sports?.length) query = query.in("sport", filters.sports);
        if (filters.states?.length) query = query.in("state", filters.states);
        return query.range(from, to);
      });
      break;
    } catch (error: any) {
      const missingCol =
        (error?.message?.match(/column ["']?([\w\.]+)["']? does not exist/i) ||
          error?.details?.match(/column ["']?([\w\.]+)["']? does not exist/i))?.[1]
          ?.split(".")
          .pop();
      if (missingCol && tournamentCols.includes(missingCol) && !requiredTournamentCols.includes(missingCol)) {
        tournamentCols = tournamentCols.filter((c) => c !== missingCol);
        console.error(JSON.stringify({ missingCol }), "get_tournament_venue_worklist_missing_column");
        continue;
      }
      throw error;
    }
  }

  // Fetch venue links for the matched tournament IDs.
  const tournamentIds = (tournaments as any[]).map((t) => t.id).filter(Boolean);
  const venueByTournament = new Map<string, any>();
  const chunkSize = 200;

  for (let i = 0; i < tournamentIds.length; i += chunkSize) {
    const chunk = tournamentIds.slice(i, i + chunkSize);
    const rows = await fetchAllPaginated((from, to) =>
      supabase
        .from("tournament_venues")
        .select("tournament_id, venues:venue_id(id,name,city,state)")
        .in("tournament_id", chunk)
        .range(from, to)
    );
    for (const row of (rows ?? []) as any[]) {
      // Keep the first venue per tournament if there are multiple.
      if (row?.tournament_id && row?.venues && !venueByTournament.has(row.tournament_id)) {
        venueByTournament.set(row.tournament_id, row.venues);
      }
    }
  }

  // Classify venue status and compute priority score for each tournament.
  const allRows: TournamentVenueWorklistRow[] = [];

  for (const t of tournaments as any[]) {
    const venue = venueByTournament.get(t.id) ?? null;

    let venue_status: "missing" | "incomplete" | "complete";
    const missing_venue_fields: string[] = [];

    if (!venue) {
      venue_status = "missing";
    } else {
      if (!venue.name) missing_venue_fields.push("name");
      if (!venue.city) missing_venue_fields.push("city");
      if (!venue.state) missing_venue_fields.push("state");
      venue_status = missing_venue_fields.length > 0 ? "incomplete" : "complete";
    }

    let priority_score = 0;
    if (venue_status === "missing") priority_score += 100;
    else if (venue_status === "incomplete") priority_score += 80;

    if (t.start_date) {
      const daysUntil = (new Date(t.start_date).getTime() - todayMs) / 86_400_000;
      if (daysUntil >= 0 && daysUntil < 21) priority_score += 30;
    }
    if (!t.official_website_url) priority_score += 20;
    if (!t.tournament_director_email) priority_score += 10;

    allRows.push({
      tournament_id: t.id,
      tournament_name: t.name,
      sport: t.sport ?? null,
      tournament_city: t.city ?? null,
      tournament_state: t.state ?? null,
      start_date: t.start_date ?? null,
      end_date: t.end_date ?? null,
      host_org: t.host_org ?? null,
      official_website_url: t.official_website_url ?? null,
      has_director_email: Boolean(t.tournament_director_email),
      venue_id: venue?.id ?? null,
      venue_name: venue?.name ?? null,
      venue_city: venue?.city ?? null,
      venue_state: venue?.state ?? null,
      missing_venue_fields,
      venue_status,
      priority_score
    });
  }

  // Filter by venue_status.
  const statusFilter = filters.venue_status ?? "any";
  const filtered =
    statusFilter === "any"
      ? allRows
      : allRows.filter((r) => {
          if (statusFilter === "missing_or_incomplete")
            return r.venue_status === "missing" || r.venue_status === "incomplete";
          return r.venue_status === statusFilter;
        });

  // Sort: priority_score desc, start_date asc, then sport / state / name.
  filtered.sort((a, b) => {
    if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
    const ad = a.start_date ?? "";
    const bd = b.start_date ?? "";
    if (ad !== bd) return ad.localeCompare(bd);
    const as_ = a.sport ?? "";
    const bs_ = b.sport ?? "";
    if (as_ !== bs_) return as_.localeCompare(bs_);
    const ast = a.tournament_state ?? "";
    const bst = b.tournament_state ?? "";
    if (ast !== bst) return ast.localeCompare(bst);
    return a.tournament_name.localeCompare(b.tournament_name);
  });

  // Summary over all filtered rows (not just the current page).
  const venue_status_summary = { missing: 0, incomplete: 0, complete: 0 };
  for (const r of filtered) venue_status_summary[r.venue_status]++;

  // Paginate.
  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 100;
  const page = filtered.slice(offset, offset + limit);

  return {
    date_window: { from: dateFrom, to: dateTo },
    total_matched: filtered.length,
    returned: page.length,
    venue_status_summary,
    tournaments: page,
    generated_at
  };
}

export async function getRollForwardLog(filters: {
  status?: "pending" | "no_dates_announced" | "discontinued" | "done" | "ambiguous";
  target_year?: number;
  batch_label?: string;
  sport?: string;
  state?: string;
  limit: number;
  offset: number;
}): Promise<RollForwardLogRow[]> {
  if (mockMode()) return [];

  const supabase = getSupabaseClient();

  let query = supabase
    .from("tournament_roll_forward_log")
    .select(
      `id,
       parent_tournament_id,
       target_year,
       status,
       batch_label,
       sibling_id,
       notes,
       researched_at,
       created_at,
       updated_at,
       parent_tournament:tournaments!parent_tournament_id(name,slug,sport,state,city,address,zip,start_date,end_date),
       sibling_tournament:tournaments!sibling_id(slug)`
    )
    .order("target_year", { ascending: true })
    .order("created_at", { ascending: true });

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.target_year) query = query.eq("target_year", filters.target_year);
  if (filters.batch_label) query = query.eq("batch_label", filters.batch_label);
  if (filters.sport || filters.state) {
    // Filter via the parent tournament join by doing a subquery approach:
    // We fetch parent ids first when sport/state filtering is needed.
    let parentQuery = supabase.from("tournaments").select("id");
    if (filters.sport) parentQuery = parentQuery.ilike("sport", `%${filters.sport}%`);
    if (filters.state) parentQuery = parentQuery.eq("state", filters.state.toUpperCase());
    const { data: parentRows, error: parentError } = await parentQuery;
    if (parentError) throw parentError;
    const parentIds = (parentRows ?? []).map((r: any) => r.id);
    if (parentIds.length === 0) return [];
    query = query.in("parent_tournament_id", parentIds);
  }

  query = query.range(filters.offset, filters.offset + filters.limit - 1);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row: any) => {
    const p = row.parent_tournament ?? {};
    const s = row.sibling_tournament ?? {};
    return {
      id: row.id,
      parent_tournament_id: row.parent_tournament_id,
      parent_name: p.name ?? null,
      parent_slug: p.slug ?? null,
      parent_sport: p.sport ?? null,
      parent_state: p.state ?? null,
      parent_city: p.city ?? null,
      parent_address: p.address ?? null,
      parent_zip: p.zip ?? null,
      parent_start_date: p.start_date ?? null,
      parent_end_date: p.end_date ?? null,
      target_year: row.target_year,
      status: row.status,
      batch_label: row.batch_label ?? null,
      sibling_id: row.sibling_id ?? null,
      sibling_slug: s.slug ?? null,
      notes: row.notes ?? null,
      researched_at: row.researched_at ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  });
}

export async function upsertRollForwardLog(input: {
  parent_tournament_id: string;
  target_year: number;
  status: "pending" | "no_dates_announced" | "discontinued" | "done" | "ambiguous";
  batch_label?: string;
  notes?: string;
  sibling_id?: string;
  researched_at?: string;
}): Promise<{ ok: true; id: string }> {
  assertWritesEnabled();
  const supabase = getSupabaseClient();

  const payload: Record<string, unknown> = {
    parent_tournament_id: input.parent_tournament_id,
    target_year: input.target_year,
    status: input.status,
    batch_label: input.batch_label ?? null,
    notes: input.notes ?? null,
    sibling_id: input.sibling_id ?? null,
    researched_at: input.researched_at ?? null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("tournament_roll_forward_log")
    .upsert(payload, { onConflict: "parent_tournament_id,target_year" })
    .select("id")
    .single();

  if (error) throw error;
  return { ok: true, id: (data as any).id };
}
