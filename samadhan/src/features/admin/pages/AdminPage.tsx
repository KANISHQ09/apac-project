import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { useAuth } from "@/features/auth";
import { useAdminDashboard } from "../hooks/useAdminDashboard";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import {
  Shield, Trash2, Loader2, ShieldAlert, ShieldCheck,
  Droplets, Zap, Car, Trees, Building2, Recycle, LayoutDashboard
} from "lucide-react";
import { STATUSES, STATUS_LABELS } from "@/shared/constants/statuses";
import { ROUTES } from "@/shared/config/routes";
import { LoadingState } from "@/shared/components/LoadingState";
import { EmptyState } from "@/shared/components/EmptyState";
import { UserRole } from "@/shared/types/domain/UserRole";
import { IssueStatus } from "@/shared/types/domain/IssueStatus";

const statusesList = [STATUSES.REPORTED, STATUSES.IN_PROGRESS, STATUSES.RESOLVED, STATUSES.REJECTED];

// ── Department metadata ────────────────────────────────────────────────────
const DEPARTMENT_META: Record<string, {
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
  const { user, loading: authLoading } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();

  const {
    isAdmin,
    userRole,
    userDepartment,
    filterDepartment,
    setFilterDepartment,
    issues,
    totalIssues,
    loading,
    isRealTimeConnected,
    updateStatus,
    deleteIssue,
  } = useAdminDashboard(user, authLoading, language);

  const handleDelete = async (id: string) => {
    const confirmText = language === "en" ? "Delete this issue?" : "क्या आप इस समस्या को हटाना चाहते हैं?";
    if (!confirm(confirmText)) return;
    await deleteIssue(id);
  };

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading || authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingState message={language === "en" ? "Loading admin data..." : "प्रशासक डेटा लोड हो रहा है..."} />
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

  const dashboardTitle = isSuperAdmin
    ? (language === "en" ? "Super Admin Dashboard" : "सुपर एडमिन डैशबोर्ड")
    : `${language === "en" ? userDeptMeta.labelEn : userDeptMeta.labelHi} ${language === "en" ? "Department Dashboard" : "विभाग डैशबोर्ड"}`;

  const dashboardSubtitle = isSuperAdmin
    ? (language === "en" ? "Manage all civic issues across every department" : "सभी विभागों की नागरिक समस्याओं का प्रबंधन करें")
    : (language === "en"
        ? `Managing issues for the ${userDeptMeta.labelEn} department`
        : `${userDeptMeta.labelHi} विभाग की समस्याओं का प्रबंधन`);

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

      {/* ── Stats Grid ─────────────────────────────────────────────────── */}
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

      {/* ── Issues Feed ────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {issues.length === 0 && (
          <EmptyState
            title={language === "en" ? "No Issues Found" : "कोई समस्या नहीं मिली"}
            description={
              language === "en"
                ? "No issues match the current department filter."
                : "वर्तमान विभाग फ़िल्टर से कोई समस्या मेल नहीं खाती।"
            }
          />
        )}

        {issues.map((issue) => {
          const issueDeptKey = Object.entries(DEPARTMENT_META).find(([, meta]) =>
            [meta.labelEn.toLowerCase(), meta.labelHi].includes(issue.category?.toLowerCase())
          )?.[0] ?? "all";
          const issueDeptMeta = DEPARTMENT_META[issueDeptKey] ?? DEPARTMENT_META["all"];

          return (
            <div
              key={issue.id}
              className="bg-card border border-border rounded-xl p-5 flex flex-col md:flex-row gap-4 shadow-sm hover:shadow-md hover:border-border/80 transition-all"
            >
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
