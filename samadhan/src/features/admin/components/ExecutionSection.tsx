import React, { useState, useEffect, useCallback } from "react";
import { 
  Users, Plus, ArrowRight, AlertCircle, CheckCircle2,
  Play, Pause, CheckSquare, XSquare, MessageSquare, AlertTriangle, Trash2
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Issue, DepartmentTask, TaskDependency, WorkflowEvent } from "@/shared/types/domain/Issue";
import { DEPARTMENT_META } from "../pages/AdminPage"; // Import DEPARTMENT_META or redeclare locally if needed
import { executionService } from "@/features/coordination";
import { normalizeDepartmentKey } from "@/features/admin/hooks/useAdminDashboard";

export function ExecutionSection({
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
  const isLeadDeptAdmin = !!(userDepartment && normalizeDepartmentKey(issue.leadDepartment) === normalizeDepartmentKey(userDepartment));
  const hasCoordinatorControl = isSuperAdmin || isLeadDeptAdmin;

  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Task creation state
  const [newTaskCode, setNewTaskCode] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDept, setNewTaskDept] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<any>("MEDIUM");

  // Dependency state
  const [predTaskId, setPredTaskId] = useState("");
  const [succTaskId, setSuccTaskId] = useState("");

  // Blocker & Rejection state per task
  const [actionReason, setActionReason] = useState<Record<string, string>>({});
  const [showReasonInput, setShowReasonInput] = useState<Record<string, string>>({}); // { taskId: 'block' | 'reject' | '' }

  const tasks = issue.tasks || [];
  const participations = issue.participations || [];

  const loadDetails = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) {
        setLoading(true);
      }
      const [depList, eventList] = await Promise.all([
        executionService.getCaseDependencies(issue.id),
        executionService.getWorkflowEvents(issue.id)
      ]);
      setDependencies(depList);
      setEvents(eventList);
    } catch (err) {
      console.error("Failed to load execution details:", err);
    } finally {
      setLoading(false);
    }
  }, [issue.id]);

  useEffect(() => {
    loadDetails(true);
  }, [issue.id, loadDetails]);

  const tasksLength = tasks.length;
  useEffect(() => {
    loadDetails(false);
  }, [tasksLength, loadDetails]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskCode || !newTaskTitle || !newTaskDept) return;
    try {
      await executionService.createDepartmentTask({
        caseId: issue.id,
        department: newTaskDept,
        taskCode: newTaskCode.toUpperCase(),
        title: newTaskTitle,
        description: newTaskDesc,
        priority: newTaskPriority,
        assignedBy: userId,
      });
      setNewTaskCode("");
      setNewTaskTitle("");
      setNewTaskDept("");
      setNewTaskDesc("");
      onRefresh();
    } catch (err: any) {
      alert(err.message || "Failed to create task");
    }
  };

  const handleAddDependency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!predTaskId || !succTaskId) return;
    try {
      await executionService.addDependency(issue.id, predTaskId, succTaskId, userId);
      setPredTaskId("");
      setSuccTaskId("");
      onRefresh();
    } catch (err: any) {
      alert(err.message || "Failed to create dependency");
    }
  };

  const handleRemoveDependency = async (depId: string) => {
    try {
      await executionService.removeDependency(issue.id, depId, userId);
      onRefresh();
    } catch (err: any) {
      alert(err.message || "Failed to delete dependency");
    }
  };

  const handleTransition = async (taskId: string, targetStatus: string) => {
    const reason = actionReason[taskId] || "";
    try {
      await executionService.transitionTask(taskId, targetStatus, userId, reason);
      setActionReason(prev => ({ ...prev, [taskId]: "" }));
      setShowReasonInput(prev => ({ ...prev, [taskId]: "" }));
      onRefresh();
    } catch (err: any) {
      alert(err.message || "Failed to transition task");
    }
  };

  // Status counters
  const statusCounts = tasks.reduce((acc, t) => {
    acc[t.taskStatus] = (acc[t.taskStatus] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="mt-6 pt-6 border-t border-border space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-5 h-5 text-indigo-500" />
          <h4 className="font-bold text-sm">
            {activeLanguage === "en" ? "Execution Flow & Dependencies" : "निष्पादन प्रवाह और निर्भरताएं"}
          </h4>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
          <span>Tasks: {tasks.length}</span>
          <span>·</span>
          <span>Waiting: {statusCounts.WAITING_DEPENDENCY || 0}</span>
          <span>·</span>
          <span>Ready: {statusCounts.READY || 0}</span>
          <span>·</span>
          <span>Working: {statusCounts.WORKING || 0}</span>
          <span>·</span>
          <span>Completed: {statusCounts.COMPLETED || 0}</span>
        </div>
      </div>

      {tasks.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          {activeLanguage === "en" ? "No execution tasks initialized yet." : "अभी तक कोई निष्पादन कार्य प्रारंभ नहीं किया गया है।"}
        </p>
      ) : (
        <div className="grid gap-3">
          {tasks.map((task) => {
            const isDeptTask = task.department === userDepartment;
            const canManage = hasCoordinatorControl || isDeptTask;
            const myReason = actionReason[task.id] || "";
            const currentShowReason = showReasonInput[task.id] || "";

            // Find predecessor names and departments
            const taskPreds = dependencies
              .filter((d) => d.successorTaskId === task.id)
              .map((d) => {
                const predTask = tasks.find((t) => t.id === d.predecessorTaskId);
                return predTask ? predTask.taskCode : "?";
              });

            const uncompletedPreds = dependencies
              .filter((d) => d.successorTaskId === task.id)
              .map((d) => tasks.find((t) => t.id === d.predecessorTaskId))
              .filter((t): t is DepartmentTask => !!t && t.taskStatus !== "COMPLETED");

            const predDepts = Array.from(
              new Set(
                uncompletedPreds.map((t) => {
                  const meta = DEPARTMENT_META[t.department];
                  return activeLanguage === "en"
                    ? (meta?.labelEn || t.department).toUpperCase()
                    : (meta?.labelHi || t.department);
                })
              )
            );

            let displayStatus = task.taskStatus.replace("_", " ");
            let badgeStyle = "bg-secondary text-secondary-foreground border-transparent";
            let cardBorder = "border-border";

            if (task.taskStatus === "WAITING_DEPENDENCY") {
              displayStatus = activeLanguage === "en"
                ? `WAITING FOR ${predDepts.join(" & ") || "PREDECESSORS"}`
                : `${predDepts.join(" और ") || "पूर्ववर्तियों"} की प्रतीक्षा है`;
              badgeStyle = "bg-amber-500/10 text-amber-600 border-amber-500/20";
              cardBorder = "border-amber-500/20 bg-amber-500/[0.01]";
            } else if (task.taskStatus === "READY" || task.taskStatus === "ACCEPTED" || task.taskStatus === "ASSIGNED") {
              displayStatus = activeLanguage === "en" ? "READY TO START" : "शुरू करने के लिए तैयार";
              badgeStyle = "bg-indigo-500/10 text-indigo-600 border-indigo-500/20";
              cardBorder = "border-indigo-500/20 bg-indigo-500/[0.01]";
            } else if (task.taskStatus === "WORKING") {
              displayStatus = activeLanguage === "en" ? "IN PROGRESS" : "प्रगति पर है";
              badgeStyle = "bg-blue-500/10 text-blue-600 border-blue-500/20";
              cardBorder = "border-blue-500/30 bg-blue-500/[0.02] shadow-sm animate-pulse-subtle";
            } else if (task.taskStatus === "BLOCKED") {
              displayStatus = activeLanguage === "en" ? "BLOCKED" : "अवरुद्ध";
              badgeStyle = "bg-red-500/10 text-red-600 border-red-500/20";
              cardBorder = "border-red-500/30 bg-red-500/[0.02]";
            } else if (task.taskStatus === "COMPLETED") {
              displayStatus = activeLanguage === "en" ? "COMPLETED" : "पूर्ण";
              badgeStyle = "bg-green-500/10 text-green-600 border-green-500/20";
              cardBorder = "border-green-500/20 bg-green-500/[0.01]";
            } else if (task.taskStatus === "REWORK_REQUIRED" || task.taskStatus === "REJECTED") {
              displayStatus = activeLanguage === "en" ? "REWORK REQUIRED" : "पुनः कार्य आवश्यक";
              badgeStyle = "bg-red-500/10 text-red-600 border-red-500/20";
              cardBorder = "border-red-500/30 bg-red-500/[0.02]";
            } else if (task.taskStatus === "CANCELLED") {
              displayStatus = activeLanguage === "en" ? "CANCELLED" : "रद्द किया गया";
              badgeStyle = "bg-gray-500/10 text-gray-600 border-gray-500/20";
            }

            return (
              <div
                key={task.id}
                className={`p-4 rounded-xl border transition-all ${cardBorder}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded font-bold">
                        {task.taskCode}
                      </span>
                      <h5 className="font-semibold text-sm">{task.title}</h5>
                      <span className="text-xs text-muted-foreground capitalize">
                        ({task.department.replace("_", " ")})
                      </span>
                    </div>
                    {task.description && (
                      <p className="text-xs text-muted-foreground mt-1">{task.description}</p>
                    )}

                    {/* Predecessors alert if blocked/waiting */}
                    {taskPreds.length > 0 && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                        <AlertTriangle className="w-3 h-3 text-yellow-600" />
                        <span>Depends on: <strong className="font-mono">{taskPreds.join(", ")}</strong></span>
                      </div>
                    )}

                    {/* Blocker reason */}
                    {task.taskStatus === "BLOCKED" && task.blockedReason && (
                      <div className="mt-2 text-xs p-2 rounded bg-destructive/5 text-destructive border border-destructive/10">
                        <strong>Obstacle:</strong> {task.blockedReason}
                      </div>
                    )}

                    {/* Rejection reason */}
                    {task.taskStatus === "REJECTED" && task.rejectionReason && (
                      <div className="mt-2 text-xs p-2 rounded bg-destructive/5 text-destructive border border-destructive/10">
                        <strong>Rejected:</strong> {task.rejectionReason}
                      </div>
                    )}
                    {/* Field Instructions & Safety Notes */}
                    {(task.completionEvidenceRules?.fieldInstructions || task.completionEvidenceRules?.safetyNotes) && (
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 bg-muted/30 border rounded text-[11px] leading-relaxed">
                        {task.completionEvidenceRules?.fieldInstructions && (
                          <div>
                            <strong className="text-muted-foreground">📋 Field Instructions:</strong>
                            <p className="text-foreground mt-0.5">{task.completionEvidenceRules.fieldInstructions}</p>
                          </div>
                        )}
                        {task.completionEvidenceRules?.safetyNotes && (
                          <div>
                            <strong className="text-amber-700">⚠️ Safety Notes:</strong>
                            <p className="text-foreground mt-0.5">{task.completionEvidenceRules.safetyNotes}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Evidence Checklist */}
                    {Array.isArray(task.completionEvidenceRules?.evidenceChecklist) && task.completionEvidenceRules.evidenceChecklist.length > 0 && (
                      <div className="mt-2 text-[11px]">
                        <strong className="text-muted-foreground block mb-1">✅ Quality Checklist:</strong>
                        <ul className="list-disc pl-4 space-y-0.5 text-foreground">
                          {task.completionEvidenceRules.evidenceChecklist.map((item: string, idx: number) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <Badge className={`shrink-0 font-mono text-[10px] uppercase tracking-wide border ${badgeStyle}`}>
                    {displayStatus}
                  </Badge>
                </div>

                {/* Task Operations */}
                {canManage && (
                  <div className="mt-3 pt-3 border-t border-border/40 flex flex-col gap-2">
                    {currentShowReason ? (
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder={
                            currentShowReason === "block"
                              ? (activeLanguage === "en" ? "Enter blocking obstacle..." : "बाधा दर्ज करें...")
                              : (activeLanguage === "en" ? "Enter rejection reason..." : "अस्वीकृति का कारण...")
                          }
                          value={myReason}
                          onChange={(e) => setActionReason(prev => ({ ...prev, [task.id]: e.target.value }))}
                          className="h-8 text-xs flex-1"
                        />
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => handleTransition(task.id, currentShowReason === "block" ? "BLOCKED" : "REJECTED")}
                          disabled={!myReason}
                        >
                          Submit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-muted-foreground"
                          onClick={() => setShowReasonInput(prev => ({ ...prev, [task.id]: "" }))}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {task.taskStatus === "ASSIGNED" && (
                          <>
                            <Button
                              size="sm"
                              className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700"
                              onClick={() => handleTransition(task.id, "ACCEPTED")}
                            >
                              Accept Task
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs text-destructive hover:bg-destructive/5"
                              onClick={() => setShowReasonInput(prev => ({ ...prev, [task.id]: "reject" }))}
                            >
                              Reject Task
                            </Button>
                          </>
                        )}

                        {task.taskStatus === "READY" && (
                          <Button
                            size="sm"
                            className="h-8 text-xs bg-blue-600 hover:bg-blue-700"
                            onClick={() => handleTransition(task.id, "WORKING")}
                          >
                            <Play className="w-3 h-3 mr-1" />
                            Start Work
                          </Button>
                        )}

                        {task.taskStatus === "WORKING" && (
                          <>
                            <Button
                              size="sm"
                              className="h-8 text-xs bg-green-600 hover:bg-green-700"
                              onClick={() => handleTransition(task.id, "COMPLETED")}
                            >
                              Complete Work
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs text-yellow-600 hover:bg-yellow-50/50"
                              onClick={() => setShowReasonInput(prev => ({ ...prev, [task.id]: "block" }))}
                            >
                              <Pause className="w-3 h-3 mr-1" />
                              Report Blocker
                            </Button>
                          </>
                        )}

                        {task.taskStatus === "BLOCKED" && (
                          <Button
                            size="sm"
                            className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700"
                            onClick={() => handleTransition(task.id, "WORKING")}
                          >
                            Resolve Blocker
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Super Admin / Coordinator Controls */}
      {hasCoordinatorControl && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border/40 pt-4">
          {/* Create Task Form */}
          <form onSubmit={handleCreateTask} className="bg-muted/30 p-4 rounded-xl border border-dashed border-border space-y-3">
            <h5 className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              {activeLanguage === "en" ? "Initialize Coordination Task" : "समन्वय कार्य प्रारंभ करें"}
            </h5>
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Code (e.g. T1)"
                value={newTaskCode}
                onChange={(e) => setNewTaskCode(e.target.value)}
                className="h-8 text-xs"
              />
              <Select value={newTaskDept} onValueChange={setNewTaskDept}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Assigned Dept" />
                </SelectTrigger>
                <SelectContent>
                  {participations.map((p) => {
                    const info = DEPARTMENT_META[p.department];
                    return (
                      <SelectItem key={p.department} value={p.department} className="text-xs">
                        {activeLanguage === "en" ? info?.labelEn : info?.labelHi}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <Input
              placeholder="Task Title (e.g. Repair leak)"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              className="h-8 text-xs"
            />
            <Input
              placeholder="Description (Optional)"
              value={newTaskDesc}
              onChange={(e) => setNewTaskDesc(e.target.value)}
              className="h-8 text-xs"
            />
            <div className="flex justify-end">
              <Button type="submit" size="sm" className="h-8 text-xs" disabled={!newTaskCode || !newTaskTitle || !newTaskDept}>
                Create Task
              </Button>
            </div>
          </form>

          {/* Add Dependency Edge */}
          {tasks.length > 1 && (
            <div className="space-y-4">
              <form onSubmit={handleAddDependency} className="bg-muted/30 p-4 rounded-xl border border-dashed border-border space-y-3">
                <h5 className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                  <ArrowRight className="w-3.5 h-3.5" />
                  {activeLanguage === "en" ? "Set Work Dependency" : "कार्य निर्भरता सेट करें"}
                </h5>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={predTaskId} onValueChange={setPredTaskId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Must Finish First" />
                    </SelectTrigger>
                    <SelectContent>
                      {tasks.map((t) => (
                        <SelectItem key={t.id} value={t.id} className="text-xs">
                          {t.taskCode} — {t.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={succTaskId} onValueChange={setSuccTaskId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Starts Next" />
                    </SelectTrigger>
                    <SelectContent>
                      {tasks.map((t) => (
                        <SelectItem key={t.id} value={t.id} className="text-xs">
                          {t.taskCode} — {t.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" size="sm" className="h-8 text-xs bg-indigo-600" disabled={!predTaskId || !succTaskId}>
                    Add Dependency
                  </Button>
                </div>
              </form>

              {/* Edge List */}
              {dependencies.length > 0 && (
                <div className="space-y-1.5 p-3 rounded-lg border bg-card/40">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Active Dependency Rules</p>
                  <div className="max-h-24 overflow-y-auto space-y-1">
                    {dependencies.map((d) => {
                      const pTask = tasks.find(t => t.id === d.predecessorTaskId);
                      const sTask = tasks.find(t => t.id === d.successorTaskId);
                      return (
                        <div key={d.id} className="flex items-center justify-between text-xs p-1 rounded bg-muted/20">
                          <span className="font-mono">
                            {pTask ? pTask.taskCode : "?"} → {sTask ? sTask.taskCode : "?"}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-5 h-5 text-destructive hover:bg-destructive/10"
                            onClick={() => handleRemoveDependency(d.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Workflow Events Timeline */}
      {events.length > 0 && (
        <div className="border-t border-border/40 pt-4 space-y-2">
          <h5 className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" />
            {activeLanguage === "en" ? "Coordination Event Ledger" : "समन्वय घटना बहीखाता"}
          </h5>
          <div className="max-h-36 overflow-y-auto space-y-2 pr-1 border rounded-lg p-3 bg-muted/10">
            {events.map((ev) => (
              <div key={ev.id} className="text-[11px] leading-relaxed border-l-2 border-primary/20 pl-2">
                <div className="flex items-center justify-between text-muted-foreground font-medium">
                  <span>{ev.eventType}</span>
                  <span>{new Date(ev.createdAt).toLocaleTimeString()}</span>
                </div>
                <p className="text-foreground/90 mt-0.5">
                  Task status: <span className="font-mono bg-muted px-1 rounded">{ev.fromStatus || "NONE"}</span> → <span className="font-mono bg-muted px-1 rounded">{ev.toStatus || "NONE"}</span>
                  {ev.metadata?.reason && ` — "${ev.metadata.reason}"`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
