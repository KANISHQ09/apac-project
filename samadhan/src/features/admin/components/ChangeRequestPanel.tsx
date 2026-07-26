import React, { useState, useEffect } from "react";
import { Plus, ArrowRight, UserPlus, GitCommit, CheckSquare, RefreshCw, XSquare, Check } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Issue, CoordinationChangeRequest, TaskTransferRequest } from "@/shared/types/domain/Issue";
import { handoffService } from "@/features/coordination";
import { DEPARTMENT_META } from "../pages/AdminPage";
import { supabase } from "@/integrations/supabase/client";
import { normalizeDepartmentKey } from "@/features/admin/hooks/useAdminDashboard";

export function ChangeRequestPanel({
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
  const [changeRequests, setChangeRequests] = useState<CoordinationChangeRequest[]>([]);
  const [transferRequests, setTransferRequests] = useState<TaskTransferRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [reqType, setReqType] = useState<any>("ADD_DEPARTMENT");
  const [proposedDept, setProposedDept] = useState("");
  const [reason, setReason] = useState("");

  const [transferTaskId, setTransferTaskId] = useState("");
  const [transferTargetDept, setTransferTargetDept] = useState("");
  const [transferReason, setTransferReason] = useState("");

  const tasks = issue.tasks || [];

  const loadRequests = async () => {
    try {
      setLoading(true);
      const { data: changes, error: errC } = await fetchChangeRequests(issue.id);
      const { data: transfers, error: errT } = await fetchTransferRequests(issue.id);
      if (!errC && changes) setChangeRequests(changes);
      if (!errT && transfers) setTransferRequests(transfers);
    } catch (err) {
      console.error("Failed to load rerouting requests:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchChangeRequests = async (caseId: string) => {
    const { data, error } = await supabase
      .from("coordination_change_requests")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false });
    return { data: data?.map((r: any) => handoffService.mapChangeRequestResponse(r)), error };
  };

  const fetchTransferRequests = async (caseId: string) => {
    const { data, error } = await supabase
      .from("task_transfer_requests")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false });
    return { data: data?.map((r: any) => handoffService.mapTransferRequestResponse(r)), error };
  };

  useEffect(() => {
    loadRequests();
  }, [issue.id]);

  const handleCreateChangeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;
    try {
      await handoffService.createChangeRequest({
        caseId: issue.id,
        requestedBy: userId,
        requestingDepartment: userDepartment || "coordinator",
        requestType: reqType,
        proposedDepartment: proposedDept || undefined,
        reason,
      });
      setReason("");
      setProposedDept("");
      loadRequests();
      onRefresh();
    } catch (err: any) {
      alert(err.message || "Failed to create change request");
    }
  };

  const handleCreateTransferRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferTaskId || !transferTargetDept || !transferReason) return;
    try {
      await handoffService.createTransferRequest({
        caseId: issue.id,
        taskId: transferTaskId,
        fromDepartment: userDepartment || "coordinator",
        proposedToDepartment: transferTargetDept,
        reason: transferReason,
        requestedBy: userId,
      });
      setTransferTaskId("");
      setTransferTargetDept("");
      setTransferReason("");
      loadRequests();
      onRefresh();
    } catch (err: any) {
      alert(err.message || "Failed to create transfer request");
    }
  };

  const handleActionChangeRequest = async (reqId: string, approve: boolean) => {
    try {
      if (approve) {
        await handoffService.approveChangeRequest(reqId, userId);
      } else {
        await handoffService.rejectChangeRequest(reqId, userId);
      }
      loadRequests();
      onRefresh();
    } catch (err: any) {
      alert(err.message || "Failed to action change request");
    }
  };

  const handleActionTransferRequest = async (transId: string, approve: boolean) => {
    try {
      if (approve) {
        await handoffService.approveTransferRequest(transId, userId);
      } else {
        await handoffService.rejectTransferRequest(transId, userId);
      }
      loadRequests();
      onRefresh();
    } catch (err: any) {
      alert(err.message || "Failed to action transfer request");
    }
  };

  return (
    <div className="mt-6 pt-6 border-t border-border space-y-6">
      {/* Forms Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Dynamic Rerouting Request */}
        <form onSubmit={handleCreateChangeRequest} className="bg-muted/20 p-4 rounded-xl border border-dashed space-y-3">
          <h5 className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5 text-indigo-500" />
            {activeLanguage === "en" ? "Request Coordination Rerouting" : "समन्वय पुनर्रूटिंग का अनुरोध करें"}
          </h5>
          <div className="grid grid-cols-2 gap-2">
            <Select value={reqType} onValueChange={setReqType}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Request Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADD_DEPARTMENT">Add Department</SelectItem>
                <SelectItem value="REMOVE_DEPARTMENT">Remove Department</SelectItem>
                <SelectItem value="EMERGENCY_SUPPORT">Emergency Support</SelectItem>
              </SelectContent>
            </Select>

            <Select value={proposedDept} onValueChange={setProposedDept}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Target Dept" />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(DEPARTMENT_META).map((dept) => {
                  const meta = DEPARTMENT_META[dept];
                  return (
                    <SelectItem key={dept} value={dept} className="text-xs">
                      {activeLanguage === "en" ? meta.labelEn : meta.labelHi}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <Input
            placeholder="Operational justification for changes..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-8 text-xs"
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" className="h-8 text-xs" disabled={!reason}>
              Submit Change Request
            </Button>
          </div>
        </form>

        {/* Task Ownership Transfer Request */}
        {(() => {
          const transferableTasks = tasks.filter((t) => {
            const isCompletedOrCancelled = t.taskStatus === "COMPLETED" || t.taskStatus === "CANCELLED";
            const isMyDept = normalizeDepartmentKey(t.department) === normalizeDepartmentKey(userDepartment);
            return !isCompletedOrCancelled && isMyDept;
          });

          const availableTargetDepts = Object.keys(DEPARTMENT_META).filter(
            (dept) => dept !== "all" && normalizeDepartmentKey(dept) !== normalizeDepartmentKey(userDepartment)
          );

          return (
            <form onSubmit={handleCreateTransferRequest} className="bg-muted/20 p-4 rounded-xl border border-dashed space-y-3">
              <h5 className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
                {activeLanguage === "en" ? "Request Task Transfer" : "कार्य हस्तांतरण का अनुरोध करें"}
              </h5>
              <div className="grid grid-cols-2 gap-2">
                {transferableTasks.length === 0 ? (
                  <Select disabled value="">
                    <SelectTrigger className="h-8 text-xs bg-muted/40 text-muted-foreground border-dashed">
                      <SelectValue placeholder="No transferable tasks available" />
                    </SelectTrigger>
                  </Select>
                ) : (
                  <Select value={transferTaskId} onValueChange={setTransferTaskId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select Task" />
                    </SelectTrigger>
                    <SelectContent>
                      {transferableTasks.map((t) => (
                        <SelectItem key={t.id} value={t.id} className="text-xs">
                          {t.taskCode} — {t.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Select value={transferTargetDept} onValueChange={setTransferTargetDept}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="New Owner Dept" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTargetDepts.map((dept) => {
                      const meta = DEPARTMENT_META[dept];
                      return (
                        <SelectItem key={dept} value={dept} className="text-xs">
                          {activeLanguage === "en" ? meta.labelEn : meta.labelHi}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <Input
                placeholder="Transfer justification..."
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                className="h-8 text-xs"
              />
              <div className="flex justify-end">
                <Button type="submit" size="sm" className="h-8 text-xs" disabled={!transferTaskId || !transferTargetDept || !transferReason}>
                  Submit Transfer Request
                </Button>
              </div>
            </form>
          );
        })()}
      </div>

      {/* Requests Ledger List */}
      <div className="space-y-4">
        {/* Coordination Change Requests */}
        {changeRequests.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <h6 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Change Request Log</h6>
            <div className="space-y-2">
              {changeRequests.map((cr) => (
                <div key={cr.id} className="p-3 border rounded-xl bg-card flex justify-between items-start gap-4">
                  <div className="text-xs space-y-1">
                    <p className="font-bold">{cr.requestType.replace("_", " ")} — {cr.proposedDepartment?.replace("_", " ")}</p>
                    <p className="text-muted-foreground">Reason: "{cr.reason}"</p>
                    <p className="text-[10px] text-muted-foreground font-mono">Status: {cr.status}</p>
                  </div>
                  {isSuperAdmin && cr.status === "PENDING" && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        className="w-7 h-7 bg-green-600 hover:bg-green-700"
                        onClick={() => handleActionChangeRequest(cr.id, true)}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="destructive"
                        className="w-7 h-7"
                        onClick={() => handleActionChangeRequest(cr.id, false)}
                      >
                        <XSquare className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Task Transfer Requests */}
        {transferRequests.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <h6 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Task Transfer Log</h6>
            <div className="space-y-2">
              {transferRequests.map((tr) => {
                const task = tasks.find(t => t.id === tr.taskId);
                return (
                  <div key={tr.id} className="p-3 border rounded-xl bg-card flex justify-between items-start gap-4">
                    <div className="text-xs space-y-1">
                      <p className="font-bold">Transfer task {task?.taskCode || "?"} to {tr.proposedToDepartment.replace("_", " ")}</p>
                      <p className="text-muted-foreground">Reason: "{tr.reason}"</p>
                      <p className="text-[10px] text-muted-foreground font-mono">Status: {tr.status}</p>
                    </div>
                    {isSuperAdmin && tr.status === "PENDING" && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          className="w-7 h-7 bg-green-600 hover:bg-green-700"
                          onClick={() => handleActionTransferRequest(tr.id, true)}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="destructive"
                          className="w-7 h-7"
                          onClick={() => handleActionTransferRequest(tr.id, false)}
                        >
                          <XSquare className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
