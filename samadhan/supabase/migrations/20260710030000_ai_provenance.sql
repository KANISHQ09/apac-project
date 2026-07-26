-- =============================================================================
-- Migration: AI Provenance & Data Origin Schema Update (Phase 2)
-- =============================================================================

-- 1. Add AI provenance & data origin columns to reported_issues
ALTER TABLE public.reported_issues
  ADD COLUMN IF NOT EXISTS data_origin TEXT DEFAULT NULL
    CHECK (data_origin IN ('citizen_live', 'seeded_demo', 'e2e_test', 'system_generated')),
  ADD COLUMN IF NOT EXISTS ai_provider TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_model TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_confidence DECIMAL(4, 3) DEFAULT NULL
    CHECK (ai_confidence >= 0 AND ai_confidence <= 1),
  ADD COLUMN IF NOT EXISTS ai_status TEXT DEFAULT NULL
    CHECK (ai_status IN ('pending', 'analyzing', 'done', 'failed'));

-- 2. Backfill existing issues inserted by seed/system scripts
-- All legacy issues get 'seeded_demo' if they belong to seeded admin accounts
UPDATE public.reported_issues
SET data_origin = 'seeded_demo'
WHERE user_id IN (
  SELECT id FROM auth.users 
  WHERE raw_user_meta_data->>'is_mock_seed' = 'true'
);

-- For any other legacy issues, mark as 'citizen_live'
UPDATE public.reported_issues
SET data_origin = 'citizen_live'
WHERE data_origin IS NULL;

-- 3. Redefine create_civic_case_with_participation RPC to support data_origin & default pending AI classification
DROP FUNCTION IF EXISTS public.create_civic_case_with_participation(UUID, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT[]);

CREATE OR REPLACE FUNCTION public.create_civic_case_with_participation(
  p_user_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_category TEXT,
  p_location TEXT,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_image_urls TEXT[],
  p_data_origin TEXT DEFAULT 'citizen_live'
)
RETURNS public.reported_issues
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_issue public.reported_issues;
  v_dept_key TEXT;
  v_ai_status TEXT;
BEGIN
  -- 1. Resolve category to department key
  v_dept_key := CASE 
    WHEN p_category IN ('Water Supply', 'जल आपूर्ति') THEN 'water_supply'
    WHEN p_category IN ('Sanitation', 'स्वच्छता') THEN 'sanitation'
    WHEN p_category IN ('Electricity', 'बिजली') THEN 'electricity'
    WHEN p_category IN ('Roads', 'सड़कें') THEN 'roads'
    WHEN p_category IN ('Parks & Gardens', 'पार्क और बगीचे') THEN 'parks'
    WHEN p_category IN ('Buildings', 'भवन') THEN 'buildings'
    ELSE LOWER(REPLACE(p_category, ' ', '_'))
  END;

  -- 2. Set default AI status based on origin (only run classification for live citizen submissions)
  v_ai_status := CASE 
    WHEN p_data_origin = 'citizen_live' THEN 'pending'
    ELSE NULL
  END;

  -- 3. Insert reported_issues (Master Case)
  INSERT INTO public.reported_issues (
    user_id,
    title,
    description,
    category,
    location,
    latitude,
    longitude,
    image_urls,
    status,
    coordination_type,
    coordination_status,
    lead_department,
    coordination_started_at,
    data_origin,
    ai_status
  ) VALUES (
    p_user_id,
    p_title,
    p_description,
    p_category,
    p_location,
    p_latitude,
    p_longitude,
    p_image_urls,
    'reported',
    'single_department',
    'intake',
    v_dept_key,
    now(),
    p_data_origin,
    v_ai_status
  )
  RETURNING * INTO v_new_issue;

  -- 4. Insert LEAD participation
  INSERT INTO public.case_participations (
    case_id,
    department,
    participation_role,
    status,
    responsibility_reason,
    added_by,
    added_source
  ) VALUES (
    v_new_issue.id,
    v_dept_key,
    'LEAD',
    'ACTIVE',
    'Lead department assigned during initial citizen submission.',
    p_user_id,
    'INITIAL_CATEGORY'
  );

  RETURN v_new_issue;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.create_civic_case_with_participation(UUID, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT[], TEXT) TO authenticated;
