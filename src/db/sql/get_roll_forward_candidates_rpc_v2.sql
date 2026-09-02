-- Versioned roll-forward read RPC. The v1 function is intentionally untouched.
-- This migration creates only read helpers and a read-only SECURITY DEFINER RPC.

CREATE OR REPLACE FUNCTION public.roll_forward_tournament_year_v2(
  p_start_date date,
  p_slug text
)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN p_start_date IS NOT NULL THEN EXTRACT(YEAR FROM p_start_date)::int
    WHEN p_slug ~ '-[0-9]{4}$' THEN substring(p_slug from '([0-9]{4})$')::int
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.roll_forward_normalize_domain_v2(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(trim(p_url)), '^[a-z][a-z0-9+.-]*://', '', 'i'),
          '^www\.', '', 'i'
        ),
        '[/?#].*$', ''
      ),
      ':[0-9]+$', ''
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.roll_forward_normalize_family_v2(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(COALESCE(p_name, '')), '(^|[^0-9])(19|20)[0-9]{2}([^0-9]|$)', ' ', 'g'),
        '[^a-z0-9]+', ' ', 'g'
      ),
      '[[:space:]]+', ' ', 'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_roll_forward_candidates_rpc_v2(
  p_target_year            int,
  p_source_year            int  DEFAULT NULL,
  p_parent_start_date_from date DEFAULT NULL,
  p_parent_start_date_to   date DEFAULT NULL,
  p_sport                  text DEFAULT NULL,
  p_state                  text DEFAULT NULL,
  p_organizer_domain       text DEFAULT NULL,
  p_roll_forward_status    text DEFAULT NULL,
  p_sibling_status         text DEFAULT 'any',
  p_batch_label            text DEFAULT NULL,
  p_limit                  int  DEFAULT 25,
  p_offset                 int  DEFAULT 0,
  -- Internal anchors used by get_tournament_roll_forward_context. When either
  -- is supplied, source-year/date candidate filtering is bypassed.
  p_source_id              text DEFAULT NULL,
  p_source_slug            text DEFAULT NULL
)
RETURNS TABLE (row_data jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_source_year int := COALESCE(p_source_year, p_target_year - 1);
BEGIN
  IF p_target_year <= v_source_year AND p_source_id IS NULL AND p_source_slug IS NULL THEN
    RAISE EXCEPTION 'target_year must be greater than source_year';
  END IF;
  IF p_limit < 1 OR p_limit > 100 OR p_offset < 0 THEN
    RAISE EXCEPTION 'limit must be 1..100 and offset must be nonnegative';
  END IF;
  IF p_parent_start_date_from IS NOT NULL AND p_parent_start_date_to IS NOT NULL
     AND p_parent_start_date_from > p_parent_start_date_to THEN
    RAISE EXCEPTION 'parent_start_date_to must be on or after parent_start_date_from';
  END IF;
  IF p_roll_forward_status = 'unresearched' AND p_batch_label IS NOT NULL THEN
    RAISE EXCEPTION 'batch_label cannot be combined with roll_forward_status=unresearched';
  END IF;
  IF COALESCE(p_roll_forward_status, '') NOT IN (
    '', 'unresearched', 'pending', 'no_dates_announced', 'discontinued', 'done',
    'ambiguous', 'ready_to_create', 'linked_existing', 'any'
  ) THEN
    RAISE EXCEPTION 'invalid roll_forward_status';
  END IF;
  IF COALESCE(p_sibling_status, 'any') NOT IN ('no_confirmed_match', 'confirmed_match', 'any') THEN
    RAISE EXCEPTION 'invalid sibling_status';
  END IF;

  RETURN QUERY
  WITH source_rows AS (
    SELECT
      t.*,
      public.roll_forward_tournament_year_v2(t.start_date, t.slug) AS resolved_source_year,
      CASE
        WHEN t.start_date IS NOT NULL
         AND t.slug ~ '-[0-9]{4}$'
         AND EXTRACT(YEAR FROM t.start_date)::int <> substring(t.slug from '([0-9]{4})$')::int
        THEN ARRAY['source_start_date_year_conflicts_with_slug_year']::text[]
        ELSE ARRAY[]::text[]
      END AS source_warnings,
      public.roll_forward_normalize_domain_v2(t.official_website_url) AS normalized_domain,
      public.roll_forward_normalize_family_v2(t.name) AS normalized_family
    FROM public.tournaments t
    WHERE t.status = 'published'
      AND t.is_canonical IS TRUE
      AND (
        (p_source_id IS NOT NULL OR p_source_slug IS NOT NULL)
        OR public.roll_forward_tournament_year_v2(t.start_date, t.slug) = v_source_year
      )
      AND (p_source_id IS NULL OR t.id::text = p_source_id)
      AND (p_source_slug IS NULL OR t.slug = p_source_slug)
      AND (
        p_source_id IS NOT NULL OR p_source_slug IS NOT NULL
        OR p_parent_start_date_from IS NULL OR t.start_date >= p_parent_start_date_from
      )
      AND (
        p_source_id IS NOT NULL OR p_source_slug IS NOT NULL
        OR p_parent_start_date_to IS NULL OR t.start_date <= p_parent_start_date_to
      )
      AND (p_sport IS NULL OR lower(t.sport) = lower(p_sport))
      AND (p_state IS NULL OR upper(t.state) = upper(p_state))
      AND (
        p_organizer_domain IS NULL
        OR public.roll_forward_normalize_domain_v2(t.official_website_url)
           = public.roll_forward_normalize_domain_v2(p_organizer_domain)
      )
  ), joined AS (
    SELECT
      s.*,
      rfl.id AS rfl_id,
      rfl.status::text AS rfl_status,
      rfl.batch_label AS rfl_batch_label,
      rfl.notes AS rfl_notes,
      rfl.researched_at AS rfl_researched_at,
      rfl.sibling_id AS rfl_sibling_id,
      COALESCE(rfl.status::text, 'unresearched') AS resolved_roll_forward_status
    FROM source_rows s
    LEFT JOIN public.tournament_roll_forward_log rfl
      ON rfl.parent_tournament_id = s.id
     AND rfl.target_year = p_target_year
  ), enriched AS (
    SELECT
      j.*,
      COALESCE(v.venues, '[]'::jsonb) AS venues,
      COALESCE(v.venue_count, 0) AS venue_count,
      COALESCE(ex.matches, '[]'::jsonb) AS explicit_matches,
      COALESCE(dm.matches, '[]'::jsonb) AS deterministic_matches,
      COALESCE(lm.matches, '[]'::jsonb) AS likely_matches,
      CASE
        WHEN j.rfl_sibling_id IS NOT NULL THEN 'explicitly_linked'
        WHEN jsonb_array_length(COALESCE(dm.matches, '[]'::jsonb)) > 0 THEN 'deterministic_match'
        WHEN jsonb_array_length(COALESCE(lm.matches, '[]'::jsonb)) > 0 THEN 'likely_match_returned'
        ELSE 'no_match_returned'
      END AS sibling_match_state
    FROM joined j
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS venue_count,
        jsonb_agg(
          jsonb_build_object(
            'venue_id', v.id::text,
            'venue_name', v.name,
            'venue_address', v.address,
            'venue_city', v.city,
            'venue_state', v.state,
            'venue_zip', v.zip,
            'is_primary', tv.is_primary
          )
          ORDER BY COALESCE(tv.is_primary, false) DESC, v.name ASC NULLS LAST, v.id ASC
        ) AS venues
      FROM public.tournament_venues tv
      JOIN public.venues v ON v.id = tv.venue_id
      WHERE tv.tournament_id = j.id
    ) v ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_build_array(
        jsonb_build_object(
          'tournament_id', j.rfl_sibling_id::text,
          'slug', es.slug,
          'name', es.name,
          'start_date', es.start_date::text,
          'end_date', es.end_date::text,
          'state', es.state,
          'city', es.city,
          'official_website_url', es.official_website_url,
          'confidence', 'explicit',
          'match_reasons', jsonb_build_array('tournament_roll_forward_log.sibling_id'),
          'integrity_warnings', to_jsonb(array_remove(ARRAY[
            CASE WHEN es.id IS NULL THEN 'explicit_sibling_missing' END,
            CASE WHEN es.id IS NOT NULL AND (es.status <> 'published' OR es.is_canonical IS NOT TRUE)
                 THEN 'explicit_sibling_unpublished' END,
            CASE WHEN es.id IS NOT NULL
                       AND public.roll_forward_tournament_year_v2(es.start_date, es.slug) IS DISTINCT FROM p_target_year
                 THEN 'explicit_sibling_wrong_target_year' END,
            CASE WHEN es.id IS NOT NULL AND j.sport IS NOT NULL AND es.sport IS NOT NULL
                       AND lower(j.sport) <> lower(es.sport)
                 THEN 'explicit_sibling_sport_mismatch' END
          ]::text[], NULL))
        )
      ) AS matches
      FROM (SELECT 1) anchor
      LEFT JOIN public.tournaments es ON es.id = j.rfl_sibling_id
      WHERE j.rfl_sibling_id IS NOT NULL
    ) ex ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'tournament_id', ds.id::text,
          'slug', ds.slug,
          'name', ds.name,
          'start_date', ds.start_date::text,
          'end_date', ds.end_date::text,
          'state', ds.state,
          'city', ds.city,
          'official_website_url', ds.official_website_url,
          'confidence', 'deterministic',
          'match_reasons', jsonb_build_array('exact_year_adjusted_slug', 'same_sport', 'target_year')
        ) ORDER BY ds.start_date ASC NULLS LAST, ds.id ASC
      ) AS matches
      FROM public.tournaments ds
      WHERE j.rfl_sibling_id IS NULL
        AND j.slug ~ '-[0-9]{4}$'
        AND ds.id <> j.id
        AND ds.status = 'published'
        AND ds.is_canonical IS TRUE
        AND public.roll_forward_tournament_year_v2(ds.start_date, ds.slug) = p_target_year
        AND j.sport IS NOT NULL AND ds.sport IS NOT NULL AND lower(ds.sport) = lower(j.sport)
        AND ds.slug = regexp_replace(j.slug, '-[0-9]{4}$', '-' || p_target_year::text)
    ) dm ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'tournament_id', ls.id::text,
          'slug', ls.slug,
          'name', ls.name,
          'start_date', ls.start_date::text,
          'end_date', ls.end_date::text,
          'state', ls.state,
          'city', ls.city,
          'official_website_url', ls.official_website_url,
          'confidence', 'likely',
          'match_reasons', to_jsonb(array_remove(ARRAY[
            'normalized_family_name',
            'same_sport',
            'target_year',
            CASE WHEN j.state IS NOT NULL AND ls.state IS NOT NULL AND upper(j.state) = upper(ls.state)
                 THEN 'same_state' END,
            CASE WHEN j.city IS NOT NULL AND ls.city IS NOT NULL AND lower(j.city) = lower(ls.city)
                 THEN 'same_city' END,
            CASE WHEN j.normalized_domain IS NOT NULL
                       AND public.roll_forward_normalize_domain_v2(ls.official_website_url) = j.normalized_domain
                 THEN 'same_organizer_domain' END,
            CASE WHEN j.start_date IS NOT NULL AND ls.start_date IS NOT NULL
                       AND ls.start_date BETWEEN
                         (
                           make_date(
                             p_target_year,
                             EXTRACT(MONTH FROM j.start_date)::int,
                             LEAST(
                               EXTRACT(DAY FROM j.start_date)::int,
                               EXTRACT(DAY FROM (
                                 date_trunc('month', make_date(p_target_year, EXTRACT(MONTH FROM j.start_date)::int, 1))
                                 + interval '1 month - 1 day'
                               ))::int
                             )
                           ) - 45
                         )
                         AND
                         (
                           make_date(
                             p_target_year,
                             EXTRACT(MONTH FROM j.start_date)::int,
                             LEAST(
                               EXTRACT(DAY FROM j.start_date)::int,
                               EXTRACT(DAY FROM (
                                 date_trunc('month', make_date(p_target_year, EXTRACT(MONTH FROM j.start_date)::int, 1))
                                 + interval '1 month - 1 day'
                               ))::int
                             )
                           ) + 45
                         )
                 THEN 'within_45_day_seasonal_window' END
          ]::text[], NULL))
        ) ORDER BY ls.start_date ASC NULLS LAST, ls.id ASC
      ) AS matches
      FROM public.tournaments ls
      WHERE j.rfl_sibling_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.tournaments exact_sibling
          WHERE j.slug ~ '-[0-9]{4}$'
            AND exact_sibling.status = 'published'
            AND exact_sibling.is_canonical IS TRUE
            AND public.roll_forward_tournament_year_v2(exact_sibling.start_date, exact_sibling.slug) = p_target_year
            AND j.sport IS NOT NULL AND exact_sibling.sport IS NOT NULL
            AND lower(exact_sibling.sport) = lower(j.sport)
            AND exact_sibling.slug = regexp_replace(j.slug, '-[0-9]{4}$', '-' || p_target_year::text)
        )
        AND ls.id <> j.id
        AND ls.status = 'published'
        AND ls.is_canonical IS TRUE
        AND public.roll_forward_tournament_year_v2(ls.start_date, ls.slug) = p_target_year
        AND j.sport IS NOT NULL AND ls.sport IS NOT NULL AND lower(ls.sport) = lower(j.sport)
        AND j.normalized_family <> ''
        AND public.roll_forward_normalize_family_v2(ls.name) = j.normalized_family
        AND (
          (j.state IS NOT NULL AND ls.state IS NOT NULL AND upper(j.state) = upper(ls.state))
          OR (j.city IS NOT NULL AND ls.city IS NOT NULL AND lower(j.city) = lower(ls.city))
          OR (j.normalized_domain IS NOT NULL
              AND public.roll_forward_normalize_domain_v2(ls.official_website_url) = j.normalized_domain)
          OR (
            j.start_date IS NOT NULL AND ls.start_date IS NOT NULL
            AND ls.start_date BETWEEN
              make_date(
                p_target_year,
                EXTRACT(MONTH FROM j.start_date)::int,
                LEAST(
                  EXTRACT(DAY FROM j.start_date)::int,
                  EXTRACT(DAY FROM (
                    date_trunc('month', make_date(p_target_year, EXTRACT(MONTH FROM j.start_date)::int, 1))
                    + interval '1 month - 1 day'
                  ))::int
                )
              ) - 45
              AND
              make_date(
                p_target_year,
                EXTRACT(MONTH FROM j.start_date)::int,
                LEAST(
                  EXTRACT(DAY FROM j.start_date)::int,
                  EXTRACT(DAY FROM (
                    date_trunc('month', make_date(p_target_year, EXTRACT(MONTH FROM j.start_date)::int, 1))
                    + interval '1 month - 1 day'
                  ))::int
                )
              ) + 45
          )
        )
    ) lm ON true
  ), filtered AS (
    SELECT *
    FROM enriched e
    WHERE (
      p_batch_label IS NULL OR (e.rfl_id IS NOT NULL AND e.rfl_batch_label = p_batch_label)
    )
      AND (
        p_roll_forward_status = 'any'
        OR (p_roll_forward_status IS NOT NULL AND e.resolved_roll_forward_status = p_roll_forward_status)
        OR (
          p_roll_forward_status IS NULL AND
          CASE
            WHEN p_batch_label IS NOT NULL
              THEN e.resolved_roll_forward_status IN ('pending', 'no_dates_announced', 'ambiguous', 'done', 'discontinued')
            ELSE e.resolved_roll_forward_status IN ('unresearched', 'pending', 'no_dates_announced', 'ambiguous')
          END
        )
      )
      AND (
        COALESCE(p_sibling_status, 'any') = 'any'
        OR (p_sibling_status = 'confirmed_match'
            AND e.sibling_match_state IN ('explicitly_linked', 'deterministic_match'))
        OR (p_sibling_status = 'no_confirmed_match'
            AND e.sibling_match_state IN ('likely_match_returned', 'no_match_returned'))
      )
  )
  SELECT jsonb_build_object(
    'source_id', f.id::text,
    'source_slug', f.slug,
    'source_name', f.name,
    'source_sport', f.sport,
    'source_state', f.state,
    'source_city', f.city,
    'source_address', f.address,
    'source_zip', f.zip,
    'source_start_date', f.start_date::text,
    'source_end_date', f.end_date::text,
    'source_official_website_url', f.official_website_url,
    'organizer_domain', f.normalized_domain,
    'tournament_director', f.tournament_director,
    'tournament_director_email', f.tournament_director_email,
    'source_year', f.resolved_source_year,
    'target_year', p_target_year,
    'roll_forward_status', f.resolved_roll_forward_status,
    'roll_forward_log_id', f.rfl_id::text,
    'roll_forward_batch_label', f.rfl_batch_label,
    'roll_forward_notes', f.rfl_notes,
    'roll_forward_researched_at', f.rfl_researched_at,
    'sibling_match_state', f.sibling_match_state,
    'sibling_matches', CASE f.sibling_match_state
      WHEN 'explicitly_linked' THEN f.explicit_matches
      WHEN 'deterministic_match' THEN f.deterministic_matches
      WHEN 'likely_match_returned' THEN f.likely_matches
      ELSE '[]'::jsonb
    END,
    'parent_venue_count', f.venue_count,
    'venues', f.venues,
    'venue_roll_forward_policy', 'inherit_parent_unless_changed',
    'data_quality_warnings', to_jsonb(f.source_warnings)
  )
  FROM filtered f
  ORDER BY f.start_date ASC NULLS LAST, f.name ASC NULLS LAST, f.id ASC
  LIMIT p_limit + 1
  OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.roll_forward_tournament_year_v2(date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.roll_forward_normalize_domain_v2(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.roll_forward_normalize_family_v2(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_roll_forward_candidates_rpc_v2(
  int, int, date, date, text, text, text, text, text, text, int, int, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.roll_forward_tournament_year_v2(date, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.roll_forward_normalize_domain_v2(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.roll_forward_normalize_family_v2(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_roll_forward_candidates_rpc_v2(
  int, int, date, date, text, text, text, text, text, text, int, int, text, text
) TO service_role;
