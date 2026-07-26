-- =============================================================================
-- Migration: RLS Hardening and Lead Department Admin Approval Rights
-- =============================================================================

-- 1. Redefine Manage tasks policy to fix the department = department ambiguity
DROP POLICY IF EXISTS "Manage tasks policy" ON public.department_tasks;

CREATE POLICY "Manage tasks policy"
ON public.department_tasks FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.department = public.department_tasks.department
  )
);

-- 2. Redefine AI coordination plan policies to allow lead department admins to manage plans
DROP POLICY IF EXISTS "AI plans manageable by staff" ON public.ai_coordination_plans;
CREATE POLICY "AI plans manageable by staff"
ON public.ai_coordination_plans FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.reported_issues ri
    JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE ri.id = public.ai_coordination_plans.case_id
      AND ur.role = 'department_admin'
      AND ri.lead_department = ur.department
  )
);

DROP POLICY IF EXISTS "AI plan participants manageable by staff" ON public.ai_plan_participants;
CREATE POLICY "AI plan participants manageable by staff"
ON public.ai_plan_participants FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.ai_coordination_plans acp
    JOIN public.reported_issues ri ON ri.id = acp.case_id
    JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE acp.id = public.ai_plan_participants.plan_id
      AND ur.role = 'department_admin'
      AND ri.lead_department = ur.department
  )
);

DROP POLICY IF EXISTS "AI plan tasks manageable by staff" ON public.ai_plan_tasks;
CREATE POLICY "AI plan tasks manageable by staff"
ON public.ai_plan_tasks FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.ai_coordination_plans acp
    JOIN public.reported_issues ri ON ri.id = acp.case_id
    JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE acp.id = public.ai_plan_tasks.plan_id
      AND ur.role = 'department_admin'
      AND ri.lead_department = ur.department
  )
);

DROP POLICY IF EXISTS "AI plan dependencies manageable by staff" ON public.ai_plan_dependencies;
CREATE POLICY "AI plan dependencies manageable by staff"
ON public.ai_plan_dependencies FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.ai_coordination_plans acp
    JOIN public.reported_issues ri ON ri.id = acp.case_id
    JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE acp.id = public.ai_plan_dependencies.plan_id
      AND ur.role = 'department_admin'
      AND ri.lead_department = ur.department
  )
);

DROP POLICY IF EXISTS "AI plan edit events manageable by staff" ON public.ai_plan_edit_events;
CREATE POLICY "AI plan edit events manageable by staff"
ON public.ai_plan_edit_events FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.ai_coordination_plans acp
    JOIN public.reported_issues ri ON ri.id = acp.case_id
    JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE acp.id = public.ai_plan_edit_events.plan_id
      AND ur.role = 'department_admin'
      AND ri.lead_department = ur.department
  )
);

-- 3. Update approve_and_activate_coordination_plan function to authorize lead department admins
CREATE OR REPLACE FUNCTION public.approve_and_activate_coordination_plan(
  p_plan_id UUID,
  p_actor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan RECORD;
  v_lead_count INTEGER;
  v_lead_dept TEXT;
  v_task RECORD;
  v_dep RECORD;
  v_task_id UUID;
  v_pred_uuid UUID;
  v_succ_uuid UUID;
  v_first_tasks_count INTEGER;
BEGIN
  -- 1. Retrieve the plan details
  SELECT * INTO v_plan
  FROM public.ai_coordination_plans
  WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Coordination plan not found.';
  END IF;

  IF v_plan.status IN ('APPROVED', 'ACTIVATED') THEN
    RAISE EXCEPTION 'Plan is already approved or activated.';
  END IF;

  -- 2. Validate participants: exactly one LEAD department
  SELECT COUNT(*), MAX(department) INTO v_lead_count, v_lead_dept
  FROM public.ai_plan_participants
  WHERE plan_id = p_plan_id AND participation_role = 'LEAD';

  IF v_lead_count = 0 THEN
    RAISE EXCEPTION 'Plan must have exactly one LEAD department (found 0).';
  END IF;
  IF v_lead_count > 1 THEN
    RAISE EXCEPTION 'Plan must have exactly one LEAD department (found %).', v_lead_count;
  END IF;

  -- 3. Verify actor is super_admin, admin, or the lead department admin
  IF NOT (
    public.has_role(p_actor_id, 'super_admin') 
    OR public.has_role(p_actor_id, 'admin') 
    OR (
      public.has_role(p_actor_id, 'department_admin') 
      AND EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = p_actor_id 
          AND department = v_lead_dept
      )
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only super admins, admins, or the lead department admin can approve coordination plans.';
  END IF;

  -- 4. Set plan status to APPROVED
  UPDATE public.ai_coordination_plans
  SET status = 'APPROVED',
      approved_by = p_actor_id,
      approved_at = now(),
      updated_at = now()
  WHERE id = p_plan_id;

  -- 5. Mark older plans for this case as SUPERSEDED
  UPDATE public.ai_coordination_plans
  SET status = 'SUPERSEDED',
      updated_at = now()
  WHERE case_id = v_plan.case_id
    AND id <> p_plan_id
    AND status IN ('PENDING', 'GENERATED', 'REVIEW_REQUIRED', 'APPROVED', 'ACTIVATED');

  -- 6. Transition case coordination status
  UPDATE public.reported_issues
  SET coordination_status = 'active',
      coordination_started_at = now(),
      lead_department = v_lead_dept,
      updated_at = now()
  WHERE id = v_plan.case_id;

  -- 7. Transactionally transfer tasks from plan to execution
  -- Clean up previous execution tasks
  DELETE FROM public.department_tasks WHERE case_id = v_plan.case_id;
  DELETE FROM public.task_dependencies WHERE case_id = v_plan.case_id;

  -- Map plan tasks to execution tasks
  FOR v_task IN 
    SELECT * FROM public.ai_plan_tasks WHERE plan_id = p_plan_id
  LOOP
    INSERT INTO public.department_tasks (
      case_id, department, task_code, title, description,
      task_status, priority, sla_duration_minutes, completion_evidence_rules,
      version, created_at, updated_at
    ) VALUES (
      v_plan.case_id, v_task.department, v_task.temp_id, v_task.title, v_task.description,
      'ASSIGNED', v_task.priority, v_task.sla_duration_minutes, v_task.completion_evidence_rules,
      1, now(), now()
    );
  END LOOP;

  -- Map plan dependencies to execution dependencies
  FOR v_dep IN 
    SELECT * FROM public.ai_plan_dependencies WHERE plan_id = p_plan_id
  LOOP
    -- Get execution task UUIDs
    SELECT id INTO v_pred_uuid FROM public.department_tasks 
    WHERE case_id = v_plan.case_id AND task_code = v_dep.predecessor_temp_id;

    SELECT id INTO v_succ_uuid FROM public.department_tasks 
    WHERE case_id = v_plan.case_id AND task_code = v_dep.successor_temp_id;

    IF v_pred_uuid IS NOT NULL AND v_succ_uuid IS NOT NULL THEN
      INSERT INTO public.task_dependencies (
        case_id, predecessor_task_id, successor_task_id, reason, created_at
      ) VALUES (
        v_plan.case_id, v_pred_uuid, v_succ_uuid, v_dep.reason, now()
      );
    END IF;
  END LOOP;

  -- 8. Transactionally create case participations
  DELETE FROM public.case_participations WHERE case_id = v_plan.case_id;

  INSERT INTO public.case_participations (
    case_id, department, participation_role, status, responsibility_reason,
    added_by, added_source, joined_at
  )
  SELECT 
    v_plan.case_id, department, participation_role, 'ACTIVE', responsibility_reason,
    p_actor_id, 'HUMAN_COORDINATOR', now()
  FROM public.ai_plan_participants
  WHERE plan_id = p_plan_id;

  -- 9. Auto-unlock tasks that have zero dependencies
  -- For tasks that have dependencies, set to WAITING_DEPENDENCY
  UPDATE public.department_tasks dt
  SET task_status = 'WAITING_DEPENDENCY'
  WHERE dt.case_id = v_plan.case_id
    AND EXISTS (
      SELECT 1 FROM public.task_dependencies td
      WHERE td.successor_task_id = dt.id
    );

  -- For tasks that have zero dependencies, auto-unlock to READY
  UPDATE public.department_tasks dt
  SET task_status = 'READY'
  WHERE dt.case_id = v_plan.case_id
    AND NOT EXISTS (
      SELECT 1 FROM public.task_dependencies td
      WHERE td.successor_task_id = dt.id
    );

  -- 10. Update plan status to ACTIVATED
  UPDATE public.ai_coordination_plans
  SET status = 'ACTIVATED',
      generation_completed_at = now(),
      updated_at = now()
  WHERE id = p_plan_id;

END;
$$;
