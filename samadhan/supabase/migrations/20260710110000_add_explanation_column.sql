-- Add explanation column to ai_coordination_plans table to support manual plan explanation storage
ALTER TABLE public.ai_coordination_plans ADD COLUMN IF NOT EXISTS explanation TEXT;
