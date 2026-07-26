-- =============================================================================
-- Migration: Add AI Performance, Correction, and Classification Metrics
-- =============================================================================

ALTER TABLE public.reported_issues
  ADD COLUMN IF NOT EXISTS ai_category TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_detection_time_ms INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_citizen_corrected BOOLEAN DEFAULT FALSE;
