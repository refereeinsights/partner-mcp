import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const inputSchema = z.object({
  query: z.string().describe(
    "Natural language question about the admin codebase — routes, trackExternalCall, EXTERNAL_API constants, EXTERNAL_API_SURFACE constants, scripts, auth, or planned features."
  )
});

// ---------------------------------------------------------------------------
// Static knowledge base
// ---------------------------------------------------------------------------

const SECTIONS = {
  monorepo: `## Monorepo Structure

- **\`apps/referee\`** — Referee Insights admin app (Next.js). All admin tooling lives under \`/admin/*\`.
- **\`apps/ti-web\`** — Tournament Insights consumer app (Next.js).
- Shared Supabase backend (single project). Admin operations use the service-role key via \`supabaseAdmin\`.
- Production domains: \`tournamentinsights.com\` (ti-web) / \`refereeinsights.com\` (referee admin).`,

  routes: `## Admin Routes (\`apps/referee/app/admin/*\`)

All routes are protected by the \`requireAdmin()\` auth guard.

| Route | Purpose |
|---|---|
| \`/admin/api-usage\` | Tracks external API calls via the \`external_api_calls\` table; uses the \`api_usage_summary(from_ts, to_ts)\` Supabase RPC to aggregate by API and surface. |
| \`/admin/tournaments\` | Tournament management UI and API. |
| \`/admin/venues\` | Venue management + Owl's Eye enrichment (scores nearby coffee/food/hotels via external APIs). |
| \`/admin/users\` | TI user management; supports tier upgrades: Explorer (free) → Insider (paid) → Weekend Pro. |`,

  apiUsage: `## API Usage Tracking (\`/admin/api-usage\`)

Tracks every outbound external API call via the \`external_api_calls\` table.

**Supabase RPC:** \`api_usage_summary(from_ts, to_ts)\` — aggregates call counts, error rates, and latency by API and surface for the given time window.

**To check usage for a specific API (e.g. Brave):**
Query \`api_usage_summary\` with your desired time range and filter results by \`api = 'brave_search'\`.

**To add tracking for a new call:**
Wrap it with \`trackExternalCall('brave_search', 'web_search', 'tournament_scan', () => yourApiCall())\`.`,

  trackExternalCall: `## trackExternalCall

**File:** \`apps/referee/lib/trackExternalCall.ts\`

\`\`\`ts
trackExternalCall(api, operation, surface, fn)
\`\`\`

Wraps every outbound API call. Inserts a row into \`external_api_calls\` with the API name, operation, surface, latency, and success/error state.

Use this whenever adding a new external API call anywhere in the codebase — never call external APIs without wrapping them here.`,

  externalApis: `## EXTERNAL_API Constants

Enum-style constants for the \`api\` argument in \`trackExternalCall\`:

| Constant | API |
|---|---|
| \`google_places\` | Google Places API |
| \`foursquare\` | Foursquare Places API |
| \`mapbox\` | Mapbox Geocoding / Directions |
| \`resend\` | Resend email delivery |
| \`open_meteo\` | OpenMeteo weather |
| \`brave_search\` | Brave Search API |
| \`bing_search\` | Bing Web Search API |
| \`serpapi\` | SerpAPI (Google SERP) |`,

  surfaces: `## EXTERNAL_API_SURFACE Constants

Enum-style constants for the \`surface\` argument in \`trackExternalCall\`. Identifies which product feature triggered the call:

| Surface | Description |
|---|---|
| \`owls_eye_batch\` | Owl's Eye bulk venue enrichment run |
| \`owls_eye_gear\` | Owl's Eye gear/equipment lookup |
| \`venue_geocode\` | Geocoding a venue address to lat/lng |
| \`venue_timezone\` | Timezone lookup for a venue |
| \`venue_places_lookup\` | Nearby places lookup for a venue |
| \`venue_address_verify\` | Address verification / normalization |
| \`tournament_enrichment\` | Enriching tournament data |
| \`email_alert\` | Alert / notification email |
| \`email_digest\` | Digest / summary email |
| \`email_transactional\` | Transactional email (e.g. signup confirmation) |
| \`venue_field_map\` | Field / court map generation |
| \`atlas_search\` | Atlas search indexing surface |
| \`tournament_scan\` | Tournament discovery / scan |`,

  scripts: `## Scripts

**\`scripts/ops/\`** — One-off data backfill and maintenance scripts. Run with \`tsx scripts/ops/your-script.ts\`. Use for ad-hoc fixes, data migrations, and manual corrections.

**\`scripts/ingest/\`** — Data ingest and linking scripts. Responsible for pulling in tournament/venue data and linking related records.`,

  auth: `## Auth & Admin Client

- **\`requireAdmin()\`** — Auth guard on every \`/admin/*\` API route. Verifies the requesting user has admin privileges via Supabase session. Must be called at the top of every admin route handler.
- **\`supabaseAdmin\`** — Service-role Supabase client for privileged DB operations inside admin routes and scripts. Never exposed to the browser/client.`,

  searchOrganizerIntel: `## Search Organizer Intelligence

Stores organizer-level research intelligence attached to one tournament-discovery search run.

**Table:** \`tournament_search_organizer_intelligence\`

**It is NOT:**
- A production organizer table
- A production tournament or venue table
- An organizer watchlist replacement
- A partner table

**Key fields:**
- \`organizer_domain\` — normalized hostname (lowercase, no www., no scheme/path). Unique per \`(search_run_id, organizer_domain)\`.
- \`confidence_level\` — \`High\`, \`Medium\`, or \`Low\`. Evidence-based only.
- \`evidence_summary\` — required for all confidence levels. Documents the source of the intelligence.
- \`tournament_families\` — recurring tournament name families explicitly attributed to this organizer. Not inferred.
- \`venue_clusters\` — facilities the organizer recurringly uses. Not assigned merely because one event used a venue.
- \`monitoring_urls\` — HTTP/HTTPS URLs for ongoing monitoring. Invalid URL rejects the entire array.
- \`recommended_cadence\` — free-text. Examples: "Weekly", "Monthly", "Weekly; daily during the two weeks before each event".
- \`next_monitor_after\` — YYYY-MM-DD date after which the next monitoring action should be taken.
- \`registration_platform\` / \`scheduling_platform\` — descriptive intelligence only. A platform must not be treated as the organizer without direct evidence.

**Tools:**
- \`get_search_organizer_intelligence\` — read (no write flag required)
- \`insert_search_organizer_intelligence\` — write, requires \`ENABLE_SEARCH_HISTORY_WRITES=true\`

**Write intent rule:** Reviewing or summarizing organizer intelligence is read-only. Use \`insert_search_organizer_intelligence\` only when the user explicitly asks to save, record, or log organizer intelligence.

**Idempotency:** Re-inserting identical data returns the existing row (\`inserted: false\`). Inserting the same domain with different data returns an actionable conflict error — use \`get_search_organizer_intelligence\` to inspect the existing row.

**RLS:** \`anon\` and \`authenticated\` roles have no access. Service role only (same as all other search-history tables).

**Workflow position:** Optional step after findings are recorded, before or after \`finalize_tournament_search_run\`. Does not affect numerical finding metrics.`,

  rollForwardV2: `## Roll-Forward Research v2

**Read tools:**
- \`get_roll_forward_candidates\` — compatibility v1; unchanged.
- \`get_roll_forward_candidates_v2\` — full source, venue, target-year log, and classified sibling context.
- \`get_tournament_roll_forward_context\` — one source tournament by production ID or slug, including all log history.

**Match hierarchy:** explicitly linked → deterministic exact year-adjusted slug → likely deterministic family match → no match returned. \`no_confirmed_match\` means likely or no-match; it never proves absence.

**Venue policy:** Source \`tournament_venues\` relationships inherit by default unless external target-year evidence explicitly identifies a change. The MCP tools are read-only and never modify venues or link likely siblings.

**Statuses:** \`pending\`, \`no_dates_announced\`, \`discontinued\`, \`done\`, \`ambiguous\`. \`unresearched\` is query-derived when no target-year log row exists; it is not persisted.

**External boundary:** Reviewed ingestion remains outside this repository. The documented CSV contract is \`existing_tournament_id,target_year,roll_forward_status,start_date,end_date,batch_label,source_url\`.`,

  planned: `## Planned / Not Yet Built

- **\`api_usage_alarms\` table** — Will store alarm configs (threshold, API, surface, comparison operator).
- **Check-alarms cron route** — Will evaluate alarms against recent \`external_api_calls\` data and trigger notifications when thresholds are exceeded.
- **Alarm management UI** — Admin UI for creating, editing, and deleting alarms (likely under \`/admin/api-usage\` or a new route).
- **\`tournament_seasons\` table** — Will model recurring tournament seasons / series.
- **Season scanner** — Script or route to detect and link tournaments into seasons.`
} as const;

type SectionKey = keyof typeof SECTIONS;

// ---------------------------------------------------------------------------
// Keyword → section routing (checked in order; first match wins per keyword)
// ---------------------------------------------------------------------------

const KEYWORD_MAP: Array<{ keywords: string[]; section: SectionKey }> = [
  {
    keywords: [
      "roll forward", "roll-forward", "get_roll_forward_candidates_v2",
      "get_tournament_roll_forward_context", "no_confirmed_match", "venue inheritance"
    ],
    section: "rollForwardV2"
  },
  {
    keywords: ["api-usage", "api usage", "brave", "bing", "serpapi", "serp", "usage summary", "from_ts", "to_ts", "rpc", "how do i check"],
    section: "apiUsage"
  },
  {
    keywords: ["trackexternalcall", "track external", "external call", "wraps", "inserts into"],
    section: "trackExternalCall"
  },
  {
    keywords: [
      "external_api_surface", "surface", "owls_eye", "owl's eye", "owls eye",
      "venue_geocode", "venue_timezone", "places_lookup", "address_verify",
      "tournament_enrichment", "email_alert", "email_digest", "email_transactional",
      "venue_field_map", "atlas_search", "tournament_scan"
    ],
    section: "surfaces"
  },
  {
    keywords: [
      "external_api", "google_places", "foursquare", "mapbox", "resend",
      "open_meteo", "brave_search", "bing_search", "serpapi"
    ],
    section: "externalApis"
  },
  {
    keywords: [
      "route", "/admin", "tournament management", "venue management",
      "user management", "tier", "explorer", "insider", "weekend pro"
    ],
    section: "routes"
  },
  {
    keywords: ["script", "ops", "ingest", "backfill", "migration", "tsx"],
    section: "scripts"
  },
  {
    keywords: ["requireadmin", "require admin", "supabaseadmin", "service role", "auth guard"],
    section: "auth"
  },
  {
    keywords: [
      "organizer intelligence", "search organizer", "insert_search_organizer", "get_search_organizer",
      "organizer_intelligence", "tournament_search_organizer", "monitoring cadence",
      "next_monitor", "venue cluster", "tournament famil", "confidence level", "evidence_summary"
    ],
    section: "searchOrganizerIntel"
  },
  {
    keywords: [
      "alarm", "alarms", "cron", "season", "tournament_seasons",
      "coming soon", "planned", "not yet built", "not yet", "upcoming"
    ],
    section: "planned"
  },
  {
    keywords: [
      "monorepo", "apps/referee", "apps/ti-web", "referee insights",
      "tournament insights", "refereeinsights", "tournamentinsights", "structure"
    ],
    section: "monorepo"
  }
];

function findSections(query: string): string[] {
  const q = query.toLowerCase();
  const matched = new Set<SectionKey>();

  for (const { keywords, section } of KEYWORD_MAP) {
    if (keywords.some(k => q.includes(k))) {
      matched.add(section);
    }
  }

  // No match → return full reference
  if (matched.size === 0) {
    return Object.values(SECTIONS);
  }

  return [...matched].map(k => SECTIONS[k]);
}

// ---------------------------------------------------------------------------
// Exported helper
// ---------------------------------------------------------------------------

export function findAdminReference(query: string): string {
  const sections = findSections(query);
  return sections.join("\n\n---\n\n");
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerGetAdminReference(server: McpServer) {
  server.registerTool(
    "get_admin_reference",
    {
      description:
        "Static reference for the tournamentinsights.com / refereeinsights.com admin codebase. " +
        "Answers questions about admin routes, trackExternalCall, EXTERNAL_API constants, " +
        "EXTERNAL_API_SURFACE constants, scripts, auth guards, and planned features. " +
        "Does not make live API or database calls.",
      inputSchema
    },
    async (input) => {
      const { query } = inputSchema.parse(input);
      const sections = findSections(query);
      const answer = sections.join("\n\n---\n\n");
      return {
        content: [{ type: "text", text: answer }]
      };
    }
  );
}
