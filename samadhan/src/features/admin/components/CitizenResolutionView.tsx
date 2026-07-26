import React, { useState, useEffect, useCallback } from "react";
import { closureService } from "@/features/coordination";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Loader2, CheckCircle2, Building2, FileText, Clock } from "lucide-react";
import type { CaseResolutionPackage } from "@/shared/types/domain/Issue";

interface CitizenResolutionViewProps {
  caseId: string;
  caseNumber: string;
  onReopenRequest: () => void;
}

const DEPT_LABELS: Record<string, string> = {
  water_supply: "Water Supply",
  sanitation: "Sanitation",
  electricity: "Electricity",
  roads: "Roads",
  parks: "Parks & Gardens",
  buildings: "Buildings",
};

function deptLabel(d: string) {
  return DEPT_LABELS[d] ?? d.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const CitizenResolutionView: React.FC<CitizenResolutionViewProps> = ({
  caseId,
  caseNumber,
  onReopenRequest,
}) => {
  const { toast } = useToast();
  const [pkg, setPkg] = useState<CaseResolutionPackage | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await closureService.getResolutionPackage(caseId);
      setPkg(data);
    } catch (err: any) {
      toast({ title: "Failed to load resolution details", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [caseId, toast]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`citizen-resolution-${caseId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "case_resolution_packages", filter: `case_id=eq.${caseId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [caseId, load]);

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="flex items-center gap-3 py-6">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Loading resolution details...</span>
        </CardContent>
      </Card>
    );
  }

  if (!pkg) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-6 text-center">
          <p className="text-sm text-muted-foreground">Resolution details not yet available.</p>
        </CardContent>
      </Card>
    );
  }

  const departments = (pkg.departmentsInvolved || []) as Array<{ department: string; participation_role: string }>;
  const tasks = (pkg.completedTasksSnapshot || []) as Array<{ department: string; title: string; task_status: string }>;
  const signoffs = (pkg.signoffSnapshot || []) as Array<{ department: string; signoff_role: string; statement: string }>;

  return (
    <div className="space-y-4">
      {/* Resolution Banner */}
      <Card className="border-2 border-green-500/40 bg-green-500/5">
        <CardContent className="pt-5">
          <div className="flex items-start gap-4">
            <CheckCircle2 className="w-8 h-8 text-green-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-base">Your issue has been resolved</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Case <span className="font-medium text-foreground">{caseNumber}</span> was resolved through
                coordinated action by{" "}
                <span className="font-medium text-green-400">{departments.length} department{departments.length !== 1 ? "s" : ""}</span>.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Closed on {pkg.closedAt ? new Date(pkg.closedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      {pkg.citizenSafeSummary && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Resolution Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">{pkg.citizenSafeSummary}</p>
          </CardContent>
        </Card>
      )}

      {/* What Each Department Did */}
      {departments.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Departments Involved
            </CardTitle>
            <CardDescription>What each department contributed to your resolution</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {departments.map((dept, i) => {
              const deptTasks = tasks.filter((t) => t.department === dept.department && t.task_status === "COMPLETED");
              const deptSignoff = signoffs.find((s) => s.department === dept.department);
              return (
                <div key={i} className="border border-border/30 rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{deptLabel(dept.department)}</p>
                    <Badge variant="outline" className="text-xs">
                      {dept.participation_role}
                    </Badge>
                  </div>
                  {deptTasks.length > 0 && (
                    <ul className="space-y-0.5">
                      {deptTasks.map((t, j) => (
                        <li key={j} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" />
                          {t.title}
                        </li>
                      ))}
                    </ul>
                  )}
                  {deptSignoff && (
                    <p className="text-xs text-muted-foreground/70 italic border-t border-border/20 pt-1.5 mt-1.5">
                      "{deptSignoff.statement}"
                    </p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Case Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Resolved: {pkg.closedAt ? new Date(pkg.closedAt).toLocaleString("en-IN") : "—"}</span>
            <span>·</span>
            <span>Package v{pkg.closureCycle}</span>
          </div>
        </CardContent>
      </Card>

      {/* Citizen Actions */}
      <Card className="border-border/50">
        <CardContent className="pt-4">
          <p className="text-sm font-medium mb-3">Is your issue actually resolved?</p>
          <div className="flex gap-3">
            <button
              onClick={onReopenRequest}
              className="flex-1 py-2.5 px-3 rounded-lg border border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10 transition-colors text-sm text-amber-400 font-medium"
            >
              Still Not Fixed
            </button>
            <div className="flex-1 py-2.5 px-3 rounded-lg border border-green-500/40 bg-green-500/5 text-sm text-green-400 font-medium text-center">
              ✓ Confirmed Resolved
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Choosing "Still Not Fixed" creates a reviewed reopen request. It will not automatically re-open the case.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
