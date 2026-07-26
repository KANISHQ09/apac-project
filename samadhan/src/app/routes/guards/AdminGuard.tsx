import { Navigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { Loader2 } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";
import { hasPermission } from "@/shared/auth/permissions";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, role, department, loading, roleLoading } = useAuth();

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={ROUTES.SIGN_IN} replace />;
  }

  const isAllowed = role ? hasPermission(
    { role, department },
    "view:admin_dashboard"
  ) : false;

  if (!isAllowed) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  return <>{children}</>;
}
