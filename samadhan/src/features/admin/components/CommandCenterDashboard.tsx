import React, { useState, useEffect } from "react";
import { slaService } from "@/features/coordination";
import { Escalation, CommissionerIntervention, DepartmentTask } from "@/shared/types/domain/Issue";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { useToast } from "@/shared/hooks/use-toast";
import { AlertCircle, ShieldAlert, Zap, Clock, ArrowRight, CornerDownRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface CommandCenterDashboardProps {
  caseId?: string;
  tasks: DepartmentTask[];
  onRefresh: () => void;
}

export const CommandCenterDashboard: React.FC<CommandCenterDashboardProps> = ({
  caseId,
  tasks,
  onRefresh,
}) => {
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [selectedEscalation, setSelectedEscalation] = useState<Escalation | null>(null);
  const [downstreamImpact, setDownstreamImpact] = useState<any[]>([]);
  const [demoOffset, setDemoOffset] = useState<number>(0);
  const { toast } = useToast();

  // Intervention Form State
  const [interventionType, setInterventionType] = useState<string>("PRIORITY_OVERRIDE");
  const [targetTaskId, setTargetTaskId] = useState<string>("");
  const [targetDept, setTargetDept] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [instruction, setInstruction] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  const fetchEscalations = async () => {
    const data = await slaService.getEscalations(caseId);
    setEscalations(data);
  };

  useEffect(() => {
    fetchEscalations();

    // Subscribe to realtime escalations
    const channel = supabase
      .channel("realtime-escalations")
      .on(
        "postgres_changes",
        { event: "*", scheme: "public", table: "escalations" },
        () => {
          fetchEscalations();
          onRefresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [caseId]);

  const handleDemoAccelerate = async (hours: number) => {
    const newOffset = demoOffset + hours * 60;
    setDemoOffset(newOffset);
    toast({
      title: `Demo Clock Advanced`,
      description: `Fast-forwarded by ${hours} hours. Click Evaluate to process breaches.`,
    });
  };

  const handleEvaluate = async () => {
    const success = await slaService.triggerEvaluator(demoOffset);
    if (success) {
      toast({
        title: "SLA Evaluation Complete",
        description: "Assessed inactivity thresholds and updated escalations.",
      });
      fetchEscalations();
      onRefresh();
    } else {
      toast({
        variant: "destructive",
        title: "Evaluation Failed",
        description: "Could not execute SLA checking.",
      });
    }
  };

  const handleSelectEscalation = async (esc: Escalation) => {
    setSelectedEscalation(esc);
    if (esc.sourceEntityType === "TASK") {
      const impact = await slaService.getDownstreamImpact(esc.sourceEntityId);
      setDownstreamImpact(impact);
    } else {
      setDownstreamImpact([]);
    }
  };

  const handleApplyIntervention = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || !instruction.trim()) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please fill in official justification and instructions.",
      });
      return;
    }

    setSubmitting(true);
    try {
      // Get current user auth
      const { data: userData } = await supabase.auth.getUser();
      const actorId = userData?.user?.id || "00000000-0000-0000-0000-000000000000";

      const res = await slaService.applyIntervention({
        caseId: selectedEscalation?.caseId || caseId || "",
        escalationId: selectedEscalation?.id,
        type: interventionType,
        targetTaskId: targetTaskId || null,
        targetDepartment: targetDept || null,
        reason,
        instruction,
        actorId,
      });

      if (res) {
        toast({
          title: "Intervention Persisted",
          description: "Commissioner directive applied successfully.",
        });
        setReason("");
        setInstruction("");
        setSelectedEscalation(null);
        fetchEscalations();
        onRefresh();
      } else {
        toast({
          variant: "destructive",
          title: "Override Failed",
          description: "Ensure you have super_admin role permissions.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Time Accelerator Section */}
      <Card className="border-amber-500/30 bg-amber-500/5 backdrop-blur-md">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-amber-500 flex items-center gap-2 text-lg">
                <Zap className="h-5 w-5 animate-pulse" />
                SIH DEMO ACCELERATION PANEL
              </CardTitle>
              <CardDescription className="text-muted-foreground text-xs mt-1">
                Simulate elapsed wall-clock hours to evaluate escalations without waiting.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-amber-500/10 text-amber-500 px-3 py-1.5 rounded-md font-mono border border-amber-500/20">
                Effective Offset: +{Math.round(demoOffset / 60)} hrs
              </span>
              <Button
                variant="outline"
                size="sm"
                className="border-amber-500/20 text-amber-500 hover:bg-amber-500/10 text-xs"
                onClick={() => setDemoOffset(0)}
              >
                Reset Clock
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDemoAccelerate(2)}
            className="text-xs border-amber-500/20 text-amber-500 hover:bg-amber-500/10"
          >
            +2 Hours
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDemoAccelerate(6)}
            className="text-xs border-amber-500/20 text-amber-500 hover:bg-amber-500/10"
          >
            +6 Hours
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDemoAccelerate(24)}
            className="text-xs border-amber-500/20 text-amber-500 hover:bg-amber-500/10"
          >
            +24 Hours
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDemoAccelerate(48)}
            className="text-xs border-amber-500/20 text-amber-500 hover:bg-amber-500/10"
          >
            +48 Hours
          </Button>
          <Button
            onClick={handleEvaluate}
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs ml-auto shadow-md"
          >
            Trigger SLA Assessment Engine
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Escalations List */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="bg-slate-900/40 border-slate-800">
            <CardHeader className="pb-3 border-b border-slate-800">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-500" />
                Active Municipal Escalation Feed ({escalations.filter(e => e.status !== 'RESOLVED').length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {escalations.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No active SLA escalations or coordination deadlocks detected.
                </div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {escalations.map((esc) => {
                    const isActive = esc.status !== "RESOLVED";
                    return (
                      <div
                        key={esc.id}
                        className={`p-4 transition-colors cursor-pointer hover:bg-slate-800/30 flex items-start justify-between gap-4 ${
                          selectedEscalation?.id === esc.id ? "bg-slate-800/40" : ""
                        }`}
                        onClick={() => handleSelectEscalation(esc)}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                              Level {esc.currentLevel} -{" "}
                              {esc.currentLevel === 1
                                ? "Nodal Officer"
                                : esc.currentLevel === 2
                                ? "Dept Head"
                                : esc.currentLevel === 3
                                ? "Deputy Commissioner"
                                : "Commissioner"}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {esc.escalationType}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-slate-200">
                            {esc.reasonDetail}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            <span className="flex items-center gap-1 font-semibold text-slate-300">
                              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                              Dept: {esc.rootCauseDepartment?.toUpperCase()}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Escalated: {esc.firstEscalatedAt.toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="text-xs text-blue-400 hover:text-blue-300">
                          Analyze
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Downstream Impact & Intervention Controller */}
        <div>
          {selectedEscalation ? (
            <div className="space-y-6">
              {/* Impact Card */}
              <Card className="bg-slate-900/40 border-slate-800">
                <CardHeader className="pb-3 border-b border-slate-800">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-400">
                    <AlertCircle className="h-4 w-4" />
                    Blocked Downstream Impact
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  {downstreamImpact.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No direct downstream tasks blocked by this node.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-300 font-medium">
                        Delaying this task blocks the following execution path:
                      </p>
                      {downstreamImpact.map((item, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs">
                          <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold text-slate-300">
                              [{item.department.toUpperCase()}]
                            </span>{" "}
                            <span className="text-slate-400">{item.title}</span>{" "}
                            <span className="text-[10px] px-1.5 py-0.2 bg-slate-800 text-slate-400 rounded">
                              {item.task_status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Intervention Action Form */}
              <Card className="bg-slate-900/40 border-slate-800">
                <CardHeader className="pb-3 border-b border-slate-800">
                  <CardTitle className="text-sm font-semibold">
                    Commissioner Directives (Intervention)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <form onSubmit={handleApplyIntervention} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Intervention Type</label>
                      <Select
                        value={interventionType}
                        onValueChange={(val) => setInterventionType(val)}
                      >
                        <SelectTrigger className="bg-slate-950 border-slate-800 text-xs">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-950 border-slate-800">
                          <SelectItem value="PRIORITY_OVERRIDE" className="text-xs">Raise case priority to CRITICAL</SelectItem>
                          <SelectItem value="REASSIGN_TASK" className="text-xs">Reassign Task Department</SelectItem>
                          <SelectItem value="ADD_SUPPORT_DEPARTMENT" className="text-xs">Add Support Department</SelectItem>
                          <SelectItem value="EMERGENCY_SEQUENCE_OVERRIDE" className="text-xs">Emergency Override Sequence (Force READY)</SelectItem>
                          <SelectItem value="CANCEL_INVALID_ESCALATION" className="text-xs">Cancel/Dismiss Escalation Alert</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {(interventionType === "REASSIGN_TASK" || interventionType === "EMERGENCY_SEQUENCE_OVERRIDE") && (
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">Target Task</label>
                        <Select value={targetTaskId} onValueChange={(val) => setTargetTaskId(val)}>
                          <SelectTrigger className="bg-slate-950 border-slate-800 text-xs">
                            <SelectValue placeholder="Select target task" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-950 border-slate-800">
                            {tasks.map((t) => (
                              <SelectItem key={t.id} value={t.id} className="text-xs">
                                [{t.department.toUpperCase()}] {t.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {(interventionType === "REASSIGN_TASK" || interventionType === "ADD_SUPPORT_DEPARTMENT") && (
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">Target Department</label>
                        <Select value={targetDept} onValueChange={(val) => setTargetDept(val)}>
                          <SelectTrigger className="bg-slate-950 border-slate-800 text-xs">
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-950 border-slate-800">
                            <SelectItem value="water_supply" className="text-xs">Water Supply</SelectItem>
                            <SelectItem value="roads" className="text-xs">Roads & Buildings</SelectItem>
                            <SelectItem value="sanitation" className="text-xs">Sanitation</SelectItem>
                            <SelectItem value="electricity" className="text-xs">Electricity Board</SelectItem>
                            <SelectItem value="traffic" className="text-xs">Traffic Police</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-medium text-slate-300">Justification / Reason</label>
                      <Textarea
                        placeholder="State the findings that necessitate this commissioner intervention..."
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="bg-slate-950 border-slate-800 text-xs min-h-[60px]"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-medium text-slate-300">Official Directives / Instructions</label>
                      <Textarea
                        placeholder="Enter the executive instructions sent to the department nodal officers..."
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        className="bg-slate-950 border-slate-800 text-xs min-h-[60px]"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={submitting}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 shadow-lg"
                    >
                      {submitting ? "Applying override..." : "Issue Executive Override"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="bg-slate-900/40 border-slate-800">
              <CardContent className="p-6 text-center text-xs text-muted-foreground">
                Select an active escalation alert card to inspect blocked paths and issue overrides.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
