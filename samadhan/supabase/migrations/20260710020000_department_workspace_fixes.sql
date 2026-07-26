-- =============================================================================
-- Migration: Department Workspace Fixes & Legacy Case Backfill
-- (Zero-Data-Loss Queue Repair)
-- =============================================================================

-- 1. Update RLS on reported_issues to align with Department Case Visibility Contract
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
  -- Department admin sees scoped issues if:
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'department_admin'
      AND (
        -- C. Lead department matches admin department
        public.reported_issues.lead_department = ur.department
        OR
        -- A. Has an ACTIVE case participation
        EXISTS (
          SELECT 1 FROM public.case_participations cp
          WHERE cp.case_id = public.reported_issues.id
            AND cp.department = ur.department
            AND cp.status = 'ACTIVE'
        )
        OR
        -- B. Has an active task assigned to their department
        EXISTS (
          SELECT 1 FROM public.department_tasks dt
          WHERE dt.case_id = public.reported_issues.id
            AND dt.department = ur.department
            AND dt.task_status IN ('READY', 'WORKING', 'WAITING_DEPENDENCY', 'BLOCKED', 'REWORK_REQUIRED')
        )
        -- D. Legacy fallback: check category scope (only if no active participations exist for this case)
        OR (
          public.reported_issues.lead_department IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.case_participations cp2
            WHERE cp2.case_id = public.reported_issues.id
          )
          AND public.check_user_issue_scope(auth.uid(), public.reported_issues.category)
        )
      )
  )
);

-- 2. Idempotent Backfill Logic for Legacy Issues lacking participations
DO $$
DECLARE
  v_rec RECORD;
  v_dept_key TEXT;
  v_super_admin_id UUID;
BEGIN
  -- Find first super_admin or default UUID to use as added_by
  SELECT user_id INTO v_super_admin_id
  FROM public.user_roles
  WHERE role = 'super_admin'
  LIMIT 1;

  FOR v_rec IN 
    SELECT id, category, user_id, lead_department 
    FROM public.reported_issues ri
    WHERE NOT EXISTS (
      SELECT 1 FROM public.case_participations cp 
      WHERE cp.case_id = ri.id
    )
  LOOP
    -- Resolve category label (English or Hindi) to department key
    v_dept_key := CASE 
      WHEN v_rec.category IN ('Water Supply', 'जल आपूर्ति') THEN 'water_supply'
      WHEN v_rec.category IN ('Sanitation', 'स्वच्छता') THEN 'sanitation'
      WHEN v_rec.category IN ('Electricity', 'बिजली') THEN 'electricity'
      WHEN v_rec.category IN ('Roads', 'सड़कें') THEN 'roads'
      WHEN v_rec.category IN ('Parks & Gardens', 'पार्क और बगीचे') THEN 'parks'
      WHEN v_rec.category IN ('Buildings', 'भवन') THEN 'buildings'
      ELSE LOWER(REPLACE(v_rec.category, ' ', '_'))
    END;

    -- Update lead_department on issue if null
    IF v_rec.lead_department IS NULL THEN
      UPDATE public.reported_issues
      SET lead_department = v_dept_key
      WHERE id = v_rec.id;
    END IF;

    -- Insert active LEAD case participation if not already violating constraints
    IF NOT EXISTS (
      SELECT 1 FROM public.case_participations 
      WHERE case_id = v_rec.id AND department = v_dept_key AND status = 'ACTIVE'
    ) AND NOT EXISTS (
      SELECT 1 FROM public.case_participations 
      WHERE case_id = v_rec.id AND status = 'ACTIVE' AND participation_role = 'LEAD'
    ) THEN
      INSERT INTO public.case_participations (
        case_id,
        department,
        participation_role,
        status,
        responsibility_reason,
        added_by,
        added_source
      ) VALUES (
        v_rec.id,
        v_dept_key,
        'LEAD',
        'ACTIVE',
        'Lead department backfilled for legacy issue.',
        COALESCE(v_rec.user_id, v_super_admin_id),
        'BACKFILL_MIGRATION'
      );
    END IF;
  END LOOP;
END;
$$;
