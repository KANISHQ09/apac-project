-- =============================================================================
-- Migration: Fix AI Plan Tables RLS Policies for Pre-Activation Draft Editing
-- =============================================================================

-- ── 1. ai_coordination_plans ────────────────────────────────────────────────
DROP POLICY IF EXISTS "AI plans insertable by staff" ON public.ai_coordination_plans;
DROP POLICY IF EXISTS "AI plans updatable by staff" ON public.ai_coordination_plans;
DROP POLICY IF EXISTS "AI plans deletable by staff" ON public.ai_coordination_plans;

CREATE POLICY "AI plans insertable by staff" ON public.ai_coordination_plans FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.reported_issues ri
    LEFT JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE ri.id = case_id
      AND (
        public.check_user_issue_scope(auth.uid(), ri.category)
        OR (ri.lead_department IS NOT NULL AND ur.role = 'department_admin' AND ri.lead_department = ur.department)
      )
  )
);

CREATE POLICY "AI plans updatable by staff" ON public.ai_coordination_plans FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.reported_issues ri
    LEFT JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE ri.id = case_id
      AND (
        public.check_user_issue_scope(auth.uid(), ri.category)
        OR (ri.lead_department IS NOT NULL AND ur.role = 'department_admin' AND ri.lead_department = ur.department)
      )
  )
);

CREATE POLICY "AI plans deletable by staff" ON public.ai_coordination_plans FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.reported_issues ri
    LEFT JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE ri.id = case_id
      AND (
        public.check_user_issue_scope(auth.uid(), ri.category)
        OR (ri.lead_department IS NOT NULL AND ur.role = 'department_admin' AND ri.lead_department = ur.department)
      )
  )
);


-- ── 2. ai_plan_participants ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "AI plan participants insertable by staff" ON public.ai_plan_participants;
DROP POLICY IF EXISTS "AI plan participants updatable by staff" ON public.ai_plan_participants;
DROP POLICY IF EXISTS "AI plan participants deletable by staff" ON public.ai_plan_participants;

CREATE POLICY "AI plan participants insertable by staff" ON public.ai_plan_participants FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.ai_coordination_plans acp
    JOIN public.reported_issues ri ON ri.id = acp.case_id
    LEFT JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE acp.id = plan_id
      AND (
        public.check_user_issue_scope(auth.uid(), ri.category)
        OR (ri.lead_department IS NOT NULL AND ur.role = 'department_admin' AND ri.lead_department = ur.department)
      )
  )
);

CREATE POLICY "AI plan participants updatable by staff" ON public.ai_plan_participants FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.ai_coordination_plans acp
    JOIN public.reported_issues ri ON ri.id = acp.case_id
    LEFT JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE acp.id = plan_id
      AND (
        public.check_user_issue_scope(auth.uid(), ri.category)
        OR (ri.lead_department IS NOT NULL AND ur.role = 'department_admin' AND ri.lead_department = ur.department)
      )
  )
);

CREATE POLICY "AI plan participants deletable by staff" ON public.ai_plan_participants FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.ai_coordination_plans acp
    JOIN public.reported_issues ri ON ri.id = acp.case_id
    LEFT JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE acp.id = plan_id
      AND (
        public.check_user_issue_scope(auth.uid(), ri.category)
        OR (ri.lead_department IS NOT NULL AND ur.role = 'department_admin' AND ri.lead_department = ur.department)
      )
  )
);


-- ── 3. ai_plan_tasks ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "AI plan tasks insertable by staff" ON public.ai_plan_tasks;
DROP POLICY IF EXISTS "AI plan tasks updatable by staff" ON public.ai_plan_tasks;
DROP POLICY IF EXISTS "AI plan tasks deletable by staff" ON public.ai_plan_tasks;

CREATE POLICY "AI plan tasks insertable by staff" ON public.ai_plan_tasks FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.ai_coordination_plans acp
    JOIN public.reported_issues ri ON ri.id = acp.case_id
    LEFT JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE acp.id = plan_id
      AND (
        public.check_user_issue_scope(auth.uid(), ri.category)
        OR (ri.lead_department IS NOT NULL AND ur.role = 'department_admin' AND ri.lead_department = ur.department)
      )
  )
);

CREATE POLICY "AI plan tasks updatable by staff" ON public.ai_plan_tasks FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.ai_coordination_plans acp
    JOIN public.reported_issues ri ON ri.id = acp.case_id
    LEFT JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE acp.id = plan_id
      AND (
        public.check_user_issue_scope(auth.uid(), ri.category)
        OR (ri.lead_department IS NOT NULL AND ur.role = 'department_admin' AND ri.lead_department = ur.department)
      )
  )
);

CREATE POLICY "AI plan tasks deletable by staff" ON public.ai_plan_tasks FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.ai_coordination_plans acp
    JOIN public.reported_issues ri ON ri.id = acp.case_id
    LEFT JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE acp.id = plan_id
      AND (
        public.check_user_issue_scope(auth.uid(), ri.category)
        OR (ri.lead_department IS NOT NULL AND ur.role = 'department_admin' AND ri.lead_department = ur.department)
      )
  )
);


-- ── 4. ai_plan_dependencies ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "AI plan dependencies insertable by staff" ON public.ai_plan_dependencies;
DROP POLICY IF EXISTS "AI plan dependencies updatable by staff" ON public.ai_plan_dependencies;
DROP POLICY IF EXISTS "AI plan dependencies deletable by staff" ON public.ai_plan_dependencies;

CREATE POLICY "AI plan dependencies insertable by staff" ON public.ai_plan_dependencies FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.ai_coordination_plans acp
    JOIN public.reported_issues ri ON ri.id = acp.case_id
    LEFT JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE acp.id = plan_id
      AND (
        public.check_user_issue_scope(auth.uid(), ri.category)
        OR (ri.lead_department IS NOT NULL AND ur.role = 'department_admin' AND ri.lead_department = ur.department)
      )
  )
);

CREATE POLICY "AI plan dependencies updatable by staff" ON public.ai_plan_dependencies FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.ai_coordination_plans acp
    JOIN public.reported_issues ri ON ri.id = acp.case_id
    LEFT JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE acp.id = plan_id
      AND (
        public.check_user_issue_scope(auth.uid(), ri.category)
        OR (ri.lead_department IS NOT NULL AND ur.role = 'department_admin' AND ri.lead_department = ur.department)
      )
  )
);

CREATE POLICY "AI plan dependencies deletable by staff" ON public.ai_plan_dependencies FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.ai_coordination_plans acp
    JOIN public.reported_issues ri ON ri.id = acp.case_id
    LEFT JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE acp.id = plan_id
      AND (
        public.check_user_issue_scope(auth.uid(), ri.category)
        OR (ri.lead_department IS NOT NULL AND ur.role = 'department_admin' AND ri.lead_department = ur.department)
      )
  )
);


-- ── 5. ai_plan_edit_events ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "AI plan edit events insertable by staff" ON public.ai_plan_edit_events;
DROP POLICY IF EXISTS "AI plan edit events updatable by staff" ON public.ai_plan_edit_events;
DROP POLICY IF EXISTS "AI plan edit events deletable by staff" ON public.ai_plan_edit_events;

CREATE POLICY "AI plan edit events insertable by staff" ON public.ai_plan_edit_events FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.ai_coordination_plans acp
    JOIN public.reported_issues ri ON ri.id = acp.case_id
    LEFT JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE acp.id = plan_id
      AND (
        public.check_user_issue_scope(auth.uid(), ri.category)
        OR (ri.lead_department IS NOT NULL AND ur.role = 'department_admin' AND ri.lead_department = ur.department)
      )
  )
);

CREATE POLICY "AI plan edit events updatable by staff" ON public.ai_plan_edit_events FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.ai_coordination_plans acp
    JOIN public.reported_issues ri ON ri.id = acp.case_id
    LEFT JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE acp.id = plan_id
      AND (
        public.check_user_issue_scope(auth.uid(), ri.category)
        OR (ri.lead_department IS NOT NULL AND ur.role = 'department_admin' AND ri.lead_department = ur.department)
      )
  )
);

CREATE POLICY "AI plan edit events deletable by staff" ON public.ai_plan_edit_events FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.ai_coordination_plans acp
    JOIN public.reported_issues ri ON ri.id = acp.case_id
    LEFT JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE acp.id = plan_id
      AND (
        public.check_user_issue_scope(auth.uid(), ri.category)
        OR (ri.lead_department IS NOT NULL AND ur.role = 'department_admin' AND ri.lead_department = ur.department)
      )
  )
);
