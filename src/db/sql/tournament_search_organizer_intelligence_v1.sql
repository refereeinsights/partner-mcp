-- tournament_search_organizer_intelligence_v1.sql
--
-- Apply against the shared Supabase project used by both TournamentInsights
-- and partner-mcp.
--
-- Convention note: the existing search-history schema
-- (tournament_search_history_schema_v1.sql) lives in the main TournamentInsights
-- MCP repo (src/db/sql/). This file is kept in partner-mcp rather than the
-- main repo because the organizer-intelligence table is specific to
-- partner-mcp's operational tooling, and partner-mcp cannot modify the
-- main repo per its scope constraints.
-- ---------------------------------------------------------------------------

create table if not exists public.tournament_search_organizer_intelligence (
  id uuid primary key default gen_random_uuid(),

  search_run_id uuid not null
    references public.tournament_search_runs(id)
    on delete cascade,

  organizer_name text,
  organizer_domain text not null,

  -- Evidence-based confidence in the organizer intelligence.
  -- High / Medium / Low only. Evidence must be documented in evidence_summary.
  confidence_level text not null
    check (confidence_level in ('High', 'Medium', 'Low')),

  evidence_summary text,

  states text[] not null default '{}',
  sports text[] not null default '{}',

  -- Recurring tournament name families attributed to this organizer.
  -- Not inferred — must be explicitly supported by evidence.
  tournament_families text[] not null default '{}',

  -- Facilities this organizer recurringly uses.
  -- Not inferred from a single-event venue association alone.
  venue_clusters text[] not null default '{}',

  -- HTTP/HTTPS URLs for ongoing monitoring.
  monitoring_urls text[] not null default '{}',

  -- Free-text monitoring cadence recommendation.
  -- Examples: 'Weekly', 'Monthly', 'Weekly; daily two weeks before each event'
  recommended_cadence text,

  -- Date after which the next monitoring action should be performed.
  next_monitor_after date,

  -- Descriptive platform intelligence — does not imply platform is the organizer.
  registration_platform text,
  scheduling_platform text,

  notes text,

  created_at timestamptz not null default now(),

  -- One row per (search_run, organizer_domain). Domain is stored normalized
  -- (lowercase, no www., no scheme/path) by the application layer.
  unique (search_run_id, organizer_domain)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists idx_tsoi_search_run_id
  on public.tournament_search_organizer_intelligence (search_run_id);

create index if not exists idx_tsoi_organizer_domain
  on public.tournament_search_organizer_intelligence (organizer_domain);

create index if not exists idx_tsoi_confidence_level
  on public.tournament_search_organizer_intelligence (confidence_level);

create index if not exists idx_tsoi_next_monitor_after
  on public.tournament_search_organizer_intelligence (next_monitor_after);

create index if not exists idx_tsoi_states
  on public.tournament_search_organizer_intelligence using gin (states);

create index if not exists idx_tsoi_sports
  on public.tournament_search_organizer_intelligence using gin (sports);

create index if not exists idx_tsoi_tournament_families
  on public.tournament_search_organizer_intelligence using gin (tournament_families);

create index if not exists idx_tsoi_venue_clusters
  on public.tournament_search_organizer_intelligence using gin (venue_clusters);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Mirrors tournament_search_history_schema_v1.sql.
-- RLS enabled with no permissive policies → anon and authenticated roles
-- receive no access by default. The Supabase service role key (used by all
-- partner-mcp reads and writes) bypasses RLS entirely.
-- ---------------------------------------------------------------------------

alter table public.tournament_search_organizer_intelligence
  enable row level security;
-- No permissive policies are created. Service role only.
