import React, { useState, useEffect, useCallback, useRef } from "react";
import { coordinationService } from "@/features/coordination/services/coordinationService";
import { AICoordinationPlan, AIPlanParticipant, AIPlanTask, AIPlanDependency } from "@/shared/types/domain/Issue";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { useToast } from "@/shared/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/shared/services/logger";
import { 
  Bot, User, ShieldAlert, CheckCircle, 
  Trash2, Plus, AlertTriangle, Edit3, ArrowRight, RefreshCw, AlertCircle,
  Save, Sparkles, FileCheck, Loader2
} from "lucide-react";

// Explicit async state machine — LOADING must always terminate
type FetchState = "IDLE" | "LOADING" | "READY" | "EMPTY" | "ERROR";

interface CoordinationPlanReviewProps {
  caseId: string;
  onPlanActivated: () => void;
}

const DEPARTMENTS = [
  { val: "water_supply", label: "Water Supply" },
  { val: "sanitation", label: "Sanitation" },
  { val: "electricity", label: "Electricity" },
  { val: "roads", label: "Roads" },
  { val: "parks", label: "Parks" },
  { val: "buildings", label: "Buildings" },
];

const ROLES = [
  { val: "LEAD", label: "LEAD" },
  { val: "RESPONSIBLE", label: "RESPONSIBLE" },
  { val: "SUPPORTING", label: "SUPPORTING" },
  { val: "CONSULTED", label: "CONSULTED" },
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

export const CoordinationPlanReview: React.FC<CoordinationPlanReviewProps> = ({
  caseId,
  onPlanActivated,
}) => {
  const { toast } = useToast();
  const [plan, setPlan] = useState<AICoordinationPlan | null>(null);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>("LOADING");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [activating, setActivating] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showStillPreparing, setShowStillPreparing] = useState<boolean>(false);
  const mountedRef = useRef(true);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [generatingWo, setGeneratingWo] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (aiStatus === "pending" || aiStatus === "analyzing") {
      setShowStillPreparing(false);
      const timer = setTimeout(() => {
        if (mountedRef.current) {
          setShowStillPreparing(true);
        }
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [aiStatus]);

  // Editable states
  const [participants, setParticipants] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [dependencies, setDependencies] = useState<any[]>([]);
  const [explanation, setExplanation] = useState<string>("");

  // New item form states
  const [newPartDept, setNewPartDept] = useState<string>("water_supply");
  const [newPartRole, setNewPartRole] = useState<string>("RESPONSIBLE");
  const [newPartReason, setNewPartReason] = useState<string>("");

  const [newTaskDept, setNewTaskDept] = useState<string>("water_supply");
  const [newTaskTitle, setNewTaskTitle] = useState<string>("");
  const [newTaskDesc, setNewTaskDesc] = useState<string>("");
  const [newTaskPriority, setNewTaskPriority] = useState<string>("MEDIUM");
  const [newTaskSLA, setNewTaskSLA] = useState<number>(1440);

  const [newDepPred, setNewDepPred] = useState<string>("");
  const [newDepSucc, setNewDepSucc] = useState<string>("");
  const [newDepReason, setNewDepReason] = useState<string>("");

  useEffect(() => {
    mountedRef.current = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mountedRef.current) setCurrentUser(data?.user);
    });
    fetchPlan();
    return () => { mountedRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  /**
   * Fetch the AI coordination plan with explicit state machine.
   * LOADING → READY | EMPTY | ERROR
   * A failed sub-query never hangs the whole Promise.all — each is individually
   * guarded and falls back to an empty array.
   */
  const fetchPlan = useCallback(async () => {
    if (!mountedRef.current) return;
    setFetchState("LOADING");
    setFetchError(null);
    try {
      // 1. Fetch issue AI status and request timestamps
      const { data: issue, error: issueErr } = await supabase
        .from("reported_issues")
        .select("ai_status, ai_request_started_at, created_at")
        .eq("id", caseId)
        .single();

      if (issueErr) throw issueErr;

      let currentStatus = issue?.ai_status || null;
      setAiStatus(currentStatus);

      // Stale preparing recovery (15 seconds threshold)
      if (currentStatus === "pending" || currentStatus === "analyzing") {
        const startedAtStr = issue?.ai_request_started_at || issue?.created_at;
        const startedAt = startedAtStr ? new Date(startedAtStr).getTime() : 0;
        if (startedAt > 0 && (Date.now() - startedAt) > 15000) {
          logger.warn(`[CoordinationPlanReview] AI classification stale for case ${caseId}. Forcing failed state.`);
          await supabase
            .from("reported_issues")
            .update({ ai_status: "failed" })
            .eq("id", caseId);
          currentStatus = "failed";
          setAiStatus("failed");
        }
      }

      // 2. Fetch plan details
      const data = await coordinationService.getAICoordinationPlan(caseId);
      if (!mountedRef.current) return;

      if (data) {
        setPlan(data);
        setParticipants(data.participants || []);
        setTasks(data.tasks || []);
        setDependencies(data.dependencies || []);
        setExplanation(data.explanation || "");
        try {
          const woData = await coordinationService.getCaseWorkOrders(caseId);
          setWorkOrders(woData || []);
        } catch (err) {
          logger.error("[CoordinationPlanReview] Failed to fetch work orders", err);
        }
        setFetchState("READY");
      } else {
        setPlan(null);
        if (currentStatus === "done") {
          setFetchState("EMPTY");
        } else if (currentStatus === "failed") {
          setFetchState("ERROR");
          setFetchError("Could not prepare the response plan. Try again.");
        } else if (currentStatus === "pending" || currentStatus === "analyzing") {
          setFetchState("EMPTY"); // Stay in empty state to allow rendering the custom progress screen
        } else {
          setFetchState("EMPTY");
        }
      }
    } catch (err: any) {
      logger.error("[CoordinationPlanReview] fetchPlan failed", err);
      if (!mountedRef.current) return;
      setFetchError(err.message || "Failed to load coordination proposal.");
      setFetchState("ERROR");
      toast({
        title: "Error fetching plan",
        description: err.message || "Failed to load coordination proposal.",
        variant: "destructive",
      });
    }
  }, [caseId, toast]);

  // Poll work orders if any is GENERATING or PENDING, or if we have fewer finished work orders than participants when plan is ACTIVATED
  useEffect(() => {
    if (!plan || plan.status !== "ACTIVATED") return;

    const hasGeneratingOrPending = workOrders.some(
      (wo) => wo.status === "GENERATING" || wo.status === "PENDING"
    );
    const hasFailed = workOrders.some((wo) => wo.status === "FAILED");
    const finishedCount = workOrders.filter((wo) => wo.status === "READY" || wo.status === "FAILED").length;
    const isPendingGeneration = finishedCount < participants.length;

    const needsPolling = hasGeneratingOrPending || (isPendingGeneration && !hasFailed);
    if (!needsPolling) return;

    const interval = setInterval(async () => {
      try {
        const woData = await coordinationService.getCaseWorkOrders(caseId);
        if (mountedRef.current) {
          setWorkOrders(woData || []);
        }
      } catch (err) {
        console.error("Failed to poll work orders:", err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [caseId, workOrders, plan, participants.length]);

  // Set up real-time subscription for case_work_orders
  useEffect(() => {
    logger.info(`[CoordinationPlanReview] Setting up realtime subscription for case_work_orders on case ${caseId}`);
    const channel = supabase
      .channel(`case-work-orders-realtime-${caseId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "case_work_orders",
          filter: `case_id=eq.${caseId}`
        },
        (payload) => {
          logger.info("[CoordinationPlanReview] Realtime case_work_orders change:", payload.eventType);
          coordinationService.getCaseWorkOrders(caseId)
            .then((woData) => {
              if (mountedRef.current) {
                setWorkOrders(woData || []);
              }
            })
            .catch((err) => console.error("Failed to reload work orders on realtime change:", err));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [caseId]);

  const handleGenerateWorkOrder = async (deptKey: string) => {
    if (!plan) return;
    setGeneratingWo((prev) => ({ ...prev, [deptKey]: true }));
    try {
      await coordinationService.generateWorkOrderPDF(plan.id, deptKey);
      toast({
        title: "Generating Work Order",
        description: `Generating document for ${deptKey.replace("_", " ").toUpperCase()}...`,
      });
      // Fetch immediately to update status to GENERATING
      const woData = await coordinationService.getCaseWorkOrders(caseId);
      setWorkOrders(woData || []);
    } catch (err: any) {
      toast({
        title: "Generation Failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setGeneratingWo((prev) => ({ ...prev, [deptKey]: false }));
    }
  };

  const handleDownloadWorkOrder = async (storagePath: string) => {
    try {
      const url = await coordinationService.getWorkOrderDownloadUrl(storagePath);
      window.open(url, "_blank");
    } catch (err: any) {
      toast({
        title: "Download Failed",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    const startTime = Date.now();
    let errStage = "INVOCATION";
    try {
      // Authenticate session before invoking
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !session) {
        errStage = "AUTH";
        throw new Error("Your session expired. Please sign in again.");
      }

      errStage = "GEMINI_REQUEST";
      await coordinationService.generateAICoordinationPlan(caseId);
      
      const elapsed = Date.now() - startTime;
      logger.info(`[CoordinationPlanReview] AI classification completed successfully in ${elapsed}ms`, {
        function: "classify-issue",
        stage: "DB_PERSISTENCE",
        elapsedMs: elapsed
      });

      toast({
        title: "Response Plan Ready",
        description: "Review and edit the proposed multi-department plan before activation.",
      });
      await fetchPlan();
    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      const errorClass = err.constructor?.name || "Error";
      const status = err.status || err.statusCode || 500;
      
      logger.error("[CoordinationPlanReview] handleGenerate failed", {
        function: "classify-issue",
        stage: errStage,
        errorClass,
        errorMessage: err.message,
        status,
        elapsedMs: elapsed
      });

      // Map to human-centered error toast messages
      let userFriendlyMessage = "Could not prepare the response plan. Try again.";
      if (errStage === "AUTH" || status === 401 || status === 403) {
        userFriendlyMessage = "Your session expired. Please sign in again.";
      } else if (status === 429 || err.message?.toLowerCase().includes("rate limit") || err.message?.toLowerCase().includes("too many requests")) {
        userFriendlyMessage = "Planning is temporarily busy. Try again shortly.";
      } else if (err.message?.toLowerCase().includes("timeout") || err.message?.toLowerCase().includes("abort") || elapsed > 10000) {
        userFriendlyMessage = "Plan preparation took too long. Try again.";
      } else if (err.message?.toLowerCase().includes("json") || err.message?.toLowerCase().includes("parse") || err.message?.toLowerCase().includes("invalid output")) {
        userFriendlyMessage = "The response plan needs to be generated again.";
      }

      toast({
        title: "AI Planning Failed",
        description: userFriendlyMessage,
        variant: "destructive",
      });

      // Mark the issue status as failed in database to terminate spinner/preparing state
      await supabase
        .from("reported_issues")
        .update({ ai_status: "failed" })
        .eq("id", caseId);

      await fetchPlan();
    } finally {
      setGenerating(false);
    }
  };

  const handleManualFallback = async () => {
    try {
      await coordinationService.createManualCoordinationPlan(caseId);
      toast({
        title: "Manual Canvas Initialized",
        description: "Add participants, subtasks, and dependencies to coordinate this case.",
      });
      await fetchPlan();
    } catch (err: any) {
      logger.error("[CoordinationPlanReview] handleManualFallback failed", err);
      toast({
        title: "Manual Fallback Failed",
        description: err.message,
        variant: "destructive",
      });
      setFetchState("ERROR");
      setFetchError(err.message);
    }
  };

  // Local validation for DAG cycles
  const hasCycle = (taskList: any[], depList: any[]): boolean => {
    const adj = new Map<string, string[]>();
    for (const t of taskList) {
      adj.set(t.temp_id || t.tempId, []);
    }
    for (const d of depList) {
      const pred = d.predecessor_temp_id || d.predecessorTempId;
      const succ = d.successor_temp_id || d.successorTempId;
      if (adj.has(pred)) {
        adj.get(pred)!.push(succ);
      }
    }

    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (node: string): boolean => {
      if (recStack.has(node)) return true;
      if (visited.has(node)) return false;

      visited.add(node);
      recStack.add(node);

      const neighbors = adj.get(node) || [];
      for (const n of neighbors) {
        if (dfs(n)) return true;
      }

      recStack.delete(node);
      return false;
    };

    for (const t of taskList) {
      const tid = t.temp_id || t.tempId;
      if (dfs(tid)) return true;
    }
    return false;
  };

  const handleAddParticipant = () => {
    if (participants.some((p) => p.department === newPartDept)) {
      toast({
        title: "Validation Error",
        description: "This department is already added to the plan.",
        variant: "destructive",
      });
      return;
    }

    const newPart = {
      department: newPartDept,
      participation_role: newPartRole,
      responsibility_reason: newPartReason || "Coordinator override",
    };

    // If role is LEAD, verify we don't have another active lead
    if (newPartRole === "LEAD") {
      const updatedParts = participants.map((p) => 
        p.participation_role === "LEAD" ? { ...p, participation_role: "RESPONSIBLE" } : p
      );
      setParticipants([...updatedParts, newPart]);
    } else {
      setParticipants([...participants, newPart]);
    }
    setNewPartReason("");
  };

  const handleRemoveParticipant = (dept: string) => {
    const part = participants.find((p) => p.department === dept);
    if (part?.participation_role === "LEAD") {
      toast({
        title: "Validation Error",
        description: "Cannot remove LEAD department. Promote another department to LEAD first.",
        variant: "destructive",
      });
      return;
    }
    setParticipants(participants.filter((p) => p.department !== dept));
  };

  const handleAddTask = () => {
    if (!newTaskTitle) {
      toast({
        title: "Validation Error",
        description: "Task title is required.",
        variant: "destructive",
      });
      return;
    }

    // Ensure the department is a participant
    if (!participants.some((p) => p.department === newTaskDept)) {
      // Auto add department as supporting
      setParticipants([...participants, {
        department: newTaskDept,
        participation_role: "SUPPORTING",
        responsibility_reason: "Added via task assignment",
      }]);
    }

    const nextIdNum = tasks.length + 1;
    const tempId = `T${nextIdNum}`;

    const newTask = {
      temp_id: tempId,
      department: newTaskDept,
      title: newTaskTitle,
      description: newTaskDesc,
      priority: newTaskPriority,
      sla_duration_minutes: newTaskSLA,
      completion_evidence_rules: {
        evidenceRequired: true,
        evidenceTypes: ["PHOTO"],
        fieldInstructions: "Execute standard field repairs.",
        safetyNotes: "Wear appropriate personal protective equipment (PPE).",
        evidenceChecklist: ["Inspect site", "Take photo of completed work"]
      }
    };

    setTasks([...tasks, newTask]);
    setNewTaskTitle("");
    setNewTaskDesc("");
  };

  const handleRemoveTask = (tempId: string) => {
    // Remove task and any dependent dependencies
    setTasks(tasks.filter((t) => (t.temp_id || t.tempId) !== tempId));
    setDependencies(dependencies.filter(
      (d) => 
        (d.predecessor_temp_id || d.predecessorTempId) !== tempId &&
        (d.successor_temp_id || d.successorTempId) !== tempId
    ));
  };

  const handleAddDependency = () => {
    if (!newDepPred || !newDepSucc) {
      toast({
        title: "Validation Error",
        description: "Select both predecessor and successor tasks.",
        variant: "destructive",
      });
      return;
    }

    if (newDepPred === newDepSucc) {
      toast({
        title: "Validation Error",
        description: "A task cannot depend on itself.",
        variant: "destructive",
      });
      return;
    }

    if (dependencies.some(
      (d) => 
        (d.predecessor_temp_id || d.predecessorTempId) === newDepPred && 
        (d.successor_temp_id || d.successorTempId) === newDepSucc
    )) {
      toast({
        title: "Validation Error",
        description: "This dependency already exists.",
        variant: "destructive",
      });
      return;
    }

    const testDeps = [...dependencies, { predecessor_temp_id: newDepPred, successor_temp_id: newDepSucc }];
    if (hasCycle(tasks, testDeps)) {
      toast({
        title: "Cycle Detected",
        description: "Adding this dependency creates a circular loop!",
        variant: "destructive",
      });
      return;
    }

    setDependencies([...dependencies, {
      predecessor_temp_id: newDepPred,
      successor_temp_id: newDepSucc,
      reason: newDepReason || "Sequence blocker",
    }]);
    setNewDepReason("");
  };

  const handleRemoveDependency = (pred: string, succ: string) => {
    setDependencies(dependencies.filter(
      (d) => 
        !((d.predecessor_temp_id || d.predecessorTempId) === pred && 
          (d.successor_temp_id || d.successorTempId) === succ)
    ));
  };

  const handleSaveChanges = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      // Validate at least one LEAD
      const leadCount = participants.filter((p) => p.participation_role === "LEAD").length;
      if (leadCount !== 1) {
        toast({
          title: "Save Failed",
          description: "There must be exactly one LEAD department assigned.",
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      await coordinationService.saveAICoordinationPlanEdits(
        plan.id,
        currentUser?.id,
        participants,
        tasks,
        dependencies,
        {
          entityType: "PLAN",
          entityId: plan.id,
          action: "UPDATE",
          beforeState: plan.validatedPlan,
          afterState: { participants, tasks, dependencies },
          reason: "Human review manual override edits",
        }
      );

      toast({
        title: "Draft Saved",
        description: "Coordination plan updates saved successfully.",
      });
      await fetchPlan();
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Save Failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleApproveAndActivate = async () => {
    if (!plan) return;
    setActivating(true);
    try {
      // Ensure exactly one LEAD department exists
      const leadCount = participants.filter((p) => p.participation_role === "LEAD").length;
      if (leadCount !== 1) {
        toast({
          title: "Activation Blocked",
          description: "Please assign exactly one LEAD department before approving.",
          variant: "destructive",
        });
        setActivating(false);
        return;
      }

      // First save latest edits
      await coordinationService.saveAICoordinationPlanEdits(
        plan.id,
        currentUser?.id,
        participants,
        tasks,
        dependencies
      );

      // Approve RPC with 10-second timeout protection
      await withTimeout(
        coordinationService.approveAndActivateCoordinationPlan(plan.id, currentUser?.id),
        10000,
        "Request timed out. The database took too long to activate the plan."
      );

      toast({
        title: "Coordination Activated!",
        description: "Operational subtasks have been dispatched to department queues.",
      });

      onPlanActivated();
      await fetchPlan();
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Activation Failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setActivating(false);
    }
  };

  // ── State machine rendering ─────────────────────────────────────────────
  if (fetchState === "LOADING") {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Loading coordination blueprint...</p>
      </div>
    );
  }

  if (fetchState === "ERROR") {
    return (
      <Card className="border-red-500/30 bg-red-500/5">
        <CardContent className="flex flex-col items-center justify-center py-8 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-red-400" />
          <div>
            <h3 className="font-semibold text-sm text-red-400">Failed to load coordination blueprint</h3>
            <p className="text-muted-foreground text-xs mt-1 max-w-sm">{fetchError}</p>
          </div>
          <Button size="sm" variant="outline" onClick={fetchPlan}>
            <RefreshCw className="w-3 h-3 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (aiStatus === "pending" || aiStatus === "analyzing") {
    return (
      <Card className="border-dashed border-2">
        <CardContent className="flex flex-col items-center justify-center py-10 text-center space-y-4">
          <div className="p-3 bg-purple-50 rounded-full text-purple-600 animate-pulse">
            <Bot className="w-8 h-8" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Preparing Response Plan</h3>
            <p className="text-muted-foreground text-sm max-w-sm mt-1">
              {showStillPreparing 
                ? "Still preparing the response plan..." 
                : "Creating a suggested action plan from the reported issue."}
            </p>
          </div>
          <div className="w-48 bg-muted h-1.5 rounded-full overflow-hidden">
            <div className="bg-purple-600 h-full rounded-full animate-pulse" style={{ width: "65%" }} />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (aiStatus === "failed" && !plan) {
    return (
      <Card className="border-red-200 bg-red-50/5 border-2">
        <CardContent className="flex flex-col items-center justify-center py-10 text-center space-y-4">
          <div className="p-3 bg-red-100 rounded-full text-red-600">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div>
            <h3 className="font-semibold text-lg text-red-700">Plan could not be prepared</h3>
            <p className="text-muted-foreground text-sm max-w-sm mt-1">
              The automated response plan could not be prepared. You can retry preparing the plan or continue manually.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleGenerate} disabled={generating} className="space-x-2">
              <RefreshCw className="w-4 h-4" />
              <span>{generating ? "Preparing..." : "Retry Preparing Plan"}</span>
            </Button>
            <Button onClick={handleManualFallback} variant="outline">
              Continue Manually
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!plan) {
    return (
      <Card className="border-dashed border-2">
        <CardContent className="flex flex-col items-center justify-center py-10 text-center space-y-4">
          <div className="p-3 bg-muted rounded-full text-muted-foreground">
            <Bot className="w-8 h-8" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">No Response Plan Yet</h3>
            <p className="text-muted-foreground text-sm max-w-sm mt-1">
              Prepare a suggested response plan from the issue details, or continue manually.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleGenerate} disabled={generating} className="space-x-2">
              <Bot className="w-4 h-4" />
              <span>{generating ? "Preparing..." : "Prepare Response Plan"}</span>
            </Button>
            <Button onClick={handleManualFallback} variant="outline">
              Continue Manually
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <Card className="overflow-hidden border border-amber-200/50 bg-amber-50/10">
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-xl flex items-center gap-2">
              {plan.modelProvider === "manual" ? <User className="w-5 h-5 text-blue-500" /> : <Bot className="w-5 h-5 text-amber-500" />}
              <span>
                {plan.modelProvider === "manual" ? "Manual Coordination Workspace" : "Response Plan Review"}
              </span>
            </CardTitle>
            <CardDescription>
              Review suggested departments, tasks, dependencies, and timelines before activation.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {plan.status === "ACTIVATED" ? (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 text-xs font-semibold rounded-full border border-green-200">
                <CheckCircle className="w-3.5 h-3.5" />
                Active Operations
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 text-xs font-semibold rounded-full border border-amber-200">
                <ShieldAlert className="w-3.5 h-3.5" />
                Human Review Gate
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          {plan.status !== "ACTIVATED" && (
            <div className="flex items-start gap-3 p-3 bg-amber-50/50 rounded-lg border border-amber-200/40 text-sm">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-medium text-amber-900">Review Required</h4>
                <p className="text-amber-800 text-xs leading-relaxed">
                  This is a draft response plan. Review the departments, tasks, and timelines before activating it.
                </p>
              </div>
            </div>
          )}

          {/* Fallback Plan Banner */}
          {(plan.is_fallback || plan.isFallback) && (
            <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm">
              <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-semibold text-yellow-700">Rule-Based Fallback Draft</h4>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  The automated planning system was busy or timed out. This is a standard fallback template. You can customize the tasks below or retry planning.
                </p>
              </div>
            </div>
          )}

          {/* Explainability Block */}
          {(explanation || plan?.validated_plan?.executiveSummary || plan?.validated_plan?.citizenImpact) && (
            <div className="p-4 bg-muted/30 rounded-xl border space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5 border-b pb-1">
                <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
                Proposed Action Strategy & Impact Analysis
              </h4>
              
              {plan?.validated_plan?.executiveSummary && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide block">Executive Summary</span>
                  <p className="text-xs font-medium text-foreground">{plan.validated_plan.executiveSummary}</p>
                </div>
              )}

              {explanation && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide block">Strategic Reasons</span>
                  <p className="text-xs text-muted-foreground italic leading-relaxed">{explanation}</p>
                </div>
              )}

              {plan?.validated_plan?.citizenImpact && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide block">Citizen Impact</span>
                  <p className="text-xs font-medium text-teal-600 dark:text-teal-400">{plan.validated_plan.citizenImpact}</p>
                </div>
              )}
            </div>
          )}

          {/* Model Meta Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-3 bg-background rounded-md border text-center">
              <span className="text-muted-foreground block mb-0.5">Confidence Score</span>
              <span className="font-semibold text-base">{(plan.confidence || 0) * 100}%</span>
            </div>
            <div className="p-3 bg-background rounded-md border text-center">
              <span className="text-muted-foreground block mb-0.5">Complexity Risk</span>
              <span className="font-semibold text-base uppercase">{plan.riskLevel || "MEDIUM"}</span>
            </div>
            <div className="p-3 bg-background rounded-md border text-center">
              <span className="text-muted-foreground block mb-0.5">Plan Version</span>
              <span className="font-semibold text-base">
                {plan.status === "ACTIVATED" ? "Active Version 1" : "Draft Version 1"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Department Work Orders section */}
      <Card className="my-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-primary" />
              <span>Department Work Orders</span>
            </div>
            <span className="text-xs text-muted-foreground">PDF Packages</span>
          </CardTitle>
          <CardDescription>
            Download or generate department-specific official work orders.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {participants.map((p) => {
              const wo = workOrders.find((w) => w.department_key === p.department);
              
              return (
                <div key={p.department} className="flex items-center justify-between p-3 border rounded-lg bg-card text-xs">
                  <div>
                    <span className="font-semibold text-sm capitalize">{p.department.replace("_", " ")}</span>
                    <span className="text-[10px] text-muted-foreground ml-2 uppercase font-bold tracking-wide">
                      {p.participation_role}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {wo ? (
                      <>
                        {wo.status === "READY" && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-7 text-xs"
                            onClick={() => handleDownloadWorkOrder(wo.storage_path)}
                          >
                            Preview & Download
                          </Button>
                        )}
                        {wo.status === "GENERATING" && (
                          <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                            Generating...
                          </span>
                        )}
                        {wo.status === "FAILED" && (
                          <>
                            <span className="text-destructive font-semibold mr-2">Failed</span>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-7 text-xs border-destructive text-destructive hover:bg-destructive/5"
                              onClick={() => handleGenerateWorkOrder(p.department)}
                              disabled={generatingWo[p.department]}
                            >
                              {generatingWo[p.department] ? "Generating..." : "Retry Document"}
                            </Button>
                          </>
                        )}
                      </>
                    ) : (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-7 text-xs"
                        onClick={() => handleGenerateWorkOrder(p.department)}
                        disabled={generatingWo[p.department]}
                      >
                        {generatingWo[p.department] ? "Generating..." : "Generate Document"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {plan.status !== "ACTIVATED" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: RACI Participants */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-4 h-4" />
                <span>Department Responsibilities</span>
              </CardTitle>
              <CardDescription>Assign departmental responsibilities.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {participants.map((p) => (
                  <div key={p.department} className="flex items-center justify-between p-2.5 bg-background border rounded-lg text-sm">
                    <div>
                      <span className="font-medium capitalize">{p.department.replace("_", " ")}</span>
                      <span className="block text-xs text-muted-foreground max-w-[200px] truncate" title={p.responsibility_reason}>
                        {p.responsibility_reason}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        p.participation_role === "LEAD" 
                          ? "bg-rose-100 text-rose-700 border border-rose-200" 
                          : "bg-blue-100 text-blue-700 border border-blue-200"
                      }`}>
                        {p.participation_role}
                      </span>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveParticipant(p.department)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {participants.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4 italic">No participants defined.</p>
                )}
              </div>

              {/* Add Participant Form */}
              <div className="pt-2 border-t space-y-2">
                <h4 className="text-xs font-semibold">Add Supporting Department</h4>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={newPartDept} onValueChange={setNewPartDept}>
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map((d) => (
                        <SelectItem key={d.val} value={d.val} className="text-xs">{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={newPartRole} onValueChange={setNewPartRole}>
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r.val} value={r.val} className="text-xs">{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Input 
                    placeholder="Reason..." 
                    className="text-xs h-8" 
                    value={newPartReason}
                    onChange={(e) => setNewPartReason(e.target.value)}
                  />
                  <Button size="sm" className="h-8" onClick={handleAddParticipant}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Column 2 & 3: Task Flow DAG & Sequencing */}
          <div className="lg:col-span-2 space-y-6">
            {/* Task list and editor */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Edit3 className="w-4 h-4" />
                    <span>Action Plan</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{tasks.length} total tasks</span>
                </CardTitle>
                <CardDescription>Outline required operational steps and SLA limits.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {tasks.map((t) => (
                    <div key={t.temp_id || t.tempId} className="p-3 bg-background border rounded-lg text-sm space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-primary">{t.temp_id || t.tempId}</span>
                        <div className="flex items-center gap-2">
                          <span className="capitalize text-xs font-medium px-2 py-0.5 bg-muted rounded border">
                            {t.department.replace("_", " ")}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            t.priority === "CRITICAL" ? "bg-red-100 text-red-700" :
                            t.priority === "HIGH" ? "bg-orange-100 text-orange-700" :
                            "bg-slate-100 text-slate-700"
                          }`}>
                            {t.priority}
                          </span>
                          <span className="text-xs text-muted-foreground">{t.sla_duration_minutes || t.slaDurationMinutes}m SLA</span>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveTask(t.temp_id || t.tempId)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <h5 className="font-medium text-xs mt-1">{t.title}</h5>
                      <p className="text-xs text-muted-foreground leading-relaxed">{t.description}</p>
                      
                      {/* Field Instructions & Safety Notes */}
                      {(t.completion_evidence_rules?.fieldInstructions || t.completion_evidence_rules?.safetyNotes) && (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 bg-muted/30 border rounded text-[11px] leading-relaxed">
                          {t.completion_evidence_rules?.fieldInstructions && (
                            <div>
                              <strong className="text-muted-foreground">📋 Field Instructions:</strong>
                              <p className="text-foreground mt-0.5">{t.completion_evidence_rules.fieldInstructions}</p>
                            </div>
                          )}
                          {t.completion_evidence_rules?.safetyNotes && (
                            <div>
                              <strong className="text-amber-700">⚠️ Safety Notes:</strong>
                              <p className="text-foreground mt-0.5">{t.completion_evidence_rules.safetyNotes}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Evidence Checklist */}
                      {Array.isArray(t.completion_evidence_rules?.evidenceChecklist) && t.completion_evidence_rules.evidenceChecklist.length > 0 && (
                        <div className="mt-2 text-[11px]">
                          <strong className="text-muted-foreground block mb-1">✅ Quality Checklist:</strong>
                          <ul className="list-disc pl-4 space-y-0.5 text-foreground">
                            {t.completion_evidence_rules.evidenceChecklist.map((item: string, idx: number) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                  {tasks.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8 italic">No tasks created yet.</p>
                  )}
                </div>

                {/* Add Task Form */}
                <div className="pt-3 border-t space-y-2">
                  <h4 className="text-xs font-semibold">Add Action Step</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Select value={newTaskDept} onValueChange={setNewTaskDept}>
                      <SelectTrigger className="text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DEPARTMENTS.map((d) => (
                          <SelectItem key={d.val} value={d.val} className="text-xs">{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={newTaskPriority} onValueChange={setNewTaskPriority}>
                      <SelectTrigger className="text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LOW" className="text-xs">LOW</SelectItem>
                        <SelectItem value="MEDIUM" className="text-xs">MEDIUM</SelectItem>
                        <SelectItem value="HIGH" className="text-xs">HIGH</SelectItem>
                        <SelectItem value="CRITICAL" className="text-xs">CRITICAL</SelectItem>
                      </SelectContent>
                    </Select>

                    <div className="flex items-center gap-1.5 bg-background border rounded px-2 h-8 text-xs">
                      <span className="text-muted-foreground font-medium">SLA:</span>
                      <input 
                        type="number" 
                        className="w-full bg-transparent focus:outline-none text-right font-medium" 
                        value={newTaskSLA}
                        onChange={(e) => setNewTaskSLA(Number(e.target.value))}
                      />
                      <span className="text-muted-foreground">min</span>
                    </div>
                  </div>
                  <Input 
                    placeholder="Task title (e.g. Stop the water main valve leak)" 
                    className="text-xs h-8"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Textarea 
                      placeholder="Execution instructions details..." 
                      className="text-xs min-h-[60px] py-1.5"
                      value={newTaskDesc}
                      onChange={(e) => setNewTaskDesc(e.target.value)}
                    />
                    <Button className="self-end h-8 space-x-1" onClick={handleAddTask}>
                      <Plus className="w-4 h-4" />
                      <span>Add</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Dependency block */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowRight className="w-4 h-4" />
                  <span>Work Order & Dependencies</span>
                </CardTitle>
                <CardDescription>Block next steps until previous actions are completed.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Current dependencies list */}
                  <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                    {dependencies.map((d, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-muted/40 border rounded text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-primary">{d.predecessor_temp_id || d.predecessorTempId}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="font-semibold text-primary">{d.successor_temp_id || d.successorTempId}</span>
                          <span className="text-muted-foreground italic truncate max-w-[100px] ml-1">({d.reason})</span>
                        </div>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveDependency(
                            d.predecessor_temp_id || d.predecessorTempId,
                            d.successor_temp_id || d.successorTempId
                          )}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                    {dependencies.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4 italic">No dependency rules established.</p>
                    )}
                  </div>

                  {/* Add Dependency Form */}
                  <div className="p-3 bg-muted/40 border rounded-lg space-y-2">
                    <h4 className="text-xs font-semibold">Set Work Dependency</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase font-semibold">Must Finish First</label>
                        <Select value={newDepPred} onValueChange={setNewDepPred}>
                          <SelectTrigger className="text-xs h-7">
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            {tasks.map((t) => (
                              <SelectItem key={t.temp_id || t.tempId} value={t.temp_id || t.tempId}>
                                {t.temp_id || t.tempId} - {t.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase font-semibold">Starts Next</label>
                        <Select value={newDepSucc} onValueChange={setNewDepSucc}>
                          <SelectTrigger className="text-xs h-7">
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            {tasks.map((t) => (
                              <SelectItem key={t.temp_id || t.tempId} value={t.temp_id || t.tempId}>
                                {t.temp_id || t.tempId} - {t.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Input 
                        placeholder="Dependency Reason..." 
                        className="text-xs h-7"
                        value={newDepReason}
                        onChange={(e) => setNewDepReason(e.target.value)}
                      />
                      <Button size="sm" className="h-7 text-xs" onClick={handleAddDependency}>
                        Add Dependency
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Activated Read-Only View */}
      {plan.status === "ACTIVATED" && (
        <Card className="border border-green-200 bg-green-50/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-green-700">
              <CheckCircle className="w-4 h-4" />
              <span>Active Multi-Department Execution Graph</span>
            </CardTitle>
            <CardDescription className="text-green-600/80">
              This case is active. Task dispatch, handoffs, and escalations are managed in the operational views.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-2">
            {/* Display active participants */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Assigned Department Responsibilities</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {participants.map((p) => (
                  <div key={p.department} className="p-3 bg-background border rounded-lg text-sm flex justify-between items-center shadow-xs">
                    <div>
                      <span className="font-semibold capitalize text-foreground">{p.department.replace("_", " ")}</span>
                      <span className="block text-[10px] text-muted-foreground max-w-[150px] truncate">{p.responsibility_reason}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      p.participation_role === "LEAD" ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-700"
                    }`}>
                      {p.participation_role}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Display active task blocks */}
            <div className="space-y-2 pt-2 border-t">
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Dispatched Operations</h4>
              <div className="space-y-2">
                {tasks.map((t) => (
                  <div key={t.temp_id || t.tempId} className="p-3.5 bg-background border rounded-lg text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-primary">{t.temp_id || t.tempId}</span>
                        <h5 className="font-medium text-foreground text-xs">{t.title}</h5>
                      </div>
                      <p className="text-xs text-muted-foreground max-w-xl leading-relaxed">{t.description}</p>
                    </div>
                    <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                      <span className="capitalize text-xs font-medium px-2 py-0.5 bg-muted rounded border">
                        {t.department.replace("_", " ")}
                      </span>
                      <span className="text-xs text-muted-foreground">{t.sla_duration_minutes || t.slaDurationMinutes}m SLA</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Control Buttons */}
      {plan.status !== "ACTIVATED" && (
        <div className="flex justify-end gap-3 pt-2">
          <Button 
            variant="outline" 
            onClick={handleGenerate}
            disabled={generating || saving || activating}
          >
            {generating ? "Preparing..." : "Prepare Response Plan"}
          </Button>
          <Button 
            variant="outline" 
            onClick={handleSaveChanges}
            disabled={saving || activating}
            className="space-x-1.5"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? "Saving..." : "Save Draft"}</span>
          </Button>
          <Button 
            onClick={handleApproveAndActivate}
            disabled={activating || saving}
            className="bg-green-600 hover:bg-green-700 text-white space-x-1.5"
          >
            <CheckCircle className="w-4 h-4" />
            <span>{activating ? "Activating..." : "Approve and Activate"}</span>
          </Button>
        </div>
      )}
    </div>
  );
};
