-- =============================================================================
-- Migration: Case Work Orders and Cross-Department RLS Hardening
-- =============================================================================

-- 1. Add is_fallback column to ai_coordination_plans
ALTER TABLE public.ai_coordination_plans
  ADD COLUMN IF NOT EXISTS is_fallback BOOLEAN DEFAULT false;

-- 2. Create case_work_orders table
CREATE TABLE IF NOT EXISTS public.case_work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.reported_issues(id) ON DELETE CASCADE NOT NULL,
  plan_id UUID REFERENCES public.ai_coordination_plans(id) ON DELETE CASCADE NOT NULL,
  department_key TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'WORK_ORDER',
  storage_path TEXT NOT NULL,
  version INT DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'GENERATING', 'READY', 'FAILED')),
  generated_at TIMESTAMPTZ,
  checksum TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for unique (plan_id, department_key)
CREATE UNIQUE INDEX IF NOT EXISTS idx_case_work_orders_plan_dept 
  ON public.case_work_orders(plan_id, department_key);

-- Index for lookup
CREATE INDEX IF NOT EXISTS idx_case_work_orders_case_id ON public.case_work_orders(case_id);

-- Enable RLS
ALTER TABLE public.case_work_orders ENABLE ROW LEVEL SECURITY;

-- 3. RLS policy for case_work_orders
CREATE POLICY "View case work orders policy"
ON public.case_work_orders FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'department_admin'
      AND (
        ur.department = public.case_work_orders.department_key
        OR
        EXISTS (
          SELECT 1 FROM public.reported_issues ri
          WHERE ri.id = public.case_work_orders.case_id
            AND ri.lead_department = ur.department
        )
      )
  )
);

CREATE POLICY "Manage case work orders policy"
ON public.case_work_orders FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
);

-- 4. Set up private storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('case-work-orders', 'case-work-orders', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for storage bucket
CREATE POLICY "View work order PDFs from storage"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'case-work-orders'
  AND (
    public.has_role(auth.uid(), 'super_admin')
    OR
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'department_admin'
        AND (
          ur.department = split_part(name, '/', 6)
          OR
          EXISTS (
            SELECT 1 FROM public.reported_issues ri
            WHERE ri.id::text = split_part(name, '/', 2)
              AND ri.lead_department = ur.department
          )
        )
    )
  )
);

CREATE POLICY "Manage work order PDFs from storage"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'case-work-orders'
  AND (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
  )
)
WITH CHECK (
  bucket_id = 'case-work-orders'
  AND (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
  )
);

-- 5. Harden reported_issues SELECT policy
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
  -- Department admin / operators see only scoped issues by lead_department OR active participation
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'department_admin'
      AND (
        ur.department = public.reported_issues.lead_department
        OR
        EXISTS (
          SELECT 1 FROM public.case_participations cp
          WHERE cp.case_id = public.reported_issues.id
            AND cp.department = ur.department
            AND cp.status = 'ACTIVE'
        )
      )
  )
);

-- 6. Harden department_tasks SELECT policy
DROP POLICY IF EXISTS "View tasks policy" ON public.department_tasks;

CREATE POLICY "View tasks policy"
ON public.department_tasks FOR SELECT
TO authenticated
USING (
  -- Super admin can view all
  public.has_role(auth.uid(), 'super_admin')
  OR
  -- Department admin can view if they can see the case
  EXISTS (
    SELECT 1 FROM public.reported_issues ri
    JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE ri.id = public.department_tasks.case_id
      AND ur.role = 'department_admin'
      AND (
        ur.department = ri.lead_department
        OR
        EXISTS (
          SELECT 1 FROM public.case_participations cp
          WHERE cp.case_id = ri.id
            AND cp.department = ur.department
            AND cp.status = 'ACTIVE'
        )
      )
  )
);

-- 7. Harden task_dependencies SELECT policy
DROP POLICY IF EXISTS "View dependencies policy" ON public.task_dependencies;

CREATE POLICY "View dependencies policy"
ON public.task_dependencies FOR SELECT
TO authenticated
USING (
  -- Super admin can view all
  public.has_role(auth.uid(), 'super_admin')
  OR
  -- Department admin can view if they can see the case
  EXISTS (
    SELECT 1 FROM public.reported_issues ri
    JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE ri.id = public.task_dependencies.case_id
      AND ur.role = 'department_admin'
      AND (
        ur.department = ri.lead_department
        OR
        EXISTS (
          SELECT 1 FROM public.case_participations cp
          WHERE cp.case_id = ri.id
            AND cp.department = ur.department
            AND cp.status = 'ACTIVE'
        )
      )
  )
);
