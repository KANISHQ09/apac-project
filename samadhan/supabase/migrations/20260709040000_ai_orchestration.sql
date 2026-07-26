-- =============================================================================
-- Migration: AI Coordination Orchestrator & Human approval gate (Prompt 5)
-- =============================================================================

-- 1. Create ai_coordination_plans table
CREATE TABLE IF NOT EXISTS public.ai_coordination_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.reported_issues(id) ON DELETE CASCADE NOT NULL,
  plan_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'GENERATING', 'GENERATED', 'VALIDATION_FAILED', 'REVIEW_REQUIRED', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'ACTIVATION_FAILED', 'ACTIVATED')),
  model_provider TEXT,
  model_name TEXT,
  prompt_version TEXT,
  input_snapshot JSONB,
  vision_snapshot JSONB,
  nearby_context_snapshot JSONB,
  raw_model_response JSONB,
  validated_plan JSONB,
  confidence NUMERIC,
  risk_level TEXT,
  generation_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generation_completed_at TIMESTAMPTZ,
  generated_by_service TEXT,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  supersedes_plan_id UUID REFERENCES public.ai_coordination_plans(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create ai_plan_participants table
CREATE TABLE IF NOT EXISTS public.ai_plan_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES public.ai_coordination_plans(id) ON DELETE CASCADE NOT NULL,
  department TEXT NOT NULL,
  participation_role TEXT NOT NULL CHECK (participation_role IN ('LEAD', 'RESPONSIBLE', 'SUPPORTING', 'CONSULTED', 'OBSERVER')),
  responsibility_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create ai_plan_tasks table
CREATE TABLE IF NOT EXISTS public.ai_plan_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES public.ai_coordination_plans(id) ON DELETE CASCADE NOT NULL,
  temp_id TEXT NOT NULL, -- "T1", "T2", etc.
  department TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  sla_duration_minutes INTEGER NOT NULL DEFAULT 1440,
  completion_evidence_rules JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create ai_plan_dependencies table
CREATE TABLE IF NOT EXISTS public.ai_plan_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES public.ai_coordination_plans(id) ON DELETE CASCADE NOT NULL,
  predecessor_temp_id TEXT NOT NULL,
  successor_temp_id TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Create ai_plan_edit_events table (Audit Log)
CREATE TABLE IF NOT EXISTS public.ai_plan_edit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES public.ai_coordination_plans(id) ON DELETE CASCADE NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('PARTICIPANT', 'TASK', 'DEPENDENCY', 'PLAN')),
  entity_id TEXT, -- temp_id or UUID
  action TEXT NOT NULL CHECK (action IN ('ADD', 'REMOVE', 'UPDATE')),
  before_state JSONB,
  after_state JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_ai_coordination_plans_case ON public.ai_coordination_plans(case_id);
CREATE INDEX IF NOT EXISTS idx_ai_plan_participants_plan ON public.ai_plan_participants(plan_id);
CREATE INDEX IF NOT EXISTS idx_ai_plan_tasks_plan ON public.ai_plan_tasks(plan_id);
CREATE INDEX IF NOT EXISTS idx_ai_plan_dependencies_plan ON public.ai_plan_dependencies(plan_id);
CREATE INDEX IF NOT EXISTS idx_ai_plan_edit_events_plan ON public.ai_plan_edit_events(plan_id);

-- 7. Enable RLS
ALTER TABLE public.ai_coordination_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_plan_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_plan_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_plan_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_plan_edit_events ENABLE ROW LEVEL SECURITY;

-- 8. Policies
CREATE POLICY "AI plans readable by auth" ON public.ai_coordination_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "AI plans manageable by staff" ON public.ai_coordination_plans FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "AI plan participants readable by auth" ON public.ai_plan_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "AI plan participants manageable by staff" ON public.ai_plan_participants FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "AI plan tasks readable by auth" ON public.ai_plan_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "AI plan tasks manageable by staff" ON public.ai_plan_tasks FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "AI plan dependencies readable by auth" ON public.ai_plan_dependencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "AI plan dependencies manageable by staff" ON public.ai_plan_dependencies FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "AI plan edit events readable by auth" ON public.ai_plan_edit_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "AI plan edit events manageable by staff" ON public.ai_plan_edit_events FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')
);

-- 9. DAG cycle validation functions
CREATE OR REPLACE FUNCTION public.validate_plan_dag(p_plan_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF EXISTS (
    WITH RECURSIVE search_cycle(start_id, current_id, path, is_cycle) AS (
      SELECT temp_id, temp_id, ARRAY[temp_id], FALSE
      FROM public.ai_plan_tasks WHERE plan_id = p_plan_id
      UNION ALL
      SELECT sc.start_id, dep.successor_temp_id, sc.path || dep.successor_temp_id, dep.successor_temp_id = ANY(sc.path)
      FROM search_cycle sc
      JOIN public.ai_plan_dependencies dep ON dep.predecessor_temp_id = sc.current_id AND dep.plan_id = p_plan_id
      WHERE NOT sc.is_cycle
    )
    SELECT 1 FROM search_cycle WHERE is_cycle = TRUE LIMIT 1
  ) THEN
    RETURN FALSE;
  END IF;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 10. Atomic approval and activation function
CREATE OR REPLACE FUNCTION public.approve_and_activate_coordination_plan(p_plan_id UUID, p_actor_id UUID)
RETURNS VOID AS $$
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

  -- 11. Update reported_issues main coordination info
  UPDATE public.reported_issues
  SET coordination_type = 'multi_department',
      coordination_status = 'active',
      lead_department = v_lead_dept,
      coordination_started_at = now(),
      updated_at = now()
  WHERE id = v_plan.case_id;

  -- 12. Mark plan as ACTIVATED
  UPDATE public.ai_coordination_plans
  SET status = 'ACTIVATED',
      approved_by = p_actor_id,
      approved_at = now(),
      updated_at = now()
  WHERE id = p_plan_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.validate_plan_dag(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_and_activate_coordination_plan(UUID, UUID) TO authenticated;
