-- Create optimized indexes for reported_issues
CREATE INDEX IF NOT EXISTS idx_reported_issues_master_issue_id_null 
  ON public.reported_issues(master_issue_id) 
  WHERE (master_issue_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_reported_issues_lead_department 
  ON public.reported_issues(lead_department);

CREATE INDEX IF NOT EXISTS idx_reported_issues_created_at_desc 
  ON public.reported_issues(created_at DESC);
