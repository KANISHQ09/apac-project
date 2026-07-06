/**
 * useAdminDashboard.ts
 * --------------------
 * Admin hook with Supabase real-time subscription for live issue updates.
 *
 * Task 2.2 — Real-Time Admin Sync (ImplementationPlan.md)
 * Task 2.3 — RBAC Department Scoping (ImplementationPlan.md)
 *
 * Listens to the reported_issues table via Supabase Realtime so that merged
 * reports, severity escalations, and status changes appear instantly in the
 * admin panel without manual page refresh.
 *
 * Department admins receive ONLY events scoped to their assigned department.
 * Super admins see all events and can filter by department via UI.
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
  water_supply: ["Water Supply", "जल आपूर्ति"],
  sanitation: ["Sanitation", "स्वच्छता"],
  electricity: ["Electricity", "बिजली"],
  roads: ["Roads", "सड़कें"],
  parks: ["Parks & Gardens", "पार्क और बगीचे"],
  buildings: ["Buildings", "भवन"],
};

/** Returns true if the issue category belongs to the given department key. */
function categoryMatchesDept(category: string, department: string): boolean {
  if (!department || department === "all") return true;
  const labels = DEPT_CATEGORY_MAP[department] ?? [];
  return labels.some((l) => l.toLowerCase() === category?.toLowerCase());
}

export function useAdminDashboard(user: User | null, authLoading: boolean, activeLanguage: "en" | "hi") {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userDepartment, setUserDepartment] = useState<string | null>(null);
  const [filterDepartment, setFilterDepartment] = useState<string>("all");

  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRealTimeConnected, setIsRealTimeConnected] = useState(false);

  // Keep a ref so the realtime callback always accesses the latest values
  const issuesRef = useRef<Issue[]>([]);
  issuesRef.current = issues;
  const userDepartmentRef = useRef<string | null>(null);
  userDepartmentRef.current = userDepartment;
  const userRoleRef = useRef<UserRole | null>(null);
  userRoleRef.current = userRole;
  const filterDepartmentRef = useRef<string>("all");
  filterDepartmentRef.current = filterDepartment;

  // ── Load initial issues ──────────────────────────────────────────────────
  const loadIssues = useCallback(async () => {
    try {
      const items = await adminService.fetchAllIssuesAdmin();
      setIssues(items);
    } catch (err: any) {
      logger.error("Failed to load admin issues:", err);
      toast({
        title: activeLanguage === "en" ? "Error" : "त्रुटि",
        description: err.message || "Failed to load issues feed.",
        variant: "destructive",
      });
    }
  }, [activeLanguage, toast]);

  // ── Auth check + initial load ────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate(ROUTES.SIGN_IN);
      return;
    }

    (async () => {
      try {
        const adminCheck = await adminService.checkIsAdmin(user.id);
        setIsAdmin(adminCheck);

        if (adminCheck) {
          // Resolve the user's role + department for scoping
          const { role, department } = await adminService.getUserRole(user.id);
          setUserRole(role as UserRole);
          setUserDepartment(department);

          // Department admins: lock filter to their department
          if (role === UserRole.DEPARTMENT_ADMIN && department) {
            setFilterDepartment(department);
          }

          await loadIssues();
        }
      } catch (err) {
        logger.error("Failed to resolve admin permissions check:", err);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, authLoading]);

  // ── Real-time subscription (Task 2.2 + 2.3) ─────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;

    logger.info("Admin: Setting up real-time subscription on reported_issues");

    const channel = supabase
      .channel("admin-issues-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",           // INSERT | UPDATE | DELETE
          schema: "public",
          table: "reported_issues",
        },
        (payload) => {
          logger.info("Admin realtime event:", payload.eventType, payload);

          const dept = userDepartmentRef.current;
          const role = userRoleRef.current;

          if (payload.eventType === "INSERT") {
            const newIssue = issueService.mapResponseToDomain(payload.new as any);

            // Ignore duplicate/subscriber issues (only show master tickets)
            if (newIssue.masterIssueId) {
              return;
            }

            // Department admins: only process events for their department
            if (role === UserRole.DEPARTMENT_ADMIN && !categoryMatchesDept(newIssue.category, dept ?? "")) {
              return;
            }

            setIssues((prev) => [newIssue, ...prev]);
            toast({
              title: activeLanguage === "en" ? "🔴 New Issue Reported" : "🔴 नई समस्या दर्ज",
              description: `${newIssue.title} — ${newIssue.category}`,
            });

          } else if (payload.eventType === "UPDATE") {
            const updated = issueService.mapResponseToDomain(payload.new as any);

            // Ignore duplicate/subscriber issues (only show master tickets)
            if (updated.masterIssueId) {
              return;
            }

            // Department admins: skip updates for other departments
            if (role === UserRole.DEPARTMENT_ADMIN && !categoryMatchesDept(updated.category, dept ?? "")) {
              return;
            }

            setIssues((prev) =>
              prev.map((i) => (i.id === updated.id ? updated : i))
            );

          } else if (payload.eventType === "DELETE") {
            setIssues((prev) => prev.filter((i) => i.id !== (payload.old as any).id));
          }
        }
      )
      .subscribe((status) => {
        logger.info("Admin realtime channel status:", status);
        setIsRealTimeConnected(status === "SUBSCRIBED");
      });

    return () => {
      logger.info("Admin: Tearing down real-time subscription");
      supabase.removeChannel(channel);
      setIsRealTimeConnected(false);
    };
  }, [isAdmin, activeLanguage]);

  // ── Computed: visible issues based on active filter ──────────────────────
  const filteredIssues = issues.filter((issue) => {
    if (userRole === UserRole.DEPARTMENT_ADMIN) {
      // Dept admins always see only their scoped category (enforced server-side too)
      return categoryMatchesDept(issue.category, userDepartment ?? "");
    }
    // Super admins can toggle the filter dropdown
    return categoryMatchesDept(issue.category, filterDepartment);
  });

  // ── Mutations ────────────────────────────────────────────────────────────
  const updateStatus = async (id: string, status: IssueStatus) => {
    try {
      await adminService.updateIssueStatusAdmin(id, status);
      setIssues((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status } : i))
      );
      toast({
        title: activeLanguage === "en" ? "Status updated" : "स्थिति अपडेट की गई",
      });
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
      toast({
        title: activeLanguage === "en" ? "Issue deleted" : "समस्या हटा दी गई",
      });
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
    isRealTimeConnected,
    updateStatus,
    deleteIssue,
    refetch: loadIssues,
  };
}
