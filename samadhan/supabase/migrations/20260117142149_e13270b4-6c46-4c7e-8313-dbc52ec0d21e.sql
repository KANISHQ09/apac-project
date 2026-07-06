-- Enable realtime for reported_issues table
ALTER PUBLICATION supabase_realtime ADD TABLE public.reported_issues;

-- Enable realtime for issue_supports table
ALTER PUBLICATION supabase_realtime ADD TABLE public.issue_supports;