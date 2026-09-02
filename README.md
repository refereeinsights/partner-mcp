# TournamentInsights Partner MCP

A standalone remote MCP server for the TournamentInsights dataset. It serves two GPTs:

- **TI Organizer Intelligence** — read-only analysis of tournament records, venues, organizer domains, and data quality
- **TI Partner Management** — read/write tools for the partner pipeline, affiliate links, and click analytics

Connects to the same Supabase project as TournamentInsights but is a completely separate repo.

## MCP endpoint

```
/api/mcp
```

Deployed: `https://<vercel-project-domain>/api/mcp`

## Available tools

### Tournament Intelligence (read-only)

| Tool | Description |
|---|---|
| `get_tournament_venue_worklist` | Near-term tournaments with venue status (missing / incomplete / complete) and priority score. Defaults to 2–6 weeks from today. |
| `get_missing_venues` | Published canonical tournaments with no linked venue. Summary + list, filterable by sport and state. |
| `get_missing_fields` | Tournaments missing any of the specified fields (website, director email, dates, etc). |
| `get_organizer_clusters` | Group tournaments by host org or inferred domain. |
| `get_venue_clusters` | Venues used by multiple tournaments. |
| `get_top_organizer_domains` | Root domains most frequently appearing as tournament websites. |
| `get_tournaments` | Search production tournaments by name, sport, state, date range, organizer domain, or status (`published`, `draft`, `archived`). Use for duplicate detection before inserting a candidate, or to pull 2026 tournaments for roll-forward research. Returns up to 100 rows including the `status` field; supports `offset` pagination. |
| `find_production_matches` | Batch duplicate lookup: pass up to 25 candidate descriptors, get production matches for each in one call. Returns `results[]` with `candidate_index`, `matches[]`, and `match_count`. Use to classify search-history findings as New / Duplicate / Enrichment without N sequential lookups. Pass candidates as `candidates_json` (JSON array string) via the Action API — ChatGPT rejects native array parameters in both MCP and OpenAPI schemas. |
| `get_tournaments_by_domain` | All tournaments whose website matches a given domain. |
| `get_state_sport_coverage` | Tournament counts by state × sport combination. |
| `get_dataset_health` | Overall data quality metrics (% missing website, email, dates). |
| `get_summary_dashboard` | Rolled-up health + top sports/states/organizers/venues. |
| `get_trends` | Tournament additions over time by week/month/quarter. |
| `get_association_dashboard` | Top tournament associations/governing bodies. |
| `get_unverified_tournaments` | Tournaments without a verified_at or is_verified flag. |
| `get_tournaments_missing_source_urls` | Tournaments with no source URL. |
| `get_email_outreach_numbers` | Draft/sent/reply counts from the outreach table. |
| `upsert_organizer_watchlist` | Add or update an organizer domain on the watchlist (write-gated). |
| `insert_tournament_candidate` | Submit a URL as a candidate tournament for review (write-gated). |
| `insert_research_note` | Attach a note to an organizer, tournament, or venue (write-gated). |

### Partner Management

| Tool | Description |
|---|---|
| `get_partner_pipeline` | Partner registry — status, category, priority, notes. |
| `get_partner_links` | Affiliate/tracking links for a partner key. |
| `get_partner_click_summary` | Click aggregates over a date range. |
| `get_fanatics_routing` | Sport-specific Fanatics affiliate link with fallback logic. |
| `get_partner_knowledge` | Sections from the partner monetization knowledge base. |
| `get_admin_reference` | Admin reference data (sport list, state list, etc). |
| `get_association_dashboard` | Tournament association breakdown. |
| `upsert_partner` | Create or update a partner record (write-gated). |
| `upsert_partner_link` | Create or update a partner affiliate link (write-gated). |
| `upsert_partner_placement` | Create or update a placement slot (write-gated). |
| `insert_partner_note` | Attach a note to a partner (write-gated). |
| `update_partner_status` | Change a partner's pipeline status (write-gated). |
| `insert_partner_test_result` | Record a partner link test result (write-gated). |

### Tournament Search History (discovery tracking)

Operational research data — tournament-discovery search runs, per-`(state, sport)` scopes, and individual findings — kept fully separate from production `tournaments` rows. Nothing here creates, updates, or auto-promotes production tournament records. Ported from the main TournamentInsights MCP repo (`src/db/searchHistoryQueries.ts` there); full design docs (candidate statuses, CSV 2.5 qualification, idempotency, window filtering, coverage aggregation) live in that repo's README.

| Tool | Description |
|---|---|
| `get_search_runs` | List search runs; filter by state/sport/region/status/tournament-window (`window_from`/`window_to`)/search timestamp. |
| `get_search_run_findings` | List findings (defaults to current/non-superseded only); filter by run/scope/state/sport/candidate_status/organizer_domain/window. |
| `get_search_coverage` | State-and-sport coverage rolled up from scopes: run counts, qualified yield rate, unresolved-verification counts, known organizer domains. |
| `get_next_search_priorities` | Scored next-search recommendations. Only surfaces combinations already present in `tournament_search_run_scopes` — cannot identify never-searched combinations. |
| `get_search_organizer_intelligence` | Query stored organizer ecosystem intelligence attached to search runs. Filter by run, domain, confidence, state, sport, or next-monitor date window. |
| `insert_tournament_search_run` | Record a search run. Idempotent via `source_batch_id` (write-gated, separate flag — see below). |
| `insert_tournament_search_scope` | Record a `(state, sport)` scope for a run (write-gated). |
| `insert_tournament_search_finding` | Record a finding; supports supersession via `supersedes_finding_id` (write-gated). |
| `insert_tournament_search_findings` | Batch-insert findings (max 100), all-or-nothing validation (write-gated). |
| `finalize_tournament_search_run` | Reconcile scope/run metrics from current findings, resolve unscoped findings, set `completed_at`/status. Idempotent (write-gated). |
| `insert_search_organizer_intelligence` | Record organizer ecosystem intelligence for a search run: confidence, evidence, tournament families, venue clusters, monitoring URLs, cadence. Idempotent on `(search_run_id, organizer_domain)` (write-gated). |
| `insert_complete_search_package` | Atomically record a complete search package (run + scopes + findings + organizer intelligence) in one call. Idempotent via `source_batch_id`. Returns `created`/`reused`/`conflict` status plus a full receipt. Requires the RPC migration (see below). Write-gated. |

**Recommended workflow (single call):**

Use `insert_complete_search_package` to record everything in one atomic call. Parameters are passed as JSON strings because ChatGPT's MCP client only supports scalar parameter types (string, boolean) — array and object types are rejected at the client layer regardless of schema:

- `run_json` — JSON string of the run descriptor (`source_batch_id` required). Example: `'{"source_batch_id":"batch-001","states":["CA"],"sports":["soccer"],"searched_at":"2026-07-29T12:00:00Z"}'`
- `scopes_json` — JSON array string of `{ state, sport }` objects (min 1). Example: `'[{"state":"CA","sport":"soccer"}]'`
- `findings_json` *(optional, default `[]`)* — JSON array string of finding objects; set `search_scope_index` (zero-based) to assign each finding to a scope, or rely on auto-assignment for single-scope packages
- `organizer_intelligence_json` *(optional, default `[]`)* — JSON array string of organizer intelligence objects (`organizer_domain`, `confidence_level`, `evidence_summary` required per entry)
- `finalize` *(boolean, default true)* — reconcile metrics and mark the run completed in the same transaction

The tool is idempotent: repeated calls with the same `source_batch_id` return `status: "reused"` if key run fields match, or `status: "conflict"` (with a diff) if they differ. Findings and org intel are deduplicated within each call.

**Alternative workflow (five separate calls):**
1. `insert_tournament_search_run` — record the run
2. `insert_tournament_search_scope` — record each (state, sport) scope
3. `insert_tournament_search_findings` — batch-record findings
4. `insert_search_organizer_intelligence` *(optional)* — record per-organizer ecosystem intelligence
5. `finalize_tournament_search_run` — reconcile metrics, set status

**Write-gating decision:** these write tools require `ENABLE_SEARCH_HISTORY_WRITES=true`, a flag separate from `ENABLE_MCP_WRITES`. Search-history writes are the routine, potentially high-frequency write path for this feature, unlike the existing admin write tools above (rare, manual actions). Both flags require `SUPABASE_SERVICE_ROLE_KEY`.

**Schema migrations (apply in order):**
1. `tournament_search_history_schema_v1.sql` from the main TournamentInsights MCP repo (`src/db/sql/`) — three core search-history tables
2. `src/db/sql/tournament_search_organizer_intelligence_v1.sql` — organizer-intelligence table
3. `src/db/sql/tournament_search_runs_seasonality_conclusion_v1.sql` — adds `seasonality_conclusion` column (required before the RPC)
4. `src/db/sql/insert_complete_search_package_rpc_v1.sql` — PL/pgSQL RPC function for `insert_complete_search_package`

RLS is enabled on all tables with no permissive policies for `anon`/`authenticated`; only the service-role key can reach this data. The RPC is `security definer` with public execute revoked.

**Organizer intelligence table:** `tournament_search_organizer_intelligence` — one row per `(search_run_id, organizer_domain)`. Stores confidence level (High/Medium/Low), evidence summary, tournament families, venue clusters, monitoring URLs, recommended cadence, next-monitor date, and registration/scheduling platforms. Does not create production organizer, tournament, or watchlist rows. Use `insert_search_organizer_intelligence` (or include entries in `insert_complete_search_package`) only when explicitly asked to save organizer intelligence — reading or summarizing is read-only via `get_search_organizer_intelligence`.

**`insert_complete_search_package` notes:**
- Requires the RPC migration (`insert_complete_search_package_rpc_v1.sql`) to be applied. Calling without the migration returns a descriptive error.
- Parameters `run_json`, `scopes_json`, `findings_json`, `organizer_intelligence_json` are JSON strings (not objects/arrays) because ChatGPT's MCP client rejects array and object parameter types. Parse happens server-side.
- The Action API (`/api/action`) route still accepts the native structured format (`run`, `scopes`, `findings`, `organizer_intelligence` as objects/arrays) — only the MCP interface uses the JSON-string form.

**`MOCK_MODE` caveat specific to this feature:** the in-memory mock store mutates module-level arrays, unlike the read-only `MOCK_TOURNAMENTS` fixture already in this repo. That mutation is only reliable within a single warm process — verified working via a `next dev` server for individual request flows, but Next.js dev/Vercel serverless make no guarantee that state persists identically across separate requests (dev-mode module reloads, cold starts, multiple instances). Don't rely on `MOCK_MODE` to test cross-request idempotency (e.g. repeated `source_batch_id` calls) here; that guarantee only actually holds against real Supabase (its `on conflict` unique index), which needs a live/staging project to verify.

### Roll-Forward Research

| Tool | Description |
|---|---|
| `get_roll_forward_candidates` | **V1 compatibility feed.** Bounded read-only candidate feed. Returns published source-year tournaments with no detected target-year sibling and no completed log entry. Filters: `source_year`, `target_year`, `sport`, `state`, `limit`, `offset`. **A returned candidate does not confirm the target-year edition exists.** |
| `get_roll_forward_candidates_v2` | **Research-grade candidate feed.** Richer V2 query with complete linked venues, organizer domain, query-derived `unresearched` state, explicit/deterministic/likely/no-match sibling classification, date-range and organizer-domain filtering, and stable pagination. V1 remains unchanged. |
| `get_tournament_roll_forward_context` | Complete read-only context for one source tournament: full tournament data, linked venues, roll-forward history, and current target-year sibling matches. Anchor by `parent_tournament_id` or `parent_slug`. |
| `get_roll_forward_log` | Roll-forward research log with full parent tournament context and all target-year staging fields. Filter by status, target_year, batch_label, sport, state. |
| `upsert_roll_forward_log` | Stage or update a roll-forward research entry on `(parent_tournament_id, target_year)`. Validates status transitions server-side. Writes target-year staging fields and verification flags. Only provided fields are updated on existing rows. Requires `ENABLE_MCP_WRITES=true`. |

#### Research Status Lifecycle

| Status | Meaning |
|---|---|
| `unresearched` | Initial state — no research completed for this target year. |
| `pending` | Research started or requires follow-up. |
| `no_dates_announced` | Organizer active but no explicit target-year dates available yet. Set `next_check_at`. |
| `ambiguous` | Possible target-year relationship exists but identity or duplicate resolution is unsafe. |
| `ready_to_create` | Verified target staged; available production lookup returned no safe existing child. |
| `linked_existing` | Confident existing production child identified and linked via `sibling_id`. |
| `discontinued` | Evidence supports no continuation for this target year. **Terminal for this target-year cycle.** |
| `done` | Roll-forward relationship reconciled. **Terminal.** |

Transition graph enforced server-side: `done` and `discontinued` are terminal. `ready_to_create` can move to `linked_existing`, `ambiguous`, or `done`. `linked_existing` can move to `done`.

#### Sibling Match States (V2)

| State | Meaning |
|---|---|
| `explicitly_linked` | `sibling_id` confirmed in roll-forward log. |
| `deterministic_match` | Year-adjusted slug + sport match found in production. |
| `likely_match_returned` | Heuristic (family/domain) match found — requires researcher confirmation. |
| `no_match_returned` | No match returned by available lookup. Does not prove production absence. |

#### V2 Cohort Workflow
```
# 1. Select candidates needing 2027 research (Jan Week 1, soccer, TX)
get_roll_forward_candidates_v2(
  target_year=2027, parent_start_date_from=2026-01-01, parent_start_date_to=2026-01-07,
  sport=soccer, state=TX, roll_forward_status=unresearched, limit=25
)

# 2. For each candidate, get full context
get_tournament_roll_forward_context(target_year=2027, parent_tournament_id=<id>)

# 3. Research externally, then stage outcome
upsert_roll_forward_log(
  parent_tournament_id=<id>, target_year=2027,
  status=ready_to_create,
  target_name="Spring Classic 2027",
  target_start_date="2027-03-15", target_end_date="2027-03-16",
  target_source_url="https://example.com/2027",
  verified_dates=true, verified_source=true,
  recommended_action=create_new
)

# 4. If a production sibling is found, link it instead
upsert_roll_forward_log(
  parent_tournament_id=<id>, target_year=2027,
  status=linked_existing, sibling_id=<production-child-uuid>
)

# 5. Reconcile to done
upsert_roll_forward_log(parent_tournament_id=<id>, target_year=2027, status=done)

# 6. Paginate to next cohort
get_roll_forward_candidates_v2(..., offset=25)
```

#### Architecture Notes
- Partner-mcp is a **research and staging layer only** — it does not create production tournament records.
- Production child creation (`ingest_roll_forward_child`) is deferred pending a production-write architecture decision (direct Supabase vs TI internal API).
- Venue creation and canonical venue matching are explicitly out of scope — venue data is surfaced for research context only.
- `find_production_matches` can be used for manual production duplicate lookup before setting `sibling_id`.

**SQL migrations required:**
- `src/db/sql/get_roll_forward_candidates_rpc_v2.sql` — V2 RPC helper functions and main query (apply before using V2 tools).
- `src/db/sql/roll_forward_log_staging_columns_v1.sql` — Adds target-year staging columns to `tournament_roll_forward_log` (apply before using staging fields in upsert).

### System

| Tool | Description |
|---|---|
| `mcp_healthcheck` | Returns server status, write mode, mock mode, and env var presence. |
| `list_tools` | Full inventory of available tools with category, access level, and description. Call first in any new session. |

## Security model

- The `/api/mcp` endpoint requires a bearer token: `Authorization: Bearer <MCP_API_KEY>`
- The Supabase service role key is server-side only — never exposed in responses
- Write tools are disabled by default; set `ENABLE_MCP_WRITES=true` to enable them
- Health endpoint (`/api/health`) is unauthenticated
- **TODO:** Replace bearer token with OAuth or Vercel-supported MCP auth

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key — server-side only |
| `MCP_API_KEY` | Yes (prod) | Bearer token for MCP endpoint auth |
| `ENABLE_MCP_WRITES` | No | Set to `true` to enable write tools |
| `ENABLE_SEARCH_HISTORY_WRITES` | No | Set to `true` to enable the tournament search-history write tools (separate from `ENABLE_MCP_WRITES`) |
| `MOCK_MODE` | No | Set to `true` to return mock data without a real Supabase connection |
| `SITE_URL` | No | Deployed URL of this service (no trailing slash) |

## Running locally

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env.local
# Edit .env.local with real values

# 3. Run dev server
npm run dev
```

The MCP endpoint will be at `http://localhost:3000/api/mcp`.

In local dev, `MCP_API_KEY` is optional — omitting it allows unauthenticated access. Always set it in production.

## Connecting an MCP client locally

For Claude Desktop or clients that support streamable HTTP:
```json
{
  "partner-mcp": {
    "url": "http://localhost:3000/api/mcp"
  }
}
```

With auth header (if MCP_API_KEY is set locally):
```json
{
  "partner-mcp": {
    "url": "http://localhost:3000/api/mcp",
    "headers": {
      "Authorization": "Bearer <your-key>"
    }
  }
}
```

For stdio-only clients, use `mcp-remote`:
```json
{
  "partner-mcp": {
    "command": "npx",
    "args": ["-y", "mcp-remote", "http://localhost:3000/api/mcp"]
  }
}
```

## Deploying to Vercel

1. Push this repo to GitHub.
2. Connect the GitHub repo to Vercel (separate from the main TI app).
3. Add environment variables in Vercel project settings:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `MCP_API_KEY`
   - `SITE_URL` (set to your Vercel project URL)
4. Deploy.
5. Test:
   ```bash
   # Health check
   curl https://your-project.vercel.app/api/health

   # MCP connection
   curl -H "Authorization: Bearer <MCP_API_KEY>" \
        https://your-project.vercel.app/api/mcp
   ```

**Note:** The `docs/partner-monetization-knowledge.md` file is bundled into the serverless function via `outputFileTracingIncludes` in `next.config.ts`. Do not move or rename that file without updating the config.

## Supabase access

This server requires SELECT access on:
- `public.tournaments`
- `public.tournament_venues`
- `public.venues`
- `public.organizer_watchlists`
- `public.tournament_outreach`
- `public.outreach_dashboard`
- `public.partners`
- `public.partner_links`
- `public.ti_map_events`
- `public.tournament_search_runs`
- `public.tournament_search_run_scopes`
- `public.tournament_search_run_findings`

Write tools (when `ENABLE_MCP_WRITES=true`) also require INSERT/UPDATE on:
- `public.organizer_watchlists`
- `public.tournament_candidates`
- `public.research_notes`
- `public.partners`
- `public.partner_links`
- `public.partner_placements`
- `public.partner_notes`
- `public.partner_test_results`

Search-history write tools (when `ENABLE_SEARCH_HISTORY_WRITES=true`) also require INSERT/UPDATE on:
- `public.tournament_search_runs`
- `public.tournament_search_run_scopes`
- `public.tournament_search_run_findings`
- `public.tournament_search_organizer_intelligence`

For production, consider using a scoped Postgres role rather than the full service role key.

## Future TODOs

1. OAuth authorization (replace static bearer token).
2. Read-only Postgres role for safe arbitrary SQL queries from the GPT.
3. Rate limiting.
4. Audit logging for MCP tool calls.
5. Revenue reporting once `partner_revenue_events` is live.
6. API/CSV imports from Impact, Rakuten, OpenTable, Lucid, etc.
