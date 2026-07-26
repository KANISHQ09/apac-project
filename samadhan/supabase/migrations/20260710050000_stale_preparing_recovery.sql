-- =============================================================================
-- Migration: Stale Preparing Recovery (Fixing stuck AI planning states)
-- =============================================================================

-- Safe one-time repair:
-- Transition any currently stale 'pending' or 'analyzing' issue records
-- (older than 15 seconds) to 'failed' so the UI doesn't spin forever.
UPDATE public.reported_issues
SET ai_status = 'failed',
    updated_at = now()
WHERE ai_status IN ('pending', 'analyzing')
  AND (
    (ai_request_started_at IS NULL AND now() - created_at > INTERVAL '15 seconds')
    OR (ai_request_started_at IS NOT NULL AND now() - ai_request_started_at > INTERVAL '15 seconds')
  );
