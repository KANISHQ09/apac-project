-- =============================================================================
-- Migration: Joint Resolution Engine, Closure Consensus & Citizen Verification
-- (Prompt 6)
-- =============================================================================

-- 0. Extend coordination_status CHECK constraint to include closure lifecycle states
ALTER TABLE public.reported_issues
  DROP CONSTRAINT IF EXISTS reported_issues_coordination_status_check;

ALTER TABLE public.reported_issues
  ADD CONSTRAINT reported_issues_coordination_status_check
  CHECK (coordination_status IN (
    'intake',
    'participation_pending',
    'coordinated',
    'active',
    'blocked',
    'closure_evaluation',
    'ready_for_joint_closure',
    'closed_pending_citizen',
    'closure_pending',
    'closed',
    'reopened',
    'cancelled'
  ));

-- =============================================================================
-- 1. CASE CLOSURE POLICIES
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.case_closure_policies (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_code                   TEXT UNIQUE NOT NULL,
  name                          TEXT NOT NULL,
  coordination_type             TEXT NOT NULL CHECK (coordination_type IN ('single_department', 'multi_department', 'emergency')),
  severity                      TEXT CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  require_all_mandatory_tasks   BOOLEAN NOT NULL DEFAULT true,
  require_all_handoffs_accepted BOOLEAN NOT NULL DEFAULT true,
  require_no_active_blockers    BOOLEAN NOT NULL DEFAULT true,
  require_no_critical_escalations BOOLEAN NOT NULL DEFAULT true,
  require_lead_signoff          BOOLEAN NOT NULL DEFAULT true,
  require_responsible_signoff   BOOLEAN NOT NULL DEFAULT false,
  require_supporting_signoff    BOOLEAN NOT NULL DEFAULT false,
  require_commissioner_approval BOOLEAN NOT NULL DEFAULT false,
  require_citizen_confirmation  BOOLEAN NOT NULL DEFAULT false,
  citizen_response_window_hours INTEGER NOT NULL DEFAULT 72,
  active                        BOOLEAN NOT NULL DEFAULT true,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default policies
INSERT INTO public.case_closure_policies (
  policy_code, name, coordination_type, severity,
  require_all_mandatory_tasks, require_all_handoffs_accepted, require_no_active_blockers,
  require_no_critical_escalations, require_lead_signoff, require_responsible_signoff,
  require_supporting_signoff, require_commissioner_approval, require_citizen_confirmation,
  citizen_response_window_hours
) VALUES
  ('SINGLE_STD',    'Single Department Standard',      'single_department', NULL,     true, false, true, false, true, false, false, false, false, 72),
  ('MULTI_LOW',     'Multi-Department Low Severity',   'multi_department',  'LOW',    true, true,  true, false, true, false, false, false, false, 72),
  ('MULTI_MED',     'Multi-Department Medium Severity','multi_department',  'MEDIUM', true, true,  true, true,  true, true,  false, false, true,  72),
  ('MULTI_HIGH',    'Multi-Department High Severity',  'multi_department',  'HIGH',   true, true,  true, true,  true, true,  true,  false, true,  48),
  ('MULTI_CRITICAL','Multi-Department Critical',       'multi_department',  'CRITICAL',true,true,  true, true,  true, true,  true,  true,  true,  24),
  ('EMERGENCY_STD', 'Emergency Standard',              'emergency',         'CRITICAL',true,true,  true, true,  true, true,  false, true,  true,  24)
ON CONFLICT (policy_code) DO NOTHING;

-- =============================================================================
-- 2. CASE RESOLUTION SIGN-OFFS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.case_resolution_signoffs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id           UUID REFERENCES public.reported_issues(id) ON DELETE CASCADE NOT NULL,
  participation_id  UUID REFERENCES public.case_participations(id) ON DELETE CASCADE NOT NULL,
  department        TEXT NOT NULL,
  signoff_role      TEXT NOT NULL CHECK (signoff_role IN ('LEAD', 'RESPONSIBLE', 'SUPPORTING', 'CONSULTED')),
  status            TEXT NOT NULL DEFAULT 'SIGNED' CHECK (status IN ('SIGNED', 'REVOKED')),
  signed_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  signed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  statement         TEXT NOT NULL,
  evidence_summary  TEXT,
  revoked_at        TIMESTAMPTZ,
  revocation_reason TEXT,
  closure_cycle     INTEGER NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one active signoff per department per case per closure cycle
CREATE UNIQUE INDEX IF NOT EXISTS idx_resolution_signoffs_unique_active
  ON public.case_resolution_signoffs(case_id, department, closure_cycle)
  WHERE (status = 'SIGNED');

CREATE INDEX IF NOT EXISTS idx_resolution_signoffs_case ON public.case_resolution_signoffs(case_id);
CREATE INDEX IF NOT EXISTS idx_resolution_signoffs_dept ON public.case_resolution_signoffs(department);

DROP TRIGGER IF EXISTS update_case_resolution_signoffs_updated_at ON public.case_resolution_signoffs;
CREATE TRIGGER update_case_resolution_signoffs_updated_at
  BEFORE UPDATE ON public.case_resolution_signoffs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.case_resolution_signoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signoffs readable by authenticated" ON public.case_resolution_signoffs
  FOR SELECT TO authenticated USING (true);

-- Department admin can insert/update only for their own department
CREATE POLICY "Signoffs writable by own department" ON public.case_resolution_signoffs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.department = case_resolution_signoffs.department
    )
  );

CREATE POLICY "Signoffs updatable by own department" ON public.case_resolution_signoffs
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.department = case_resolution_signoffs.department
    )
  );

-- =============================================================================
-- 3. CASE RESOLUTION PACKAGES (Immutable Closure Snapshot)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.case_resolution_packages (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                     UUID REFERENCES public.reported_issues(id) ON DELETE CASCADE NOT NULL,
  version                     INTEGER NOT NULL DEFAULT 1,
  closure_cycle               INTEGER NOT NULL DEFAULT 1,
  status                      TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'HISTORICAL', 'SUPERSEDED')),
  generated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by                UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  summary                     TEXT NOT NULL,
  root_cause                  TEXT,
  departments_involved        JSONB NOT NULL DEFAULT '[]',
  completed_tasks_snapshot    JSONB NOT NULL DEFAULT '[]',
  accepted_handoffs_snapshot  JSONB NOT NULL DEFAULT '[]',
  evidence_snapshot           JSONB NOT NULL DEFAULT '[]',
  sla_snapshot                JSONB NOT NULL DEFAULT '{}',
  escalation_snapshot         JSONB NOT NULL DEFAULT '[]',
  signoff_snapshot            JSONB NOT NULL DEFAULT '[]',
  citizen_safe_summary        TEXT NOT NULL,
  policy_used                 TEXT,
  supersedes_package_id       UUID REFERENCES public.case_resolution_packages(id) ON DELETE SET NULL,
  closed_by                   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at                   TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resolution_packages_case ON public.case_resolution_packages(case_id);
CREATE INDEX IF NOT EXISTS idx_resolution_packages_status ON public.case_resolution_packages(case_id, status);

ALTER TABLE public.case_resolution_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Resolution packages readable by authenticated" ON public.case_resolution_packages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Resolution packages manageable by staff" ON public.case_resolution_packages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

-- =============================================================================
-- 4. CASE CITIZEN CONFIRMATIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.case_citizen_confirmations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       UUID REFERENCES public.reported_issues(id) ON DELETE CASCADE NOT NULL,
  citizen_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  response      TEXT NOT NULL CHECK (response IN ('CONFIRMED_RESOLVED', 'STILL_NOT_FIXED', 'PARTIALLY_RESOLVED')),
  reason_code   TEXT,
  comment       TEXT,
  closure_cycle INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One confirmation per citizen per closure cycle
CREATE UNIQUE INDEX IF NOT EXISTS idx_citizen_confirmations_unique
  ON public.case_citizen_confirmations(case_id, citizen_id, closure_cycle);

CREATE INDEX IF NOT EXISTS idx_citizen_confirmations_case ON public.case_citizen_confirmations(case_id);

ALTER TABLE public.case_citizen_confirmations ENABLE ROW LEVEL SECURITY;

-- Citizens can only insert/read their own confirmations
CREATE POLICY "Citizens can read own confirmations" ON public.case_citizen_confirmations
  FOR SELECT TO authenticated USING (citizen_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Citizens can submit their own confirmation" ON public.case_citizen_confirmations
  FOR INSERT TO authenticated
  WITH CHECK (citizen_id = auth.uid());

-- =============================================================================
-- 5. CASE REOPEN REQUESTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.case_reopen_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID REFERENCES public.reported_issues(id) ON DELETE CASCADE NOT NULL,
  requested_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  request_source  TEXT NOT NULL CHECK (request_source IN ('CITIZEN_PORTAL', 'ADMIN_REVIEW', 'DEPARTMENT_FLAG', 'COMMISSIONER_ORDER')),
  reason_code     TEXT NOT NULL CHECK (reason_code IN ('ISSUE_PERSISTS', 'ISSUE_RECURRED', 'PARTIAL_RESOLUTION', 'UNSAFE_CONDITION', 'WRONG_LOCATION_FIXED', 'EVIDENCE_DISPUTE', 'OTHER')),
  description     TEXT NOT NULL,
  evidence_urls   TEXT[] DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN')),
  reviewed_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  review_reason   TEXT,
  closure_cycle   INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reopen_requests_case ON public.case_reopen_requests(case_id);
CREATE INDEX IF NOT EXISTS idx_reopen_requests_status ON public.case_reopen_requests(status);

DROP TRIGGER IF EXISTS update_case_reopen_requests_updated_at ON public.case_reopen_requests;
CREATE TRIGGER update_case_reopen_requests_updated_at
  BEFORE UPDATE ON public.case_reopen_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.case_reopen_requests ENABLE ROW LEVEL SECURITY;

-- Citizens can create reopen requests for cases they own
CREATE POLICY "Citizen reopen for own case" ON public.case_reopen_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND (
      request_source = 'CITIZEN_PORTAL'
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'super_admin')
    )
  );

CREATE POLICY "Reopen requests readable by staff and case owner" ON public.case_reopen_requests
  FOR SELECT TO authenticated USING (
    requested_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Reopen requests manageable by staff" ON public.case_reopen_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

-- =============================================================================
-- 6. CASE RESOLUTION OUTCOMES (Recurrence Tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.case_resolution_outcomes (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                 UUID REFERENCES public.reported_issues(id) ON DELETE CASCADE NOT NULL,
  closure_cycle           INTEGER NOT NULL DEFAULT 1,
  root_cause_code         TEXT,
  departments_involved    TEXT[] DEFAULT '{}',
  total_coordination_minutes INTEGER,
  sla_breached            BOOLEAN DEFAULT false,
  reopen_count            INTEGER DEFAULT 0,
  recurrence_detected     BOOLEAN DEFAULT false,
  days_to_recurrence      INTEGER,
  outcome_quality_score   NUMERIC(5,2),  -- 0.00 to 100.00, calculated from formula
  handoff_count           INTEGER DEFAULT 0,
  rework_count            INTEGER DEFAULT 0,
  escalation_count        INTEGER DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_outcomes_case_cycle ON public.case_resolution_outcomes(case_id, closure_cycle);

ALTER TABLE public.case_resolution_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Outcomes readable by auth" ON public.case_resolution_outcomes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Outcomes manageable by staff" ON public.case_resolution_outcomes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

-- =============================================================================
-- 7. CLOSURE ELIGIBILITY ENGINE
-- =============================================================================
CREATE OR REPLACE FUNCTION public.evaluate_case_closure_eligibility(p_case_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case RECORD;
  v_policy RECORD;
  v_missing JSONB := '[]';
  v_completed JSONB := '[]';
  v_active_blockers JSONB;
  v_active_escalations JSONB;
  v_eligible BOOLEAN := true;

  -- task stats
  v_mandatory_incomplete INTEGER;
  v_pending_handoffs INTEGER;
  v_rework_tasks INTEGER;
  v_critical_escalations INTEGER;
  v_active_blocker_count INTEGER;

  -- signoff stats
  v_lead_dept TEXT;
  v_lead_signoff_count INTEGER;
  v_responsible_signoffs INTEGER;
  v_responsible_depts INTEGER;
BEGIN
  -- 1. Load case
  SELECT * INTO v_case
  FROM public.reported_issues
  WHERE id = p_case_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case not found: %', p_case_id;
  END IF;

  -- 2. Select applicable policy (most specific match)
  SELECT cp.* INTO v_policy
  FROM public.case_closure_policies cp
  WHERE cp.active = true
    AND cp.coordination_type = v_case.coordination_type
    AND (cp.severity IS NULL OR cp.severity = v_case.severity)
  ORDER BY
    (cp.severity IS NOT NULL) DESC,
    cp.require_commissioner_approval DESC
  LIMIT 1;

  -- Fallback: single department standard policy
  IF NOT FOUND THEN
    SELECT * INTO v_policy FROM public.case_closure_policies WHERE policy_code = 'SINGLE_STD' AND active = true LIMIT 1;
  END IF;

  -- 3. Check: mandatory tasks complete
  IF v_policy.require_all_mandatory_tasks THEN
    SELECT COUNT(*) INTO v_mandatory_incomplete
    FROM public.department_tasks
    WHERE case_id = p_case_id
      AND task_status NOT IN ('COMPLETED', 'CANCELLED')
      AND task_status != 'WAITING_DEPENDENCY';  -- only count tasks that are not waiting for something else

    -- More precise: count tasks that are in an incomplete workable state
    SELECT COUNT(*) INTO v_mandatory_incomplete
    FROM public.department_tasks
    WHERE case_id = p_case_id
      AND task_status IN ('READY', 'ACCEPTED', 'WORKING', 'BLOCKED', 'REWORK_REQUIRED', 'COMPLETED_PENDING_HANDOFF', 'WAITING_HANDOFF');

    IF v_mandatory_incomplete > 0 THEN
      v_eligible := false;
      v_missing := v_missing || jsonb_build_object(
        'code', 'TASKS_INCOMPLETE',
        'count', v_mandatory_incomplete,
        'message', format('%s task(s) are still incomplete', v_mandatory_incomplete)
      );
    ELSE
      v_completed := v_completed || jsonb_build_object('code', 'TASKS_COMPLETE', 'message', 'All tasks completed or cancelled');
    END IF;
  END IF;

  -- 4. Check: handoffs all accepted (no submitted/under_review handoffs)
  IF v_policy.require_all_handoffs_accepted THEN
    SELECT COUNT(*) INTO v_pending_handoffs
    FROM public.task_handoffs
    WHERE case_id = p_case_id
      AND handoff_status IN ('SUBMITTED', 'UNDER_REVIEW', 'DRAFT');

    IF v_pending_handoffs > 0 THEN
      v_eligible := false;
      v_missing := v_missing || jsonb_build_object(
        'code', 'HANDOFFS_PENDING',
        'count', v_pending_handoffs,
        'message', format('%s handoff(s) are still pending acceptance', v_pending_handoffs)
      );
    ELSE
      v_completed := v_completed || jsonb_build_object('code', 'HANDOFFS_ACCEPTED', 'message', 'All handoffs accepted');
    END IF;

    -- Check rework
    SELECT COUNT(*) INTO v_rework_tasks
    FROM public.department_tasks
    WHERE case_id = p_case_id
      AND task_status = 'REWORK_REQUIRED';

    IF v_rework_tasks > 0 THEN
      v_eligible := false;
      v_missing := v_missing || jsonb_build_object(
        'code', 'REWORK_ACTIVE',
        'count', v_rework_tasks,
        'message', format('%s task(s) require rework', v_rework_tasks)
      );
    END IF;
  END IF;

  -- 5. Check: no active blockers
  IF v_policy.require_no_active_blockers THEN
    SELECT COUNT(*) INTO v_active_blocker_count
    FROM public.task_blockers
    WHERE case_id = p_case_id
      AND status = 'ACTIVE';

    IF v_active_blocker_count > 0 THEN
      v_eligible := false;
      v_missing := v_missing || jsonb_build_object(
        'code', 'ACTIVE_BLOCKERS',
        'count', v_active_blocker_count,
        'message', format('%s active blocker(s) must be resolved before closure', v_active_blocker_count)
      );
    ELSE
      v_completed := v_completed || jsonb_build_object('code', 'NO_BLOCKERS', 'message', 'No active blockers');
    END IF;
  END IF;

  -- 6. Check: no critical escalations
  IF v_policy.require_no_critical_escalations THEN
    SELECT COUNT(*) INTO v_critical_escalations
    FROM public.escalations
    WHERE case_id = p_case_id
      AND status IN ('OPEN', 'ACKNOWLEDGED', 'INTERVENTION_REQUIRED')
      AND severity = 'CRITICAL';

    IF v_critical_escalations > 0 THEN
      v_eligible := false;
      v_missing := v_missing || jsonb_build_object(
        'code', 'CRITICAL_ESCALATIONS',
        'count', v_critical_escalations,
        'message', format('%s critical escalation(s) must be resolved', v_critical_escalations)
      );
    ELSE
      v_completed := v_completed || jsonb_build_object('code', 'NO_CRITICAL_ESCALATIONS', 'message', 'No unresolved critical escalations');
    END IF;
  END IF;

  -- 7. Check: LEAD department signed off
  IF v_policy.require_lead_signoff THEN
    SELECT department INTO v_lead_dept
    FROM public.case_participations
    WHERE case_id = p_case_id
      AND participation_role = 'LEAD'
      AND status = 'ACTIVE'
    LIMIT 1;

    SELECT COUNT(*) INTO v_lead_signoff_count
    FROM public.case_resolution_signoffs
    WHERE case_id = p_case_id
      AND department = v_lead_dept
      AND status = 'SIGNED';

    IF v_lead_signoff_count = 0 THEN
      v_eligible := false;
      v_missing := v_missing || jsonb_build_object(
        'code', 'LEAD_SIGNOFF_MISSING',
        'department', v_lead_dept,
        'message', format('Lead department (%s) has not signed off', v_lead_dept)
      );
    ELSE
      v_completed := v_completed || jsonb_build_object('code', 'LEAD_SIGNOFF_PRESENT', 'message', format('Lead department (%s) has signed off', v_lead_dept));
    END IF;
  END IF;

  -- 8. Check: RESPONSIBLE departments signed off
  IF v_policy.require_responsible_signoff THEN
    SELECT COUNT(*) INTO v_responsible_depts
    FROM public.case_participations
    WHERE case_id = p_case_id
      AND participation_role = 'RESPONSIBLE'
      AND status = 'ACTIVE';

    SELECT COUNT(*) INTO v_responsible_signoffs
    FROM public.case_resolution_signoffs crs
    JOIN public.case_participations cp ON cp.case_id = crs.case_id AND cp.department = crs.department
    WHERE crs.case_id = p_case_id
      AND crs.status = 'SIGNED'
      AND cp.participation_role = 'RESPONSIBLE'
      AND cp.status = 'ACTIVE';

    IF v_responsible_signoffs < v_responsible_depts THEN
      v_eligible := false;
      v_missing := v_missing || jsonb_build_object(
        'code', 'RESPONSIBLE_SIGNOFFS_MISSING',
        'required', v_responsible_depts,
        'received', v_responsible_signoffs,
        'message', format('%s of %s responsible department(s) have not signed off', (v_responsible_depts - v_responsible_signoffs), v_responsible_depts)
      );
    ELSE
      v_completed := v_completed || jsonb_build_object('code', 'RESPONSIBLE_SIGNOFFS_PRESENT', 'message', 'All responsible departments signed off');
    END IF;
  END IF;

  -- 9. Collect active blockers detail
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', tb.id,
    'task_id', tb.task_id,
    'blocker_type', tb.blocker_type,
    'reason', tb.reason,
    'declared_at', tb.declared_at
  )), '[]') INTO v_active_blockers
  FROM public.task_blockers tb
  WHERE tb.case_id = p_case_id AND tb.status = 'ACTIVE';

  -- 10. Collect active escalations detail
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'severity', e.severity,
    'escalation_type', e.escalation_type,
    'status', e.status,
    'root_cause_department', e.root_cause_department
  )), '[]') INTO v_active_escalations
  FROM public.escalations e
  WHERE e.case_id = p_case_id
    AND e.status IN ('OPEN', 'ACKNOWLEDGED', 'INTERVENTION_REQUIRED');

  RETURN jsonb_build_object(
    'eligible', v_eligible,
    'case_id', p_case_id,
    'case_number', v_case.case_number,
    'coordination_type', v_case.coordination_type,
    'policy_used', v_policy.policy_code,
    'missing_requirements', v_missing,
    'completed_requirements', v_completed,
    'active_blockers', v_active_blockers,
    'active_escalations', v_active_escalations,
    'evaluated_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.evaluate_case_closure_eligibility(UUID) TO authenticated;

-- =============================================================================
-- 8. PREMATURE CLOSURE PREVENTION TRIGGER
-- =============================================================================
CREATE OR REPLACE FUNCTION public.check_coordination_closure_allowed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_missing JSONB;
  v_missing_count INTEGER;
  v_missing_msg TEXT;
BEGIN
  -- Only enforce for multi_department or emergency cases
  -- Only trigger when status changes to 'resolved'
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'resolved'
     AND OLD.status != 'resolved'
     AND NEW.coordination_type IN ('multi_department', 'emergency') THEN

    -- Evaluate eligibility
    v_result := public.evaluate_case_closure_eligibility(NEW.id);

    IF (v_result->>'eligible')::BOOLEAN = false THEN
      v_missing := v_result->'missing_requirements';
      v_missing_count := jsonb_array_length(v_missing);

      -- Build a human-readable message from the first missing requirement
      IF v_missing_count > 0 THEN
        v_missing_msg := (v_missing->0->>'message');
      ELSE
        v_missing_msg := 'Closure policy requirements not met.';
      END IF;

      RAISE EXCEPTION 'PREMATURE_CLOSURE_DENIED: %. Total unmet requirements: %. Use close_coordinated_case() RPC for compliant closure.',
        v_missing_msg, v_missing_count
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_closure_allowed ON public.reported_issues;
CREATE TRIGGER trigger_check_closure_allowed
  BEFORE UPDATE ON public.reported_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.check_coordination_closure_allowed();

-- =============================================================================
-- 9. DEPARTMENT SIGN-OFF RPC
-- =============================================================================
CREATE OR REPLACE FUNCTION public.submit_resolution_signoff(
  p_case_id         UUID,
  p_participation_id UUID,
  p_statement       TEXT,
  p_evidence_summary TEXT,
  p_actor_id        UUID
)
RETURNS public.case_resolution_signoffs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participation RECORD;
  v_actor_dept TEXT;
  v_cycle INTEGER;
  v_signoff public.case_resolution_signoffs;
BEGIN
  -- 1. Verify participation exists and is active
  SELECT * INTO v_participation
  FROM public.case_participations
  WHERE id = p_participation_id AND case_id = p_case_id AND status = 'ACTIVE';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participation not found or inactive: %', p_participation_id;
  END IF;

  -- 2. Verify actor belongs to that department (or is super_admin)
  SELECT department INTO v_actor_dept
  FROM public.user_roles
  WHERE user_id = p_actor_id
  LIMIT 1;

  IF NOT (public.has_role(p_actor_id, 'super_admin')
          OR v_actor_dept = v_participation.department) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: You can only sign off for your own department (%). Your department: %',
      v_participation.department, v_actor_dept;
  END IF;

  -- 3. Determine current closure cycle from package
  SELECT COALESCE(MAX(closure_cycle), 1) INTO v_cycle
  FROM public.case_resolution_packages
  WHERE case_id = p_case_id;

  -- 4. Insert signoff (unique constraint on case+dept+cycle prevents duplicates)
  INSERT INTO public.case_resolution_signoffs (
    case_id, participation_id, department, signoff_role, status,
    signed_by, statement, evidence_summary, closure_cycle
  ) VALUES (
    p_case_id, p_participation_id, v_participation.department,
    v_participation.participation_role, 'SIGNED',
    p_actor_id, p_statement, p_evidence_summary, v_cycle
  )
  RETURNING * INTO v_signoff;

  -- 5. Log workflow event
  INSERT INTO public.workflow_events (
    case_id, actor_id, actor_department, event_type, metadata
  ) VALUES (
    p_case_id, p_actor_id, v_participation.department, 'SIGNOFF_SUBMITTED',
    jsonb_build_object(
      'signoff_id', v_signoff.id,
      'signoff_role', v_participation.participation_role,
      'closure_cycle', v_cycle
    )
  );

  -- 6. Re-evaluate closure eligibility and update coordination_status
  DECLARE
    v_eligibility JSONB;
  BEGIN
    v_eligibility := public.evaluate_case_closure_eligibility(p_case_id);
    IF (v_eligibility->>'eligible')::BOOLEAN = true THEN
      UPDATE public.reported_issues
      SET coordination_status = 'ready_for_joint_closure', updated_at = now()
      WHERE id = p_case_id
        AND coordination_status != 'ready_for_joint_closure';
    ELSE
      UPDATE public.reported_issues
      SET coordination_status = 'closure_evaluation', updated_at = now()
      WHERE id = p_case_id
        AND coordination_status NOT IN ('ready_for_joint_closure', 'closure_evaluation');
    END IF;
  END;

  RETURN v_signoff;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_resolution_signoff(UUID, UUID, TEXT, TEXT, UUID) TO authenticated;

-- =============================================================================
-- 10. REVOKE SIGN-OFF RPC
-- =============================================================================
CREATE OR REPLACE FUNCTION public.revoke_resolution_signoff(
  p_signoff_id UUID,
  p_reason     TEXT,
  p_actor_id   UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_signoff RECORD;
  v_actor_dept TEXT;
BEGIN
  SELECT * INTO v_signoff FROM public.case_resolution_signoffs WHERE id = p_signoff_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Signoff not found: %', p_signoff_id; END IF;
  IF v_signoff.status = 'REVOKED' THEN RAISE EXCEPTION 'Signoff already revoked'; END IF;

  -- Only own-department or super_admin can revoke
  SELECT department INTO v_actor_dept FROM public.user_roles WHERE user_id = p_actor_id LIMIT 1;
  IF NOT (public.has_role(p_actor_id, 'super_admin') OR v_actor_dept = v_signoff.department) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Cannot revoke another department signoff';
  END IF;

  UPDATE public.case_resolution_signoffs
  SET status = 'REVOKED', revoked_at = now(), revocation_reason = p_reason, updated_at = now()
  WHERE id = p_signoff_id;

  -- Set case back to closure_evaluation if it was ready
  UPDATE public.reported_issues
  SET coordination_status = 'closure_evaluation', updated_at = now()
  WHERE id = v_signoff.case_id
    AND coordination_status = 'ready_for_joint_closure';

  INSERT INTO public.workflow_events (
    case_id, actor_id, actor_department, event_type, metadata
  ) VALUES (
    v_signoff.case_id, p_actor_id, v_signoff.department, 'SIGNOFF_REVOKED',
    jsonb_build_object('signoff_id', p_signoff_id, 'reason', p_reason)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_resolution_signoff(UUID, TEXT, UUID) TO authenticated;

-- =============================================================================
-- 11. ATOMIC JOINT CLOSURE RPC
-- =============================================================================
CREATE OR REPLACE FUNCTION public.close_coordinated_case(
  p_case_id  UUID,
  p_actor_id UUID
)
RETURNS public.case_resolution_packages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case        RECORD;
  v_eligibility JSONB;
  v_eligible    BOOLEAN;
  v_cycle       INTEGER;
  v_prev_pkg    UUID;
  v_package     public.case_resolution_packages;
  v_actor_role  TEXT;
  v_departments JSONB;
  v_tasks       JSONB;
  v_handoffs    JSONB;
  v_signoffs    JSONB;
  v_sla_summary JSONB;
  v_citizen_summary TEXT;
BEGIN
  -- 1. Lock case row
  SELECT * INTO v_case FROM public.reported_issues WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Case not found: %', p_case_id; END IF;

  -- 2. Verify actor authority (admin or super_admin)
  IF NOT (public.has_role(p_actor_id, 'super_admin') OR public.has_role(p_actor_id, 'admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only administrators can close cases.';
  END IF;

  -- 3. Case must not already be resolved/cancelled
  IF v_case.status IN ('resolved', 'cancelled') THEN
    RAISE EXCEPTION 'ALREADY_CLOSED: Case is already in status: %', v_case.status;
  END IF;

  -- 4. Run closure eligibility check
  v_eligibility := public.evaluate_case_closure_eligibility(p_case_id);
  v_eligible := (v_eligibility->>'eligible')::BOOLEAN;

  IF NOT v_eligible THEN
    RAISE EXCEPTION 'CLOSURE_DENIED: Case does not meet closure requirements. Missing: %',
      v_eligibility->'missing_requirements';
  END IF;

  -- 5. Determine closure cycle
  SELECT COALESCE(MAX(closure_cycle) + 1, 1) INTO v_cycle
  FROM public.case_resolution_packages WHERE case_id = p_case_id;

  -- 6. Mark any prior packages as HISTORICAL
  UPDATE public.case_resolution_packages
  SET status = 'HISTORICAL'
  WHERE case_id = p_case_id AND status = 'ACTIVE';

  -- 7. Build snapshots
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'department', department,
    'participation_role', participation_role,
    'joined_at', joined_at
  )), '[]') INTO v_departments
  FROM public.case_participations WHERE case_id = p_case_id AND status = 'ACTIVE';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'department', department, 'title', title,
    'task_status', task_status, 'completed_at', completed_at
  )), '[]') INTO v_tasks
  FROM public.department_tasks WHERE case_id = p_case_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'from_department', from_department, 'to_department', to_department,
    'handoff_status', handoff_status, 'submitted_at', submitted_at
  )), '[]') INTO v_handoffs
  FROM public.task_handoffs WHERE case_id = p_case_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'department', department, 'signoff_role', signoff_role,
    'signed_at', signed_at, 'statement', statement
  )), '[]') INTO v_signoffs
  FROM public.case_resolution_signoffs WHERE case_id = p_case_id AND status = 'SIGNED';

  -- 8. Build citizen-safe summary from completed task titles
  SELECT 'Resolved through coordinated action by ' || COUNT(DISTINCT department)::text || ' departments. ' ||
    string_agg(department || ': ' || title, '; ')
  INTO v_citizen_summary
  FROM public.department_tasks
  WHERE case_id = p_case_id AND task_status = 'COMPLETED';

  IF v_citizen_summary IS NULL THEN
    v_citizen_summary := 'Resolved through inter-departmental coordination.';
  END IF;

  -- 9. SLA summary
  SELECT jsonb_build_object(
    'total_sla_instances', COUNT(*),
    'breached', COUNT(*) FILTER (WHERE status = 'BREACHED'),
    'completed', COUNT(*) FILTER (WHERE status = 'COMPLETED')
  ) INTO v_sla_summary
  FROM public.sla_instances WHERE case_id = p_case_id;

  -- 10. Create resolution package
  INSERT INTO public.case_resolution_packages (
    case_id, version, closure_cycle, status, generated_by, summary, root_cause,
    departments_involved, completed_tasks_snapshot, accepted_handoffs_snapshot,
    evidence_snapshot, sla_snapshot, signoff_snapshot, citizen_safe_summary,
    closed_by, closed_at
  ) VALUES (
    p_case_id, v_cycle, v_cycle, 'ACTIVE', p_actor_id,
    'Joint closure for case ' || v_case.case_number,
    NULL,  -- root cause to be filled manually if needed
    v_departments, v_tasks, v_handoffs,
    '[]', v_sla_summary, v_signoffs,
    v_citizen_summary,
    p_actor_id, now()
  ) RETURNING * INTO v_package;

  -- 11. Update case status atomically
  UPDATE public.reported_issues
  SET status = 'resolved',
      coordination_status = 'closed',
      updated_at = now()
  WHERE id = p_case_id;

  -- 12. Record workflow event
  INSERT INTO public.workflow_events (
    case_id, actor_id, event_type, metadata
  ) VALUES (
    p_case_id, p_actor_id, 'CASE_CLOSED',
    jsonb_build_object(
      'closure_package_id', v_package.id,
      'closure_cycle', v_cycle,
      'departments_involved', jsonb_array_length(v_departments)
    )
  );

  -- 13. Record outcome metrics
  INSERT INTO public.case_resolution_outcomes (
    case_id, closure_cycle,
    departments_involved,
    total_coordination_minutes,
    handoff_count, escalation_count
  )
  SELECT
    p_case_id, v_cycle,
    ARRAY(SELECT DISTINCT department FROM public.case_participations WHERE case_id = p_case_id AND status = 'ACTIVE'),
    EXTRACT(EPOCH FROM (now() - v_case.coordination_started_at)) / 60,
    (SELECT COUNT(*) FROM public.task_handoffs WHERE case_id = p_case_id),
    (SELECT COUNT(*) FROM public.escalations WHERE case_id = p_case_id)
  ON CONFLICT (case_id, closure_cycle) DO NOTHING;

  RETURN v_package;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_coordinated_case(UUID, UUID) TO authenticated;

-- =============================================================================
-- 12. REOPEN REVIEW RPC
-- =============================================================================
CREATE OR REPLACE FUNCTION public.review_case_reopen_request(
  p_request_id UUID,
  p_decision   TEXT,  -- 'APPROVED' | 'REJECTED'
  p_reason     TEXT,
  p_actor_id   UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_new_cycle INTEGER;
BEGIN
  -- 1. Validate decision
  IF p_decision NOT IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'Invalid decision: %. Must be APPROVED or REJECTED.', p_decision;
  END IF;

  -- 2. Verify actor authority
  IF NOT (public.has_role(p_actor_id, 'super_admin') OR public.has_role(p_actor_id, 'admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only administrators can review reopen requests.';
  END IF;

  -- 3. Lock and load request
  SELECT * INTO v_request FROM public.case_reopen_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reopen request not found: %', p_request_id; END IF;
  IF v_request.status != 'PENDING' THEN
    RAISE EXCEPTION 'Request is not in PENDING state: %', v_request.status;
  END IF;

  -- 4. Update the request
  UPDATE public.case_reopen_requests
  SET status = p_decision, reviewed_by = p_actor_id, reviewed_at = now(), review_reason = p_reason, updated_at = now()
  WHERE id = p_request_id;

  -- 5. On APPROVED: reopen the case
  IF p_decision = 'APPROVED' THEN
    -- New closure cycle
    SELECT COALESCE(MAX(closure_cycle) + 1, 1) INTO v_new_cycle
    FROM public.case_resolution_packages WHERE case_id = v_request.case_id;

    -- Mark existing resolution packages historical
    UPDATE public.case_resolution_packages
    SET status = 'HISTORICAL'
    WHERE case_id = v_request.case_id AND status = 'ACTIVE';

    -- Invalidate signoffs from previous cycle
    UPDATE public.case_resolution_signoffs
    SET status = 'REVOKED', revoked_at = now(),
        revocation_reason = 'Case reopened: ' || COALESCE(p_reason, 'Reopen request approved')
    WHERE case_id = v_request.case_id AND status = 'SIGNED';

    -- Update case status to reopened
    UPDATE public.reported_issues
    SET status = 'in_progress',
        coordination_status = 'reopened',
        updated_at = now()
    WHERE id = v_request.case_id;

    -- Update reopen count in outcomes
    UPDATE public.case_resolution_outcomes
    SET reopen_count = reopen_count + 1, updated_at = now()
    WHERE case_id = v_request.case_id;

    -- Log workflow event
    INSERT INTO public.workflow_events (
      case_id, actor_id, event_type, metadata
    ) VALUES (
      v_request.case_id, p_actor_id, 'CASE_REOPENED',
      jsonb_build_object(
        'reopen_request_id', p_request_id,
        'reason_code', v_request.reason_code,
        'new_closure_cycle', v_new_cycle,
        'review_reason', p_reason
      )
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_case_reopen_request(UUID, TEXT, TEXT, UUID) TO authenticated;

-- =============================================================================
-- 13. COORDINATION METRICS FUNCTION
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_coordination_metrics(
  p_from TIMESTAMPTZ DEFAULT now() - INTERVAL '30 days',
  p_to   TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH
  cases AS (
    SELECT id, coordination_type, coordination_started_at, created_at, status, updated_at
    FROM public.reported_issues
    WHERE coordination_type = 'multi_department'
      AND created_at BETWEEN p_from AND p_to
  ),
  handoff_stats AS (
    SELECT
      COUNT(*) AS total_handoffs,
      COUNT(*) FILTER (WHERE handoff_status = 'REJECTED') AS rejected_handoffs,
      AVG(EXTRACT(EPOCH FROM (reviewed_at - submitted_at))/60) FILTER (WHERE handoff_status = 'ACCEPTED') AS avg_acceptance_minutes
    FROM public.task_handoffs th
    JOIN cases c ON c.id = th.case_id
  ),
  sla_stats AS (
    SELECT
      COUNT(*) AS total_sla,
      COUNT(*) FILTER (WHERE si.status = 'BREACHED') AS breached_sla
    FROM public.sla_instances si
    JOIN cases c ON c.id = si.case_id
  ),
  escalation_stats AS (
    SELECT COUNT(*) AS total_escalations
    FROM public.escalations e
    JOIN cases c ON c.id = e.case_id
  ),
  reopen_stats AS (
    SELECT
      COUNT(*) AS total_requests,
      COUNT(*) FILTER (WHERE rr.status = 'APPROVED') AS approved_reopens
    FROM public.case_reopen_requests rr
    JOIN cases c ON c.id = rr.case_id
  ),
  closure_stats AS (
    SELECT
      COUNT(*) AS total_closed,
      COUNT(DISTINCT case_id) FILTER (WHERE reopen_count = 0) AS first_time_closed
    FROM public.case_resolution_outcomes co
    JOIN cases c ON c.id = co.case_id
  )
  SELECT jsonb_build_object(
    'period_from', p_from,
    'period_to', p_to,
    'total_multi_dept_cases', (SELECT COUNT(*) FROM cases),
    'total_handoffs', (SELECT total_handoffs FROM handoff_stats),
    'rework_rate_pct', ROUND(
      100.0 * (SELECT rejected_handoffs FROM handoff_stats)::NUMERIC /
      NULLIF((SELECT total_handoffs FROM handoff_stats), 0), 2),
    'avg_handoff_acceptance_minutes', ROUND((SELECT avg_acceptance_minutes FROM handoff_stats)::NUMERIC, 2),
    'sla_breach_rate_pct', ROUND(
      100.0 * (SELECT breached_sla FROM sla_stats)::NUMERIC /
      NULLIF((SELECT total_sla FROM sla_stats), 0), 2),
    'total_escalations', (SELECT total_escalations FROM escalation_stats),
    'reopen_rate_pct', ROUND(
      100.0 * (SELECT approved_reopens FROM reopen_stats)::NUMERIC /
      NULLIF((SELECT COUNT(*) FROM cases), 0), 2),
    'first_time_resolution_rate_pct', ROUND(
      100.0 * (SELECT first_time_closed FROM closure_stats)::NUMERIC /
      NULLIF((SELECT total_closed FROM closure_stats), 0), 2),
    'total_closed', (SELECT total_closed FROM closure_stats)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_coordination_metrics(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
