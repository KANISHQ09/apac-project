-- =============================================================================
-- Migration: SLA Engine, Escalations, and Commissioner Interventions (Prompt 4)
-- =============================================================================

-- 1. SLA Policies Table
CREATE TABLE IF NOT EXISTS public.sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('CASE', 'TASK', 'HANDOFF', 'STATUS')),
  department TEXT,
  issue_category TEXT,
  severity TEXT CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  inactivity_minutes INTEGER,
  resolution_minutes INTEGER,
  active BOOLEAN DEFAULT true,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Escalation Policies & Levels
CREATE TABLE IF NOT EXISTS public.escalation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.escalation_policy_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES public.escalation_policies(id) ON DELETE CASCADE,
  level_number INTEGER NOT NULL CHECK (level_number IN (1, 2, 3, 4)),
  name TEXT NOT NULL,
  trigger_delay_minutes INTEGER NOT NULL,
  authority_role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. SLA Clock Instances
CREATE TABLE IF NOT EXISTS public.sla_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.reported_issues(id) ON DELETE CASCADE NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('CASE', 'TASK', 'HANDOFF')),
  entity_id UUID NOT NULL,
  policy_id UUID REFERENCES public.sla_policies(id),
  clock_type TEXT NOT NULL CHECK (clock_type IN ('ACKNOWLEDGEMENT', 'TASK_START', 'TASK_COMPLETION', 'HANDOFF_REVIEW', 'BLOCKED_DEPENDENCY', 'REWORK', 'INACTIVITY')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at TIMESTAMPTZ NOT NULL,
  paused_at TIMESTAMPTZ,
  resumed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  breached_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'COMPLETED', 'BREACHED', 'CANCELLED')),
  pause_reason TEXT,
  accumulated_pause_seconds INTEGER DEFAULT 0,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sla_instances_case_id ON public.sla_instances(case_id);
CREATE INDEX IF NOT EXISTS idx_sla_instances_status ON public.sla_instances(status, due_at);

-- 4. Escalations Table
CREATE TABLE IF NOT EXISTS public.escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.reported_issues(id) ON DELETE CASCADE NOT NULL,
  source_entity_type TEXT NOT NULL CHECK (source_entity_type IN ('CASE', 'TASK', 'HANDOFF')),
  source_entity_id UUID NOT NULL,
  sla_instance_id UUID REFERENCES public.sla_instances(id) ON DELETE SET NULL,
  escalation_policy_id UUID REFERENCES public.escalation_policies(id),
  current_level INTEGER NOT NULL DEFAULT 1 CHECK (current_level IN (1, 2, 3, 4)),
  severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  escalation_type TEXT NOT NULL CHECK (escalation_type IN ('SLA_BREACH', 'TASK_INACTIVITY', 'DEPENDENCY_BLOCK', 'HANDOFF_REVIEW_DELAY', 'REPEATED_HANDOFF_REJECTION', 'REWORK_LOOP', 'TRANSFER_LOOP', 'CHANGE_REQUEST_DELAY', 'CROSS_DEPARTMENT_DEADLOCK', 'CRITICAL_CASE_STALL')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'INTERVENTION_REQUIRED', 'RESOLVED', 'CANCELLED')),
  root_cause_department TEXT,
  reason_code TEXT,
  reason_detail TEXT,
  first_escalated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_escalated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_escalations_case_id ON public.escalations(case_id);
CREATE INDEX IF NOT EXISTS idx_escalations_status ON public.escalations(status);

-- 5. Commissioner Interventions Table
CREATE TABLE IF NOT EXISTS public.commissioner_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.reported_issues(id) ON DELETE CASCADE NOT NULL,
  escalation_id UUID REFERENCES public.escalations(id) ON DELETE SET NULL,
  intervention_type TEXT NOT NULL CHECK (intervention_type IN ('PRIORITY_OVERRIDE', 'REASSIGN_TASK', 'ADD_SUPPORT_DEPARTMENT', 'FORCE_COORDINATION_REVIEW', 'EMERGENCY_SEQUENCE_OVERRIDE', 'REQUEST_JOINT_MEETING', 'APPOINT_COORDINATION_OWNER', 'EXTEND_SLA_WITH_REASON', 'CANCEL_INVALID_ESCALATION')),
  target_task_id UUID REFERENCES public.department_tasks(id) ON DELETE SET NULL,
  target_department TEXT,
  initiated_by UUID REFERENCES auth.users(id),
  reason TEXT NOT NULL,
  instruction TEXT NOT NULL,
  previous_state JSONB,
  resulting_state JSONB,
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_commissioner_interventions_case ON public.commissioner_interventions(case_id);

-- 6. Task Blockers Table
CREATE TABLE IF NOT EXISTS public.task_blockers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.reported_issues(id) ON DELETE CASCADE NOT NULL,
  task_id UUID REFERENCES public.department_tasks(id) ON DELETE CASCADE NOT NULL,
  blocker_type TEXT NOT NULL CHECK (blocker_type IN ('DEPENDENCY', 'RESOURCE', 'APPROVAL', 'BUDGET', 'FIELD_CONDITION', 'EXTERNAL_AGENCY', 'SAFETY', 'OTHER')),
  blocking_department TEXT,
  external_reference TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RESOLVED')),
  declared_by UUID REFERENCES auth.users(id),
  declared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_task_blockers_task ON public.task_blockers(task_id, status);

-- 7. SLA Exception Requests Table
CREATE TABLE IF NOT EXISTS public.sla_exception_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sla_instance_id UUID REFERENCES public.sla_instances(id) ON DELETE CASCADE NOT NULL,
  requested_by UUID REFERENCES auth.users(id),
  reason_code TEXT,
  justification TEXT NOT NULL,
  requested_extension_minutes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  decision_note TEXT
);

-- Enable RLS
ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalation_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalation_policy_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissioner_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_blockers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_exception_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "SLA Policies readable by auth" ON public.sla_policies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Escalation Policies readable by auth" ON public.escalation_policies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Escalation Levels readable by auth" ON public.escalation_policy_levels FOR SELECT TO authenticated USING (true);
CREATE POLICY "SLA Instances readable by auth" ON public.sla_instances FOR SELECT TO authenticated USING (true);
CREATE POLICY "Escalations readable by auth" ON public.escalations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Interventions readable by auth" ON public.commissioner_interventions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Interventions manageable by superadmin" ON public.commissioner_interventions FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Blockers readable by auth" ON public.task_blockers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Blockers manageable by department staff" ON public.task_blockers FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin')
  OR EXISTS (
    SELECT 1 FROM public.department_tasks t
    JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE t.id = task_id AND ur.department = t.department
  )
);

CREATE POLICY "SLA Exception Requests readable by auth" ON public.sla_exception_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "SLA Exception Requests manageable by superadmin or requester" ON public.sla_exception_requests FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin')
  OR requested_by = auth.uid()
);

-- 8. Recursive Blocker Downstream Impact Calculation
CREATE OR REPLACE FUNCTION public.get_downstream_impact(p_task_id UUID)
RETURNS TABLE (
  task_id UUID,
  task_code TEXT,
  department TEXT,
  title TEXT,
  task_status TEXT,
  level_depth INT
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE downstream AS (
    -- Anchor
    SELECT t.id, t.task_code, t.department, t.title, t.task_status, 1 AS depth
    FROM public.task_dependencies td
    JOIN public.department_tasks t ON t.id = td.successor_task_id
    WHERE td.predecessor_task_id = p_task_id

    UNION

    -- Recursive
    SELECT t.id, t.task_code, t.department, t.title, t.task_status, d.depth + 1
    FROM public.task_dependencies td
    JOIN public.department_tasks t ON t.id = td.successor_task_id
    JOIN downstream d ON d.id = td.predecessor_task_id
  )
  SELECT DISTINCT d.id, d.task_code, d.department, d.title, d.task_status, d.depth
  FROM downstream d;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 9. Authoritative Evaluator for SLA breaches and level advancement (Demo time offset compatible)
CREATE OR REPLACE FUNCTION public.evaluate_coordination_escalations(p_demo_time_offset_minutes INT DEFAULT 0)
RETURNS VOID AS $$
DECLARE
  v_effective_time TIMESTAMPTZ;
  v_breached RECORD;
  v_escalation RECORD;
  v_stalled_task RECORD;
  v_policy RECORD;
  v_default_policy_id UUID;
  v_escalation_policy_id UUID;
BEGIN
  v_effective_time := now() + (p_demo_time_offset_minutes * INTERVAL '1 minute');

  -- Get fallback escalation policy
  SELECT id INTO v_escalation_policy_id FROM public.escalation_policies LIMIT 1;
  IF v_escalation_policy_id IS NULL THEN
    INSERT INTO public.escalation_policies (policy_code, name) 
    VALUES ('DEFAULT_MUNICIPAL', 'Default Municipal Hierarchy')
    RETURNING id INTO v_escalation_policy_id;

    INSERT INTO public.escalation_policy_levels (policy_id, level_number, name, trigger_delay_minutes, authority_role)
    VALUES 
      (v_escalation_policy_id, 1, 'Department Nodal Officer', 60, 'nodal_officer'),
      (v_escalation_policy_id, 2, 'Department Head', 240, 'dept_head'),
      (v_escalation_policy_id, 3, 'Deputy Commissioner', 480, 'deputy_commissioner'),
      (v_escalation_policy_id, 4, 'Municipal Commissioner', 720, 'commissioner');
  END IF;

  -- 1. Identify active SLA instances that have breached
  FOR v_breached IN
    SELECT * FROM public.sla_instances 
    WHERE status = 'ACTIVE' AND due_at < v_effective_time
  LOOP
    UPDATE public.sla_instances 
    SET status = 'BREACHED', breached_at = v_effective_time, updated_at = now()
    WHERE id = v_breached.id;

    -- Idempotently create L1 escalation record
    IF NOT EXISTS (
      SELECT 1 FROM public.escalations 
      WHERE sla_instance_id = v_breached.id AND status = 'OPEN'
    ) THEN
      INSERT INTO public.escalations (
        case_id, source_entity_type, source_entity_id, sla_instance_id, escalation_policy_id,
        current_level, severity, escalation_type, status, root_cause_department,
        reason_code, reason_detail, first_escalated_at, last_escalated_at
      ) VALUES (
        v_breached.case_id, v_breached.entity_type, v_breached.entity_id, v_breached.id, v_escalation_policy_id,
        1, 'MEDIUM', 'SLA_BREACH', 'OPEN', 
        (SELECT department FROM public.department_tasks WHERE id = v_breached.entity_id LIMIT 1),
        'CLOCK_EXPIRED', 'SLA deadline expired for ' || v_breached.clock_type, v_effective_time, v_effective_time
      );
    END IF;
  END LOOP;

  -- 2. Evaluate level advancement for OPEN escalations
  FOR v_escalation IN
    SELECT e.*, l.trigger_delay_minutes FROM public.escalations e
    JOIN public.escalation_policy_levels l ON l.policy_id = e.escalation_policy_id AND l.level_number = e.current_level
    WHERE e.status = 'OPEN' AND e.current_level < 4
  LOOP
    IF v_effective_time > v_escalation.last_escalated_at + (v_escalation.trigger_delay_minutes * INTERVAL '1 minute') THEN
      UPDATE public.escalations
      SET current_level = current_level + 1,
          last_escalated_at = v_effective_time,
          updated_at = now()
      WHERE id = v_escalation.id;

      INSERT INTO public.workflow_events (
        case_id, task_id, event_type, from_status, to_status, metadata
      ) VALUES (
        v_escalation.case_id, 
        CASE WHEN v_escalation.source_entity_type = 'TASK' THEN v_escalation.source_entity_id ELSE NULL END,
        'PRIVILEGED_OVERRIDE', NULL, NULL,
        jsonb_build_object('reason', 'SLA Breach escalated to Level ' || (v_escalation.current_level + 1)::text)
      );
    END IF;
  END LOOP;

  -- 3. Detect task inactivity stall (> 6 hours without updates)
  FOR v_stalled_task IN
    SELECT t.* FROM public.department_tasks t
    WHERE t.task_status IN ('READY', 'WORKING')
      AND t.updated_at + INTERVAL '6 hours' < v_effective_time
      AND NOT EXISTS (
        SELECT 1 FROM public.escalations 
        WHERE source_entity_id = t.id AND escalation_type = 'TASK_INACTIVITY' AND status = 'OPEN'
      )
  LOOP
    INSERT INTO public.escalations (
      case_id, source_entity_type, source_entity_id, escalation_policy_id,
      current_level, severity, escalation_type, status, root_cause_department,
      reason_code, reason_detail, first_escalated_at, last_escalated_at
    ) VALUES (
      v_stalled_task.case_id, 'TASK', v_stalled_task.id, v_escalation_policy_id,
      1, 'HIGH', 'TASK_INACTIVITY', 'OPEN', v_stalled_task.department,
      'STALL_DETECTED', 'Task inactive for over 6 hours.', v_effective_time, v_effective_time
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 10. Commissioner Interventions Execution RPC
CREATE OR REPLACE FUNCTION public.apply_commissioner_intervention(
  p_case_id UUID,
  p_escalation_id UUID,
  p_type TEXT,
  p_target_task_id UUID,
  p_target_dept TEXT,
  p_reason TEXT,
  p_instruction TEXT,
  p_actor_id UUID
)
RETURNS public.commissioner_interventions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intervention public.commissioner_interventions;
  v_prev_state JSONB := '{}'::jsonb;
  v_new_state JSONB := '{}'::jsonb;
BEGIN
  -- Validate auth role
  IF NOT public.has_role(p_actor_id, 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only Commissioner or Super Admins can issue overrides.';
  END IF;

  -- Apply Override Actions
  IF p_type = 'PRIORITY_OVERRIDE' THEN
    SELECT jsonb_build_object('priority', priority) INTO v_prev_state FROM public.reported_issues WHERE id = p_case_id;
    UPDATE public.reported_issues SET priority = 'CRITICAL' WHERE id = p_case_id;
    v_new_state := jsonb_build_object('priority', 'CRITICAL');

  ELSIF p_type = 'REASSIGN_TASK' AND p_target_task_id IS NOT NULL AND p_target_dept IS NOT NULL THEN
    SELECT jsonb_build_object('department', department) INTO v_prev_state FROM public.department_tasks WHERE id = p_target_task_id;
    UPDATE public.department_tasks SET department = p_target_dept, task_status = 'ASSIGNED', updated_at = now() WHERE id = p_target_task_id;
    v_new_state := jsonb_build_object('department', p_target_dept);

  ELSIF p_type = 'ADD_SUPPORT_DEPARTMENT' AND p_target_dept IS NOT NULL THEN
    INSERT INTO public.case_participations (case_id, department, participation_role, status, responsibility_reason)
    VALUES (p_case_id, p_target_dept, 'SUPPORTING', 'ACTIVE', p_instruction);
    v_new_state := jsonb_build_object('added_department', p_target_dept);

  ELSIF p_type = 'EMERGENCY_SEQUENCE_OVERRIDE' AND p_target_task_id IS NOT NULL THEN
    -- Bypasses dependency checks by moving task status to READY immediately
    SELECT jsonb_build_object('task_status', task_status) INTO v_prev_state FROM public.department_tasks WHERE id = p_target_task_id;
    UPDATE public.department_tasks SET task_status = 'READY', updated_at = now() WHERE id = p_target_task_id;
    v_new_state := jsonb_build_object('task_status', 'READY');

  ELSE
    RAISE EXCEPTION 'Unsupported intervention type: %', p_type;
  END IF;

  -- Record intervention
  INSERT INTO public.commissioner_interventions (
    case_id, escalation_id, intervention_type, target_task_id, target_department,
    initiated_by, reason, instruction, previous_state, resulting_state, status, completed_at
  ) VALUES (
    p_case_id, p_escalation_id, p_type, p_target_task_id, p_target_dept,
    p_actor_id, p_reason, p_instruction, v_prev_state, v_new_state, 'COMPLETED', now()
  ) RETURNING * INTO v_intervention;

  -- Resolve active escalation if provided
  IF p_escalation_id IS NOT NULL THEN
    UPDATE public.escalations 
    SET status = 'RESOLVED', resolved_by = p_actor_id, resolved_at = now() 
    WHERE id = p_escalation_id;
  END IF;

  -- Log workflow timeline event
  INSERT INTO public.workflow_events (
    case_id, task_id, actor_id, actor_department, event_type, from_status, to_status, metadata
  ) VALUES (
    p_case_id, p_target_task_id, p_actor_id, 'coordinator', 'PRIVILEGED_OVERRIDE',
    v_prev_state->>'task_status', v_new_state->>'task_status',
    jsonb_build_object('reason', p_reason, 'instruction', p_instruction, 'intervention_id', v_intervention.id)
  );

  RETURN v_intervention;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.get_downstream_impact(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_coordination_escalations(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_commissioner_intervention(UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, UUID) TO authenticated;
