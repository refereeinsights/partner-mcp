-- tournament_search_runs_source_batch_id_uidx_v1.sql
--
-- Apply against the shared Supabase project.
--
-- Adds a full unique index on source_batch_id to support idempotent
-- insert_tournament_search_run calls via the Supabase JS client.
--
-- Design note: a PARTIAL unique index (WHERE source_batch_id IS NOT NULL)
-- would also enforce uniqueness, but the Supabase JS client generates
-- ON CONFLICT (source_batch_id) without a WHERE predicate, which PostgreSQL
-- requires to match the index definition exactly. A full unique index is used
-- instead. PostgreSQL treats NULLs as distinct in unique indexes, so rows
-- with source_batch_id = NULL are not constrained against each other.
-- ---------------------------------------------------------------------------

create unique index if not exists tournament_search_runs_source_batch_id_uidx
  on public.tournament_search_runs (source_batch_id);
