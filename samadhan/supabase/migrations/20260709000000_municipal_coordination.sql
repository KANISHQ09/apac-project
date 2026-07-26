-- =============================================================================
-- Migration: Municipal Coordination OS Foundation (Prompt 1)
-- =============================================================================

-- 1. Create sequence for human-readable case numbers
CREATE SEQUENCE IF NOT EXISTS public.reported_issues_case_number_seq;

-- 2. Add coordination columns to reported_issues
ALTER TABLE public.reported_issues
  ADD COLUMN IF NOT EXISTS case_number TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS coordination_type TEXT DEFAULT 'single_department' CHECK (coordination_type IN ('single_department', 'multi_department', 'emergency')),
  ADD COLUMN IF NOT EXISTS coordination_status TEXT DEFAULT 'intake' CHECK (coordination_status IN ('intake', 'participation_pending', 'coordinated', 'active', 'blocked', 'closure_pending', 'closed')),
  ADD COLUMN IF NOT EXISTS lead_department TEXT,
  ADD COLUMN IF NOT EXISTS coordination_version INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS coordination_started_at TIMESTAMPTZ;

-- 3. Create helper function to format case number on insert
CREATE OR REPLACE FUNCTION public.assign_case_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.case_number IS NULL THEN
    NEW.case_number := 'SAM-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.reported_issues_case_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_assign_case_number ON public.reported_issues;
CREATE TRIGGER trigger_assign_case_number
  BEFORE INSERT ON public.reported_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_case_number();

-- 4. Create case_participations table
CREATE TABLE IF NOT EXISTS public.case_participations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.reported_issues(id) ON DELETE CASCADE NOT NULL,
  department TEXT NOT NULL, -- 'water_supply', 'sanitation', 'electricity', 'roads', 'parks', 'buildings'
  participation_role TEXT NOT NULL CHECK (participation_role IN ('LEAD', 'RESPONSIBLE', 'SUPPORTING', 'CONSULTED', 'OBSERVER')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PROPOSED', 'ACTIVE', 'REMOVED')),
  responsibility_reason TEXT,
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  added_source TEXT NOT NULL CHECK (added_source IN ('INITIAL_CATEGORY', 'HUMAN_COORDINATOR', 'SUPER_ADMIN', 'SYSTEM_BACKFILL')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_case_participations_case_id ON public.case_participations(case_id);
CREATE INDEX IF NOT EXISTS idx_case_participations_dept ON public.case_participations(department);

-- Unique constraint: prevent multiple active participations for same department on a case
CREATE UNIQUE INDEX IF NOT EXISTS idx_case_participations_active_unique
  ON public.case_participations(case_id, department)
  WHERE (status = 'ACTIVE');

-- Unique constraint: exactly one active LEAD per case
CREATE UNIQUE INDEX IF NOT EXISTS idx_case_participations_lead_unique
  ON public.case_participations(case_id)
  WHERE (status = 'ACTIVE' AND participation_role = 'LEAD');

-- 5. Trigger to update timestamps on case_participations
DROP TRIGGER IF EXISTS update_case_participations_updated_at ON public.case_participations;
CREATE TRIGGER update_case_participations_updated_at
  BEFORE UPDATE ON public.case_participations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Idempotent backfill of existing issues
DO $$
DECLARE
  r RECORD;
  v_dept_key TEXT;
  v_case_num TEXT;
BEGIN
  FOR r IN SELECT * FROM public.reported_issues LOOP
    -- Assign case number if missing
    IF r.case_number IS NULL THEN
      v_case_num := 'SAM-' || to_char(r.created_at, 'YYYY') || '-' || lpad(nextval('public.reported_issues_case_number_seq')::text, 6, '0');
      UPDATE public.reported_issues SET case_number = v_case_num WHERE id = r.id;
    END IF;

    -- Resolve category label to department key
    v_dept_key := CASE 
      WHEN r.category IN ('Water Supply', 'जल आपूर्ति') THEN 'water_supply'
      WHEN r.category IN ('Sanitation', 'स्वच्छता') THEN 'sanitation'
      WHEN r.category IN ('Electricity', 'बिजली') THEN 'electricity'
      WHEN r.category IN ('Roads', 'सड़कें') THEN 'roads'
      WHEN r.category IN ('Parks & Gardens', 'पार्क और बगीचे') THEN 'parks'
      WHEN r.category IN ('Buildings', 'भवन') THEN 'buildings'
      ELSE LOWER(REPLACE(r.category, ' ', '_'))
    END;

    -- Update lead department in reported_issues if null
    UPDATE public.reported_issues
    SET lead_department = v_dept_key
    WHERE id = r.id AND lead_department IS NULL;

    -- Insert active LEAD case participation if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM public.case_participations 
      WHERE case_id = r.id AND department = v_dept_key AND status = 'ACTIVE'
    ) THEN
      INSERT INTO public.case_participations (
        case_id,
        department,
        participation_role,
        status,
        responsibility_reason,
        added_source,
        joined_at,
        created_at,
        updated_at
      ) VALUES (
        r.id,
        v_dept_key,
        'LEAD',
        'ACTIVE',
        'Automatic migration backfill from category: ' || r.category,
        'SYSTEM_BACKFILL',
        r.created_at,
        r.created_at,
        r.created_at
      );
    END IF;
  END LOOP;
END;
$$;

-- 7. Atomic transaction RPC for new case creation
CREATE OR REPLACE FUNCTION public.create_civic_case_with_participation(
  p_user_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_category TEXT,
  p_location TEXT,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_image_urls TEXT[]
)
RETURNS public.reported_issues
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_issue public.reported_issues;
  v_dept_key TEXT;
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

  -- 2. Insert reported_issues (Master Case)
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
    coordination_started_at
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
    now()
  )
  RETURNING * INTO v_new_issue;

  -- 3. Insert LEAD participation
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

-- 8. Enable RLS on case_participations
ALTER TABLE public.case_participations ENABLE ROW LEVEL SECURITY;

-- Select policy: authenticated users can read all active case participations
CREATE POLICY "View participations policy"
ON public.case_participations FOR SELECT
TO authenticated
USING (true);

-- Management policy: super admin / admin role can edit participations
CREATE POLICY "Manage participations policy"
ON public.case_participations FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
);

-- 9. Update reported_issues RLS SELECT policy to respect participations
DROP POLICY IF EXISTS "View reported issues policy" ON public.reported_issues;

CREATE POLICY "View reported issues policy"
ON public.reported_issues FOR SELECT
USING (
  -- Citizens (no administrative role) can see all issues
  NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin', 'department_admin')
  )
  OR
  -- Super admin sees everything
  public.has_role(auth.uid(), 'super_admin')
  OR
  -- Department admin sees scoped issues by category OR active participation
  public.check_user_issue_scope(auth.uid(), category)
  OR
  EXISTS (
    SELECT 1 FROM public.case_participations cp
    JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE cp.case_id = public.reported_issues.id
      AND cp.department = ur.department
      AND cp.status = 'ACTIVE'
  )
);

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.create_civic_case_with_participation(UUID, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT[]) TO authenticated;
