-- =============================================================================
-- Migration: Coordinated Execution Engine & Dependency DAG (Prompt 2)
-- =============================================================================

-- 1. Create department_tasks table
CREATE TABLE IF NOT EXISTS public.department_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.reported_issues(id) ON DELETE CASCADE NOT NULL,
  department TEXT NOT NULL,
  task_code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  task_status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK (task_status IN ('DRAFT', 'ASSIGNED', 'WAITING_DEPENDENCY', 'READY', 'ACCEPTED', 'WORKING', 'BLOCKED', 'COMPLETED', 'REJECTED', 'CANCELLED')),
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  blocked_at TIMESTAMPTZ,
  blocked_reason TEXT,
  rejection_reason TEXT,
  due_at TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: task_code must be unique per case (e.g. T1, T2, etc.)
CREATE UNIQUE INDEX IF NOT EXISTS idx_department_tasks_code_unique ON public.department_tasks(case_id, task_code);
CREATE INDEX IF NOT EXISTS idx_department_tasks_case_id ON public.department_tasks(case_id);
CREATE INDEX IF NOT EXISTS idx_department_tasks_dept ON public.department_tasks(department, task_status);

-- 2. Create task_dependencies table
CREATE TABLE IF NOT EXISTS public.task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.reported_issues(id) ON DELETE CASCADE NOT NULL,
  predecessor_task_id UUID NOT NULL REFERENCES public.department_tasks(id) ON DELETE CASCADE,
  successor_task_id UUID NOT NULL REFERENCES public.department_tasks(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'FINISH_TO_START' CHECK (dependency_type IN ('FINISH_TO_START', 'FINISH_TO_FINISH')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_predecessor_successor_not_equal CHECK (predecessor_task_id != successor_task_id)
);

-- Unique index to prevent duplicate edges
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_dependencies_unique ON public.task_dependencies(predecessor_task_id, successor_task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_successor ON public.task_dependencies(successor_task_id);

-- 3. Create workflow_events table (Operational Log)
CREATE TABLE IF NOT EXISTS public.workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.reported_issues(id) ON DELETE CASCADE NOT NULL,
  task_id UUID REFERENCES public.department_tasks(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_department TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('TASK_CREATED', 'TASK_ASSIGNED', 'TASK_ACCEPTED', 'TASK_REJECTED', 'TASK_STARTED', 'TASK_BLOCKED', 'TASK_UNBLOCKED', 'TASK_COMPLETED', 'DEPENDENCY_ADDED', 'DEPENDENCY_REMOVED', 'TASK_BECAME_READY', 'PRIVILEGED_OVERRIDE', 'PLAN_ACTIVATED', 'SIGNOFF_SUBMITTED', 'SIGNOFF_REVOKED', 'CASE_CLOSED', 'CASE_REOPENED')),
  from_status TEXT,
  to_status TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_events_case_id ON public.workflow_events(case_id, created_at);

-- 4. Authoritative Cycle Detection Function
CREATE OR REPLACE FUNCTION public.check_dependency_cycle(p_successor_id UUID, p_predecessor_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_cycle_detected BOOLEAN := FALSE;
BEGIN
  IF p_successor_id = p_predecessor_id THEN
    RETURN TRUE;
  END IF;

  WITH RECURSIVE dependency_chain AS (
    SELECT successor_task_id FROM public.task_dependencies WHERE predecessor_task_id = p_successor_id
    UNION
    SELECT td.successor_task_id FROM public.task_dependencies td
    JOIN dependency_chain dc ON td.predecessor_task_id = dc.successor_task_id
  )
  SELECT EXISTS(
    SELECT 1 FROM dependency_chain WHERE successor_task_id = p_predecessor_id
  ) INTO v_cycle_detected;

  RETURN v_cycle_detected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Cycle prevention trigger
CREATE OR REPLACE FUNCTION public.trigger_check_dependency_cycle()
RETURNS TRIGGER AS $$
BEGIN
  IF public.check_dependency_cycle(NEW.successor_task_id, NEW.predecessor_task_id) THEN
    RAISE EXCEPTION 'Circular dependency detected: adding this edge creates a cycle in the task graph.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prevent_cycle ON public.task_dependencies;
CREATE TRIGGER trigger_prevent_cycle
  BEFORE INSERT OR UPDATE ON public.task_dependencies
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_check_dependency_cycle();

-- 5. Trigger to enforce dependency status gates (cannot set to WORKING/COMPLETED if predecessors not done)
CREATE OR REPLACE FUNCTION public.trigger_check_task_dependencies()
RETURNS TRIGGER AS $$
DECLARE
  v_unfinished_predecessor TEXT;
BEGIN
  IF NEW.task_status IN ('WORKING', 'COMPLETED') THEN
    SELECT t.task_code INTO v_unfinished_predecessor
    FROM public.task_dependencies td
    JOIN public.department_tasks t ON t.id = td.predecessor_task_id
    WHERE td.successor_task_id = NEW.id
      AND t.task_status != 'COMPLETED'
    LIMIT 1;

    IF v_unfinished_predecessor IS NOT NULL THEN
      RAISE EXCEPTION 'Task cannot enter WORKING or COMPLETED status because predecessor task (%) is not completed.', v_unfinished_predecessor;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_enforce_dependency_gates ON public.department_tasks;
CREATE TRIGGER trigger_enforce_dependency_gates
  BEFORE UPDATE ON public.department_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_check_task_dependencies();

-- 6. Trigger to automatically unlock downstream tasks when a task is completed
CREATE OR REPLACE FUNCTION public.trigger_activate_successors()
RETURNS TRIGGER AS $$
DECLARE
  v_successor RECORD;
  v_all_predecessors_completed BOOLEAN;
BEGIN
  IF OLD.task_status != 'COMPLETED' AND NEW.task_status = 'COMPLETED' THEN
    FOR v_successor IN 
      SELECT t.* FROM public.department_tasks t
      JOIN public.task_dependencies td ON td.successor_task_id = t.id
      WHERE td.predecessor_task_id = NEW.id
    LOOP
      SELECT NOT EXISTS (
        SELECT 1 FROM public.task_dependencies td2
        JOIN public.department_tasks t2 ON t2.id = td2.predecessor_task_id
        WHERE td2.successor_task_id = v_successor.id
          AND t2.task_status != 'COMPLETED'
      ) INTO v_all_predecessors_completed;

      IF v_all_predecessors_completed AND v_successor.task_status = 'WAITING_DEPENDENCY' THEN
        UPDATE public.department_tasks
        SET task_status = 'READY',
            updated_at = now()
        WHERE id = v_successor.id;

        INSERT INTO public.workflow_events (
          case_id,
          task_id,
          event_type,
          from_status,
          to_status,
          metadata
        ) VALUES (
          v_successor.case_id,
          v_successor.id,
          'TASK_BECAME_READY',
          'WAITING_DEPENDENCY',
          'READY',
          jsonb_build_object('reason', 'All predecessor tasks completed')
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_unlock_downstream ON public.department_tasks;
CREATE TRIGGER trigger_unlock_downstream
  AFTER UPDATE ON public.department_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_activate_successors();

-- 7. Controlled Task Transition RPC
CREATE OR REPLACE FUNCTION public.transition_department_task(
  p_task_id UUID,
  p_new_status TEXT,
  p_actor_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.department_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.department_tasks;
  v_old_status TEXT;
  v_role TEXT;
  v_user_dept TEXT;
  v_all_predecessors_completed BOOLEAN;
BEGIN
  SELECT * INTO v_task FROM public.department_tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found.';
  END IF;

  v_old_status := v_task.task_status;

  SELECT department, role INTO v_user_dept, v_role FROM public.user_roles WHERE user_id = p_actor_id;

  IF v_role != 'super_admin' AND (v_user_dept IS NULL OR v_user_dept != v_task.department) THEN
    RAISE EXCEPTION 'Unauthorized: User does not belong to department %.', v_task.department;
  END IF;

  IF p_new_status = 'ACCEPTED' THEN
    IF v_old_status != 'ASSIGNED' THEN
      RAISE EXCEPTION 'Invalid transition: Can only accept task from ASSIGNED status.';
    END IF;

    SELECT NOT EXISTS (
      SELECT 1 FROM public.task_dependencies td
      JOIN public.department_tasks t ON t.id = td.predecessor_task_id
      WHERE td.successor_task_id = p_task_id
        AND t.task_status != 'COMPLETED'
    ) INTO v_all_predecessors_completed;

    IF v_all_predecessors_completed THEN
      p_new_status := 'READY';
    ELSE
      p_new_status := 'WAITING_DEPENDENCY';
    END IF;

    UPDATE public.department_tasks
    SET task_status = p_new_status,
        accepted_by = p_actor_id,
        accepted_at = now(),
        updated_at = now()
      WHERE id = p_task_id
      RETURNING * INTO v_task;

  ELSIF p_new_status = 'WORKING' THEN
    IF v_old_status NOT IN ('READY', 'BLOCKED') THEN
      RAISE EXCEPTION 'Invalid transition: Can only start task from READY or BLOCKED status.';
    END IF;

    UPDATE public.department_tasks
    SET task_status = 'WORKING',
        started_at = COALESCE(started_at, now()),
        updated_at = now()
      WHERE id = p_task_id
      RETURNING * INTO v_task;

  ELSIF p_new_status = 'BLOCKED' THEN
    IF v_old_status != 'WORKING' THEN
      RAISE EXCEPTION 'Invalid transition: Can only block task from WORKING status.';
    END IF;
    IF p_reason IS NULL OR p_reason = '' THEN
      RAISE EXCEPTION 'Blocked reason is mandatory when blocking a task.';
    END IF;

    UPDATE public.department_tasks
    SET task_status = 'BLOCKED',
        blocked_reason = p_reason,
        updated_at = now()
      WHERE id = p_task_id
      RETURNING * INTO v_task;

  ELSIF p_new_status = 'COMPLETED' THEN
    IF v_old_status != 'WORKING' THEN
      RAISE EXCEPTION 'Invalid transition: Can only complete task from WORKING status.';
    END IF;

    UPDATE public.department_tasks
    SET task_status = 'COMPLETED',
        completed_at = now(),
        updated_at = now()
      WHERE id = p_task_id
      RETURNING * INTO v_task;

  ELSIF p_new_status = 'REJECTED' THEN
    IF v_old_status NOT IN ('ASSIGNED', 'READY') THEN
      RAISE EXCEPTION 'Invalid transition: Can only reject task from ASSIGNED or READY status.';
    END IF;
    IF p_reason IS NULL OR p_reason = '' THEN
      RAISE EXCEPTION 'Rejection reason is mandatory when rejecting a task.';
    END IF;

    UPDATE public.department_tasks
    SET task_status = 'REJECTED',
        rejection_reason = p_reason,
        updated_at = now()
      WHERE id = p_task_id
      RETURNING * INTO v_task;

  ELSE
    RAISE EXCEPTION 'Invalid transition to target status: %', p_new_status;
  END IF;

  INSERT INTO public.workflow_events (
    case_id,
    task_id,
    actor_id,
    actor_department,
    event_type,
    from_status,
    to_status,
    metadata
  ) VALUES (
    v_task.case_id,
    v_task.id,
    p_actor_id,
    v_user_dept,
    CASE 
      WHEN p_new_status = 'READY' THEN 'TASK_ACCEPTED'
      WHEN p_new_status = 'WAITING_DEPENDENCY' THEN 'TASK_ACCEPTED'
      WHEN p_new_status = 'WORKING' THEN 'TASK_STARTED'
      WHEN p_new_status = 'BLOCKED' THEN 'TASK_BLOCKED'
      WHEN p_new_status = 'COMPLETED' THEN 'TASK_COMPLETED'
      WHEN p_new_status = 'REJECTED' THEN 'TASK_REJECTED'
      ELSE 'PRIVILEGED_OVERRIDE'
    END,
    v_old_status,
    p_new_status,
    jsonb_build_object('reason', p_reason)
  );

  RETURN v_task;
END;
$$;

-- 8. RLS Policies for department_tasks
ALTER TABLE public.department_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View tasks policy"
ON public.department_tasks FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Manage tasks policy"
ON public.department_tasks FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND department = department
  )
);

-- RLS Policies for task_dependencies
ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View dependencies policy"
ON public.task_dependencies FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Manage dependencies policy"
ON public.task_dependencies FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
);

-- RLS Policies for workflow_events
ALTER TABLE public.workflow_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View workflow events policy"
ON public.workflow_events FOR SELECT
TO authenticated
USING (true);

-- Trigger to update updated_at on department_tasks
DROP TRIGGER IF EXISTS update_department_tasks_updated_at ON public.department_tasks;
CREATE TRIGGER update_department_tasks_updated_at
  BEFORE UPDATE ON public.department_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.transition_department_task(UUID, TEXT, UUID, TEXT) TO authenticated;
