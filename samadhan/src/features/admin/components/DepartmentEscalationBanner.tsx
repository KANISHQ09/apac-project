import React, { useState, useEffect } from "react";
import { slaService } from "@/features/coordination";
import { Escalation, DepartmentTask } from "@/shared/types/domain/Issue";
import { Alert, AlertTitle, AlertDescription } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/components/ui/dialog";
import { Textarea } from "@/shared/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { useToast } from "@/shared/hooks/use-toast";
import { AlertTriangle, UserCheck, Ban, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DepartmentEscalationBannerProps {
  caseId?: string;
  department: string;
  tasks: DepartmentTask[];
  onRefresh: () => void;
}

export const DepartmentEscalationBanner: React.FC<DepartmentEscalationBannerProps> = ({
  caseId,
  department,
  tasks,
  onRefresh,
}) => {
  const [departmentEscalations, setDepartmentEscalations] = useState<Escalation[]>([]);
  const [selectedTask, setSelectedTask] = useState<string>("");
  const [blockerType, setBlockerType] = useState<string>("RESOURCE");
  const [reason, setReason] = useState<string>("");
  const [justification, setJustification] = useState<string>("");
  const [extensionMinutes, setExtensionMinutes] = useState<number>(120);

  const [declaringBlocker, setDeclaringBlocker] = useState<boolean>(false);
  const [requestingExtension, setRequestingExtension] = useState<boolean>(false);
  const { toast } = useToast();

  const fetchEscalations = async () => {
    const list = await slaService.getEscalations(caseId);
    // Filter by department
    const deptList = list.filter(
      (esc) =>
        esc.rootCauseDepartment === department &&
        esc.status !== "RESOLVED" &&
        esc.status !== "CANCELLED"
    );
    setDepartmentEscalations(deptList);
  };

  useEffect(() => {
    fetchEscalations();

    const channel = supabase
      .channel("dept-realtime-escalations")
      .on(
        "postgres_changes",
        { event: "*", scheme: "public", table: "escalations" },
        () => {
          fetchEscalations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [caseId, department]);

  const handleAcknowledge = async (escId: string) => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;

    const { error } = await supabase
      .from("escalations")
      .update({
        status: "ACKNOWLEDGED",
        acknowledged_by: userId,
        acknowledged_at: new Date().toISOString(),
      })
      .eq("id", escId);

    if (error) {
      toast({
        variant: "destructive",
        title: "Acknowledge Failed",
        description: error.message,
      });
    } else {
      toast({
        title: "Escalation Acknowledged",
        description: "Status set to ACKNOWLEDGED. Incident management has been notified.",
      });
      fetchEscalations();
      onRefresh();
    }
  };

  const handleDeclareBlocker = async () => {
    if (!selectedTask || !reason.trim()) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please specify target task and blocker justification.",
      });
      return;
    }

    setDeclaringBlocker(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id || "00000000-0000-0000-0000-000000000000";

      const res = await slaService.declareTaskBlocker({
        caseId: caseId || "",
        taskId: selectedTask,
        blockerType,
        reason,
        declaredBy: userId,
      });

      if (res) {
        toast({
          title: "Blocker Filed",
          description: "Formal bottleneck logged to timeline.",
        });
        setReason("");
        fetchEscalations();
        onRefresh();
      }
    } finally {
      setDeclaringBlocker(false);
    }
  };

  const handleRequestExtension = async (esc: Escalation) => {
    if (!justification.trim() || !esc.slaInstanceId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please explain justification before requesting SLA extension.",
      });
      return;
    }

    setRequestingExtension(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id || "00000000-0000-0000-0000-000000000000";

      const res = await slaService.submitSLAExceptionRequest({
        slaInstanceId: esc.slaInstanceId,
        justification,
        extensionMinutes,
        requestedBy: userId,
      });

      if (res) {
        toast({
          title: "Extension Filed",
          description: "Requested extension sent to Coordinator for approval.",
        });
        setJustification("");
        fetchEscalations();
      }
    } finally {
      setRequestingExtension(false);
    }
  };

  if (departmentEscalations.length === 0) return null;

  return (
    <div className="space-y-4 mb-6">
      {departmentEscalations.map((esc) => (
        <Alert key={esc.id} variant="destructive" className="border-red-500 bg-red-500/5 backdrop-blur-md p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <div className="flex-1 space-y-2">
              <AlertTitle className="text-sm font-bold text-red-400 flex items-center gap-2">
                URGENT DEPARTMENTAL ESCALATION (LEVEL {esc.currentLevel})
              </AlertTitle>
              <AlertDescription className="text-xs text-slate-300">
                {esc.reasonDetail} Status: <span className="font-mono text-red-400 font-bold">{esc.status}</span>.
              </AlertDescription>

              <div className="flex flex-wrap items-center gap-2 mt-2">
                {esc.status === "OPEN" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-500/30 hover:bg-red-500/10 text-xs text-red-400"
                    onClick={() => handleAcknowledge(esc.id)}
                  >
                    <UserCheck className="h-3.5 w-3.5 mr-1" />
                    Acknowledge
                  </Button>
                )}

                {/* Blocker Declaration Dialog */}
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="border-amber-500/30 hover:bg-amber-500/10 text-xs text-amber-400">
                      <Ban className="h-3.5 w-3.5 mr-1" />
                      Declare Blocker
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-slate-900 border-slate-800 max-w-sm">
                    <DialogHeader>
                      <DialogTitle className="text-sm font-semibold">Declare Task Blocker</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">Select Task</label>
                        <Select value={selectedTask} onValueChange={(val) => setSelectedTask(val)}>
                          <SelectTrigger className="bg-slate-950 border-slate-800 text-xs">
                            <SelectValue placeholder="Select task" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-950 border-slate-800">
                            {tasks
                              .filter((t) => t.department === department)
                              .map((t) => (
                                <SelectItem key={t.id} value={t.id} className="text-xs">
                                  {t.title}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">Blocker Type</label>
                        <Select value={blockerType} onValueChange={(val) => setBlockerType(val)}>
                          <SelectTrigger className="bg-slate-950 border-slate-800 text-xs">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-950 border-slate-800">
                            <SelectItem value="RESOURCE" className="text-xs">Resource shortage (Materials/Crew)</SelectItem>
                            <SelectItem value="APPROVAL" className="text-xs">Pending administrative approval</SelectItem>
                            <SelectItem value="FIELD_CONDITION" className="text-xs">Unfavorable site/weather conditions</SelectItem>
                            <SelectItem value="EXTERNAL_AGENCY" className="text-xs">Blocked by external utility board</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">Justification / Details</label>
                        <Textarea
                          placeholder="Provide details on the exact bottleneck..."
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          className="bg-slate-950 border-slate-800 text-xs min-h-[60px]"
                        />
                      </div>

                      <Button
                        size="sm"
                        disabled={declaringBlocker}
                        onClick={handleDeclareBlocker}
                        className="w-full bg-amber-600 hover:bg-amber-700 text-white text-xs"
                      >
                        {declaringBlocker ? "Submitting..." : "Submit Blocker"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* SLA Exception Request Dialog */}
                {esc.slaInstanceId && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="border-blue-500/30 hover:bg-blue-500/10 text-xs text-blue-400">
                        <Clock className="h-3.5 w-3.5 mr-1" />
                        Request SLA Extension
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-slate-900 border-slate-800 max-w-sm">
                      <DialogHeader>
                        <DialogTitle className="text-sm font-semibold">Request SLA Exception Extension</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                          <label className="text-xs text-muted-foreground">Extension (Minutes)</label>
                          <Select
                            value={extensionMinutes.toString()}
                            onValueChange={(val) => setExtensionMinutes(parseInt(val))}
                          >
                            <SelectTrigger className="bg-slate-950 border-slate-800 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-950 border-slate-800">
                              <SelectItem value="60" className="text-xs">1 Hour</SelectItem>
                              <SelectItem value="120" className="text-xs">2 Hours</SelectItem>
                              <SelectItem value="360" className="text-xs">6 Hours</SelectItem>
                              <SelectItem value="720" className="text-xs">12 Hours</SelectItem>
                              <SelectItem value="1440" className="text-xs">24 Hours</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs text-muted-foreground">Official Justification</label>
                          <Textarea
                            placeholder="State the justification for extending the resolution timeline..."
                            value={justification}
                            onChange={(e) => setJustification(e.target.value)}
                            className="bg-slate-950 border-slate-800 text-xs min-h-[60px]"
                          />
                        </div>

                        <Button
                          size="sm"
                          disabled={requestingExtension}
                          onClick={() => handleRequestExtension(esc)}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs"
                        >
                          {requestingExtension ? "Filing request..." : "File SLA Request"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>
          </div>
        </Alert>
      ))}
    </div>
  );
};
