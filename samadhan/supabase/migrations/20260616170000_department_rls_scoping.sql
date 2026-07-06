-- =============================================================================
-- Migration: Department-Specific RLS Scoping
-- Task 2.3 — Role-Based Access Control (RBAC) (ImplementationPlan.md)
-- =============================================================================

-- 1. Create helper function to check department scope for a user
CREATE OR REPLACE FUNCTION public.check_user_issue_scope(_user_id UUID, _category TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role app_role;
  v_dept TEXT;
  v_category_key TEXT;
BEGIN
  -- Get user's role and department
  SELECT role, department INTO v_role, v_dept
  FROM public.user_roles
  WHERE user_id = _user_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Super admin and global admin have global access
  IF v_role = 'super_admin' OR (v_role = 'admin' AND (v_dept IS NULL OR v_dept = 'all')) THEN
    RETURN TRUE;
  END IF;

  -- Department admin needs to match category
  IF v_role = 'department_admin' THEN
    -- Resolve category label (can be English/Hindi) to key matching user_roles.department
    v_category_key := CASE 
      WHEN _category IN ('Water Supply', 'जल आपूर्ति') THEN 'water_supply'
      WHEN _category IN ('Sanitation', 'स्वच्छता') THEN 'sanitation'
      WHEN _category IN ('Electricity', 'बिजली') THEN 'electricity'
      WHEN _category IN ('Roads', 'सड़कें') THEN 'roads'
      WHEN _category IN ('Parks & Gardens', 'पार्क और बगीचे') THEN 'parks'
      WHEN _category IN ('Buildings', 'भवन') THEN 'buildings'
      ELSE LOWER(REPLACE(_category, ' ', '_'))
    END;

    RETURN (v_dept = v_category_key OR v_dept = 'all');
  END IF;

  RETURN FALSE;
END;
$$;

-- 2. Drop existing RLS policies on reported_issues
DROP POLICY IF EXISTS "Anyone can view reported issues" ON public.reported_issues;
DROP POLICY IF EXISTS "Users or Admins can update issues" ON public.reported_issues;
DROP POLICY IF EXISTS "Users or Admins can delete issues" ON public.reported_issues;

-- 3. Re-create SELECT policy: citizens see all, but department admins only see their scoped tickets
CREATE POLICY "View reported issues policy"
ON public.reported_issues FOR SELECT
USING (
  -- Citizens (no admin/dept_admin roles) can see all tickets
  NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin', 'department_admin')
  )
  OR
  -- Super admin sees everything
  public.has_role(auth.uid(), 'super_admin')
  OR
  -- Department admin / operators see only scoped tickets
  public.check_user_issue_scope(auth.uid(), category)
);

-- 4. Re-create UPDATE policy: users can update their own issues; admins can update scoped issues
CREATE POLICY "Update reported issues policy"
ON public.reported_issues FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id 
  OR public.check_user_issue_scope(auth.uid(), category)
)
WITH CHECK (
  auth.uid() = user_id 
  OR public.check_user_issue_scope(auth.uid(), category)
);

-- 5. Re-create DELETE policy: users can delete their own issues; admins can delete scoped issues
CREATE POLICY "Delete reported issues policy"
ON public.reported_issues FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id 
  OR public.check_user_issue_scope(auth.uid(), category)
);

-- 6. Grant execute permissions on the scoping helper
GRANT EXECUTE ON FUNCTION public.check_user_issue_scope(UUID, TEXT) TO authenticated;
