import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { useAuth } from "@/features/auth";
import { useAdminDashboard, normalizeDepartmentKey } from "../hooks/useAdminDashboard";
import { logger } from "@/shared/services/logger";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  Shield, Trash2, Loader2, ShieldAlert, ShieldCheck,
  Droplets, Zap, Car, Trees, Building2, Recycle, LayoutDashboard,
  Users, Plus, ArrowRight, AlertCircle, CheckCircle2, AlertTriangle,
  Layers, Play, Wrench, Hourglass, Inbox, RotateCcw, FileCheck, Clock, ArrowDownLeft,
  ChevronDown, ChevronUp, Brain, Sparkles, RefreshCw
} from "lucide-react";
import { STATUSES, STATUS_LABELS } from "@/shared/constants/statuses";
import { ROUTES } from "@/shared/config/routes";
import { LoadingState } from "@/shared/components/LoadingState";
import { EmptyState } from "@/shared/components/EmptyState";
import { UserRole } from "@/shared/types/domain/UserRole";
import { IssueStatus } from "@/shared/types/domain/IssueStatus";
import { Issue } from "@/shared/types/domain/Issue";
import { coordinationService } from "@/features/coordination";
import { ExecutionSection } from "../components/ExecutionSection";
import { HandoffBoard } from "../components/HandoffBoard";
import { ChangeRequestPanel } from "../components/ChangeRequestPanel";
import { CommandCenterDashboard } from "../components/CommandCenterDashboard";
import { DepartmentEscalationBanner } from "../components/DepartmentEscalationBanner";
import { CoordinationSection } from "../components/CoordinationSection";
import { JointClosurePanel } from "../components/JointClosurePanel";
import { CoordinationOutcomesDashboard } from "../components/CoordinationOutcomesDashboard";
import { ReopenRequestPanel } from "../components/ReopenRequestPanel";
import { PanelErrorBoundary } from "@/shared/components/PanelErrorBoundary";


const statusesList = Object.values(STATUSES);

function getRecommendedNextAction(issue: Issue, userDepartment: string, language: "en" | "hi"): { title: string; desc: string } {
  const isEn = language === "en";
  const status = issue.status;

  if (status === "reported") {
    return {
      title: isEn ? "Review New Case" : "नए मामले की समीक्षा करें",
      desc: isEn 
        ? "Evaluate the reported grievance, and Accept Case or Mark Invalid." 
        : "रिपोर्ट की गई शिकायत का मूल्यांकन करें, और मामला स्वीकार करें या अवैध चिह्नित करें।"
    };
  }

  if (status === "triage" || status === "accepted") {
    if (issue.aiStatus === "pending" || issue.aiStatus === "analyzing") {
      return {
        title: isEn ? "Preparing Response Plan" : "प्रतिक्रिया योजना तैयार की जा रही है",
        desc: isEn 
          ? "AI is analyzing the issue details and drafting an execution plan." 
          : "AI मामले का विश्लेषण कर रहा है और एक निष्पादन योजना का मसौदा तैयार कर रहा है।"
      };
    }
    if (!issue.aiProvider) {
      return {
        title: isEn ? "Generate Response Plan" : "प्रतिक्रिया योजना उत्पन्न करें",
        desc: isEn 
          ? "Trigger AI analysis to generate draft tasks and department routing." 
          : "ड्राफ्ट कार्य और विभाग रूटिंग उत्पन्न करने के लिए AI विश्लेषण ट्रिगर करें।"
      };
    }
    return {
      title: isEn ? "Approve Response Plan" : "प्रतिक्रिया योजना स्वीकृत करें",
      desc: isEn 
        ? "Review the AI-generated draft coordination plan and approve to spawn tasks." 
        : "AI द्वारा जनरेट की गई ड्राफ्ट समन्वय योजना की समीक्षा करें और कार्य शुरू करने के लिए योजना स्वीकृत करें।"
    };
  }

  if (status === "plan_review") {
    return {
      title: isEn ? "Review and Approve Response Plan" : "प्रतिक्रिया योजना की समीक्षा और स्वीकृति",
      desc: isEn 
        ? "Review the proposed tasks, owner departments, and dependency DAG, then click Approve." 
        : "प्रस्तावित कार्यों, उनके विभागों और निर्भरता आरेख की समीक्षा करें, फिर स्वीकृत करें पर क्लिक करें।"
    };
  }

  if (status === "assigned" || status === "in_progress") {
    const myReadyTasks = issue.tasks?.filter(
      t => normalizeDepartmentKey(t.department) === normalizeDepartmentKey(userDepartment) && t.taskStatus === "READY"
    ) || [];
    if (myReadyTasks.length > 0) {
      return {
        title: isEn ? "Start Ready Task" : "तैयार कार्य शुरू करें",
        desc: isEn 
          ? `You have ${myReadyTasks.length} task(s) ready for execution. Accept/Start working on them.` 
          : `आपके पास निष्पादन के लिए ${myReadyTasks.length} कार्य तैयार हैं। उन्हें स्वीकार करें/काम शुरू करें।`
      };
    }

    const myWorkingTasks = issue.tasks?.filter(
      t => normalizeDepartmentKey(t.department) === normalizeDepartmentKey(userDepartment) && t.taskStatus === "WORKING"
    ) || [];
    if (myWorkingTasks.length > 0) {
      return {
        title: isEn ? "Complete Working Tasks" : "चल रहे कार्यों को पूरा करें",
        desc: isEn 
          ? `Finish active operations for: "${myWorkingTasks[0].title}" and submit completion evidence.` 
          : `सक्रिय संचालन समाप्त करें: "${myWorkingTasks[0].title}" और पूरा होने का प्रमाण जमा करें।`
      };
    }

    const pendingHandoffs = issue.handoffs?.filter(
      h => normalizeDepartmentKey(h.toDepartment) === normalizeDepartmentKey(userDepartment) && 
           (h.handoffStatus === "SUBMITTED" || h.handoffStatus === "UNDER_REVIEW")
    ) || [];
    if (pendingHandoffs.length > 0) {
      return {
        title: isEn ? "Review Incoming Handoff" : "आने वाले हैंडऑफ़ की समीक्षा करें",
        desc: isEn 
          ? `A supporting department submitted completion evidence. Review and Accept Handoff.` 
          : `एक सहायक विभाग ने काम पूरा होने का प्रमाण प्रस्तुत किया है। हैंडऑफ़ की समीक्षा करें और स्वीकार करें।`
      };
    }

    return {
      title: isEn ? "Monitor Task Execution" : "कार्य निष्पादन की निगरानी करें",
      desc: isEn 
        ? "Awaiting execution of predecessor tasks or dependencies from other departments." 
        : "अन्य विभागों से पूर्ववर्ती कार्यों या निर्भरताओं के पूरा होने की प्रतीक्षा है।"
    };
  }

  if (status === "verification") {
    return {
      title: isEn ? "Verify Repair Evidence" : "मरम्मत साक्ष्य सत्यापित करें",
      desc: isEn 
        ? "Review post-repair photos, pressure tests, or local site confirmations before resolution." 
        : "समाधान से पहले मरम्मत के बाद की तस्वीरें, दबाव परीक्षण या साइट पुष्टि की समीक्षा करें।"
    };
  }

  if (status === "resolved") {
    return {
      title: isEn ? "Close Case" : "मामला बंद करें",
      desc: isEn 
        ? "All verification gates passed. Secure final signatures to permanently close the case." 
        : "सभी सत्यापन द्वार पास हो गए हैं। मामले को स्थायी रूप से बंद करने के लिए अंतिम हस्ताक्षर प्राप्त करें।"
    };
  }

  return {
    title: isEn ? "Case Closed" : "मामला बंद हो गया",
    desc: isEn ? "This case is resolved and officially closed." : "यह मामला हल हो गया है और आधिकारिक रूप से बंद है।"
  };
}

// ── Department metadata ────────────────────────────────────────────────────
export const DEPARTMENT_META: Record<string, {
  labelEn: string;
  labelHi: string;
  icon: React.ReactNode;
  color: string;
  gradient: string;
}> = {
  all: {
    labelEn: "All Departments",
    labelHi: "सभी विभाग",
    icon: <LayoutDashboard className="w-5 h-5" />,
    color: "text-primary",
    gradient: "from-primary/20 to-primary/5",
  },
  water_supply: {
    labelEn: "Water Supply",
    labelHi: "जल आपूर्ति",
    icon: <Droplets className="w-5 h-5" />,
    color: "text-blue-500",
    gradient: "from-blue-500/20 to-blue-500/5",
  },
  sanitation: {
    labelEn: "Sanitation",
    labelHi: "स्वच्छता",
    icon: <Recycle className="w-5 h-5" />,
    color: "text-green-500",
    gradient: "from-green-500/20 to-green-500/5",
  },
  electricity: {
    labelEn: "Electricity",
    labelHi: "बिजली",
    icon: <Zap className="w-5 h-5" />,
    color: "text-yellow-500",
    gradient: "from-yellow-500/20 to-yellow-500/5",
  },
  roads: {
    labelEn: "Roads",
    labelHi: "सड़कें",
    icon: <Car className="w-5 h-5" />,
    color: "text-orange-500",
    gradient: "from-orange-500/20 to-orange-500/5",
  },
  parks: {
    labelEn: "Parks & Gardens",
    labelHi: "पार्क और बगीचे",
    icon: <Trees className="w-5 h-5" />,
    color: "text-emerald-500",
    gradient: "from-emerald-500/20 to-emerald-500/5",
  },
  buildings: {
    labelEn: "Buildings",
    labelHi: "भवन",
    icon: <Building2 className="w-5 h-5" />,
    color: "text-purple-500",
    gradient: "from-purple-500/20 to-purple-500/5",
  },
};

const STATUS_COLORS: Record<string, string> = {
  reported:    "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  in_progress: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  resolved:    "bg-green-500/10 text-green-600 border-green-500/20",
  rejected:    "bg-red-500/10 text-red-600 border-red-500/20",
};

export default function AdminPage() {
  const { user, loading: sessionLoading, roleLoading, role: resolvedRole, department: resolvedDepartment } = useAuth();
  const authLoading = sessionLoading || roleLoading;
  const { language } = useLanguage();
  const navigate = useNavigate();

  const [showDiagnostics, setShowDiagnostics] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowDiagnostics(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const {
    isAdmin,
    userRole,
    userDepartment,
    filterDepartment,
    setFilterDepartment,
    issues,
    totalIssues,
    loading,
    error: dashboardError,
    isRefreshing,
    refreshError,
    isRealTimeConnected,
    updateStatus,
    deleteIssue,
    refetch: loadIssues,
  } = useAdminDashboard(user, authLoading, language, resolvedRole, resolvedDepartment);

  const [activeTab, setActiveTab] = useState<"queue" | "analytics" | "reopens">("queue");

  const [opStats, setOpStats] = useState({
    incomingHandoffs: 0,
    reworkRequired: 0,
    slaBreached: 0,
    slaAtRisk: 0,
    pendingSignoffs: 0,
    openEscalations: 0,
  });
  const [statsLoading, setStatsLoading] = useState(false);
  const [expandedIssues, setExpandedIssues] = useState<Record<string, boolean>>({});

  const toggleIssueExpanded = (issueId: string) => {
    setExpandedIssues((prev) => ({ ...prev, [issueId]: !prev[issueId] }));
  };

  const isInitialStatsLoad = useRef(true);
  const ourTaskIdsSerialized = issues
    .flatMap(i => i.tasks || [])
    .filter(t => t.department === userDepartment)
    .map(t => t.id)
    .sort()
    .join(",");

  const closureIssueIdsSerialized = issues
    .filter(i => i.coordinationStatus === "closure_review")
    .map(i => i.id)
    .sort()
    .join(",");

  useEffect(() => {
    if (!userDepartment || userRole === UserRole.SUPER_ADMIN) return;
    
    (async () => {
      try {
        if (isInitialStatsLoad.current) {
          setStatsLoading(true);
          isInitialStatsLoad.current = false;
        }
        
        const ourTaskIds = ourTaskIdsSerialized ? ourTaskIdsSerialized.split(",") : [];
        
        // 1. Incoming Handoffs
        const { count: handoffs } = await supabase
          .from("task_handoffs")
          .select("*", { count: "exact", head: true })
          .eq("to_department", userDepartment)
          .in("handoff_status", ["SUBMITTED", "UNDER_REVIEW"]);
          
        // 2. Rework Required (Rejected handoffs where we are the source)
        const { count: rework } = await supabase
          .from("task_handoffs")
          .select("*", { count: "exact", head: true })
          .eq("from_department", userDepartment)
          .eq("handoff_status", "REJECTED");
          
        // 3. Open Escalations where we are the root cause
        const { count: escalations } = await supabase
          .from("escalations")
          .select("*", { count: "exact", head: true })
          .eq("status", "OPEN")
          .eq("root_cause_department", userDepartment);
          
        // 4. SLA Breached
        let breached = 0;
        if (ourTaskIds.length > 0) {
          const { count } = await supabase
            .from("sla_instances")
            .select("*", { count: "exact", head: true })
            .eq("status", "BREACHED")
            .in("entity_id", ourTaskIds);
          breached = count || 0;
        }
        
        // 5. SLA At Risk
        let atRisk = 0;
        if (ourTaskIds.length > 0) {
          const soon = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
          const now = new Date().toISOString();
          const { count } = await supabase
            .from("sla_instances")
            .select("*", { count: "exact", head: true })
            .eq("status", "ACTIVE")
            .in("entity_id", ourTaskIds)
            .gte("due_at", now)
            .lte("due_at", soon);
          atRisk = count || 0;
        }
        
        // 6. Pending Sign-offs (closure review cases where we are participating but not signed yet)
        const closureIssues = closureIssueIdsSerialized ? closureIssueIdsSerialized.split(",") : [];
        let pendingClosureSignoffs = 0;
        if (closureIssues.length > 0) {
          const { data: signed } = await supabase
            .from("case_resolution_signoffs")
            .select("case_id")
            .eq("department", userDepartment)
            .eq("status", "SIGNED");
          const signedIds = new Set(signed?.map(s => s.case_id) || []);
          pendingClosureSignoffs = closureIssues.filter(id => !signedIds.has(id)).length;
        }
        
        setOpStats({
          incomingHandoffs: handoffs || 0,
          reworkRequired: rework || 0,
          slaBreached: breached,
          slaAtRisk: atRisk,
          pendingSignoffs: pendingClosureSignoffs,
          openEscalations: escalations || 0,
        });
      } catch (err) {
        console.error("Failed to fetch operational stats:", err);
      } finally {
        setStatsLoading(false);
      }
    })();
  }, [userDepartment, userRole, ourTaskIdsSerialized, closureIssueIdsSerialized]);

  // Log structured diagnostics to developer console
  useEffect(() => {
    logger.info("[AdminPage] Auth/Dashboard State:", {
      authLoading,
      userEmail: user?.email,
      resolvedRole,
      resolvedDepartment,
      dashboardLoading: loading,
      dashboardError,
      isAdmin
    });
  }, [authLoading, user, resolvedRole, resolvedDepartment, loading, dashboardError, isAdmin]);

  const handleDelete = async (id: string) => {
    const confirmText = language === "en" ? "Delete this issue?" : "क्या आप इस समस्या को हटाना चाहते हैं?";
    if (!confirm(confirmText)) return;
    await deleteIssue(id);
  };

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading || authLoading) {
    const showDiagnosticsParam = new URLSearchParams(window.location.search).get("debug") === "true";
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <LoadingState message={language === "en" ? "Loading admin data..." : "प्रशासक डेटा लोड हो रहा है..."} />
        {showDiagnostics && showDiagnosticsParam && (
          <div className="p-4 bg-muted border rounded-md text-xs font-mono max-w-md w-full space-y-1 text-left">
            <h4 className="font-bold border-b pb-1 mb-2">Diagnostics:</h4>
            <div>authLoading: {String(authLoading)}</div>
            <div>user: {user ? `${user.email} (masked)` : "null"}</div>
            <div>resolvedRole: {String(resolvedRole)}</div>
            <div>resolvedDepartment: {String(resolvedDepartment)}</div>
            <div>dashboardLoading: {String(loading)}</div>
            <div>dashboardError: {String(dashboardError)}</div>
            <div>isAdmin: {String(isAdmin)}</div>
          </div>
        )}
      </div>
    );
  }

  // ── Load error state ───────────────────────────────────────────────────
  const hasUsableData = totalIssues && totalIssues.length > 0;
  if (dashboardError && !hasUsableData) {
    return (
      <div className="container mx-auto px-4 max-w-md text-center py-16">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold mb-2">
          {language === "en" ? "Operations data could not be loaded." : "संचालन डेटा लोड नहीं किया जा सका।"}
        </h2>
        <p className="text-muted-foreground mb-6 text-sm">
          {language === "en"
            ? "Your account is signed in, but the latest department data could not be retrieved."
            : "आपका खाता साइन इन है, लेकिन नवीनतम विभाग डेटा प्राप्त नहीं किया जा सका।"}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={() => loadIssues(true)}>
            {language === "en" ? "Try Again" : "पुनः प्रयास करें"}
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            {language === "en" ? "Refresh Session" : "सत्र रीफ़्रेश करें"}
          </Button>
        </div>
      </div>
    );
  }

  // ── Unauthorized state ─────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 max-w-md text-center py-16">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-6">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold mb-2">
          {language === "en" ? "Access Denied" : "पहुंच अस्वीकृत"}
        </h2>
        <p className="text-muted-foreground mb-6">
          {language === "en"
            ? "You need admin privileges to view this page."
            : "इस पृष्ठ को देखने के लिए आपके पास व्यवस्थापक विशेषाधिकार होने चाहिए।"}
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          To grant admin access, run this in the Supabase SQL editor:
          <br />
          <code className="bg-muted px-2 py-1 rounded text-xs">
            INSERT INTO user_roles (user_id, role) VALUES ('{user?.id}', 'admin');
          </code>
        </p>
        <Button onClick={() => navigate(ROUTES.DASHBOARD)}>
          {language === "en" ? "Back to Dashboard" : "डैशबोर्ड पर वापस जाएं"}
        </Button>
      </div>
    );
  }

  // ── Computed display metadata ──────────────────────────────────────────
  const isSuperAdmin = userRole === UserRole.SUPER_ADMIN;
  const activeDept = isSuperAdmin ? filterDepartment : (userDepartment ?? "all");
  const deptMeta = DEPARTMENT_META[activeDept] ?? DEPARTMENT_META["all"];
  const userDeptMeta = DEPARTMENT_META[userDepartment ?? "all"] ?? DEPARTMENT_META["all"];

  const activeCasesCount = issues.filter((i) => i.status !== "resolved" && i.status !== "rejected").length;
  
  const tasksReadyCount = issues.reduce(
    (acc, i) => acc + (i.tasks?.filter((t) => t.department === userDepartment && t.taskStatus === "READY").length || 0),
    0
  );
  
  const tasksWorkingCount = issues.reduce(
    (acc, i) => acc + (i.tasks?.filter((t) => t.department === userDepartment && (t.taskStatus === "WORKING" || t.taskStatus === "ACCEPTED")).length || 0),
    0
  );
  
  const tasksWaitingCount = issues.reduce(
    (acc, i) => acc + (i.tasks?.filter((t) => t.department === userDepartment && t.taskStatus === "WAITING_DEPENDENCY").length || 0),
    0
  );
  
  const blockingCount = issues.filter((i) => {
    const hasUncompleted = i.tasks?.some(
      (t) => t.department === userDepartment && !["COMPLETED", "CANCELLED", "REJECTED"].includes(t.taskStatus)
    );
    const hasWaiting = i.tasks?.some(
      (t) => t.department !== userDepartment && t.taskStatus === "WAITING_DEPENDENCY"
    );
    return hasUncompleted && hasWaiting;
  }).length;

  const dashboardTitle = isSuperAdmin
    ? (language === "en" ? "Super Admin Dashboard" : "सुपर एडमिन डैशबोर्ड")
    : `${language === "en" ? userDeptMeta.labelEn : userDeptMeta.labelHi} ${language === "en" ? "Operations" : "संचालन"}`;

  const dashboardSubtitle = isSuperAdmin
    ? (language === "en" ? "Manage all civic issues across every department" : "सभी विभागों की नागरिक समस्याओं का प्रबंधन करें")
    : (language === "en"
        ? "Monitor assigned civic cases, execute departmental tasks, coordinate dependencies, and prevent SLA breaches."
        : "आवंटित नागरिक मामलों की निगरानी करें, विभागीय कार्यों को निष्पादित करें, निर्भरताओं का समन्वय करें और SLA उल्लंघन को रोकें।");

  return (
    <div className="container mx-auto px-4 max-w-6xl py-8">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          {/* Department icon badge */}
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${deptMeta.gradient} border border-border flex items-center justify-center shadow-sm ${deptMeta.color}`}>
            {isSuperAdmin ? <ShieldCheck className="w-7 h-7" /> : deptMeta.icon}
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">{dashboardTitle}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{dashboardSubtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Dept scope badge for dept admins */}
          {!isSuperAdmin && userDepartment && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-card text-sm font-medium ${userDeptMeta.color}`}>
              {userDeptMeta.icon}
              <span>{language === "en" ? userDeptMeta.labelEn : userDeptMeta.labelHi}</span>
            </div>
          )}

          {/* Background refresh indicator */}
          {isRefreshing && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-card shadow-sm text-sm">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground text-xs">
                {language === "en" ? "Refreshing..." : "रीफ़्रेश हो रहा है..."}
              </span>
            </div>
          )}

          {/* Real-time connection indicator (Task 2.2) */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card shadow-sm text-sm">
            <span className="relative flex h-2.5 w-2.5">
              {isRealTimeConnected && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              )}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isRealTimeConnected ? "bg-green-500" : "bg-yellow-500"}`} />
            </span>
            <span className="text-muted-foreground">
              {isRealTimeConnected
                ? (language === "en" ? "Live" : "लाइव")
                : (language === "en" ? "Connecting…" : "कनेक्ट हो रहा…")}
            </span>
          </div>
        </div>
      </div>

      {refreshError && (
        <div className="mb-6 p-3 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              {language === "en" 
                ? `Connection interrupted. Showing last available cached data (${refreshError}).` 
                : `कनेक्शन बाधित हुआ। अंतिम उपलब्ध कैश्ड डेटा दिखाया जा रहा है (${refreshError})।`}
            </span>
          </div>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-amber-800 hover:bg-amber-100" onClick={() => loadIssues(false)}>
            {language === "en" ? "Retry" : "पुनः प्रयास करें"}
          </Button>
        </div>
      )}

      {/* ── Tabs Navigation ──────────────────────────────────────────────── */}
      <div className="flex border-b border-border mb-6">
        <button
          onClick={() => setActiveTab("queue")}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-all ${
            activeTab === "queue"
              ? "border-primary text-primary font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {language === "en" ? "Issues Queue" : "समस्या कतार"}
        </button>
        <button
          onClick={() => setActiveTab("analytics")}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-all ${
            activeTab === "analytics"
              ? "border-primary text-primary font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {language === "en" ? "Coordination Analytics" : "समन्वय विश्लेषण"}
        </button>
        <button
          onClick={() => setActiveTab("reopens")}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-all ${
            activeTab === "reopens"
              ? "border-primary text-primary font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {language === "en" ? "Reopen Requests" : "पुनः खोलने के अनुरोध"}
        </button>
      </div>

      {activeTab === "queue" && (
        <>
          {/* ── Super Admin: Department Filter ─────────────────────────────── */}
      {isSuperAdmin && (
        <div className="flex items-center gap-3 mb-6 p-4 rounded-xl border border-border bg-card/50">
          <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground shrink-0">
            {language === "en" ? "Filter by Department:" : "विभाग के अनुसार फ़िल्टर करें:"}
          </span>
          <div className="flex flex-wrap gap-2">
            {Object.entries(DEPARTMENT_META).map(([key, meta]) => (
              <button
                key={key}
                onClick={() => setFilterDepartment(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  filterDepartment === key
                    ? `${meta.color} bg-gradient-to-br ${meta.gradient} border-current shadow-sm`
                    : "text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground"
                }`}
              >
                {meta.icon}
                {language === "en" ? meta.labelEn : meta.labelHi}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Stats / KPI Grid ─────────────────────────────────────────────── */}
      {isSuperAdmin ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {statusesList.map((s) => {
            const count = issues.filter((i) => i.status === s).length;
            const label = STATUS_LABELS[s]?.[language] || s;
            const colorClass = STATUS_COLORS[s] ?? "bg-muted text-foreground border-border";
            return (
              <div key={s} className={`border rounded-xl p-4 shadow-sm ${colorClass}`}>
                <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
                <p className="text-3xl font-bold mt-1">{count}</p>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          {/* Primary Operations Row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            {[
              {
                label: language === "en" ? "Active Cases" : "सक्रिय मामले",
                value: activeCasesCount,
                icon: <Layers className="w-4 h-4 text-blue-500" />,
                color: "bg-blue-500/5 border-blue-500/10 text-blue-750 dark:text-blue-400"
              },
              {
                label: language === "en" ? "Ready Tasks" : "तैयार कार्य",
                value: tasksReadyCount,
                icon: <Play className="w-4 h-4 text-indigo-500" />,
                color: "bg-indigo-500/5 border-indigo-500/10 text-indigo-750 dark:text-indigo-400"
              },
              {
                label: language === "en" ? "In Progress" : "कार्य प्रगति पर",
                value: tasksWorkingCount,
                icon: <Wrench className="w-4 h-4 text-amber-500" />,
                color: "bg-amber-500/5 border-amber-500/10 text-amber-750 dark:text-amber-400"
              },
              {
                label: language === "en" ? "SLA Risk" : "SLA जोखिम में",
                value: opStats.slaAtRisk,
                icon: <Clock className="w-4 h-4 text-yellow-500" />,
                color: "bg-yellow-500/5 border-yellow-500/10 text-yellow-750 dark:text-yellow-400"
              },
              {
                label: language === "en" ? "Blocked" : "अवरुद्ध",
                value: blockingCount,
                icon: <AlertTriangle className="w-4 h-4 text-red-500" />,
                color: "bg-red-500/5 border-red-500/10 text-red-750 dark:text-red-400"
              }
            ].map((kpi, idx) => (
              <div key={idx} className={`h-[102px] border rounded-xl p-3.5 shadow-sm flex flex-col justify-between transition-all duration-350 hover:shadow-md ${kpi.color}`}>
                {loading || statsLoading ? (
                  <div className="space-y-2 animate-pulse w-full">
                    <div className="h-3.5 bg-foreground/10 rounded w-2/3" />
                    <div className="h-7 bg-foreground/15 rounded w-1/3 mt-2" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider opacity-85 leading-none">{kpi.label}</span>
                      <div className="p-1 rounded bg-background/50 border border-border/10">
                        {kpi.icon}
                      </div>
                    </div>
                    <p className="text-2xl font-extrabold mt-3.5 tracking-tight leading-none">{kpi.value}</p>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Secondary Operations Summary */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{language === "en" ? "Secondary Operations Summary" : "द्वितीयक संचालन सारांश"}</span>
              <hr className="grow border-border" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                {
                  label: language === "en" ? "Waiting Tasks" : "प्रतीक्षारत कार्य",
                  value: tasksWaitingCount,
                  icon: <Hourglass className="w-3.5 h-3.5 text-slate-500" />,
                  color: "bg-slate-500/5 border-slate-500/10 text-slate-750 dark:text-slate-400"
                },
                {
                  label: language === "en" ? "Incoming Handoffs" : "आने वाले हैंडऑफ़",
                  value: opStats.incomingHandoffs,
                  icon: <Inbox className="w-3.5 h-3.5 text-teal-500" />,
                  color: "bg-teal-500/5 border-teal-500/10 text-teal-750 dark:text-teal-400"
                },
                {
                  label: language === "en" ? "Rework Required" : "पुनर्कार्य आवश्यक",
                  value: opStats.reworkRequired,
                  icon: <RotateCcw className="w-3.5 h-3.5 text-rose-500" />,
                  color: "bg-rose-500/5 border-rose-500/10 text-rose-750 dark:text-rose-400"
                },
                {
                  label: language === "en" ? "SLA Breached" : "SLA उल्लंघन",
                  value: opStats.slaBreached,
                  icon: <ShieldAlert className="w-3.5 h-3.5 text-red-650" />,
                  color: "bg-red-600/5 border-red-600/10 text-red-800 dark:text-red-400"
                },
                {
                  label: language === "en" ? "Pending Sign-offs" : "लंबित साइन-ऑफ़",
                  value: opStats.pendingSignoffs,
                  icon: <FileCheck className="w-3.5 h-3.5 text-emerald-500" />,
                  color: "bg-emerald-500/5 border-emerald-500/10 text-emerald-750 dark:text-emerald-400"
                }
              ].map((kpi, idx) => (
                <div key={idx} className={`h-[80px] border rounded-xl p-3 shadow-sm flex flex-col justify-between transition-all duration-350 hover:shadow-md ${kpi.color}`}>
                  {loading || statsLoading ? (
                    <div className="space-y-2 animate-pulse w-full">
                      <div className="h-3 bg-foreground/10 rounded w-1/2" />
                      <div className="h-5 bg-foreground/15 rounded w-1/4 mt-1.5" />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80 leading-none">{kpi.label}</span>
                        <div className="p-0.5 rounded bg-background/30">
                          {kpi.icon}
                        </div>
                      </div>
                      <p className="text-xl font-bold mt-2 tracking-tight leading-none">{kpi.value}</p>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Issues Feed ────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {issues.length === 0 && (
          <EmptyState
            title={
              !isSuperAdmin
                ? (language === "en" ? `No Active ${userDeptMeta.labelEn} Cases` : `कोई सक्रिय ${userDeptMeta.labelHi} मामले नहीं`)
                : (language === "en" ? "No Issues Found" : "कोई समस्या नहीं मिली")
            }
            description={
              !isSuperAdmin
                ? (language === "en"
                    ? `There are currently no active civic cases involving the ${userDeptMeta.labelEn} department.`
                    : `वर्तमान में ${userDeptMeta.labelHi} विभाग से संबंधित कोई सक्रिय नागरिक मामले नहीं हैं।`)
                : (language === "en"
                    ? "No issues match the current department filter."
                    : "वर्तमान विभाग फ़िल्टर से कोई समस्या मेल नहीं खाती।")
            }
          />
        )}

        {issues.map((issue) => {
          const issueDeptKey = Object.entries(DEPARTMENT_META).find(([, meta]) =>
            [meta.labelEn.toLowerCase(), meta.labelHi].includes(issue.category?.toLowerCase())
          )?.[0] ?? "all";
          const issueDeptMeta = DEPARTMENT_META[issueDeptKey] ?? DEPARTMENT_META["all"];
          const isExpanded = !!expandedIssues[issue.id];

          // 1. Data Origin Badge styling
          let originLabel = language === "en" ? "Historical" : "ऐतिहासिक";
          let originStyle = "bg-muted text-muted-foreground border-muted-foreground/10";
          
          if (issue.dataOrigin === "seeded_demo") {
            originLabel = language === "en" ? "Demo Issue" : "डेमो मामला";
            originStyle = "bg-blue-500/10 text-blue-600 border-blue-500/20";
          } else if (issue.dataOrigin === "citizen_live") {
            originLabel = language === "en" ? "Live Citizen" : "लाइव नागरिक";
            originStyle = "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-semibold";
          } else if (issue.dataOrigin === "e2e_test") {
            originLabel = language === "en" ? "Test Fixture" : "परीक्षण फिक्सचर";
            originStyle = "bg-amber-500/10 text-amber-600 border-amber-500/20";
          } else if (issue.dataOrigin === "system_generated") {
            originLabel = language === "en" ? "System Gen" : "सिस्टम जनरेटेड";
            originStyle = "bg-indigo-500/10 text-indigo-600 border-indigo-500/20";
          }

          // 2. AI Status Badge styling
          let aiBadge = null;
          const hasPlan = (issue.tasks && issue.tasks.length > 0) || issue.aiStatus === "done";
          if (issue.aiStatus === "pending" || issue.aiStatus === "analyzing") {
            aiBadge = (
              <Badge variant="outline" className="animate-pulse bg-purple-500/5 text-purple-600 border-purple-500/20 flex items-center gap-1.5 h-5 text-[10px] px-1.5">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                <span>{language === "en" ? "Preparing plan" : "योजना तैयार की जा रही है"}</span>
              </Badge>
            );
          } else if (hasPlan) {
            aiBadge = (
              <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/25 flex items-center gap-1.5 h-5 text-[10px] px-1.5" title={language === "en" ? "Response plan ready" : "प्रतिक्रिया योजना तैयार"}>
                <Brain className="w-2.5 h-2.5 shrink-0" />
                <span>{language === "en" ? "Response plan ready" : "प्रतिक्रिया योजना तैयार"}</span>
              </Badge>
            );
          } else if (issue.aiStatus === "failed") {
            aiBadge = (
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 flex items-center gap-1.5 h-5 text-[10px] px-1.5">
                <Sparkles className="w-2.5 h-2.5 shrink-0 text-muted-foreground" />
                <span>{language === "en" ? "Plan failed" : "योजना विफल"}</span>
              </Badge>
            );
          }

          // 3. Dept Role Badge
          const myParticipation = issue.participations?.find(
            (p) => normalizeDepartmentKey(p.department) === normalizeDepartmentKey(userDepartment)
          );
          const roleLabel = myParticipation
            ? (myParticipation.participationRole === "LEAD"
                ? (language === "en" ? "Lead Dept" : "मुख्य विभाग")
                : (language === "en" ? "Supporting" : "सहायक विभाग"))
            : (normalizeDepartmentKey(issue.leadDepartment) === normalizeDepartmentKey(userDepartment)
                ? (language === "en" ? "Lead Dept" : "मुख्य विभाग")
                : null);

          // 4. SLA State Badge
          const hasBreachedTask = issue.tasks?.some(
            (t) => normalizeDepartmentKey(t.department) === normalizeDepartmentKey(userDepartment) && t.slaStatus === "BREACHED"
          );
          const hasAtRiskTask = issue.tasks?.some(
            (t) => normalizeDepartmentKey(t.department) === normalizeDepartmentKey(userDepartment) && t.slaStatus === "AT_RISK"
          );
          const slaLabel = hasBreachedTask
            ? (language === "en" ? "SLA Breached" : "SLA उल्लंघन")
            : hasAtRiskTask
            ? (language === "en" ? "SLA At Risk" : "SLA जोखिम में")
            : null;

          return (
            <div
              key={issue.id}
              className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4 shadow-sm hover:shadow-md hover:border-border/80 transition-all"
            >
              <div className="flex flex-col md:flex-row gap-4">
                {issue.imageUrls?.[0] && (
                  <img
                    src={issue.imageUrls[0]}
                    alt=""
                    className="w-full md:w-28 h-28 object-cover rounded-lg shrink-0"
                  />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <Badge variant="outline" className={`h-5 text-[10px] px-1.5 ${originStyle}`}>
                          {originLabel}
                        </Badge>
                        {aiBadge}
                        {issue.severity && (
                          <Badge variant="outline" className={`h-5 text-[10px] px-1.5 capitalize ${
                            issue.severity.toLowerCase() === "high" ? "bg-red-500/10 text-red-600 border-red-500/20" :
                            issue.severity.toLowerCase() === "medium" ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
                            "bg-slate-500/10 text-slate-650 border-slate-500/20"
                          }`}>
                            {issue.severity}
                          </Badge>
                        )}
                        {roleLabel && (
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20 h-5 text-[10px] px-1.5">
                            {roleLabel}
                          </Badge>
                        )}
                        {slaLabel && (
                          <Badge variant="outline" className={`h-5 text-[10px] px-1.5 font-bold ${
                            hasBreachedTask ? "bg-red-600/10 text-red-650 border-red-600/25" : "bg-yellow-500/10 text-yellow-600 border-yellow-500/25 animate-pulse"
                          }`}>
                            {slaLabel}
                          </Badge>
                        )}
                        {issue.coordinationType === "multi_department" && (
                          <Badge variant="outline" className="bg-rose-500/10 text-rose-600 border-rose-500/20 h-5 text-[10px] px-1.5">
                            {language === "en" ? "Multi-Dept Coordination" : "बहु-विभाग समन्वय"}
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-semibold text-base leading-tight truncate">{issue.title}</h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {/* Department chip */}
                        <span className={`flex items-center gap-1 text-xs font-medium ${issueDeptMeta.color}`}>
                          {issueDeptMeta.icon}
                          {issue.category}
                        </span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground truncate">{issue.location}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{new Date(issue.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      ▲ {issue.supportsCount} {language === "en" ? "supports" : "समर्थन"}
                    </Badge>
                  </div>

                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{issue.description}</p>

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Select value={issue.status} onValueChange={(v) => updateStatus(issue.id, v as IssueStatus)}>
                        <SelectTrigger id={`status-${issue.id}`} className="w-40 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusesList.map((s) => {
                            const label = STATUS_LABELS[s]?.[language] || s;
                            return (
                              <SelectItem key={s} value={s} className="text-xs capitalize">
                                {label}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>

                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => handleDelete(issue.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        {language === "en" ? "Delete" : "हटाएं"}
                      </Button>
                    </div>

                    <Button
                      variant={isExpanded ? "outline" : "default"}
                      size="sm"
                      className="h-8 text-xs font-semibold gap-1"
                      onClick={() => toggleIssueExpanded(issue.id)}
                    >
                      {isExpanded ? (
                        <>
                          {language === "en" ? "Close Details" : "विवरण बंद करें"}
                          <ChevronUp className="w-3.5 h-3.5" />
                        </>
                      ) : (
                        <>
                          {language === "en" ? "Open Case" : "मामला खोलें"}
                          <ChevronDown className="w-3.5 h-3.5" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {isExpanded && (() => {
                const hasTasks = Array.isArray(issue.tasks) && issue.tasks.length > 0;
                const nextStep = getRecommendedNextAction(issue, userDepartment || "", language);

                return (
                  <div className="mt-4 pt-4 border-t border-border space-y-4">
                    {/* Recommended Next Step Block */}
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-sm text-amber-700">
                          {language === "en" ? "Recommended Next Step" : "अनुशंसित अगला कदम"}: {nextStep.title}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          {nextStep.desc}
                        </p>
                      </div>
                    </div>

                    {hasTasks && (
                      <DepartmentEscalationBanner
                        caseId={issue.id}
                        department={userDepartment || ""}
                        tasks={issue.tasks || []}
                        onRefresh={loadIssues}
                      />
                    )}

                    <PanelErrorBoundary panelName="Coordination Blueprint">
                      <CoordinationSection
                        issue={issue}
                        isSuperAdmin={isSuperAdmin}
                        activeLanguage={language}
                        onRefresh={loadIssues}
                      />
                    </PanelErrorBoundary>

                    {hasTasks && (
                      <PanelErrorBoundary panelName="Execution Engine">
                        <ExecutionSection
                          issue={issue}
                          isSuperAdmin={isSuperAdmin}
                          userDepartment={userDepartment}
                          userId={user?.id || ""}
                          activeLanguage={language}
                          onRefresh={loadIssues}
                        />
                      </PanelErrorBoundary>
                    )}

                    {hasTasks && issue.coordinationType === "multi_department" && (
                      <PanelErrorBoundary panelName="Handoff Board">
                        <HandoffBoard
                          issue={issue}
                          isSuperAdmin={isSuperAdmin}
                          userDepartment={userDepartment}
                          userId={user?.id || ""}
                          activeLanguage={language}
                          onRefresh={loadIssues}
                        />
                      </PanelErrorBoundary>
                    )}

                    {["accepted", "plan_review", "assigned", "in_progress", "verification"].includes(issue.status) && (
                      <PanelErrorBoundary panelName="Change Requests">
                        <ChangeRequestPanel
                          issue={issue}
                          isSuperAdmin={isSuperAdmin}
                          userDepartment={userDepartment}
                          userId={user?.id || ""}
                          activeLanguage={language}
                          onRefresh={loadIssues}
                        />
                      </PanelErrorBoundary>
                    )}

                    {issue.coordinationType === "multi_department" && ["verification", "resolved", "closed"].includes(issue.status) && (
                      <PanelErrorBoundary panelName="Joint Closure">
                        <JointClosurePanel
                          caseId={issue.id}
                          caseNumber={issue.caseNumber || ""}
                          participations={issue.participations || []}
                          currentUserId={user?.id || ""}
                          currentUserDepartment={userDepartment || ""}
                          isAdmin={isAdmin}
                          isSuperAdmin={isSuperAdmin}
                          onCaseClosed={loadIssues}
                          onRefresh={loadIssues}
                        />
                      </PanelErrorBoundary>
                    )}

                    {isSuperAdmin && (
                      <CommandCenterDashboard
                        caseId={issue.id}
                        tasks={issue.tasks || []}
                        onRefresh={loadIssues}
                      />
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
        </>
      )}

      {activeTab === "analytics" && <CoordinationOutcomesDashboard />}
      {activeTab === "reopens" && <ReopenRequestPanel currentUserId={user?.id || ""} />}

      {/* Diagnostics Panel */}
      <div className="mt-8 p-4 bg-muted border rounded-xl text-xs font-mono max-w-full space-y-2 text-left">
        <h4 className="font-bold border-b pb-1">Development Diagnostics Panel:</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>authLoading: {String(authLoading)}</div>
          <div>user: {user ? `${user.email} (${user.id.slice(0, 8)}...)` : "null"}</div>
          <div>resolvedRole: {String(resolvedRole)}</div>
          <div>resolvedDept: {String(resolvedDepartment)}</div>
          <div>dashboardLoading: {String(loading)}</div>
          <div>dashboardError: {String(dashboardError)}</div>
          <div>isAdmin: {String(isAdmin)}</div>
          <div>isRealTimeConnected: {String(isRealTimeConnected)}</div>
          <div>unfilteredIssuesCount: {totalIssues?.length ?? 0}</div>
          <div>filteredIssuesCount: {issues?.length ?? 0}</div>
        </div>
        {totalIssues && totalIssues.length > 0 && (
          <div className="mt-2 pt-2 border-t text-[10px] space-y-0.5">
            <strong>First 3 Unfiltered Issues:</strong>
            {totalIssues.slice(0, 3).map(i => (
              <div key={i.id}>
                - [{i.caseNumber || "no-num"}] {i.title} | Cat: {i.category} | Lead: {i.leadDepartment} | Status: {i.status} | Tasks: {i.tasks?.length ?? 0}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
