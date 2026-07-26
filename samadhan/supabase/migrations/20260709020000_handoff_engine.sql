-- =============================================================================
-- Migration: Evidence-Based Handoffs & Dynamic Rerouting (Prompt 3)
-- =============================================================================

-- 1. Alter task_dependencies to add requires_handoff
ALTER TABLE public.task_dependencies ADD COLUMN IF NOT EXISTS requires_handoff BOOLEAN NOT NULL DEFAULT false;

-- 2. Update task_status check constraint in department_tasks
ALTER TABLE public.department_tasks DROP CONSTRAINT IF EXISTS department_tasks_task_status_check;
ALTER TABLE public.department_tasks ADD CONSTRAINT department_tasks_task_status_check 
  CHECK (task_status IN (
    'DRAFT', 'ASSIGNED', 'WAITING_DEPENDENCY', 'READY', 'ACCEPTED', 
    'WORKING', 'BLOCKED', 'COMPLETED', 'REJECTED', 'CANCELLED',
    'COMPLETED_PENDING_HANDOFF', 'WAITING_HANDOFF', 'REWORK_REQUIRED'
  ));

-- 3. Create task_handoffs table
CREATE TABLE IF NOT EXISTS public.task_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.reported_issues(id) ON DELETE CASCADE NOT NULL,
  source_task_id UUID REFERENCES public.department_tasks(id) ON DELETE CASCADE NOT NULL,
  target_task_id UUID REFERENCES public.department_tasks(id) ON DELETE CASCADE NOT NULL,
  from_department TEXT NOT NULL,
  to_department TEXT NOT NULL,
  handoff_status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (handoff_status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'CANCELLED')),
  revision_number INTEGER NOT NULL DEFAULT 1,
  submission_note TEXT,
  acceptance_note TEXT,
  rejection_reason TEXT,
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  supersedes_handoff_id UUID REFERENCES public.task_handoffs(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_source_target_different CHECK (source_task_id != target_task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_handoffs_case_id ON public.task_handoffs(case_id);
CREATE INDEX IF NOT EXISTS idx_task_handoffs_to_dept ON public.task_handoffs(to_department, handoff_status);
CREATE INDEX IF NOT EXISTS idx_task_handoffs_from_dept ON public.task_handoffs(from_department, handoff_status);
CREATE INDEX IF NOT EXISTS idx_task_handoffs_source ON public.task_handoffs(source_task_id);
CREATE INDEX IF NOT EXISTS idx_task_handoffs_target ON public.task_handoffs(target_task_id);

-- 4. Create handoff_evidence table
CREATE TABLE IF NOT EXISTS public.handoff_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handoff_id UUID REFERENCES public.task_handoffs(id) ON DELETE CASCADE NOT NULL,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('PHOTO', 'VIDEO', 'DOCUMENT', 'INSPECTION_NOTE', 'GEO_CONFIRMATION', 'OTHER')),
  storage_path TEXT,
  public_url TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  captured_at TIMESTAMPTZ,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB,
  checksum TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_handoff_evidence_handoff ON public.handoff_evidence(handoff_id);

-- 5. Create coordination_change_requests table
CREATE TABLE IF NOT EXISTS public.coordination_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.reported_issues(id) ON DELETE CASCADE NOT NULL,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requesting_department TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('ADD_DEPARTMENT', 'REMOVE_DEPARTMENT', 'CHANGE_LEAD', 'ADD_TASK', 'RESEQUENCE', 'EMERGENCY_SUPPORT')),
  proposed_department TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coordination_change_case ON public.coordination_change_requests(case_id, status);

-- 6. Create task_transfer_requests table
CREATE TABLE IF NOT EXISTS public.task_transfer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.reported_issues(id) ON DELETE CASCADE NOT NULL,
  task_id UUID REFERENCES public.department_tasks(id) ON DELETE CASCADE NOT NULL,
  from_department TEXT NOT NULL,
  proposed_to_department TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED')),
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_task_transfer_task ON public.task_transfer_requests(task_id, status);

-- Enable RLS
ALTER TABLE public.task_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handoff_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coordination_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_transfer_requests ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies
CREATE POLICY "View handoffs policy" ON public.task_handoffs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage handoffs policy" ON public.task_handoffs FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin')
  OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND (department = from_department OR department = to_department)
  )
);

CREATE POLICY "View evidence policy" ON public.handoff_evidence FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage evidence policy" ON public.handoff_evidence FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin')
  OR EXISTS (
    SELECT 1 FROM public.task_handoffs h
    JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE h.id = handoff_id
      AND (ur.department = h.from_department OR ur.department = h.to_department)
  )
);

CREATE POLICY "View change requests policy" ON public.coordination_change_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage change requests policy" ON public.coordination_change_requests FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND department = requesting_department
  )
);

CREATE POLICY "View transfer requests policy" ON public.task_transfer_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage transfer requests policy" ON public.task_transfer_requests FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin')
  OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND (department = from_department OR department = proposed_to_department)
  )
);

-- 8. Trigger to enforce dependency gates (cannot set to WORKING/COMPLETED if predecessors not done)
CREATE OR REPLACE FUNCTION public.trigger_check_task_dependencies()
RETURNS TRIGGER AS $$
DECLARE
  v_unfinished_predecessor TEXT;
BEGIN
  IF NEW.task_status IN ('WORKING', 'COMPLETED', 'COMPLETED_PENDING_HANDOFF') THEN
    SELECT t.task_code INTO v_unfinished_predecessor
    FROM public.task_dependencies td
    JOIN public.department_tasks t ON t.id = td.predecessor_task_id
    WHERE td.successor_task_id = NEW.id
      AND t.task_status NOT IN ('COMPLETED', 'COMPLETED_PENDING_HANDOFF')
    LIMIT 1;

    IF v_unfinished_predecessor IS NOT NULL THEN
      RAISE EXCEPTION 'Task cannot enter WORKING or COMPLETED status because predecessor task (%) is not completed.', v_unfinished_predecessor;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper function to recalculate a specific successor task's status
CREATE OR REPLACE FUNCTION public.recalculate_successor_status(p_successor_id UUID)
RETURNS VOID AS $$
DECLARE
  v_successor public.department_tasks;
  v_all_predecessors_completed BOOLEAN;
  v_pending_handoff BOOLEAN;
BEGIN
  SELECT * INTO v_successor FROM public.department_tasks WHERE id = p_successor_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- 1. Check if all predecessors are completed
  SELECT NOT EXISTS (
    SELECT 1 FROM public.task_dependencies td
    JOIN public.department_tasks t ON t.id = td.predecessor_task_id
    WHERE td.successor_task_id = p_successor_id
      AND t.task_status NOT IN ('COMPLETED', 'COMPLETED_PENDING_HANDOFF')
  ) INTO v_all_predecessors_completed;

  IF NOT v_all_predecessors_completed THEN
    -- Predecessors are not fully done, keep in WAITING_DEPENDENCY
    IF v_successor.task_status != 'WAITING_DEPENDENCY' AND v_successor.task_status NOT IN ('DRAFT', 'ASSIGNED', 'REJECTED', 'CANCELLED') THEN
      UPDATE public.department_tasks SET task_status = 'WAITING_DEPENDENCY', updated_at = now() WHERE id = p_successor_id;
    END IF;
    RETURN;
  END IF;

  -- 2. Predecessors are done, check if there are pending required handoffs
  SELECT EXISTS (
    SELECT 1 FROM public.task_dependencies td
    WHERE td.successor_task_id = p_successor_id
      AND td.requires_handoff = true
      AND NOT EXISTS (
        SELECT 1 FROM public.task_handoffs th
        WHERE th.source_task_id = td.predecessor_task_id
          AND th.target_task_id = p_successor_id
          AND th.handoff_status = 'ACCEPTED'
      )
  ) INTO v_pending_handoff;

  IF v_pending_handoff THEN
    -- Handoffs are pending, successor must be in WAITING_HANDOFF
    IF v_successor.task_status IN ('WAITING_DEPENDENCY', 'READY') THEN
      UPDATE public.department_tasks SET task_status = 'WAITING_HANDOFF', updated_at = now() WHERE id = p_successor_id;
      
      INSERT INTO public.workflow_events (
        case_id, task_id, event_type, from_status, to_status, metadata
      ) VALUES (
        v_successor.case_id, v_successor.id, 'TASK_BECAME_READY', v_successor.task_status, 'WAITING_HANDOFF',
        jsonb_build_object('reason', 'Predecessors complete, awaiting handoff approval')
      );
    END IF;
  ELSE
    -- Predecessors done and all required handoffs accepted! Ready to execute
    IF v_successor.task_status IN ('WAITING_DEPENDENCY', 'WAITING_HANDOFF') THEN
      UPDATE public.department_tasks SET task_status = 'READY', updated_at = now() WHERE id = p_successor_id;

      INSERT INTO public.workflow_events (
        case_id, task_id, event_type, from_status, to_status, metadata
      ) VALUES (
        v_successor.case_id, v_successor.id, 'TASK_BECAME_READY', v_successor.task_status, 'READY',
        jsonb_build_object('reason', 'All predecessors and required handoffs completed')
      );
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate trigger_activate_successors to recalculate successors status when a task goes to COMPLETED or COMPLETED_PENDING_HANDOFF
CREATE OR REPLACE FUNCTION public.trigger_activate_successors()
RETURNS TRIGGER AS $$
DECLARE
  v_successor RECORD;
BEGIN
  IF (OLD.task_status NOT IN ('COMPLETED', 'COMPLETED_PENDING_HANDOFF') AND NEW.task_status IN ('COMPLETED', 'COMPLETED_PENDING_HANDOFF')) THEN
    FOR v_successor IN 
      SELECT id FROM public.department_tasks
      WHERE id IN (
        SELECT successor_task_id FROM public.task_dependencies WHERE predecessor_task_id = NEW.id
      )
    LOOP
      PERFORM public.recalculate_successor_status(v_successor.id);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Authoritative Transition RPC Override
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
  v_has_handoff_dep BOOLEAN;
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
    IF v_old_status NOT IN ('ASSIGNED', 'REJECTED') THEN
      RAISE EXCEPTION 'Invalid transition: Can only accept task from ASSIGNED or REJECTED status.';
    END IF;

    -- Evaluate whether to go to READY or WAITING_DEPENDENCY
    SELECT NOT EXISTS (
      SELECT 1 FROM public.task_dependencies td
      JOIN public.department_tasks t ON t.id = td.predecessor_task_id
      WHERE td.successor_task_id = p_task_id
        AND t.task_status NOT IN ('COMPLETED', 'COMPLETED_PENDING_HANDOFF')
    ) INTO v_all_predecessors_completed;

    IF v_all_predecessors_completed THEN
      -- Also check if there are pending handoffs
      SELECT EXISTS (
        SELECT 1 FROM public.task_dependencies td
        WHERE td.successor_task_id = p_task_id
          AND td.requires_handoff = true
          AND NOT EXISTS (
            SELECT 1 FROM public.task_handoffs th
            WHERE th.source_task_id = td.predecessor_task_id
              AND th.target_task_id = p_task_id
              AND th.handoff_status = 'ACCEPTED'
          )
      ) INTO v_has_handoff_dep;

      IF v_has_handoff_dep THEN
        p_new_status := 'WAITING_HANDOFF';
      ELSE
        p_new_status := 'READY';
      END IF;
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
    IF v_old_status NOT IN ('READY', 'BLOCKED', 'REWORK_REQUIRED') THEN
      RAISE EXCEPTION 'Invalid transition: Can only start task from READY, BLOCKED, or REWORK_REQUIRED status.';
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

    -- Check if any outgoing dependencies require a handoff
    SELECT EXISTS (
      SELECT 1 FROM public.task_dependencies
      WHERE predecessor_task_id = p_task_id
        AND requires_handoff = true
    ) INTO v_has_handoff_dep;

    IF v_has_handoff_dep THEN
      p_new_status := 'COMPLETED_PENDING_HANDOFF';
    ELSE
      p_new_status := 'COMPLETED';
    END IF;

    UPDATE public.department_tasks
    SET task_status = p_new_status,
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
      WHEN p_new_status = 'WAITING_HANDOFF' THEN 'TASK_ACCEPTED'
      WHEN p_new_status = 'WORKING' THEN 'TASK_STARTED'
      WHEN p_new_status = 'BLOCKED' THEN 'TASK_BLOCKED'
      WHEN p_new_status = 'COMPLETED' THEN 'TASK_COMPLETED'
      WHEN p_new_status = 'COMPLETED_PENDING_HANDOFF' THEN 'TASK_COMPLETED'
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

-- 10. Handoff operations RPCs
CREATE OR REPLACE FUNCTION public.submit_task_handoff(
  p_case_id UUID,
  p_source_task_id UUID,
  p_target_task_id UUID,
  p_note TEXT,
  p_actor_id UUID
)
RETURNS public.task_handoffs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handoff public.task_handoffs;
  v_source public.department_tasks;
  v_target public.department_tasks;
  v_actor_dept TEXT;
  v_actor_role TEXT;
  v_rev_count INT;
  v_prev_id UUID;
BEGIN
  -- Validate tasks
  SELECT * INTO v_source FROM public.department_tasks WHERE id = p_source_task_id FOR UPDATE;
  SELECT * INTO v_target FROM public.department_tasks WHERE id = p_target_task_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source or target task not found.';
  END IF;

  SELECT department, role INTO v_actor_dept, v_actor_role FROM public.user_roles WHERE user_id = p_actor_id;
  
  IF v_actor_role != 'super_admin' AND (v_actor_dept IS NULL OR v_actor_dept != v_source.department) THEN
    RAISE EXCEPTION 'Unauthorized: Only the source department staff can submit a handoff.';
  END IF;

  -- Ensure valid status for handoff submission
  IF v_source.task_status NOT IN ('COMPLETED_PENDING_HANDOFF', 'WORKING', 'REWORK_REQUIRED') THEN
    RAISE EXCEPTION 'Invalid task status for submitting handoff: %', v_source.task_status;
  END IF;

  -- Revision counting
  SELECT COALESCE(MAX(revision_number), 0), MAX(id) INTO v_rev_count, v_prev_id 
  FROM public.task_handoffs 
  WHERE source_task_id = p_source_task_id AND target_task_id = p_target_task_id;

  IF v_prev_id IS NOT NULL THEN
    UPDATE public.task_handoffs SET handoff_status = 'SUPERSEDED' WHERE id = v_prev_id;
  END IF;

  -- Update source task to COMPLETED_PENDING_HANDOFF
  IF v_source.task_status != 'COMPLETED_PENDING_HANDOFF' THEN
    UPDATE public.department_tasks SET task_status = 'COMPLETED_PENDING_HANDOFF', updated_at = now() WHERE id = p_source_task_id;
  END IF;

  -- Insert handoff
  INSERT INTO public.task_handoffs (
    case_id, source_task_id, target_task_id, from_department, to_department,
    handoff_status, revision_number, submission_note, submitted_by, submitted_at,
    supersedes_handoff_id
  ) VALUES (
    p_case_id, p_source_task_id, p_target_task_id, v_source.department, v_target.department,
    'SUBMITTED', v_rev_count + 1, p_note, p_actor_id, now(), v_prev_id
  ) RETURNING * INTO v_handoff;

  -- Log event
  INSERT INTO public.workflow_events (
    case_id, task_id, actor_id, actor_department, event_type, from_status, to_status, metadata
  ) VALUES (
    p_case_id, p_source_task_id, p_actor_id, v_actor_dept, 'TASK_COMPLETED',
    v_source.task_status, 'COMPLETED_PENDING_HANDOFF',
    jsonb_build_object('reason', 'Handoff submitted to ' || v_target.department, 'handoff_id', v_handoff.id)
  );

  RETURN v_handoff;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_task_handoff(
  p_handoff_id UUID,
  p_note TEXT,
  p_actor_id UUID
)
RETURNS public.task_handoffs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handoff public.task_handoffs;
  v_source public.department_tasks;
  v_target public.department_tasks;
  v_actor_dept TEXT;
  v_actor_role TEXT;
  v_all_handoffs_accepted BOOLEAN;
BEGIN
  SELECT * INTO v_handoff FROM public.task_handoffs WHERE id = p_handoff_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Handoff not found.';
  END IF;

  SELECT department, role INTO v_actor_dept, v_actor_role FROM public.user_roles WHERE user_id = p_actor_id;

  IF v_actor_role != 'super_admin' AND (v_actor_dept IS NULL OR v_actor_dept != v_handoff.to_department) THEN
    RAISE EXCEPTION 'Unauthorized: Only the target department staff can accept a handoff.';
  END IF;

  IF v_handoff.handoff_status NOT IN ('SUBMITTED', 'UNDER_REVIEW') THEN
    RAISE EXCEPTION 'Invalid handoff status for acceptance: %', v_handoff.handoff_status;
  END IF;

  -- Update handoff
  UPDATE public.task_handoffs
  SET handoff_status = 'ACCEPTED',
      acceptance_note = p_note,
      reviewed_by = p_actor_id,
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_handoff_id
  RETURNING * INTO v_handoff;

  -- Check if other handoffs for the source task are complete to move it to COMPLETED status
  SELECT NOT EXISTS (
    SELECT 1 FROM public.task_dependencies td
    WHERE td.predecessor_task_id = v_handoff.source_task_id
      AND td.requires_handoff = true
      AND NOT EXISTS (
        SELECT 1 FROM public.task_handoffs th
        WHERE th.source_task_id = v_handoff.source_task_id
          AND th.target_task_id = td.successor_task_id
          AND th.handoff_status = 'ACCEPTED'
      )
  ) INTO v_all_handoffs_accepted;

  IF v_all_handoffs_accepted THEN
    UPDATE public.department_tasks SET task_status = 'COMPLETED', updated_at = now() WHERE id = v_handoff.source_task_id;
  END IF;

  -- Recompute target task status
  PERFORM public.recalculate_successor_status(v_handoff.target_task_id);

  -- Log event
  INSERT INTO public.workflow_events (
    case_id, task_id, actor_id, actor_department, event_type, from_status, to_status, metadata
  ) VALUES (
    v_handoff.case_id, v_handoff.target_task_id, p_actor_id, v_actor_dept, 'TASK_ACCEPTED',
    'WAITING_HANDOFF', 'READY',
    jsonb_build_object('reason', 'Handoff accepted: ' || p_note, 'handoff_id', v_handoff.id)
  );

  RETURN v_handoff;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_task_handoff(
  p_handoff_id UUID,
  p_reason TEXT,
  p_actor_id UUID
)
RETURNS public.task_handoffs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handoff public.task_handoffs;
  v_actor_dept TEXT;
  v_actor_role TEXT;
BEGIN
  IF p_reason IS NULL OR p_reason = '' THEN
    RAISE EXCEPTION 'Rejection reason is mandatory.';
  END IF;

  SELECT * INTO v_handoff FROM public.task_handoffs WHERE id = p_handoff_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Handoff not found.';
  END IF;

  SELECT department, role INTO v_actor_dept, v_actor_role FROM public.user_roles WHERE user_id = p_actor_id;

  IF v_actor_role != 'super_admin' AND (v_actor_dept IS NULL OR v_actor_dept != v_handoff.to_department) THEN
    RAISE EXCEPTION 'Unauthorized: Only the target department staff can reject a handoff.';
  END IF;

  IF v_handoff.handoff_status NOT IN ('SUBMITTED', 'UNDER_REVIEW') THEN
    RAISE EXCEPTION 'Invalid handoff status for rejection: %', v_handoff.handoff_status;
  END IF;

  -- Update handoff
  UPDATE public.task_handoffs
  SET handoff_status = 'REJECTED',
      rejection_reason = p_reason,
      reviewed_by = p_actor_id,
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_handoff_id
  RETURNING * INTO v_handoff;

  -- Move source task back to REWORK_REQUIRED
  UPDATE public.department_tasks 
  SET task_status = 'REWORK_REQUIRED', 
      rejection_reason = p_reason,
      updated_at = now() 
  WHERE id = v_handoff.source_task_id;

  -- Log event
  INSERT INTO public.workflow_events (
    case_id, task_id, actor_id, actor_department, event_type, from_status, to_status, metadata
  ) VALUES (
    v_handoff.case_id, v_handoff.source_task_id, p_actor_id, v_actor_dept, 'TASK_REJECTED',
    'COMPLETED_PENDING_HANDOFF', 'REWORK_REQUIRED',
    jsonb_build_object('reason', 'Handoff rejected: ' || p_reason, 'handoff_id', v_handoff.id)
  );

  RETURN v_handoff;
END;
$$;

-- Grant permissions for new RPCs
GRANT EXECUTE ON FUNCTION public.submit_task_handoff(UUID, UUID, UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_task_handoff(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_task_handoff(UUID, TEXT, UUID) TO authenticated;
