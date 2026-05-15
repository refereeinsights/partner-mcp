# TournamentInsights Partner MCP

A standalone remote MCP server for the TournamentInsights partner and monetization program.

## What this is

This server exposes read-only MCP tools for querying the TournamentInsights partner pipeline, affiliate links, click analytics, Fanatics sport routing, and the partner monetization knowledge base.

It connects to the same Supabase project as TournamentInsights but is a completely separate repo — no code is imported from the main app.

## MCP endpoint

```
/api/mcp
```

Deployed: `https://<vercel-project-domain>/api/mcp`

## Available tools

| Tool | Description |
|---|---|
| `get_partner_pipeline` | Partner registry from `public.partners` — status, category, priority, notes |
| `get_partner_links` | Affiliate/tracking links for a partner key from `public.partner_links` |
| `get_partner_click_summary` | Click aggregates from `public.ti_map_events` over a date range |
| `get_fanatics_routing` | Sport-specific Fanatics affiliate link with fallback logic |
| `get_partner_knowledge` | Sections from `docs/partner-monetization-knowledge.md` |

## Security model

- The `/api/mcp` endpoint requires a bearer token: `Authorization: Bearer <MCP_API_KEY>`
- The Supabase service role key is server-side only — never exposed in responses
- All tools are read-only (no writes)
- Health endpoint (`/api/health`) is unauthenticated
- **TODO:** Replace bearer token with OAuth or Vercel-supported MCP auth

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (or scoped `mcp_partner` role key) — server-side only |
| `MCP_API_KEY` | Yes (prod) | Bearer token for MCP endpoint auth |
| `SITE_URL` | Optional | Deployed URL of this service (no trailing slash) |

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
- `public.partners`
- `public.partner_links`
- `public.ti_map_events`
- `public.tournaments`
- `public.tournament_venues`
- `public.venues`
- `public.organizer_watchlists`
- `public.tournament_outreach`
- `public.outreach_dashboard`

For production, use the scoped `mcp_partner` Postgres role rather than the full service role key:
```sql
grant select on public.partners to mcp_partner;
grant select on public.partner_links to mcp_partner;
-- ... (see setup docs)
```

## Future TODOs

1. OAuth authorization (replace static bearer token).
2. Admin write tools: update partner statuses, manage notes.
3. Create/deactivate partner link tool.
4. Revenue reporting once `partner_revenue_events` is live.
5. API/CSV imports from Impact, Rakuten, OpenTable, Lucid, etc.
6. Rate limiting.
7. Audit logging for MCP tool calls.
