-- =============================================================================
-- Migration: Add Hybrid Vision Telemetry & Mapping Columns
-- =============================================================================

ALTER TABLE public.reported_issues
  ADD COLUMN IF NOT EXISTS ai_supporting_departments TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS ai_requires_multiple_departments BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_estimated_response_time TEXT DEFAULT NULL;
