# TournamentInsights Partner Monetization Knowledge

## Purpose

This file is the durable source of truth for TournamentInsights partner strategy, implementation decisions, and monetization context. It is read by the `get_partner_knowledge` MCP tool and should be updated as the partner program evolves.

## Core Monetization Principles

- Placements must feel helpful, not intrusive — gear, lodging, and dining partners should appear in context (tournament pages, gear hubs, venue detail pages).
- Attribution must be clean. Every partner click routes through `/go/partner/[partnerLinkId]` in the main app and is recorded in `public.ti_map_events` as `partner_click_clicked`.
- Partner links use sub-IDs to track source, surface, and sport. Never use a bare affiliate link without tracking parameters.
- Affiliate disclosures are required. All placements must be accompanied by an appropriate disclosure.
- Prioritize partners with high relevance to tournament families: sporting goods, team travel, local dining, and event logistics.

## Current Partner Pipeline

| Partner | Category | Status | Priority |
|---|---|---|---|
| Fanatics | sporting_goods_affiliate | active_tracking_links_created | high |
| Lucid Travel | team_travel_room_blocks | application_pending | high |
| OpenTable | restaurant_reservations | application_pending | medium |
| Dick's Sporting Goods | sporting_goods_affiliate | application_pending | medium |
| Scheels | sporting_goods_affiliate | reapply_next_week | low |

## Lodging Context

Team travel and hotel room blocks are a high-value monetization surface. Tournament families often need to book multiple rooms simultaneously. Positioning is "Need rooms for your team?" rather than generic hotel search.

- Lucid Travel specializes in group room blocks — strong fit.
- Book Travel placement already exists in the main TI app (implemented for Fanatics launch).
- Future: integrate a lodging partner (Lucid Travel preferred) into the Book Travel section.

## Partner Categories

- `sporting_goods_affiliate` — gear and equipment affiliate programs (Fanatics, Dick's, Scheels)
- `team_travel_room_blocks` — group hotel/lodging partners (Lucid Travel)
- `restaurant_reservations` — dining affiliate programs (OpenTable)
- (future) `event_logistics` — tournament supplies, trophies, photography

## Fanatics Implementation

**Status:** Active. Impact affiliate links created and deployed.

**Sport-specific routing:** Use sport-specific links where available. Fall back to the all-sports tournament page link.

| Sport | sub_id_3 |
|---|---|
| Baseball / Softball | baseball_softball |
| Basketball | basketball |
| Soccer | soccer |
| Hockey | hockey |
| Lacrosse | lacrosse |
| All others | all_sports |

**Active links (stored in public.partner_links):**

| Label | sub_id_1 | sub_id_2 | sub_id_3 |
|---|---|---|---|
| General Gear Hub | gear_hub | fanatics_module | all_sports |
| Tournament Pages (fallback) | tournament_page | gear_module | all_sports |
| Baseball & Softball | tournament_page | gear_module | baseball_softball |
| Basketball | tournament_page | gear_module | basketball |
| Soccer | tournament_page | gear_module | soccer |
| Hockey | tournament_page | gear_module | hockey |
| Lacrosse | tournament_page | gear_module | lacrosse |

**Disclosure:** "Affiliate link — TournamentInsights may earn a commission on qualifying purchases."

## OpenTable Status

- **Status:** Application submitted, pending approval.
- **Priority:** Medium.
- **Fit:** Tournament families eating out near venues; local restaurant discovery on venue/tournament pages.
- **Open items before launch:** referral fee structure, API access for real-time availability, attribution and reporting access, co-branding requirements.
- **Placement idea:** Venue detail pages — "Dining near [Venue Name]."

## Lucid Travel Status

- **Status:** Application submitted, pending approval.
- **Priority:** High — strong fit for tournament travel.
- **Fit:** Group room blocks and team hotel reservations. Position as "Need rooms for your team?"
- **Placement idea:** Tournament detail pages, Book Travel section.
- **Note:** Complements (does not replace) any individual hotel affiliate program.

## Sporting Goods Affiliate Status

**Dick's Sporting Goods**
- Status: Application pending.
- Priority: Medium.
- Fit: Youth sports gear, tournament essentials, sport-specific shopping modules.
- Note: Broader demographic fit than Fanatics for youth recreational sports.

**Scheels**
- Status: Re-apply next week (as of knowledge file last update).
- Priority: Low.
- Angle for re-application: youth sports families, tournament essentials, sporting goods for competitive players.
- Note: Regional footprint — stronger fit for Midwest tournament markets.

## Implemented Partner Infrastructure

**Main app (apps/ti-web):**
- `/go/partner/[partnerLinkId]` — redirect route that logs the click and forwards to the affiliate URL.
- Click logging: `partner_click_clicked` event in `public.ti_map_events` with JSONB properties: `partner_key`, `partner_link_id`, `sport`, `page_type`, `placement`, `campaign`.
- Book Travel section: implemented on tournament pages, currently surfacing Fanatics gear links.

**Supabase tables:**
- `public.partners` — partner registry (key, name, category, status, priority, etc.)
- `public.partner_links` — individual affiliate/tracking links per partner
- `public.ti_map_events` — event log; partner clicks are `event_name = partner_click_clicked`

**This MCP repo:**
- Read-only access to the above three tables.
- `mcp_partner` Postgres role with SELECT grants on required tables.

## Tracking Standards

All partner clicks must include:
- `partner_key` — identifies the partner (e.g. `fanatics`)
- `partner_link_id` — identifies the specific link row in `public.partner_links`
- `sport` — tournament or venue sport context, if available
- `page_type` — where the click occurred (e.g. `tournament_page`, `venue_page`, `gear_hub`)
- `placement` — UI surface within the page (e.g. `gear_module`, `book_travel`, `sidebar`)
- `campaign` — optional campaign tag for A/B or seasonal tracking

Never use bare affiliate URLs. Always route through `/go/partner/[partnerLinkId]`.

## Public Placement Priorities

1. **Tournament pages** — gear module (Fanatics sport-specific link), Book Travel section (future: Lucid Travel)
2. **Venue pages** — dining nearby (future: OpenTable), gear module
3. **Gear Hub page** — Fanatics general gear link, future: Dick's / Scheels
4. **Search results** — low priority until partner program is more mature

## QA Checklist

Before launching any new partner placement:
- [ ] Partner link row exists in `public.partner_links` with correct sub-IDs
- [ ] `/go/partner/[partnerLinkId]` redirect works and returns 302
- [ ] `partner_click_clicked` event appears in `public.ti_map_events` after test click
- [ ] `get_partner_click_summary` MCP tool reflects the test click
- [ ] Affiliate disclosure is visible on the placement
- [ ] Sport-specific routing verified for Fanatics placements
- [ ] Link is marked `is_active = true` in the database

## Recent Decisions Log

- **2026-05-15** — Standalone partner MCP server created. Separate from main app repo. Read-only tools for pipeline, links, click summaries, Fanatics routing, and this knowledge file.
- **2026-05-15** — Scoped `mcp_partner` Postgres role created with SELECT on partners, partner_links, ti_map_events, tournaments, tournament_venues, venues, organizer_watchlists, tournament_outreach, outreach_dashboard.
- **Fanatics** — Impact affiliate program joined. Sport-specific links created for baseball/softball, basketball, soccer, hockey, lacrosse. All-sports fallback link set to tournament_page/gear_module/all_sports.
- **OpenTable / Lucid Travel / Dick's / Scheels** — Applications submitted or in progress. Not yet live.

## How to Update This File

1. Edit `docs/partner-monetization-knowledge.md` in this repo.
2. Commit and deploy to Vercel — the knowledge file is bundled at build time.
3. The `get_partner_knowledge` MCP tool will reflect the update after the next cold start.
4. Add a dated entry to the **Recent Decisions Log** section for any significant change.
