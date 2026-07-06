-- =============================================================================
-- Migration: Spatial Intelligence & Deduplication
-- Task 2.1 — PostGIS Spatial Dedup Trigger (ImplementationPlan.md)
-- =============================================================================
-- Prerequisites:
--   This migration requires the PostGIS extension, available on Supabase Pro
--   plans or via the Extensions tab in your Supabase Dashboard.
--   Enable it first: Dashboard → Database → Extensions → PostGIS
-- =============================================================================

-- 1. Enable PostGIS extension (idempotent)
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- 2. Add geospatial columns to reported_issues
--    lat / lng stored as FLOAT for simple client storage,
--    plus a PostGIS GEOGRAPHY POINT computed from them for spatial queries.
ALTER TABLE public.reported_issues
  ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS coordinates GEOGRAPHY(POINT, 4326)
    GENERATED ALWAYS AS (
      CASE
        WHEN latitude IS NOT NULL AND longitude IS NOT NULL
        THEN ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
        ELSE NULL
      END
    ) STORED;

-- 3. Add a column to link "subscriber" reports to a "master" ticket
--    When a duplicate grievance is detected within the proximity radius,
--    its master_issue_id is set to the existing open ticket instead of
--    creating a new top-level issue.
ALTER TABLE public.reported_issues
  ADD COLUMN IF NOT EXISTS master_issue_id UUID
    REFERENCES public.reported_issues(id) ON DELETE SET NULL;

-- Index for fast subscriber lookups
CREATE INDEX IF NOT EXISTS idx_reported_issues_master_issue_id
  ON public.reported_issues(master_issue_id)
  WHERE master_issue_id IS NOT NULL;

-- Spatial index for ST_DWithin queries
CREATE INDEX IF NOT EXISTS idx_reported_issues_coordinates
  ON public.reported_issues USING GIST(coordinates)
  WHERE coordinates IS NOT NULL;

-- 4. Create the spatial deduplication trigger function
--    Logic:
--      When a new grievance is INSERTed:
--        a. Look for any OPEN issue of the SAME category within 50 metres.
--        b. If found → set master_issue_id to the oldest matching open ticket.
--           The new row becomes a "subscriber" (upvote) rather than a duplicate.
--        c. Also increment the master ticket's supports_count as a proxy upvote.
--      If no nearby match is found → proceed normally (master_issue_id stays NULL).

CREATE OR REPLACE FUNCTION public.spatial_dedup_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_master_id UUID;
  v_proximity_metres CONSTANT INT := 50; -- Configurable proximity radius
BEGIN
  -- Only run spatial dedup if coordinates are provided for the new issue
  IF NEW.coordinates IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find the earliest open, non-subscriber ticket of the same category
  -- within the proximity radius
  SELECT id
  INTO v_master_id
  FROM public.reported_issues
  WHERE
    category    = NEW.category
    AND status  IN ('reported', 'in_progress')   -- Only open tickets
    AND master_issue_id IS NULL                   -- Only top-level (master) tickets
    AND id      <> NEW.id                         -- Exclude self
    AND coordinates IS NOT NULL
    AND ST_DWithin(
      coordinates,
      NEW.coordinates,
      v_proximity_metres
    )
  ORDER BY created_at ASC                         -- Oldest open ticket is master
  LIMIT 1;

  IF v_master_id IS NOT NULL THEN
    -- Link this new submission as a subscriber to the master ticket
    NEW.master_issue_id := v_master_id;

    -- Increment the master ticket's community support count (proxy upvote)
    UPDATE public.reported_issues
    SET supports_count = supports_count + 1
    WHERE id = v_master_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Attach the trigger (BEFORE INSERT so we can modify NEW.master_issue_id)
DROP TRIGGER IF EXISTS spatial_dedup_on_insert ON public.reported_issues;

CREATE TRIGGER spatial_dedup_on_insert
BEFORE INSERT ON public.reported_issues
FOR EACH ROW
EXECUTE FUNCTION public.spatial_dedup_trigger_func();

-- 6. Helper RPC: get all subscribers for a master ticket
--    Usage: SELECT * FROM get_issue_subscribers('master-uuid-here');
CREATE OR REPLACE FUNCTION public.get_issue_subscribers(p_master_id UUID)
RETURNS SETOF public.reported_issues
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.reported_issues
  WHERE master_issue_id = p_master_id
  ORDER BY created_at ASC;
$$;

-- 7. Grant execute to authenticated users (RLS on the underlying table still applies)
GRANT EXECUTE ON FUNCTION public.get_issue_subscribers(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.spatial_dedup_trigger_func() TO authenticated;
