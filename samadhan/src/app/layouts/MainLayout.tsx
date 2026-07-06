import { Outlet, useLocation } from "react-router-dom";
import { Header } from "@/shared/components/Header";
import { Footer } from "@/shared/components/Footer";
import { BackgroundPattern } from "@/shared/components/BackgroundPattern";
import { ROUTES } from "@/shared/config/routes";

const AUTH_ROUTES = [ROUTES.SIGN_IN, ROUTES.SIGN_UP];

export function MainLayout() {
  const { pathname } = useLocation();
  const isAuthPage = AUTH_ROUTES.includes(pathname as typeof ROUTES.SIGN_IN);

  return (
    <div className="min-h-screen bg-background relative flex flex-col justify-between">
      <BackgroundPattern />
      {!isAuthPage && <Header />}
      <main className={`flex-1 w-full ${!isAuthPage ? "pt-16" : ""}`}>
        <Outlet />
      </main>
      {!isAuthPage && <Footer />}
    </div>
  );
}
