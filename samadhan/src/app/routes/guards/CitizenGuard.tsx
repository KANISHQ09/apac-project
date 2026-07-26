import { Navigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { Loader2 } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";

export function CitizenGuard({ children }: { children: React.ReactNode }) {
  const { user, role, loading, roleLoading } = useAuth();

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    // Unauthenticated users are allowed to see these pages (or will be redirected by AuthGuard if protected)
    return <>{children}</>;
  }

  const isAdminUser = role && ["super_admin", "admin", "department_admin"].includes(role);

  if (isAdminUser) {
    return <Navigate to={ROUTES.ADMIN} replace />;
  }

  return <>{children}</>;
}
