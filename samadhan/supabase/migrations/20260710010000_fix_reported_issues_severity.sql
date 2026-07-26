-- =============================================================================
-- Migration: Add severity to reported_issues & Update approve_and_activate RPC
-- =============================================================================

-- 1. Add severity column to reported_issues
ALTER TABLE public.reported_issues
  ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'MEDIUM'
  CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));

-- 2. Update approve_and_activate_coordination_plan function to copy risk_level to severity
CREATE OR REPLACE FUNCTION public.approve_and_activate_coordination_plan(p_plan_id UUID, p_actor_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan RECORD;
  v_lead_count INTEGER;
  v_lead_dept TEXT;
  v_task RECORD;
  v_dep RECORD;
  v_task_uuid UUID;
  v_predecessor_uuid UUID;
  v_successor_uuid UUID;
  v_default_policy_id UUID;
  v_due_at TIMESTAMPTZ;
BEGIN
  -- 1. Lock the plan row
  SELECT * INTO v_plan FROM public.ai_coordination_plans WHERE id = p_plan_id FOR UPDATE;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'AI Coordination Plan not found: %', p_plan_id;
  END IF;

  -- 2. Verify status
  IF v_plan.status NOT IN ('REVIEW_REQUIRED', 'GENERATED', 'VALIDATION_FAILED', 'PENDING') THEN
    RAISE EXCEPTION 'Plan cannot be approved in current status: %', v_plan.status;
  END IF;

  -- 3. Verify actor is admin or superadmin
  IF NOT (public.has_role(p_actor_id, 'super_admin') OR public.has_role(p_actor_id, 'admin')) THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can approve coordination plans.';
  END IF;

  -- 4. Validate participants: exactly one LEAD department
  SELECT COUNT(*), MAX(department) INTO v_lead_count, v_lead_dept
  FROM public.ai_plan_participants
  WHERE plan_id = p_plan_id AND participation_role = 'LEAD';

  IF v_lead_count != 1 THEN
    RAISE EXCEPTION 'Plan validation failed: Must contain exactly one LEAD department. Found %.', v_lead_count;
  END IF;

  -- 5. Validate all participating departments are valid
  IF EXISTS (
    SELECT 1 FROM public.ai_plan_participants
    WHERE plan_id = p_plan_id
      AND department NOT IN ('water_supply', 'sanitation', 'electricity', 'roads', 'parks', 'buildings')
  ) THEN
    RAISE EXCEPTION 'Plan validation failed: Invalid department detected.';
  END IF;

  -- 6. Validate DAG cycle-free
  IF NOT public.validate_plan_dag(p_plan_id) THEN
    RAISE EXCEPTION 'Plan validation failed: Circular dependency detected in the task list.';
  END IF;

  -- 7. Validate that all predecessors/successors exist in the tasks
  IF EXISTS (
    SELECT 1 FROM public.ai_plan_dependencies dep
    WHERE dep.plan_id = p_plan_id
      AND (
        NOT EXISTS (SELECT 1 FROM public.ai_plan_tasks t WHERE t.plan_id = p_plan_id AND t.temp_id = dep.predecessor_temp_id)
        OR NOT EXISTS (SELECT 1 FROM public.ai_plan_tasks t WHERE t.plan_id = p_plan_id AND t.temp_id = dep.successor_temp_id)
      )
  ) THEN
    RAISE EXCEPTION 'Plan validation failed: Dependency refers to a non-existent task.';
  END IF;

  -- 8. Transactionally create case participations
  DELETE FROM public.case_participations WHERE case_id = v_plan.case_id;

  INSERT INTO public.case_participations (case_id, department, participation_role, status, responsibility_reason, added_by, added_source, joined_at)
  SELECT v_plan.case_id, department, participation_role, 'ACTIVE', responsibility_reason, p_actor_id, 'HUMAN_COORDINATOR', now()
  FROM public.ai_plan_participants
  WHERE plan_id = p_plan_id;

  -- 9. Insert tasks and map temp_id to real UUIDs
  CREATE TEMP TABLE temp_task_mapping (
    temp_id TEXT PRIMARY KEY,
    real_uuid UUID NOT NULL
  ) ON COMMIT DROP;

  -- Get default SLA policy
  SELECT id INTO v_default_policy_id FROM public.sla_policies WHERE scope_type = 'TASK' LIMIT 1;

  FOR v_task IN SELECT * FROM public.ai_plan_tasks WHERE plan_id = p_plan_id LOOP
    v_task_uuid := gen_random_uuid();
    v_due_at := now() + (v_task.sla_duration_minutes * INTERVAL '1 minute');

    -- If a task has predecessors, start it in WAITING_DEPENDENCY. Otherwise start in READY.
    IF EXISTS (
      SELECT 1 FROM public.ai_plan_dependencies
      WHERE plan_id = p_plan_id AND successor_temp_id = v_task.temp_id
    ) THEN
      INSERT INTO public.department_tasks (
        id, case_id, department, task_code, title, description, task_status, priority, due_at, created_at, updated_at
      ) VALUES (
        v_task_uuid, v_plan.case_id, v_task.department, v_task.temp_id, v_task.title, v_task.description,
        'WAITING_DEPENDENCY', v_task.priority, v_due_at, now(), now()
      );
    ELSE
      INSERT INTO public.department_tasks (
        id, case_id, department, task_code, title, description, task_status, priority, due_at, created_at, updated_at
      ) VALUES (
        v_task_uuid, v_plan.case_id, v_task.department, v_task.temp_id, v_task.title, v_task.description,
        'READY', v_task.priority, v_due_at, now(), now()
      );
    END IF;

    -- Store mapping
    INSERT INTO temp_task_mapping (temp_id, real_uuid) VALUES (v_task.temp_id, v_task_uuid);

    -- Create SLA Instance
    INSERT INTO public.sla_instances (
      case_id, entity_type, entity_id, policy_id, clock_type, started_at, due_at, status
    ) VALUES (
      v_plan.case_id, 'TASK', v_task_uuid, v_default_policy_id, 'TASK_COMPLETION', now(), v_due_at, 'ACTIVE'
    );

    -- Log workflow event
    INSERT INTO public.workflow_events (
      case_id, task_id, actor_id, actor_department, event_type, from_status, to_status, metadata
    ) VALUES (
      v_plan.case_id, v_task_uuid, p_actor_id, 'coordinator', 'TASK_CREATED', NULL, 
      CASE WHEN EXISTS(SELECT 1 FROM public.ai_plan_dependencies WHERE plan_id = p_plan_id AND successor_temp_id = v_task.temp_id) THEN 'WAITING_DEPENDENCY' ELSE 'READY' END,
      jsonb_build_object('created_via', 'AI_PLAN_APPROVAL')
    );
  END LOOP;

  -- 10. Insert dependencies using mapped UUIDs
  FOR v_dep IN SELECT * FROM public.ai_plan_dependencies WHERE plan_id = p_plan_id LOOP
    SELECT real_uuid INTO v_predecessor_uuid FROM temp_task_mapping WHERE temp_id = v_dep.predecessor_temp_id;
    SELECT real_uuid INTO v_successor_uuid FROM temp_task_mapping WHERE temp_id = v_dep.successor_temp_id;

    INSERT INTO public.task_dependencies (
      case_id, predecessor_task_id, successor_task_id, dependency_type, created_by, created_at
    ) VALUES (
      v_plan.case_id, v_predecessor_uuid, v_successor_uuid, 'FINISH_TO_START', p_actor_id, now()
    );

    -- Log dependency added
    INSERT INTO public.workflow_events (
      case_id, task_id, actor_id, event_type, metadata
    ) VALUES (
      v_plan.case_id, v_successor_uuid, p_actor_id, 'DEPENDENCY_ADDED',
      jsonb_build_object('predecessor_task_id', v_predecessor_uuid, 'reason', v_dep.reason)
    );
  END LOOP;

  -- 11. Update reported_issues main coordination info (including severity)
  UPDATE public.reported_issues
  SET coordination_type = 'multi_department',
      coordination_status = 'active',
      lead_department = v_lead_dept,
      coordination_started_at = now(),
      severity = COALESCE(v_plan.risk_level, 'MEDIUM'),
      updated_at = now()
  WHERE id = v_plan.case_id;

  -- 12. Mark plan as ACTIVATED
  UPDATE public.ai_coordination_plans
  SET status = 'ACTIVATED',
      approved_by = p_actor_id,
      approved_at = now(),
      updated_at = now()
  WHERE id = p_plan_id;

  -- 13. Log plan activated event
  INSERT INTO public.workflow_events (
    case_id, actor_id, event_type, metadata
  ) VALUES (
    v_plan.case_id, p_actor_id, 'PLAN_ACTIVATED',
    jsonb_build_object('plan_id', p_plan_id, 'risk_level', v_plan.risk_level)
  );

END;
$$;
