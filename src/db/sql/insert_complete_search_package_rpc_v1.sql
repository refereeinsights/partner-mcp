-- insert_complete_search_package_rpc_v1.sql
--
-- Apply against the shared Supabase project AFTER:
--   tournament_search_runs_seasonality_conclusion_v1.sql
--
-- PL/pgSQL RPC that atomically inserts (or retrieves) a complete search
-- package: run → scopes → findings → organizer intelligence → finalize.
-- Returns a JSONB receipt consistent with committed database state.
--
-- Security: RLS is enabled on all target tables with no permissive policies
-- for anon/authenticated. This function is security definer so it executes
-- with owner privileges (service role). Public execute access is revoked.
-- ---------------------------------------------------------------------------

create or replace function public.insert_complete_search_package_rpc(payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_run           jsonb := payload -> 'run';
  v_scopes        jsonb := payload -> 'scopes';
  v_findings      jsonb := payload -> 'findings';
  v_org_intel     jsonb := payload -> 'organizer_intelligence';
  v_finalize      boolean := coalesce((payload ->> 'finalize')::boolean, true);

  v_source_batch_id text  := v_run ->> 'source_batch_id';
  v_run_id          uuid;
  v_package_status  text;

  -- scope tracking
  v_scope_result    jsonb;
  v_scope_results   jsonb := '[]'::jsonb;
  v_scope_id        uuid;

  -- finding tracking
  v_finding         jsonb;
  v_finding_id      uuid;
  v_dedupe_key      text;
  v_existing_id     uuid;
  v_inserted_findings  int := 0;
  v_reused_findings    int := 0;
  v_superseded_findings int := 0;
  v_finding_ids     jsonb := '[]'::jsonb;

  -- organizer intel tracking
  v_intel           jsonb;
  v_intel_id        uuid;
  v_inserted_intel  int := 0;
  v_reused_intel    int := 0;
  v_intel_record_ids jsonb := '[]'::jsonb;

  -- metric vars
  v_candidates_found          int;
  v_qualified_rows            int;
  v_needs_venue_verification  int;
  v_needs_address_verification int;
  v_needs_date_verification   int;
  v_duplicates_found          int;
  v_out_of_scope_found        int;

  v_scope_entry     jsonb;
  v_scope_state     text;
  v_scope_sport     text;

  v_completed_at    timestamptz;
  v_now             timestamptz := now();

  v_conflicts       jsonb := '[]'::jsonb;
  v_conflict        jsonb;
  v_stored_run      record;

begin
  -- -------------------------------------------------------------------------
  -- 1. Run: retrieve or insert
  -- -------------------------------------------------------------------------
  select id, region_name, date_from, date_to, search_method, states, sports
    into v_stored_run
    from public.tournament_search_runs
   where source_batch_id = v_source_batch_id
   limit 1;

  if found then
    v_run_id := v_stored_run.id;
    v_package_status := 'reused';

    -- Conflict detection on key fields
    if (v_run ->> 'region_name') is not null
       and (v_run ->> 'region_name') <> coalesce(v_stored_run.region_name, '') then
      v_conflicts := v_conflicts || jsonb_build_object(
        'path', 'run.region_name',
        'stored_value', v_stored_run.region_name,
        'incoming_value', v_run ->> 'region_name'
      );
    end if;

    if (v_run ->> 'date_from') is not null
       and (v_run ->> 'date_from') <> coalesce(v_stored_run.date_from::text, '') then
      v_conflicts := v_conflicts || jsonb_build_object(
        'path', 'run.date_from',
        'stored_value', v_stored_run.date_from,
        'incoming_value', (v_run ->> 'date_from')::date
      );
    end if;

    if (v_run ->> 'date_to') is not null
       and (v_run ->> 'date_to') <> coalesce(v_stored_run.date_to::text, '') then
      v_conflicts := v_conflicts || jsonb_build_object(
        'path', 'run.date_to',
        'stored_value', v_stored_run.date_to,
        'incoming_value', (v_run ->> 'date_to')::date
      );
    end if;

    if (v_run ->> 'search_method') is not null
       and (v_run ->> 'search_method') <> coalesce(v_stored_run.search_method, '') then
      v_conflicts := v_conflicts || jsonb_build_object(
        'path', 'run.search_method',
        'stored_value', v_stored_run.search_method,
        'incoming_value', v_run ->> 'search_method'
      );
    end if;

    if jsonb_array_length(v_run -> 'states') > 0
       and (select array_agg(x order by x) from jsonb_array_elements_text(v_run -> 'states') as x)
           <> (select array_agg(x order by x) from unnest(v_stored_run.states) as x) then
      v_conflicts := v_conflicts || jsonb_build_object(
        'path', 'run.states',
        'stored_value', v_stored_run.states,
        'incoming_value', v_run -> 'states'
      );
    end if;

    if jsonb_array_length(v_run -> 'sports') > 0
       and (select array_agg(x order by x) from jsonb_array_elements_text(v_run -> 'sports') as x)
           <> (select array_agg(x order by x) from unnest(v_stored_run.sports) as x) then
      v_conflicts := v_conflicts || jsonb_build_object(
        'path', 'run.sports',
        'stored_value', v_stored_run.sports,
        'incoming_value', v_run -> 'sports'
      );
    end if;

    if jsonb_array_length(v_conflicts) > 0 then
      return jsonb_build_object(
        'status', 'conflict',
        'search_run_id', v_run_id,
        'source_batch_id', v_source_batch_id,
        'conflicts', v_conflicts
      );
    end if;

  else
    v_run_id := (v_run ->> 'id')::uuid;
    v_package_status := 'created';

    insert into public.tournament_search_runs (
      id, source_batch_id, region_name, states, sports,
      date_from, date_to,
      search_prompt_version, search_prompt_text, search_prompt_hash, search_prompt_truncated,
      search_method, research_agent, research_model,
      searched_at, searched_by,
      candidates_found, qualified_rows, needs_venue_verification,
      needs_address_verification, needs_date_verification,
      duplicates_found, out_of_scope_found,
      organizer_domains, organizer_names, venue_names, high_value_sources,
      search_summary, unresolved_work, next_action, next_search_after,
      seasonality_conclusion, status, completed_at, created_at, updated_at
    ) values (
      v_run_id,
      v_source_batch_id,
      nullif(trim(v_run ->> 'region_name'), ''),
      (select array_agg(x) from jsonb_array_elements_text(coalesce(v_run -> 'states', '[]')) as x),
      (select array_agg(x) from jsonb_array_elements_text(coalesce(v_run -> 'sports', '[]')) as x),
      nullif(v_run ->> 'date_from', '')::date,
      nullif(v_run ->> 'date_to', '')::date,
      nullif(v_run ->> 'search_prompt_version', ''),
      nullif(v_run ->> 'search_prompt_text', ''),
      nullif(v_run ->> 'search_prompt_hash', ''),
      coalesce((v_run ->> 'search_prompt_truncated')::boolean, false),
      nullif(v_run ->> 'search_method', ''),
      nullif(v_run ->> 'research_agent', ''),
      nullif(v_run ->> 'research_model', ''),
      coalesce(nullif(v_run ->> 'searched_at', ''), v_now::text)::timestamptz,
      nullif(v_run ->> 'searched_by', ''),
      0, 0, 0, 0, 0, 0, 0,
      (select array_agg(x) from jsonb_array_elements_text(coalesce(v_run -> 'organizer_domains', '[]')) as x),
      (select array_agg(x) from jsonb_array_elements_text(coalesce(v_run -> 'organizer_names', '[]')) as x),
      (select array_agg(x) from jsonb_array_elements_text(coalesce(v_run -> 'venue_names', '[]')) as x),
      (select array_agg(x) from jsonb_array_elements_text(coalesce(v_run -> 'high_value_sources', '[]')) as x),
      nullif(v_run ->> 'search_summary', ''),
      nullif(v_run ->> 'unresolved_work', ''),
      nullif(v_run ->> 'next_action', ''),
      nullif(v_run ->> 'next_search_after', '')::date,
      nullif(v_run ->> 'seasonality_conclusion', ''),
      'in_progress',
      null,
      v_now,
      v_now
    );
  end if;

  -- -------------------------------------------------------------------------
  -- 2. Scopes: insert or retrieve, build scope_results array
  -- -------------------------------------------------------------------------
  for v_scope_entry in select * from jsonb_array_elements(coalesce(v_scopes, '[]'))
  loop
    v_scope_state := v_scope_entry ->> 'state';
    v_scope_sport := v_scope_entry ->> 'sport';

    insert into public.tournament_search_run_scopes (
      id, search_run_id, state, sport,
      candidates_found, qualified_rows, needs_venue_verification,
      needs_address_verification, needs_date_verification,
      duplicates_found, out_of_scope_found, created_at
    )
    values (
      gen_random_uuid(), v_run_id, v_scope_state, v_scope_sport,
      0, 0, 0, 0, 0, 0, 0, v_now
    )
    on conflict (search_run_id, state, sport) do nothing;

    select id into v_scope_id
      from public.tournament_search_run_scopes
     where search_run_id = v_run_id
       and state = v_scope_state
       and sport = v_scope_sport;

    v_scope_results := v_scope_results || jsonb_build_object(
      'input_index', jsonb_array_length(v_scope_results),
      'search_scope_id', v_scope_id,
      'state', v_scope_state,
      'sport', v_scope_sport
    );
  end loop;

  -- -------------------------------------------------------------------------
  -- 3. Findings: dedupe → insert → supersession
  -- -------------------------------------------------------------------------
  for v_finding in select * from jsonb_array_elements(coalesce(v_findings, '[]'))
  loop
    -- Resolve the scope UUID from resolved_scope_state + resolved_scope_sport
    select id into v_scope_id
      from public.tournament_search_run_scopes
     where search_run_id = v_run_id
       and state = (v_finding ->> 'resolved_scope_state')
       and sport = (v_finding ->> 'resolved_scope_sport');

    -- Build the finding deduplication key (mirrors TypeScript buildFindingDedupeKey)
    v_dedupe_key :=
      v_run_id::text || ' ' ||
      coalesce(trim(lower(v_finding ->> 'tournament_name')), '') || ' ' ||
      coalesce(trim(lower(v_finding ->> 'sport')), '') || ' ' ||
      coalesce((v_finding ->> 'start_date'), 'epoch') || ' ' ||
      coalesce((v_finding ->> 'end_date'), 'epoch') || ' ' ||
      coalesce(trim(lower(v_finding ->> 'venue_name')), '') || ' ' ||
      coalesce(trim(lower(v_finding ->> 'venue_state')), '');

    -- Check for existing current finding with same dedupe key (skip if this is a supersession)
    if (v_finding ->> 'supersedes_finding_id') is null then
      select f.id into v_existing_id
        from public.tournament_search_run_findings f
       where f.search_run_id = v_run_id
         and f.is_current = true
         and (
           v_run_id::text || ' ' ||
           coalesce(trim(lower(f.tournament_name)), '') || ' ' ||
           coalesce(trim(lower(f.sport)), '') || ' ' ||
           coalesce(f.start_date::text, 'epoch') || ' ' ||
           coalesce(f.end_date::text, 'epoch') || ' ' ||
           coalesce(trim(lower(f.venue_name)), '') || ' ' ||
           coalesce(trim(lower(f.venue_state)), '')
         ) = v_dedupe_key
       limit 1;
    else
      v_existing_id := null;
    end if;

    if v_existing_id is not null then
      v_reused_findings := v_reused_findings + 1;
      v_finding_ids := v_finding_ids || to_jsonb(v_existing_id::text);
    else
      v_finding_id := gen_random_uuid();

      insert into public.tournament_search_run_findings (
        id, search_run_id, search_scope_id, is_current,
        supersedes_finding_id, candidate_status,
        tournament_name, sport, start_date, end_date, state,
        source_url, venue_name, venue_address, venue_city,
        venue_state, venue_source_url, existing_tournament_id,
        organizer_name, organizer_domain, notes, created_at
      ) values (
        v_finding_id,
        v_run_id,
        v_scope_id,
        true,
        nullif(v_finding ->> 'supersedes_finding_id', '')::uuid,
        v_finding ->> 'candidate_status',
        nullif(trim(v_finding ->> 'tournament_name'), ''),
        nullif(trim(v_finding ->> 'sport'), ''),
        nullif(v_finding ->> 'start_date', '')::date,
        nullif(v_finding ->> 'end_date', '')::date,
        nullif(trim(v_finding ->> 'state'), ''),
        nullif(trim(v_finding ->> 'source_url'), ''),
        nullif(trim(v_finding ->> 'venue_name'), ''),
        nullif(trim(v_finding ->> 'venue_address'), ''),
        nullif(trim(v_finding ->> 'venue_city'), ''),
        nullif(trim(v_finding ->> 'venue_state'), ''),
        nullif(trim(v_finding ->> 'venue_source_url'), ''),
        nullif(v_finding ->> 'existing_tournament_id', '')::uuid,
        nullif(trim(v_finding ->> 'organizer_name'), ''),
        nullif(trim(v_finding ->> 'organizer_domain'), ''),
        nullif(trim(v_finding ->> 'notes'), ''),
        v_now
      );

      -- Mark prior finding as superseded
      if (v_finding ->> 'supersedes_finding_id') is not null then
        update public.tournament_search_run_findings
           set is_current = false
         where id = (v_finding ->> 'supersedes_finding_id')::uuid;
        v_superseded_findings := v_superseded_findings + 1;
      end if;

      v_inserted_findings := v_inserted_findings + 1;
      v_finding_ids := v_finding_ids || to_jsonb(v_finding_id::text);
    end if;
  end loop;

  -- -------------------------------------------------------------------------
  -- 4. Organizer intelligence: insert or reuse (no conflict on retry)
  -- -------------------------------------------------------------------------
  for v_intel in select * from jsonb_array_elements(coalesce(v_org_intel, '[]'))
  loop
    insert into public.tournament_search_organizer_intelligence (
      id, search_run_id,
      organizer_name, organizer_domain, confidence_level, evidence_summary,
      states, sports, tournament_families, venue_clusters,
      monitoring_urls, recommended_cadence, next_monitor_after,
      registration_platform, scheduling_platform, notes, created_at
    ) values (
      gen_random_uuid(),
      v_run_id,
      nullif(trim(v_intel ->> 'organizer_name'), ''),
      v_intel ->> 'organizer_domain',
      v_intel ->> 'confidence_level',
      v_intel ->> 'evidence_summary',
      (select array_agg(x) from jsonb_array_elements_text(coalesce(v_intel -> 'states', '[]')) as x),
      (select array_agg(x) from jsonb_array_elements_text(coalesce(v_intel -> 'sports', '[]')) as x),
      (select array_agg(x) from jsonb_array_elements_text(coalesce(v_intel -> 'tournament_families', '[]')) as x),
      (select array_agg(x) from jsonb_array_elements_text(coalesce(v_intel -> 'venue_clusters', '[]')) as x),
      (select array_agg(x) from jsonb_array_elements_text(coalesce(v_intel -> 'monitoring_urls', '[]')) as x),
      nullif(trim(v_intel ->> 'recommended_cadence'), ''),
      nullif(v_intel ->> 'next_monitor_after', '')::date,
      nullif(trim(v_intel ->> 'registration_platform'), ''),
      nullif(trim(v_intel ->> 'scheduling_platform'), ''),
      nullif(trim(v_intel ->> 'notes'), ''),
      v_now
    )
    on conflict (search_run_id, organizer_domain) do nothing;

    select id into v_intel_id
      from public.tournament_search_organizer_intelligence
     where search_run_id = v_run_id
       and organizer_domain = (v_intel ->> 'organizer_domain');

    -- Determine if it was just inserted (xmax = 0) or already existed
    -- Using a simpler approach: check if created_at = v_now
    if exists (
      select 1 from public.tournament_search_organizer_intelligence
       where id = v_intel_id and created_at = v_now
    ) then
      v_inserted_intel := v_inserted_intel + 1;
    else
      v_reused_intel := v_reused_intel + 1;
    end if;

    v_intel_record_ids := v_intel_record_ids || to_jsonb(v_intel_id::text);
  end loop;

  -- -------------------------------------------------------------------------
  -- 5. Metrics: aggregate from all current findings for this run
  -- -------------------------------------------------------------------------
  select
    count(*)                                                        filter (where true),
    count(*) filter (where candidate_status = 'Qualified'),
    count(*) filter (where candidate_status = 'Needs Venue Verification'),
    count(*) filter (where candidate_status = 'Needs Address Verification'),
    count(*) filter (where candidate_status = 'Needs Date Verification'),
    count(*) filter (where candidate_status = 'Duplicate'),
    count(*) filter (where candidate_status in (
      'Out of Scope - State', 'Out of Scope - Date', 'Out of Scope - Sport',
      'Not a Tournament', 'Other Exclusion'
    ))
  into
    v_candidates_found, v_qualified_rows, v_needs_venue_verification,
    v_needs_address_verification, v_needs_date_verification,
    v_duplicates_found, v_out_of_scope_found
  from public.tournament_search_run_findings
  where search_run_id = v_run_id and is_current = true;

  -- Update per-scope metrics
  update public.tournament_search_run_scopes s
  set
    candidates_found = sub.candidates_found,
    qualified_rows = sub.qualified_rows,
    needs_venue_verification = sub.needs_venue_verification,
    needs_address_verification = sub.needs_address_verification,
    needs_date_verification = sub.needs_date_verification,
    duplicates_found = sub.duplicates_found,
    out_of_scope_found = sub.out_of_scope_found
  from (
    select
      search_scope_id,
      count(*)                                                       filter (where true)              as candidates_found,
      count(*) filter (where candidate_status = 'Qualified')                                          as qualified_rows,
      count(*) filter (where candidate_status = 'Needs Venue Verification')                           as needs_venue_verification,
      count(*) filter (where candidate_status = 'Needs Address Verification')                         as needs_address_verification,
      count(*) filter (where candidate_status = 'Needs Date Verification')                            as needs_date_verification,
      count(*) filter (where candidate_status = 'Duplicate')                                          as duplicates_found,
      count(*) filter (where candidate_status in (
        'Out of Scope - State', 'Out of Scope - Date', 'Out of Scope - Sport',
        'Not a Tournament', 'Other Exclusion'
      ))                                                                                              as out_of_scope_found
    from public.tournament_search_run_findings
    where search_run_id = v_run_id and is_current = true
    group by search_scope_id
  ) sub
  where s.id = sub.search_scope_id;

  -- -------------------------------------------------------------------------
  -- 6. Update run: metrics, optional summary fields, optional finalize
  -- -------------------------------------------------------------------------
  if v_finalize then
    v_completed_at := v_now;
  else
    v_completed_at := null;
  end if;

  update public.tournament_search_runs
  set
    candidates_found             = v_candidates_found,
    qualified_rows               = v_qualified_rows,
    needs_venue_verification     = v_needs_venue_verification,
    needs_address_verification   = v_needs_address_verification,
    needs_date_verification      = v_needs_date_verification,
    duplicates_found             = v_duplicates_found,
    out_of_scope_found           = v_out_of_scope_found,
    search_summary               = coalesce(nullif(trim(v_run ->> 'search_summary'), ''), search_summary),
    unresolved_work              = coalesce(nullif(trim(v_run ->> 'unresolved_work'), ''), unresolved_work),
    next_action                  = coalesce(nullif(trim(v_run ->> 'next_action'), ''), next_action),
    next_search_after            = coalesce(nullif(v_run ->> 'next_search_after', '')::date, next_search_after),
    seasonality_conclusion       = coalesce(nullif(trim(v_run ->> 'seasonality_conclusion'), ''), seasonality_conclusion),
    status                       = case when v_finalize then 'completed' else status end,
    completed_at                 = case when v_finalize then v_completed_at else completed_at end,
    updated_at                   = v_now
  where id = v_run_id;

  -- -------------------------------------------------------------------------
  -- 7. Return receipt
  -- -------------------------------------------------------------------------
  return jsonb_build_object(
    'status', v_package_status,
    'search_run_id', v_run_id,
    'source_batch_id', v_source_batch_id,
    'scope_results', v_scope_results,
    'finding_results', jsonb_build_object(
      'inserted', v_inserted_findings,
      'reused', v_reused_findings,
      'superseded', v_superseded_findings,
      'finding_ids', v_finding_ids
    ),
    'organizer_intelligence_results', jsonb_build_object(
      'inserted', v_inserted_intel,
      'reused', v_reused_intel,
      'record_ids', v_intel_record_ids
    ),
    'metrics', jsonb_build_object(
      'candidates_found', v_candidates_found,
      'qualified_rows', v_qualified_rows,
      'needs_venue_verification', v_needs_venue_verification,
      'needs_address_verification', v_needs_address_verification,
      'needs_date_verification', v_needs_date_verification,
      'duplicates_found', v_duplicates_found,
      'out_of_scope_found', v_out_of_scope_found
    ),
    'finalized', v_finalize,
    'completed_at', case when v_finalize then v_completed_at else null end
  );

exception
  when others then
    raise exception 'insert_complete_search_package_rpc: % (SQLSTATE: %)', sqlerrm, sqlstate;
end;
$$;

-- Revoke public execute; only the service role (used by the MCP server) may call this.
revoke execute on function public.insert_complete_search_package_rpc(jsonb) from public;
