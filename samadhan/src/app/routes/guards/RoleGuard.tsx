import { Navigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { Loader2 } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";
import { UserRole } from "@/shared/types/domain/UserRole";

export function RoleGuard({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}) {
  const { user, role, loading, roleLoading } = useAuth();

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !role || !allowedRoles.includes(role)) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  return <>{children}</>;
}
