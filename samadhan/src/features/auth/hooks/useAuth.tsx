import { useState, useEffect, createContext, useContext, ReactNode, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { authService } from "../services/authService";
import { adminService } from "@/features/admin/services/adminService";
import { UserRole } from "@/shared/types/domain/UserRole";
import { logger } from "@/shared/services/logger";
import { LoginInput } from "../validation/loginSchema";
import { SignupInput } from "../validation/signupSchema";

export type AuthState =
  | "BOOTSTRAPPING"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "SIGNING_IN"
  | "SIGNING_OUT"
  | "ERROR";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: UserRole | null;
  department: string | null;
  loading: boolean;
  roleLoading: boolean;
  status: AuthState;
  signIn: (input: LoginInput) => Promise<any>;
  signUp: (input: SignupInput) => Promise<any>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState>("BOOTSTRAPPING");
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [department, setDepartment] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(true);

  // Keep references to state so handleSessionChange doesn't capture stale values
  const userRef = useRef<User | null>(null);
  userRef.current = user;
  const roleRef = useRef<UserRole | null>(null);
  roleRef.current = role;

  useEffect(() => {
    let active = true;
    let initialEventFired = false;

    // Helper to load role for a user
    const fetchAndCacheRole = async (userId: string, isSilent = false) => {
      const cacheKey = `samadhan_role_data_${userId}`;
      if (!isSilent) {
        setRoleLoading(true);
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (active) {
              setRole(parsed.role);
              setDepartment(parsed.department);
              setRoleLoading(false);
            }
          } catch (e) {
            // ignore bad cache
          }
        }
      }

      try {
        const res = await adminService.getUserRole(userId);
        const fetchedRole = res.role as UserRole;
        const fetchedDept = res.department;
        if (active) {
          setRole(fetchedRole);
          setDepartment(fetchedDept);
          setRoleLoading(false);
          localStorage.setItem(
            cacheKey,
            JSON.stringify({ role: fetchedRole, department: fetchedDept })
          );
        }
      } catch (err) {
        logger.error("Failed to load user role:", err);
        if (active) {
          setRole((prev) => prev || UserRole.USER);
          setDepartment((prev) => prev || null);
          setRoleLoading(false);
        }
      }
    };

    const handleSessionChange = async (event: string, newSession: Session | null) => {
      if (!active) return;
      logger.info(`[useAuth] Session change callback: event=${event} userId=${newSession?.user?.id || "none"}`);

      const isSameUser = newSession?.user?.id === userRef.current?.id;

      if (event === "TOKEN_REFRESHED" && isSameUser) {
        // Silent token update - do not reset loading states, roles, or departments
        setSession(newSession);
        setUser(newSession?.user ?? null);
        return;
      }

      const isSilentCheck = isSameUser && roleRef.current !== null;

      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        setStatus("SIGNED_IN");
        setLoading(false);
        await fetchAndCacheRole(newSession.user.id, isSilentCheck);
      } else {
        setStatus("SIGNED_OUT");
        setRole(null);
        setDepartment(null);
        setLoading(false);
        setRoleLoading(false);
      }
    };

    // Set up auth state listener
    const subscription = authService.onAuthStateChange(async (event, newSession) => {
      initialEventFired = true;
      await handleSessionChange(event, newSession);
    });

    // Bounded watchdog for initial bootstrap
    const watchdogTimer = setTimeout(() => {
      if (active && !initialEventFired) {
        logger.warn("[useAuth] Initial bootstrap watchdog fired. Attempting getSession() fallback.");
        authService.getSession()
          .then(async (currentSession) => {
            if (!active) return;
            if (!initialEventFired) {
              initialEventFired = true;
              await handleSessionChange("INITIAL_SESSION", currentSession);
            }
          })
          .catch((err) => {
            logger.error("[useAuth] Watchdog session restoration failed:", err);
            if (active) {
              setStatus("ERROR");
              setLoading(false);
              setRoleLoading(false);
            }
          });
      }
    }, 1500);

    // Initial check (in case subscription didn't fire INITIAL_SESSION immediately)
    authService.getSession()
      .then(async (currentSession) => {
        if (!active) return;
        if (!initialEventFired) {
          initialEventFired = true;
          await handleSessionChange("INITIAL_SESSION", currentSession);
        }
      })
      .catch((err) => {
        logger.error("[useAuth] Failed to restore initial session:", err);
        if (active) {
          setStatus("ERROR");
          setLoading(false);
          setRoleLoading(false);
        }
      });

    return () => {
      active = false;
      clearTimeout(watchdogTimer);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (input: LoginInput) => {
    try {
      setStatus("SIGNING_IN");
      setLoading(true);
      setRoleLoading(true);
      const res = await authService.signIn(input);
      return res;
    } catch (err) {
      logger.error("SignIn failed:", err);
      setStatus("ERROR");
      setLoading(false);
      setRoleLoading(false);
      throw err;
    }
  };

  const signUp = async (input: SignupInput) => {
    try {
      setStatus("SIGNING_IN");
      setLoading(true);
      const res = await authService.signUp(input);
      return res;
    } catch (err) {
      logger.error("SignUp failed:", err);
      setStatus("ERROR");
      setLoading(false);
      throw err;
    }
  };

  const signOut = async () => {
    try {
      setStatus("SIGNING_OUT");
      setLoading(true);
      setRoleLoading(true);

      if (user) {
        localStorage.removeItem(`samadhan_role_data_${user.id}`);
      }
      await authService.signOut();
    } catch (err) {
      logger.error("Signout failed:", err);
      // Recover state back to SIGNED_IN if we still have a user
      if (user) {
        setStatus("SIGNED_IN");
      } else {
        setStatus("SIGNED_OUT");
      }
      setLoading(false);
      setRoleLoading(false);
      throw err;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        department,
        loading,
        roleLoading,
        status,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
