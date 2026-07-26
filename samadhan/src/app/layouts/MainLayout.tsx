import { Outlet, useLocation } from "react-router-dom";
import { Header } from "@/shared/components/Header";
import { Footer } from "@/shared/components/Footer";
import { BackgroundPattern } from "@/shared/components/BackgroundPattern";
import { ROUTES } from "@/shared/config/routes";
import { useAuth } from "@/features/auth";
import { UserRole } from "@/shared/types/domain/UserRole";

const AUTH_ROUTES = [ROUTES.SIGN_IN, ROUTES.SIGN_UP];

/** Role values that qualify as an admin user for layout purposes */
const ADMIN_ROLE_VALUES: string[] = [
  UserRole.SUPER_ADMIN,
  UserRole.DEPARTMENT_ADMIN,
  "admin",
];

export function MainLayout() {
  const { pathname } = useLocation();
  const { role } = useAuth();
  const isAuthPage = AUTH_ROUTES.includes(pathname as typeof ROUTES.SIGN_IN);

  /** True when the currently-authenticated user is any kind of administrator */
  const isAdminUser = !!role && ADMIN_ROLE_VALUES.includes(role as string);

  return (
    <div className="min-h-screen bg-background relative flex flex-col justify-between">
      <BackgroundPattern />
      {!isAuthPage && <Header />}
      <main className={`flex-1 w-full ${!isAuthPage ? "pt-16" : ""}`}>
        <Outlet />
      </main>
      {!isAuthPage && <Footer isAdminUser={isAdminUser} />}
    </div>
  );
}
