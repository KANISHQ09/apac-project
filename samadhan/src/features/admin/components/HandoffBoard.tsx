import React, { useState, useEffect } from "react";
import { 
  Inbox, Outbox, AlertCircle, FileText, CheckCircle2, XCircle, 
  MapPin, Clock, Send, Eye, ShieldAlert, Plus, HelpCircle
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Issue, TaskHandoff, HandoffEvidence, DepartmentTask } from "@/shared/types/domain/Issue";
import { handoffService, executionService } from "@/features/coordination";
import { DEPARTMENT_META } from "../pages/AdminPage";
import { normalizeDepartmentKey } from "@/features/admin/hooks/useAdminDashboard";

export function HandoffBoard({
  issue,
  isSuperAdmin,
  userDepartment,
  userId,
  activeLanguage,
  onRefresh,
}: {
  issue: Issue;
  isSuperAdmin: boolean;
  userDepartment: string | null;
  userId: string;
  activeLanguage: "en" | "hi";
  onRefresh: () => void;
}) {
  const [handoffs, setHandoffs] = useState<TaskHandoff[]>([]);
  const [dependencies, setDependencies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"inbox" | "outbox">("inbox");

  // Handoff submission state
  const [sourceTaskId, setSourceTaskId] = useState("");
  const [targetTaskId, setTargetTaskId] = useState("");
  const [note, setNote] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [evidenceType, setEvidenceType] = useState<string>("PHOTO");

  // Review states
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const [rejectionReason, setRejectionReason] = useState<Record<string, string>>({});
  const [showRejectInput, setShowRejectInput] = useState<Record<string, boolean>>({});

  const tasks = issue.tasks || [];

  const loadHandoffs = async () => {
    try {
      setLoading(true);
      const [list, depList] = await Promise.all([
        handoffService.getCaseHandoffs(issue.id),
        executionService.getCaseDependencies(issue.id)
      ]);
      setHandoffs(list);
      setDependencies(depList);
    } catch (err) {
      console.error("Failed to load handoffs:", err);
    } finally {
      setLoading(false);
    }
  };

  const tasksKey = (issue.tasks || []).map((t) => `${t.id}-${t.status}`).join(",");

  useEffect(() => {
    loadHandoffs();
  }, [issue.id, tasksKey]);

  const handleSubmitHandoff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceTaskId || !targetTaskId || !note) return;
    try {
      const filesArr = evidenceFiles.map((file) => ({
        file,
        type: evidenceType,
      }));

      await handoffService.submitHandoff({
        caseId: issue.id,
        sourceTaskId,
        targetTaskId,
        note,
        actorId: userId,
        evidenceFiles: filesArr,
      });

      setSourceTaskId("");
      setTargetTaskId("");
      setNote("");
      setEvidenceFiles([]);
      loadHandoffs();
      onRefresh();
    } catch (err: any) {
      alert(err.message || "Failed to submit handoff");
    }
  };

  const handleAccept = async (handoffId: string) => {
    const noteText = reviewNote[handoffId] || "Verification successful.";
    try {
      await handoffService.acceptHandoff(handoffId, noteText, userId);
      loadHandoffs();
      onRefresh();
    } catch (err: any) {
      alert(err.message || "Failed to accept handoff");
    }
  };

  const handleReject = async (handoffId: string) => {
    const reason = rejectionReason[handoffId];
    if (!reason) {
      alert("Rejection reason is required.");
      return;
    }
    try {
      await handoffService.rejectHandoff(handoffId, reason, userId);
      loadHandoffs();
      onRefresh();
    } catch (err: any) {
      alert(err.message || "Failed to reject handoff");
    }
  };

  const isLeadDeptAdmin = !!(userDepartment && normalizeDepartmentKey(issue.leadDepartment) === normalizeDepartmentKey(userDepartment));
  const canManageAll = isSuperAdmin || isLeadDeptAdmin;

  // Scoped lists
  const inbox = handoffs.filter((h) => 
    (canManageAll || h.toDepartment === userDepartment) && 
    (h.handoffStatus === "SUBMITTED" || h.handoffStatus === "UNDER_REVIEW")
  );

  const outbox = handoffs.filter((h) => 
    (canManageAll || h.fromDepartment === userDepartment)
  );

  // Rework pending tasks
  const reworkTasks = tasks.filter((t) => 
    t.taskStatus === "REWORK_REQUIRED" && 
    (canManageAll || t.department === userDepartment)
  );

  return (
    <div className="mt-6 pt-6 border-t border-border space-y-6">
      {/* Rework Banner */}
      {reworkTasks.map((task) => (
        <div key={task.id} className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <h5 className="font-bold text-xs text-destructive">
              {activeLanguage === "en" ? "REWORK LOOP REQUIRED" : "रिवर्क लूप आवश्यक"}
            </h5>
            <p className="text-xs text-foreground/90 font-medium">
              Task <strong className="font-mono">{task.taskCode} ({task.title})</strong> was rejected.
            </p>
            {task.rejectionReason && (
              <p className="text-xs text-muted-foreground bg-destructive/10 p-2 rounded border border-destructive/20">
                <strong>Reason:</strong> "{task.rejectionReason}"
              </p>
            )}
            <div className="pt-2 border-t border-destructive/20">
              <p className="text-xs text-muted-foreground italic">
                Please correct the execution defects, capture new geo-tagged evidence, and submit a new handoff revision below.
              </p>
            </div>
          </div>
        </div>
      ))}

      {/* Tabs */}
      <div className="flex items-center justify-between border-b pb-2 flex-wrap gap-2">
        <div className="flex gap-2">
          <Button
            variant={activeTab === "inbox" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("inbox")}
            className="text-xs"
          >
            <Inbox className="w-3.5 h-3.5 mr-1" />
            Inbox ({inbox.length})
          </Button>
          <Button
            variant={activeTab === "outbox" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("outbox")}
            className="text-xs"
          >
            <Send className="w-3.5 h-3.5 mr-1" />
            Outbox ({outbox.length})
          </Button>
        </div>
        <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
          {activeLanguage === "en" ? "Inter-Department Verification Gates" : "विभाग सत्यापन गेट्स"}
        </h4>
      </div>

      {/* Handoff List */}
      <div className="space-y-4">
        {activeTab === "inbox" && (
          inbox.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No verification handoffs pending review.</p>
          ) : (
            inbox.map((h) => {
              const srcTask = tasks.find(t => t.id === h.sourceTaskId);
              const tgtTask = tasks.find(t => t.id === h.targetTaskId);
              return (
                <div key={h.id} className="p-4 border rounded-xl bg-card space-y-3 shadow-sm">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Badge className="font-mono text-xs bg-indigo-500/10 text-indigo-500 border-indigo-500/20">
                        {srcTask?.taskCode || "?"} → {tgtTask?.taskCode || "?"}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono">Rev {h.revisionNumber}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] tracking-wide font-mono uppercase">
                      {h.handoffStatus}
                    </Badge>
                  </div>

                  <div className="text-xs space-y-1.5">
                    <p><strong>From:</strong> {h.fromDepartment.replace("_", " ")} ({srcTask?.title})</p>
                    <p><strong>To:</strong> {h.toDepartment.replace("_", " ")} ({tgtTask?.title})</p>
                    {h.submissionNote && (
                      <p className="text-muted-foreground italic bg-muted/30 p-2 rounded">
                        <strong>Sender Note:</strong> "{h.submissionNote}"
                      </p>
                    )}
                  </div>

                  {/* Evidence Display */}
                  {h.evidence && h.evidence.length > 0 && (
                    <div className="space-y-2 border-t border-border/40 pt-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Verification Evidence</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {h.evidence.map((ev) => (
                          <div key={ev.id} className="p-2 border rounded-lg bg-muted/20 flex flex-col justify-between gap-2">
                            <div className="flex items-center gap-1.5 text-[10px] font-medium text-foreground/80">
                              <FileText className="w-3.5 h-3.5 text-blue-500" />
                              <span>{ev.evidenceType}</span>
                            </div>
                            {ev.publicUrl && (
                              <a href={ev.publicUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-1">
                                <Eye className="w-3 h-3" /> View Upload
                              </a>
                            )}
                            {ev.latitude && ev.longitude && (
                              <div className="text-[9px] text-muted-foreground flex items-center gap-0.5 font-mono">
                                <MapPin className="w-2.5 h-2.5 shrink-0" />
                                <span>{ev.latitude.toFixed(5)}, {ev.longitude.toFixed(5)}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Accept / Reject controls */}
                  <div className="pt-2 border-t border-border/40 space-y-2">
                    {showRejectInput[h.id] ? (
                      <div className="space-y-2">
                        <Input
                          placeholder="Provide detailed rejection/rework reason..."
                          value={rejectionReason[h.id] || ""}
                          onChange={(e) => setRejectionReason(prev => ({ ...prev, [h.id]: e.target.value }))}
                          className="h-8 text-xs"
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            className="h-8 text-xs"
                            variant="destructive"
                            onClick={() => handleReject(h.id)}
                            disabled={!rejectionReason[h.id]}
                          >
                            Confirm Reject
                          </Button>
                          <Button
                            size="sm"
                            className="h-8 text-xs"
                            variant="ghost"
                            onClick={() => setShowRejectInput(prev => ({ ...prev, [h.id]: false }))}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Input
                          placeholder="Verification comments..."
                          value={reviewNote[h.id] || ""}
                          onChange={(e) => setReviewNote(prev => ({ ...prev, [h.id]: e.target.value }))}
                          className="h-8 text-xs flex-1 min-w-[150px]"
                        />
                        <Button
                          size="sm"
                          className="h-8 text-xs bg-green-600 hover:bg-green-700"
                          onClick={() => handleAccept(h.id)}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Accept & Verify
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          variant="destructive"
                          onClick={() => setShowRejectInput(prev => ({ ...prev, [h.id]: true }))}
                        >
                          <XCircle className="w-3 h-3 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )
        )}

        {activeTab === "outbox" && (
          outbox.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No outbox handoffs generated yet.</p>
          ) : (
            outbox.map((h) => {
              const srcTask = tasks.find(t => t.id === h.sourceTaskId);
              const tgtTask = tasks.find(t => t.id === h.targetTaskId);
              return (
                <div key={h.id} className="p-3 border rounded-lg bg-muted/10 space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold">
                      {srcTask?.taskCode} → {tgtTask?.taskCode} (Rev {h.revisionNumber})
                    </span>
                    <Badge variant={h.handoffStatus === "ACCEPTED" ? "default" : h.handoffStatus === "REJECTED" ? "destructive" : "secondary"}>
                      {h.handoffStatus}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sender: {h.fromDepartment.replace("_", " ")} | Receiver: {h.toDepartment.replace("_", " ")}
                  </p>
                  {h.submissionNote && (
                    <p className="text-[11px] italic text-muted-foreground">
                      Note: "{h.submissionNote}"
                    </p>
                  )}
                  {h.rejectionReason && (
                    <p className="text-xs text-destructive bg-destructive/5 p-2 rounded border border-destructive/10">
                      <strong>Rejection Reason:</strong> "{h.rejectionReason}"
                    </p>
                  )}
                  {h.acceptanceNote && (
                    <p className="text-xs text-green-600 bg-green-500/5 p-2 rounded border border-green-500/10">
                      <strong>Acceptance Note:</strong> "{h.acceptanceNote}"
                    </p>
                  )}
                </div>
              );
            })
          )
        )}
      </div>

      {/* Submit Handoff Package Form */}
      {(() => {
        const eligibleSourceTasks = tasks.filter((t) => {
          const isCompleted = t.taskStatus === "COMPLETED" || t.taskStatus === "COMPLETED_PENDING_HANDOFF";
          const isMyDept = normalizeDepartmentKey(t.department) === normalizeDepartmentKey(userDepartment);
          return isCompleted && isMyDept;
        });

        const eligibleTargetTasks = tasks.filter((t) => {
          if (t.taskStatus === "COMPLETED" || t.taskStatus === "CANCELLED") return false;
          if (sourceTaskId) {
            return dependencies.some(
              (d) => d.predecessorTaskId === sourceTaskId && d.successorTaskId === t.id
            );
          }
          return dependencies.some((d) => d.successorTaskId === t.id);
        });

        return (
          <div className="border-t border-border/40 pt-4">
            <form onSubmit={handleSubmitHandoff} className="bg-card p-4 rounded-xl border space-y-3">
              <h5 className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                {activeLanguage === "en" ? "Submit Formal Handoff Package" : "औपचारिक हैंडऑफ़ पैकेज सबमिट करें"}
              </h5>
              <div className="grid grid-cols-2 gap-2">
                {eligibleSourceTasks.length === 0 ? (
                  <Select disabled value="">
                    <SelectTrigger className="h-8 text-xs bg-muted/40 text-muted-foreground border-dashed">
                      <SelectValue placeholder="No completed source tasks available" />
                    </SelectTrigger>
                  </Select>
                ) : (
                  <Select value={sourceTaskId} onValueChange={setSourceTaskId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Source Task (Completed)" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleSourceTasks.map((t) => (
                        <SelectItem key={t.id} value={t.id} className="text-xs">
                          {t.taskCode} — {t.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {!sourceTaskId ? (
                  <Select disabled value="">
                    <SelectTrigger className="h-8 text-xs bg-muted/40 text-muted-foreground border-dashed">
                      <SelectValue placeholder="Select Source Task First" />
                    </SelectTrigger>
                  </Select>
                ) : eligibleTargetTasks.length === 0 ? (
                  <Select disabled value="">
                    <SelectTrigger className="h-8 text-xs bg-muted/40 text-muted-foreground border-dashed">
                      <SelectValue placeholder="No dependent target tasks found" />
                    </SelectTrigger>
                  </Select>
                ) : (
                  <Select value={targetTaskId} onValueChange={setTargetTaskId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Target Task (Dependent)" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleTargetTasks.map((t) => (
                        <SelectItem key={t.id} value={t.id} className="text-xs">
                          {t.taskCode} — {t.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Select value={evidenceType} onValueChange={setEvidenceType}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Evidence Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PHOTO">Photo</SelectItem>
                    <SelectItem value="VIDEO">Video</SelectItem>
                    <SelectItem value="DOCUMENT">Document</SelectItem>
                    <SelectItem value="GEO_CONFIRMATION">Geo Confirmation</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="file"
                  onChange={(e) => setEvidenceFiles(Array.from(e.target.files || []))}
                  className="h-8 text-xs p-1"
                />
              </div>

              <Input
                placeholder="Technical details, excavation depth, stability confirmation, etc."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-8 text-xs"
              />

              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  className="h-8 text-xs bg-indigo-600"
                  disabled={!sourceTaskId || !targetTaskId || !note}
                >
                  Submit Handoff Package
                </Button>
              </div>
            </form>
          </div>
        );
      })()}
    </div>
  );
}
