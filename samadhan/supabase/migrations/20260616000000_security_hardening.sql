-- 1. Upgrade Roles Enum
-- Note: In Postgres, ADD VALUE cannot run inside transaction blocks.
-- We add values if they don't exist by executing safety statements.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'department_admin';

-- 2. Add Department Support to user_roles
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS department TEXT;

-- 3. Update has_role helper function (supporting super_admin privilege inheritance)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id 
      AND (role = _role OR role = 'super_admin')
  )
$$;

-- 4. Create Rate Limiting Table
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  request_count INT DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (key, endpoint, window_start)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- No RLS policies exist on rate_limits, making it accessible strictly through the Service Role.

-- 5. Create check_rate_limit Postgres function
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _key TEXT,
  _endpoint TEXT,
  _max_requests INT,
  _window_seconds INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_count INT;
  _window_start TIMESTAMPTZ;
  _window_interval INTERVAL;
BEGIN
  _window_interval := (_window_seconds || ' seconds')::interval;
  _window_start := now() - ((extract(epoch from now())::integer % _window_seconds) || ' seconds')::interval;
  
  -- Clean up rate limits that are older than twice the window size to keep the table clean
  DELETE FROM public.rate_limits 
  WHERE window_start < now() - _window_interval * 2;
  
  -- Record the request and get the current count
  INSERT INTO public.rate_limits (key, endpoint, request_count, window_start)
  VALUES (_key, _endpoint, 1, _window_start)
  ON CONFLICT (key, endpoint, window_start)
  DO UPDATE SET request_count = public.rate_limits.request_count + 1
  RETURNING request_count INTO _current_count;
  
  RETURN _current_count <= _max_requests;
END;
$$;

-- 6. Create Security Logs Table (Append-only)
CREATE TABLE IF NOT EXISTS public.security_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address TEXT, -- Hashed IP fingerprint (SHA-256)
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view security logs"
ON public.security_logs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));
-- No policies exist for INSERT/UPDATE/DELETE. Edge functions insert via service role.

-- 7. Create Audit Logs Table (Append-only)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  record_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address TEXT, -- Hashed IP fingerprint (SHA-256)
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and Super admins can view audit logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
-- No policies exist for UPDATE/DELETE, preventing modifications to the audit trail.

-- 8. Create Audit Trigger Function
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
  _old_val JSONB := NULL;
  _new_val JSONB := NULL;
  _event_type TEXT;
  _record_id UUID;
BEGIN
  _user_id := auth.uid();
  
  IF TG_OP = 'INSERT' THEN
    _event_type := 'insert_' || TG_TABLE_NAME;
    _new_val := to_jsonb(NEW);
    _record_id := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    _event_type := 'update_' || TG_TABLE_NAME;
    _old_val := to_jsonb(OLD);
    _new_val := to_jsonb(NEW);
    _record_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    _event_type := 'delete_' || TG_TABLE_NAME;
    _old_val := to_jsonb(OLD);
    _record_id := OLD.id;
  END IF;
  
  INSERT INTO public.audit_logs (event_type, record_id, user_id, old_data, new_data)
  VALUES (_event_type, _record_id, _user_id, _old_val, _new_val);
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Create Triggers
CREATE OR REPLACE TRIGGER audit_reported_issues
AFTER INSERT OR UPDATE OR DELETE ON public.reported_issues
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE OR REPLACE TRIGGER audit_profiles
AFTER INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE OR REPLACE TRIGGER audit_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- 9. Secure profiles RLS
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users and Admins can view profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Secure reported_issues RLS
DROP POLICY IF EXISTS "Anyone can view all reported issues" ON public.reported_issues;
DROP POLICY IF EXISTS "Users can insert their own issues" ON public.reported_issues;
DROP POLICY IF EXISTS "Users can update their own issues" ON public.reported_issues;
DROP POLICY IF EXISTS "Users can delete their own issues" ON public.reported_issues;
DROP POLICY IF EXISTS "Admins can update any issue" ON public.reported_issues;
DROP POLICY IF EXISTS "Admins can delete any issue" ON public.reported_issues;

CREATE POLICY "Anyone can view reported issues"
ON public.reported_issues FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can report issues"
ON public.reported_issues FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users or Admins can update issues"
ON public.reported_issues FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users or Admins can delete issues"
ON public.reported_issues FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Secure issue_supports RLS
DROP POLICY IF EXISTS "Anyone can view issue supports count" ON public.issue_supports;
DROP POLICY IF EXISTS "Authenticated users can support issues" ON public.issue_supports;
DROP POLICY IF EXISTS "Users can remove their own support" ON public.issue_supports;

CREATE POLICY "Anyone can view support lists"
ON public.issue_supports FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can support issues"
ON public.issue_supports FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove support"
ON public.issue_supports FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Secure notification_preferences RLS
DROP POLICY IF EXISTS "Users can view their own notification preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can insert their own notification preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can update their own notification preferences" ON public.notification_preferences;

CREATE POLICY "Users can select notification preferences"
ON public.notification_preferences FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert notification preferences"
ON public.notification_preferences FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update notification preferences"
ON public.notification_preferences FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Secure user_roles RLS
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

CREATE POLICY "Users and Admins can view roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only super admins can manage user roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
