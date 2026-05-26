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

### System

| Tool | Description |
|---|---|
| `mcp_healthcheck` | Returns server status, write mode, and env var presence. |

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

Write tools (when `ENABLE_MCP_WRITES=true`) also require INSERT/UPDATE on:
- `public.organizer_watchlists`
- `public.tournament_candidates`
- `public.research_notes`
- `public.partners`
- `public.partner_links`
- `public.partner_placements`
- `public.partner_notes`
- `public.partner_test_results`

For production, consider using a scoped Postgres role rather than the full service role key.

## Future TODOs

1. OAuth authorization (replace static bearer token).
2. Read-only Postgres role for safe arbitrary SQL queries from the GPT.
3. Rate limiting.
4. Audit logging for MCP tool calls.
5. Revenue reporting once `partner_revenue_events` is live.
6. API/CSV imports from Impact, Rakuten, OpenTable, Lucid, etc.
