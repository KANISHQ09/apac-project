-- Create issue_supports table to track who supported which issue
CREATE TABLE public.issue_supports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID REFERENCES public.reported_issues(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(issue_id, user_id)
);

-- Enable RLS
ALTER TABLE public.issue_supports ENABLE ROW LEVEL SECURITY;

-- Policies for issue_supports
CREATE POLICY "Anyone can view issue supports count"
ON public.issue_supports FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can support issues"
ON public.issue_supports FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their own support"
ON public.issue_supports FOR DELETE
USING (auth.uid() = user_id);

-- Update reported_issues policies to allow community viewing
DROP POLICY IF EXISTS "Users can view their own issues" ON public.reported_issues;

CREATE POLICY "Anyone can view all reported issues"
ON public.reported_issues FOR SELECT
USING (true);

-- Create function to update supports count
CREATE OR REPLACE FUNCTION public.update_issue_supports_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reported_issues 
    SET supports_count = supports_count + 1 
    WHERE id = NEW.issue_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reported_issues 
    SET supports_count = supports_count - 1 
    WHERE id = OLD.issue_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for auto-updating supports count
CREATE TRIGGER update_supports_count
AFTER INSERT OR DELETE ON public.issue_supports
FOR EACH ROW EXECUTE FUNCTION public.update_issue_supports_count();