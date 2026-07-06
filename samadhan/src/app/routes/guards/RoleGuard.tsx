import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { adminService } from "@/features/admin";
import { Loader2 } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";
import { logger } from "@/shared/services/logger";
import { UserRole } from "@/shared/types/domain/UserRole";

export function RoleGuard({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}) {
  const { user, loading: authLoading } = useAuth();
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setUserRole(null);
      setChecking(false);
      return;
    }

    setChecking(true);
    adminService.getUserRole(user.id)
      .then((res) => {
        setUserRole(res.role as UserRole);
        setChecking(false);
      })
      .catch((err) => {
        logger.error("Failed to verify user role in guard:", err);
        setUserRole(UserRole.USER); // Default fallback
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

  if (!userRole || !allowedRoles.includes(userRole)) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  return <>{children}</>;
}
