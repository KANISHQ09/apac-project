import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { adminService } from "@/features/admin";
import { Loader2 } from "lucide-react";
import { logger } from "@/shared/services/logger";
import { ROUTES } from "@/shared/config/routes";
import { hasPermission } from "@/shared/auth/permissions";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setAuthorized(false);
      setChecking(false);
      return;
    }

    setChecking(true);
    adminService.getUserRole(user.id)
      .then((res) => {
        const isAllowed = res.role ? hasPermission(
          { role: res.role, department: res.department },
          "view:admin_dashboard"
        ) : false;
        setAuthorized(isAllowed);
        setChecking(false);
      })
      .catch((err) => {
        logger.error("Failed to verify admin status in guard:", err);
        setAuthorized(false);
        setChecking(false);
      });
  }, [user, authLoading]);

  if (authLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!authorized) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  return <>{children}</>;
}
