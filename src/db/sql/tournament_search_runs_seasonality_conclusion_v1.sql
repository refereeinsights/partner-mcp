-- tournament_search_runs_seasonality_conclusion_v1.sql
--
-- Apply against the shared Supabase project.
--
-- Adds seasonality_conclusion column to tournament_search_runs.
-- Required before applying insert_complete_search_package_rpc_v1.sql.
-- ---------------------------------------------------------------------------

alter table public.tournament_search_runs
  add column if not exists seasonality_conclusion text;
