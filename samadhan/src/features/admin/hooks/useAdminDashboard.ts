/**
 * useAdminDashboard.ts
 * --------------------
 * Admin hook with Supabase real-time subscription for live issue updates.
 *
 * P0.2 FIX — Root cause of "Loading admin data..." infinite hang:
 *   Uses pre-resolved role + department from AuthProvider (useAuth).
 *   Adds a 15-second timeout safeguard to prevent infinite spinner.
 *   Explicitly waits for Supabase session restoration before querying.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { User } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/shared/hooks/use-toast";
import { adminService } from "../services/adminService";
import { Issue } from "@/shared/types/domain/Issue";
import { IssueStatus } from "@/shared/types/domain/IssueStatus";
import { UserRole } from "@/shared/types/domain/UserRole";
import { logger } from "@/shared/services/logger";
import { ROUTES } from "@/shared/config/routes";
import { supabase } from "@/integrations/supabase/client";
import { issueService } from "@/features/issues";

// Mapping from department key → issue category labels (both languages)
const DEPT_CATEGORY_MAP: Record<string, string[]> = {
  water_supply: ["Water Supply", "जल आपूर्ति", "water_leak", "water supply", "water leakage", "burst pipe", "pipe leak"],
  sanitation: ["Sanitation", "स्वच्छता", "garbage", "trash", "waste"],
  electricity: ["Electricity", "बिजली", "power", "power_cut", "streetlight"],
  roads: ["Roads", "सड़कें", "pothole", "potholes", "road"],
  parks: ["Parks & Gardens", "पार्क और बगीचे", "park", "garden", "tree_falling"],
  buildings: ["Buildings", "भवन", "building", "illegal_construction"],
};

/** Normalize department or category keys to the canonical department key */
export function normalizeDepartmentKey(deptOrCategory: any): string {
  if (typeof deptOrCategory !== "string") return "";
  const key = deptOrCategory.trim().toLowerCase();

  if (
    key === "water_supply" || 
    key === "water_leak" || 
    key === "water supply" || 
    key === "water leakage" || 
    key === "burst_pipe" || 
    key === "burst pipe" || 
    key === "pipe_leak" ||
    key === "pipe leak" ||
    key === "low_pressure" || 
    key === "no_water" ||
    key === "contaminated_water" || 
    key === "pipeline_damage" || 
    key === "valve_failure" || 
    key === "overflow" || 
    key === "supply_disruption" ||
    key === "water" ||
    key === "जल आपूर्ति"
  ) {
    return "water_supply";
  }

  if (
    key === "sanitation" || 
    key === "cleanliness" || 
    key === "garbage" || 
    key === "trash" || 
    key === "waste" || 
    key === "sewage" ||
    key === "drainage" || 
    key === "clogged_drain" || 
    key === "स्वच्छता"
  ) {
    return "sanitation";
  }

  if (
    key === "electricity" || 
    key === "power" || 
    key === "power_cut" || 
    key === "street_light" || 
    key === "streetlight" || 
    key === "transformer" || 
    key === "blackout" || 
    key === "बिजली"
  ) {
    return "electricity";
  }

  if (
    key === "roads" || 
    key === "road" || 
    key === "pothole" || 
    key === "potholes" || 
    key === "street" || 
    key === "asphalt" || 
    key === "sih_potholes" ||
    key === "सड़कें"
  ) {
    return "roads";
  }

  if (
    key === "parks" || 
    key === "parks_gardens" || 
    key === "park" || 
    key === "garden" || 
    key === "trees" || 
    key === "tree_falling" || 
    key === "पार्क और बगीचे"
  ) {
    return "parks";
  }

  if (
    key === "buildings" || 
    key === "building" || 
    key === "construction" || 
    key === "illegal_construction" || 
    key === "encroachment" || 
    key === "भवन"
  ) {
    return "buildings";
  }

  return key.replace(/\s+/g, "_");
}

/** Returns true if the issue category belongs to the given department key. */
export function categoryMatchesDept(category: string, department: string): boolean {
  if (!department || department === "all") return true;
  const normDept = normalizeDepartmentKey(department);
  const normCat = normalizeDepartmentKey(category);
  if (normDept === normCat) return true;

  const labels = DEPT_CATEGORY_MAP[normDept] ?? [];
  return labels.some((l) => l.toLowerCase() === category?.toLowerCase() || l.toLowerCase() === normCat);
}

/** Role strings that qualify as "admin" */
const ADMIN_ROLES: string[] = [
  UserRole.SUPER_ADMIN,
  UserRole.DEPARTMENT_ADMIN,
  "admin",
];

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const tId = setTimeout(() => reject(new Error(errorMsg)), timeoutMs);
      promise.catch(() => {}).finally(() => clearTimeout(tId));
    })
  ]);
}

function deriveIsAdmin(role: UserRole | null): boolean | null {
  if (role === null) return null;
  return ADMIN_ROLES.includes(role as string);
}

export function useAdminDashboard(
  user: User | null,
  authLoading: boolean,
  activeLanguage: "en" | "hi",
  resolvedRole: UserRole | null,
  resolvedDepartment: string | null,
  config?: { queryTimeoutMs?: number; authTimeoutMs?: number }
) {
  const queryTimeoutMs = config?.queryTimeoutMs ?? 8000;
  const authTimeoutMs = config?.authTimeoutMs ?? 5000;
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(() =>
    deriveIsAdmin(resolvedRole)
  );
  const [userRole, setUserRole] = useState<UserRole | null>(resolvedRole);
  const [userDepartment, setUserDepartment] = useState<string | null>(
    resolvedDepartment
  );
  const [filterDepartment, setFilterDepartment] = useState<string>(() => {
    if (resolvedRole === UserRole.DEPARTMENT_ADMIN && resolvedDepartment) {
      return resolvedDepartment;
    }
    return "all";
  });

  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRealTimeConnected, setIsRealTimeConnected] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const bootedUserIdRef = useRef<string | null>(null);
  const isBootedRef = useRef(false);

  console.log(`[useAdminDashboard hook render] issuesCount=${issues.length}, loading=${loading}, error=${error}, isRefreshing=${isRefreshing}, refreshError=${refreshError}`);

  // Request counter to avoid overlapping/stale async responses
  const requestCountRef = useRef(0);

  // Telemetry refs for timing stats
  const totalRefreshCountRef = useRef(0);
  const totalRefreshTimeRef = useRef(0);
  const refreshDurationsRef = useRef<number[]>([]);

  // Active fetch promise tracking for deduplication
  const activeFetchPromiseRef = useRef<Promise<Issue[]> | null>(null);

  // Last refetch start time to prevent focus refresh storm
  const lastRefetchTimeRef = useRef<number>(0);

  // Keep refs so the realtime callback always accesses the latest values
  const issuesRef = useRef<Issue[]>([]);
  issuesRef.current = issues;
  const userDepartmentRef = useRef<string | null>(null);
  userDepartmentRef.current = userDepartment;
  const userRoleRef = useRef<UserRole | null>(null);
  userRoleRef.current = userRole;
  const filterDepartmentRef = useRef<string>("all");
  filterDepartmentRef.current = filterDepartment;

  // ── Sync role/dept from AuthProvider ─────────────────────────────────────
  useEffect(() => {
    if (resolvedRole === null) return;
    const admin = deriveIsAdmin(resolvedRole);
    setIsAdmin(admin);
    setUserRole(resolvedRole);
    setUserDepartment(resolvedDepartment);
    if (resolvedRole === UserRole.DEPARTMENT_ADMIN && resolvedDepartment) {
      setFilterDepartment(resolvedDepartment);
    }
  }, [resolvedRole, resolvedDepartment]);

  const activeLanguageRef = useRef(activeLanguage);
  useEffect(() => {
    activeLanguageRef.current = activeLanguage;
  }, [activeLanguage]);

  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const loadIssues = useCallback(async (isInitial = false, force = false) => {
    const now = Date.now();
    if (!isInitial) {
      lastRefetchTimeRef.current = now;
    }

    if (!force && activeFetchPromiseRef.current) {
      logger.info("[useAdminDashboard] Reusing active fetch promise for deduplication");
      try {
        await activeFetchPromiseRef.current;
      } catch (e) {
        // Handled by original caller
      }
      return;
    }

    const requestId = ++requestCountRef.current;
    if (isInitial) {
      setLoading(true);
      setError(null);
    } else {
      setIsRefreshing(true);
      setRefreshError(null);
    }

    const startTime = Date.now();
    logger.info(`[useAdminDashboard] Starting refresh stage (request #${requestId})`);
    
    // Create & track active fetch promise
    const fetchPromise = adminService.fetchAllIssuesAdmin();
    activeFetchPromiseRef.current = fetchPromise;

    try {
      const items = await withTimeout(
        fetchPromise,
        queryTimeoutMs,
        "TIMEOUT"
      );

      if (requestId === requestCountRef.current) {
        const duration = Date.now() - startTime;
        refreshDurationsRef.current.push(duration);
        totalRefreshCountRef.current++;
        totalRefreshTimeRef.current += duration;

        const avg = totalRefreshTimeRef.current / totalRefreshCountRef.current;
        const sorted = [...refreshDurationsRef.current].sort((a, b) => a - b);
        const p95 = sorted[Math.floor(sorted.length * 0.95)] || duration;

        logger.info(`[useAdminDashboard] Refresh completed in ${duration}ms. Avg: ${avg.toFixed(1)}ms. P95: ${p95.toFixed(1)}ms. Total: ${totalRefreshCountRef.current}`);

        setIssues(items);
        setError(null);
        setRefreshError(null);
      }
    } catch (err: any) {
      const duration = Date.now() - startTime;
      if (requestId === requestCountRef.current) {
        let finalErrorMsg = err.message || "Failed to load issues.";
        if (err.message === "TIMEOUT") {
          if (!navigator.onLine) {
            finalErrorMsg = activeLanguageRef.current === "en"
              ? "Network offline. Reconnecting..."
              : "नेटवर्क ऑफ़लाइन है। पुन: कनेक्ट किया जा रहा है...";
          } else {
            const hasAnalyzingAI = issuesRef.current.some(
              i => i.aiStatus === "analyzing" || i.aiStatus === "pending"
            );
            if (hasAnalyzingAI) {
              finalErrorMsg = activeLanguageRef.current === "en"
                ? "AI is drafting a coordination plan. This page will update automatically."
                : "एआई समन्वय योजना का मसौदा तैयार कर रहा है। यह पृष्ठ अपने आप अपडेट हो जाएगा।";
            } else {
              finalErrorMsg = activeLanguageRef.current === "en"
                ? "Server timeout. Request timed out. The database query took too long to respond."
                : "सर्वर टाइमआउट। अनुरोध समय समाप्त हो गया। डेटाबेस क्वेरी को प्रतिक्रिया देने में बहुत लंबा समय लगा।";
            }
          }
        } else {
          if (!navigator.onLine) {
            finalErrorMsg = activeLanguageRef.current === "en"
              ? "Network offline. Reconnecting..."
              : "नेटवर्क ऑफ़लाइन है। पुन: कनेक्ट किया जा रहा है...";
          }
        }

        logger.error(`[useAdminDashboard] Refresh failed after ${duration}ms:`, err);

        if (issuesRef.current.length === 0) {
          setError(finalErrorMsg);
        } else {
          setRefreshError(finalErrorMsg);
          if (!navigator.onLine) {
            toastRef.current({
              title: activeLanguageRef.current === "en" ? "Connection Offline" : "कनेक्शन ऑफ़लाइन",
              description: finalErrorMsg,
              variant: "destructive",
            });
          }
        }
      }
    } finally {
      activeFetchPromiseRef.current = null;
      if (requestId === requestCountRef.current) {
        if (isInitial) {
          setLoading(false);
        }
        setIsRefreshing(false);
      }
    }
  }, [queryTimeoutMs]);

  // ── Auth check + initial load ────────────────────────────────────────────
  useEffect(() => {
    let active = true;

    // Still loading auth context — wait
    if (authLoading) return;

    // No user — redirect to sign-in
    if (!user) {
      navigate(ROUTES.SIGN_IN);
      return;
    }

    // Role not yet resolved from AuthProvider — wait
    if (resolvedRole === null) return;

    const admin = deriveIsAdmin(resolvedRole);

    if (admin) {
      if (isBootedRef.current && bootedUserIdRef.current === user.id) {
        logger.info("[useAdminDashboard] Already booted for user, skipping initial load");
        return;
      }
      isBootedRef.current = true;
      bootedUserIdRef.current = user.id;
    }

    (async () => {
      try {
        logger.info("[useAdminDashboard] Boot: role=%s dept=%s admin=%s", resolvedRole, resolvedDepartment, admin);

        if (admin) {
          if (active) {
            await loadIssues(true);
          }
        } else {
          if (active) {
            setLoading(false);
          }
        }
      } catch (err: any) {
        logger.error("[useAdminDashboard] Boot error:", err);
        if (active) {
          setError(err.message || "Failed to initialise admin dashboard.");
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading, resolvedRole]);

  const loadIssuesRef = useRef(loadIssues);
  useEffect(() => {
    loadIssuesRef.current = loadIssues;
  }, [loadIssues]);

  // Debounced load issues caller for real-time events to handle database updates
  const debouncedTimeoutRef = useRef<any>(null);
  const triggerDebouncedLoad = useCallback(() => {
    if (debouncedTimeoutRef.current) {
      clearTimeout(debouncedTimeoutRef.current);
    }
    debouncedTimeoutRef.current = setTimeout(() => {
      logger.info("[useAdminDashboard] Debounced realtime event trigger firing refresh");
      loadIssuesRef.current(false, true);
    }, 500);
  }, []);

  useEffect(() => {
    return () => {
      if (debouncedTimeoutRef.current) {
        clearTimeout(debouncedTimeoutRef.current);
      }
    };
  }, []);

  // ── Window focus / visibility change background refresh ──────────────────
  useEffect(() => {
    if (!isAdmin) return;

    const handleFocusOrVisible = () => {
      const now = Date.now();
      // Rate limit focus refetches to once every 15 seconds to avoid request storms
      if (now - lastRefetchTimeRef.current > 15000) {
        logger.info("[useAdminDashboard] Window focus or visibility change triggered background refresh");
        lastRefetchTimeRef.current = now;
        loadIssuesRef.current(false, false); // Background refresh (allow deduplication)
      } else {
        logger.info("[useAdminDashboard] Focus/visibility refresh throttled");
      }
    };

    const handleFocus = () => {
      handleFocusOrVisible();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleFocusOrVisible();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isAdmin]);

   // ── Real-time subscription ───────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;

    logger.info("Admin: Setting up real-time subscription");

    const isRealtimeEventRelevant = (table: string, payload: any): boolean => {
      const dept = userDepartmentRef.current;
      const role = userRoleRef.current;

      // Super admins and admins care about all changes
      if (role === UserRole.SUPER_ADMIN || role === "admin") {
        return true;
      }

      const normalizedDept = normalizeDepartmentKey(dept || "");
      if (!normalizedDept) return false;

      // Extract new/old values
      const newRow = payload.new || {};
      const oldRow = payload.old || {};

      // 1. Check department match if present
      const eventDept = normalizeDepartmentKey(
        newRow.department || oldRow.department || newRow.lead_department || oldRow.lead_department || ""
      );
      if (eventDept && eventDept === normalizedDept) {
        return true;
      }

      // 2. Check case ID match if present
      const caseId = newRow.case_id || oldRow.case_id || newRow.id || oldRow.id;
      if (caseId && issuesRef.current.some((i) => i.id === caseId)) {
        return true;
      }

      // 3. Fallback to true if we cannot resolve case_id or department to avoid missing updates
      if (!caseId && !eventDept) {
        return true;
      }

      return false;
    };

    const handleRealtimeEvent = (table: string, payload: any) => {
      if (isRealtimeEventRelevant(table, payload)) {
        logger.info(`Admin realtime event is relevant for table ${table}, triggering load`);
        triggerDebouncedLoad();
      } else {
        logger.info(`Admin realtime event for table ${table} is not relevant, skipping load`);
      }
    };

    const channel = supabase
      .channel("admin-issues-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reported_issues" },
        (payload) => {
          logger.info("Admin realtime: reported_issues", payload.eventType);
          const dept = userDepartmentRef.current;
          const role = userRoleRef.current;

          if (payload.eventType === "INSERT") {
            const newIssue = issueService.mapResponseToDomain(payload.new as any);
            if (newIssue.masterIssueId) return;
            
            const isRelevant = role === UserRole.SUPER_ADMIN || 
                               newIssue.leadDepartment === dept ||
                               categoryMatchesDept(newIssue.category, dept || "all");
            
            if (isRelevant) {
              toastRef.current({
                title: activeLanguageRef.current === "en" ? "🔴 New Issue Reported" : "🔴 नई समस्या दर्ज",
                description: `${newIssue.title} — ${newIssue.category}`,
              });
            }
            triggerDebouncedLoad();
          } else if (payload.eventType === "UPDATE") {
            if (isRealtimeEventRelevant("reported_issues", payload)) {
              triggerDebouncedLoad();
            }
          } else if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as any).id;
            setIssues((prev) => prev.filter((i) => i.id !== deletedId));
            if (isRealtimeEventRelevant("reported_issues", payload)) {
              triggerDebouncedLoad();
            }
          }
        }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "case_participations" }, (p) => handleRealtimeEvent("case_participations", p))
      .on("postgres_changes", { event: "*", schema: "public", table: "department_tasks" }, (p) => handleRealtimeEvent("department_tasks", p))
      .on("postgres_changes", { event: "*", schema: "public", table: "task_handoffs" }, (p) => handleRealtimeEvent("task_handoffs", p))
      .on("postgres_changes", { event: "*", schema: "public", table: "coordination_change_requests" }, (p) => handleRealtimeEvent("coordination_change_requests", p))
      .on("postgres_changes", { event: "*", schema: "public", table: "task_transfer_requests" }, (p) => handleRealtimeEvent("task_transfer_requests", p))
      .subscribe((status) => {
        logger.info("Admin realtime channel status:", status);
        setIsRealTimeConnected(status === "SUBSCRIBED");
      });

    return () => {
      logger.info("Admin: Tearing down real-time subscription");
      supabase.removeChannel(channel);
      setIsRealTimeConnected(false);
    };
  }, [isAdmin, triggerDebouncedLoad]);

  // ── Computed: visible issues ─────────────────────────────────────────────
  const filteredIssues = issues.filter((issue) => {
    if (userRole === UserRole.DEPARTMENT_ADMIN) {
      const dept = normalizeDepartmentKey(userDepartment);
      if (!dept) return false;

      const isLead = normalizeDepartmentKey(issue.leadDepartment) === dept;
      const hasActiveParticipation = issue.participations?.some(
        (p) => normalizeDepartmentKey(p.department) === dept && (p.status === "ACTIVE" || p.status === "PROPOSED")
      );
      const hasActiveTask = issue.tasks?.some(
        (t) => normalizeDepartmentKey(t.department) === dept
      );

      // Check draft/proposed coordination plans
      const hasDraftPlanParticipation = issue.coordinationPlans?.some((plan: any) => {
        if (plan.status === "ACTIVATED" || plan.status === "REJECTED" || plan.status === "SUPERSEDED") return false;
        
        const hasProposedDept = plan.aiPlanParticipants?.some(
          (p: any) => normalizeDepartmentKey(p.department) === dept
        );
        const hasProposedTask = plan.aiPlanTasks?.some(
          (t: any) => normalizeDepartmentKey(t.department) === dept
        );
        return hasProposedDept || hasProposedTask;
      });

      return isLead || !!hasActiveParticipation || !!hasActiveTask || !!hasDraftPlanParticipation;
    }
    return categoryMatchesDept(issue.category, filterDepartment);
  });

  // ── Mutations ────────────────────────────────────────────────────────────
  const updateStatus = async (id: string, status: IssueStatus) => {
    try {
      await adminService.updateIssueStatusAdmin(id, status);
      setIssues((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
      toast({ title: activeLanguage === "en" ? "Status updated" : "स्थिति अपडेट की गई" });
    } catch (error: any) {
      logger.error("Failed to update status:", error);
      toast({
        title: activeLanguage === "en" ? "Error" : "त्रुटि",
        description: error.message || "Failed to update issue status.",
        variant: "destructive",
      });
    }
  };

  const deleteIssue = async (id: string) => {
    try {
      await adminService.deleteIssueAdmin(id);
      setIssues((prev) => prev.filter((i) => i.id !== id));
      toast({ title: activeLanguage === "en" ? "Issue deleted" : "समस्या हटा दी गई" });
    } catch (error: any) {
      logger.error("Failed to delete issue:", error);
      toast({
        title: activeLanguage === "en" ? "Error" : "त्रुटि",
        description: error.message || "Failed to delete issue report.",
        variant: "destructive",
      });
    }
  };

  return {
    isAdmin,
    userRole,
    userDepartment,
    filterDepartment,
    setFilterDepartment,
    issues: filteredIssues,
    totalIssues: issues,
    loading,
    error,
    isRefreshing,
    refreshError,
    isRealTimeConnected,
    updateStatus,
    deleteIssue,
    refetch: loadIssues,
  };
}
