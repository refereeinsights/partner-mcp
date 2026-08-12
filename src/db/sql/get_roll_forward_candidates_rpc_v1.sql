-- RPC: get_roll_forward_candidates
-- Returns published source-year tournaments that appear to lack a target-year
-- sibling and have not yet completed roll-forward research. Intended for
-- GPT research agents; does not write anything.
--
-- Source-year detection:
--   Primary:   slug ends with -{source_year} (e.g. cal-cup-2026)
--   Secondary: yearless slug + start_date falls in source_year
--
-- Sibling detection (slug-year matches only):
--   Derives expected target slug via string replacement and checks production.
--   Yearless-slug candidates have expected_target_slug = NULL — no slug-based
--   sibling check is possible; year_source = 'start_date' indicates this.
--
-- Log exclusions:
--   Excludes source/target pairs whose log status is 'done' or 'discontinued'.
--   Returns candidates with pending/no_dates_announced/ambiguous log rows so
--   GPT researchers can see prior research state.
--
-- Ordering: start_date ASC NULLS LAST, id ASC (deterministic for stable paging)

CREATE OR REPLACE FUNCTION get_roll_forward_candidates_rpc(
  p_source_year int,
  p_target_year int,
  p_sport       text DEFAULT NULL,
  p_state       text DEFAULT NULL,
  p_limit       int  DEFAULT 25,
  p_offset      int  DEFAULT 0
)
RETURNS TABLE (
  source_id                        text,
  source_name                      text,
  source_slug                      text,
  source_sport                     text,
  source_state                     text,
  source_city                      text,
  source_address                   text,
  source_zip                       text,
  source_start_date                text,
  source_end_date                  text,
  source_status                    text,
  source_official_website_url      text,
  source_tournament_director       text,
  source_tournament_director_email text,
  year_source                      text,
  expected_target_slug             text,
  log_id                           text,
  log_status                       text,
  log_batch_label                  text,
  venue_count                      bigint,
  venue_names                      text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    t.id::text                                  AS source_id,
    t.name                                      AS source_name,
    t.slug                                      AS source_slug,
    t.sport                                     AS source_sport,
    t.state                                     AS source_state,
    t.city                                      AS source_city,
    t.address                                   AS source_address,
    t.zip                                       AS source_zip,
    t.start_date::text                          AS source_start_date,
    t.end_date::text                            AS source_end_date,
    t.status                                    AS source_status,
    t.official_website_url                      AS source_official_website_url,
    t.tournament_director                       AS source_tournament_director,
    t.tournament_director_email                 AS source_tournament_director_email,
    CASE
      WHEN t.slug ~ ('-' || p_source_year::text || '$') THEN 'slug'
      ELSE 'start_date'
    END                                         AS year_source,
    CASE
      WHEN t.slug ~ ('-' || p_source_year::text || '$')
        THEN regexp_replace(
               t.slug,
               '-' || p_source_year::text || '$',
               '-' || p_target_year::text
             )
      ELSE NULL
    END                                         AS expected_target_slug,
    rfl.id::text                                AS log_id,
    rfl.status::text                            AS log_status,
    rfl.batch_label                             AS log_batch_label,
    COALESCE(vc.venue_count, 0)                 AS venue_count,
    COALESCE(vc.venue_names, ARRAY[]::text[])   AS venue_names
  FROM tournaments t

  LEFT JOIN tournament_roll_forward_log rfl
    ON  rfl.parent_tournament_id = t.id
    AND rfl.target_year = p_target_year

  -- Lateral venue aggregation: only executed for matched rows (efficient).
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)                                                              AS venue_count,
      array_agg(v.name ORDER BY v.name)
        FILTER (WHERE v.name IS NOT NULL)                                   AS venue_names
    FROM tournament_venues tv
    JOIN venues v ON v.id = tv.venue_id
    WHERE tv.tournament_id = t.id
  ) vc ON true

  WHERE
    t.status = 'published'
    AND (
      -- Primary: slug ends with -{source_year}
      t.slug ~ ('-' || p_source_year::text || '$')
      OR (
        -- Secondary: yearless slug, start_date year matches source_year
        t.slug IS NOT NULL
        AND t.slug !~ '-[0-9]{4}$'
        AND t.start_date IS NOT NULL
        AND EXTRACT(YEAR FROM t.start_date)::int = p_source_year
      )
    )
    AND (p_sport IS NULL OR t.sport = p_sport)
    AND (p_state IS NULL OR t.state = p_state)
    -- Exclude pairs already completed in the log
    AND (rfl.id IS NULL OR rfl.status NOT IN ('done', 'discontinued'))
    -- For slug-based candidates: exclude if target-year sibling already exists
    AND NOT (
      t.slug ~ ('-' || p_source_year::text || '$')
      AND EXISTS (
        SELECT 1
        FROM   tournaments sibling
        WHERE  sibling.slug = regexp_replace(
                 t.slug,
                 '-' || p_source_year::text || '$',
                 '-' || p_target_year::text
               )
      )
    )

  ORDER BY t.start_date ASC NULLS LAST, t.id ASC
  LIMIT  p_limit
  OFFSET p_offset;
$$;

-- Only the service role may call this function.
REVOKE ALL ON FUNCTION get_roll_forward_candidates_rpc(int, int, text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_roll_forward_candidates_rpc(int, int, text, text, int, int) TO service_role;
