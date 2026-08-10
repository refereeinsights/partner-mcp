-- RPC: get_state_sport_coverage
-- Replaces the JS-side fetchAllPaginated + in-memory GROUP BY approach,
-- which undercounts when the Supabase project max-rows cap is below the
-- total tournament count. This function aggregates server-side so counts
-- are always exact regardless of row limits.

CREATE OR REPLACE FUNCTION get_state_sport_coverage_rpc(
  p_sports text[] DEFAULT NULL,
  p_states text[] DEFAULT NULL
)
RETURNS TABLE (
  sport                       text,
  state                       text,
  tournament_count            bigint,
  missing_website_count       bigint,
  missing_director_email_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COALESCE(t.sport, 'unknown')  AS sport,
    COALESCE(t.state, '')         AS state,
    COUNT(*)                      AS tournament_count,
    COUNT(*) FILTER (
      WHERE t.official_website_url IS NULL OR t.official_website_url = ''
    )                             AS missing_website_count,
    COUNT(*) FILTER (
      WHERE t.tournament_director_email IS NULL OR t.tournament_director_email = ''
    )                             AS missing_director_email_count
  FROM tournaments t
  WHERE
    (p_sports IS NULL OR t.sport = ANY(p_sports))
    AND (p_states IS NULL OR t.state = ANY(p_states))
  GROUP BY t.sport, t.state
  ORDER BY tournament_count DESC;
$$;

-- Only the service role may call this function.
REVOKE ALL ON FUNCTION get_state_sport_coverage_rpc(text[], text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_state_sport_coverage_rpc(text[], text[]) TO service_role;
