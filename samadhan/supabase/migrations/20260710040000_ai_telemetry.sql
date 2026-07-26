-- =============================================================================
-- Migration: AI Performance Telemetry Schema Update
-- =============================================================================

ALTER TABLE public.reported_issues
  ADD COLUMN IF NOT EXISTS ai_request_started_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_response_received_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_plan_ready_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_latency_ms INTEGER DEFAULT NULL;
