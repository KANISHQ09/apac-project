-- =============================================================================
-- Migration: Supporting Department Case Visibility & RLS Recursion Fix (v2)
-- =============================================================================

-- 1. Recreate reported_issues SELECT policy (recursion-free)
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
        -- A. Has an active or proposed case participation
        EXISTS (
          SELECT 1 FROM public.case_participations cp
          WHERE cp.case_id = public.reported_issues.id
            AND cp.department = ur.department
            AND cp.status IN ('ACTIVE', 'PROPOSED')
        )
        OR
        -- B. Has a task assigned to their department
        EXISTS (
          SELECT 1 FROM public.department_tasks dt
          WHERE dt.case_id = public.reported_issues.id
            AND dt.department = ur.department
        )
        -- E. Proposed in any AI Coordination Plan (participants or tasks)
        OR EXISTS (
          SELECT 1 FROM public.ai_coordination_plans acp
          LEFT JOIN public.ai_plan_participants app ON app.plan_id = acp.id
          LEFT JOIN public.ai_plan_tasks apt ON apt.plan_id = acp.id
          WHERE acp.case_id = public.reported_issues.id
            AND acp.status NOT IN ('REJECTED', 'SUPERSEDED')
            AND (app.department = ur.department OR apt.department = ur.department)
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

-- 2. Recreate department_tasks SELECT policy to be recursion-free
DROP POLICY IF EXISTS "View tasks policy" ON public.department_tasks;

CREATE POLICY "View tasks policy"
ON public.department_tasks FOR SELECT
TO authenticated
USING (
  -- Super admin can view all
  public.has_role(auth.uid(), 'super_admin')
  OR
  -- Users can view tasks of their own department
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.department = public.department_tasks.department
  )
  OR
  -- Users can view tasks for cases where their department is a participant
  EXISTS (
    SELECT 1 FROM public.case_participations cp
    JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE cp.case_id = public.department_tasks.case_id
      AND cp.department = ur.department
  )
  OR
  -- Users can view tasks for cases where their department is proposed on a plan
  EXISTS (
    SELECT 1 FROM public.ai_coordination_plans acp
    JOIN public.ai_plan_participants app ON app.plan_id = acp.id
    JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE acp.case_id = public.department_tasks.case_id
      AND app.department = ur.department
  )
);
