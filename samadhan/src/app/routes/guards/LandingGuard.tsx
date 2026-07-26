import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { ROUTES } from "@/shared/config/routes";

const ADMIN_ROLES = ["super_admin", "admin", "department_admin"];

/**
 * LandingGuard
 * ------------
 * Wraps the public landing route (/).
 * - Unauthenticated users: see the landing page normally.
 * - Authenticated citizens (role = user): see the landing page normally.
 * - Authenticated admins: redirected immediately to /admin.
 *
 * We do NOT show a loading spinner here — the landing page renders for
 * everyone by default, and the redirect fires once the role is resolved.
 * This prevents any flash of a spinner on the public-facing home page.
 */
export function LandingGuard({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();

  if (role && ADMIN_ROLES.includes(role as string)) {
    return <Navigate to={ROUTES.ADMIN} replace />;
  }

  return <>{children}</>;
}
