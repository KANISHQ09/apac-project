import React, { useState, useEffect, useCallback } from "react";
import { closureService } from "@/features/coordination";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { Badge } from "@/shared/components/ui/badge";
import {
  CheckCircle,
  XCircle,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  FileCheck,
  Building2,
  Lock,
} from "lucide-react";
import type {
  ClosureEligibilityResult,
  CaseResolutionSignoff,
  CaseParticipation,
} from "@/shared/types/domain/Issue";

interface JointClosurePanelProps {
  caseId: string;
  caseNumber: string;
  participations: CaseParticipation[];
  currentUserDepartment?: string;
  currentUserId?: string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  onCaseClosed: () => void;
  onRefresh: () => void;
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

export const JointClosurePanel: React.FC<JointClosurePanelProps> = ({
  caseId,
  caseNumber,
  participations,
  currentUserDepartment,
  currentUserId,
  isAdmin = false,
  isSuperAdmin = false,
  onCaseClosed,
  onRefresh,
}) => {
  const { toast } = useToast();
  const [eligibility, setEligibility] = useState<ClosureEligibilityResult | null>(null);
  const [signoffs, setSignoffs] = useState<CaseResolutionSignoff[]>([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [signingOff, setSigningOff] = useState(false);

  // Sign-off form
  const [showSignoffForm, setShowSignoffForm] = useState(false);
  const [statement, setStatement] = useState("");
  const [evidenceSummary, setEvidenceSummary] = useState("");

  // Revoke form
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eligRes, sigRes] = await Promise.all([
        closureService.evaluateClosureEligibility(caseId),
        closureService.getCaseSignoffs(caseId),
      ]);
      setEligibility(eligRes);
      setSignoffs(sigRes.filter((s) => s.status === "SIGNED"));
    } catch (err: any) {
      toast({ title: "Failed to load closure status", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [caseId, toast]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`closure-panel-${caseId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "case_resolution_signoffs", filter: `case_id=eq.${caseId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "department_tasks", filter: `case_id=eq.${caseId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_handoffs", filter: `case_id=eq.${caseId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [caseId, load]);

  const myParticipation = participations.find(
    (p) => p.department === currentUserDepartment && p.status === "ACTIVE"
  );
  const mySignoff = signoffs.find((s) => s.department === currentUserDepartment);
  const canSignoff = (isAdmin || isSuperAdmin) && myParticipation && !mySignoff;

  const handleSignoff = async () => {
    if (!currentUserId || !myParticipation) return;
    if (!statement.trim()) {
      toast({ title: "Statement required", description: "Please provide a closure statement.", variant: "destructive" });
      return;
    }
    setSigningOff(true);
    try {
      await closureService.submitResolutionSignoff(
        caseId,
        myParticipation.id,
        statement,
        evidenceSummary,
        currentUserId
      );
      toast({ title: "Sign-off submitted", description: `${deptLabel(currentUserDepartment!)} has signed off.` });
      setShowSignoffForm(false);
      setStatement("");
      setEvidenceSummary("");
      load();
      onRefresh();
    } catch (err: any) {
      toast({ title: "Sign-off failed", description: err.message, variant: "destructive" });
    } finally {
      setSigningOff(false);
    }
  };

  const handleRevoke = async (signoffId: string) => {
    if (!currentUserId || !revokeReason.trim()) {
      toast({ title: "Reason required", variant: "destructive" });
      return;
    }
    try {
      await closureService.revokeResolutionSignoff(signoffId, revokeReason, currentUserId);
      toast({ title: "Sign-off revoked" });
      setRevokeId(null);
      setRevokeReason("");
      load();
      onRefresh();
    } catch (err: any) {
      toast({ title: "Revoke failed", description: err.message, variant: "destructive" });
    }
  };

  const handleClose = async () => {
    if (!currentUserId) return;
    setClosing(true);
    try {
      await closureService.closeCoordinatedCase(caseId, currentUserId);
      toast({ title: "Case closed", description: `${caseNumber} has been jointly closed.` });
      onCaseClosed();
    } catch (err: any) {
      // Show exact DB error so user knows WHAT is missing
      toast({
        title: "Closure denied",
        description: err.message?.replace("PREMATURE_CLOSURE_DENIED: ", "").replace("CLOSURE_DENIED: ", "") ?? "Requirements not met",
        variant: "destructive",
      });
    } finally {
      setClosing(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="flex items-center gap-3 py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-muted-foreground">Evaluating closure requirements...</span>
        </CardContent>
      </Card>
    );
  }

  if (!eligibility) return null;

  const totalReq = eligibility.missingRequirements.length + eligibility.completedRequirements.length;
  const completedCount = eligibility.completedRequirements.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className={`border-2 ${eligibility.eligible ? "border-green-500/50 bg-green-500/5" : "border-amber-500/50 bg-amber-500/5"}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {eligibility.eligible ? (
                <CheckCircle className="w-6 h-6 text-green-500" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-amber-500" />
              )}
              <div>
                <CardTitle className="text-base">Joint Closure Status — {caseNumber}</CardTitle>
                <CardDescription>
                  {completedCount} / {totalReq} requirements met · Policy: {eligibility.policyUsed}
                </CardDescription>
              </div>
            </div>
            <Badge
              variant={eligibility.eligible ? "default" : "secondary"}
              className={eligibility.eligible ? "bg-green-500/20 text-green-400 border-green-500/30" : ""}
            >
              {eligibility.eligible ? "READY TO CLOSE" : "NOT ELIGIBLE"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-2">
          {/* Progress bar */}
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${eligibility.eligible ? "bg-green-500" : "bg-amber-500"}`}
              style={{ width: `${totalReq > 0 ? (completedCount / totalReq) * 100 : 0}%` }}
            />
          </div>

          {/* Requirements list */}
          <div className="grid gap-1.5 pt-1">
            {eligibility.completedRequirements.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-green-400">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>{r.message}</span>
              </div>
            ))}
            {eligibility.missingRequirements.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-amber-400">
                <XCircle className="w-4 h-4 flex-shrink-0" />
                <span>{r.message}</span>
              </div>
            ))}
          </div>

          {/* Active blockers */}
          {eligibility.activeBlockers.length > 0 && (
            <div className="mt-2 p-2 rounded-md bg-red-500/10 border border-red-500/20">
              <p className="text-xs font-medium text-red-400 mb-1">Active Blockers ({eligibility.activeBlockers.length})</p>
              {eligibility.activeBlockers.map((b, i) => (
                <p key={i} className="text-xs text-muted-foreground">{b.blocker_type}: {b.reason}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Department Sign-offs */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileCheck className="w-4 h-4" />
            Department Sign-offs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {participations
            .filter((p) => p.status === "ACTIVE" && p.participationRole !== "OBSERVER")
            .map((p) => {
              const signed = signoffs.find((s) => s.department === p.department);
              const isMyDept = p.department === currentUserDepartment;
              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    signed ? "border-green-500/30 bg-green-500/5" : "border-border/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{deptLabel(p.department)}</p>
                      <p className="text-xs text-muted-foreground">{p.participationRole}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {signed ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span className="text-xs text-green-400">Signed</span>
                        {isMyDept && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-6 px-2 text-red-400 hover:text-red-300"
                            onClick={() => setRevokeId(signed.id)}
                          >
                            Revoke
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Pending</span>
                        {isMyDept && canSignoff && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => setShowSignoffForm(true)}
                          >
                            Sign Off
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
        </CardContent>
      </Card>

      {/* Sign-off Form */}
      {showSignoffForm && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Submit Sign-off — {deptLabel(currentUserDepartment ?? "")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Closure Statement *</label>
              <Textarea
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                placeholder="Describe what your department completed and the current status of the issue..."
                className="resize-none"
                rows={3}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Evidence Summary</label>
              <Textarea
                value={evidenceSummary}
                onChange={(e) => setEvidenceSummary(e.target.value)}
                placeholder="Reference photo IDs, inspection records, or field notes..."
                className="resize-none"
                rows={2}
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSignoff}
                disabled={signingOff}
              >
                {signingOff ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <ShieldCheck className="w-3 h-3 mr-2" />}
                Confirm Sign-off
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowSignoffForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Revoke Form */}
      {revokeId && (
        <Card className="border-red-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-red-400">Revoke Sign-off</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="Reason for revoking sign-off..."
              className="resize-none"
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleRevoke(revokeId)}
              >
                Confirm Revoke
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setRevokeId(null); setRevokeReason(""); }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Closure Action */}
      {(isAdmin || isSuperAdmin) && (
        <Card className="border-border/50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Joint Case Closure</p>
                <p className="text-xs text-muted-foreground">
                  {eligibility.eligible
                    ? "All requirements met. Case is ready for authoritative closure."
                    : "Resolve all missing requirements before closing."}
                </p>
              </div>
              <Button
                onClick={handleClose}
                disabled={!eligibility.eligible || closing}
                className={eligibility.eligible ? "bg-green-600 hover:bg-green-700" : ""}
              >
                {closing ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : eligibility.eligible ? (
                  <ShieldCheck className="w-4 h-4 mr-2" />
                ) : (
                  <Lock className="w-4 h-4 mr-2" />
                )}
                {eligibility.eligible ? "Close Case Jointly" : "Closure Locked"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
