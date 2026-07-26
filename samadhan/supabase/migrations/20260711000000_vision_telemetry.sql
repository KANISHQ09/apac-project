-- =============================================================================
-- Migration: AI Vision Telemetry & Pre-Detection Tracking Columns
-- =============================================================================

ALTER TABLE public.reported_issues
  ADD COLUMN IF NOT EXISTS ai_detected_issue TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_risk TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_priority TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_objects TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS ai_bounding_boxes JSONB DEFAULT NULL;
