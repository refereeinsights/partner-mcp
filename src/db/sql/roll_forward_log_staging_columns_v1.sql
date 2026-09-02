-- Add target-year staging columns to tournament_roll_forward_log for V2 research workflow.
-- These fields are written by upsert_roll_forward_log and read by get_roll_forward_log.
-- All columns are nullable; existing rows are unaffected.
--
-- Apply via Supabase SQL editor or migration runner. Idempotent via IF NOT EXISTS.
--
-- Also adds the two new research statuses (ready_to_create, linked_existing) to the
-- existing status CHECK constraint. Supabase does not support ALTER TABLE ... DROP CONSTRAINT
-- by name in a portable way, so this migration drops and re-adds the constraint if needed.
-- If no CHECK constraint exists on the status column, the ADD CONSTRAINT below adds it fresh.

ALTER TABLE public.tournament_roll_forward_log
  ADD COLUMN IF NOT EXISTS target_name             text,
  ADD COLUMN IF NOT EXISTS target_start_date        date,
  ADD COLUMN IF NOT EXISTS target_end_date          date,
  ADD COLUMN IF NOT EXISTS target_source_url        text,
  ADD COLUMN IF NOT EXISTS target_venue_name        text,
  ADD COLUMN IF NOT EXISTS target_venue_address     text,
  ADD COLUMN IF NOT EXISTS target_venue_city        text,
  ADD COLUMN IF NOT EXISTS target_venue_state       char(2),
  ADD COLUMN IF NOT EXISTS target_venue_source_url  text,
  ADD COLUMN IF NOT EXISTS target_organizer_domain  text,
  ADD COLUMN IF NOT EXISTS production_match_id      uuid,
  ADD COLUMN IF NOT EXISTS match_confidence         text,
  ADD COLUMN IF NOT EXISTS recommended_action       text,
  ADD COLUMN IF NOT EXISTS verified_dates           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_source          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_venue           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_youth_scope     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_checked_at          timestamptz,
  ADD COLUMN IF NOT EXISTS next_check_at            timestamptz;

-- Optional FK: production_match_id → tournaments.id (add if the tournaments table exists)
-- ALTER TABLE public.tournament_roll_forward_log
--   ADD CONSTRAINT fk_roll_forward_production_match
--     FOREIGN KEY (production_match_id) REFERENCES public.tournaments(id);

-- CHECK constraints for match_confidence and recommended_action (safe to run repeatedly):
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_roll_forward_match_confidence'
      AND conrelid = 'public.tournament_roll_forward_log'::regclass
  ) THEN
    ALTER TABLE public.tournament_roll_forward_log
      ADD CONSTRAINT chk_roll_forward_match_confidence
        CHECK (match_confidence IN ('explicit', 'deterministic', 'likely'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_roll_forward_recommended_action'
      AND conrelid = 'public.tournament_roll_forward_log'::regclass
  ) THEN
    ALTER TABLE public.tournament_roll_forward_log
      ADD CONSTRAINT chk_roll_forward_recommended_action
        CHECK (recommended_action IN ('link_existing', 'create_new', 'manual_review'));
  END IF;
END $$;

-- Update the status column to accept the two new V2 research statuses.
-- The existing V1 statuses (pending, no_dates_announced, discontinued, done, ambiguous)
-- remain unchanged; we extend the allowed set.
DO $$
BEGIN
  -- Drop existing status check constraint if present (Supabase may name it automatically).
  DECLARE
    v_conname text;
  BEGIN
    SELECT conname INTO v_conname
    FROM pg_constraint
    WHERE conrelid = 'public.tournament_roll_forward_log'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%';
    IF v_conname IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.tournament_roll_forward_log DROP CONSTRAINT %I', v_conname);
    END IF;
  END;
  -- Add updated status constraint with all V2 values.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_roll_forward_status'
      AND conrelid = 'public.tournament_roll_forward_log'::regclass
  ) THEN
    ALTER TABLE public.tournament_roll_forward_log
      ADD CONSTRAINT chk_roll_forward_status
        CHECK (status IN (
          'pending', 'no_dates_announced', 'discontinued', 'done', 'ambiguous',
          'unresearched', 'ready_to_create', 'linked_existing'
        ));
  END IF;
END $$;
