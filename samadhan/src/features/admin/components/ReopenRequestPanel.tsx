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
import { Badge } from "@/shared/components/ui/badge";
import { Loader2, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import type { CaseReopenRequest } from "@/shared/types/domain/Issue";

interface ReopenRequestPanelProps {
  currentUserId: string;
}

const REASON_LABELS: Record<string, string> = {
  ISSUE_PERSISTS: "Issue Persists",
  ISSUE_RECURRED: "Issue Recurred",
  PARTIAL_RESOLUTION: "Partial Resolution",
  UNSAFE_CONDITION: "Unsafe Condition",
  WRONG_LOCATION_FIXED: "Wrong Location Fixed",
  EVIDENCE_DISPUTE: "Evidence Dispute",
  OTHER: "Other",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  APPROVED: "bg-green-500/20 text-green-400 border-green-500/30",
  REJECTED: "bg-red-500/20 text-red-400 border-red-500/30",
  WITHDRAWN: "bg-muted/50 text-muted-foreground",
};

export const ReopenRequestPanel: React.FC<ReopenRequestPanelProps> = ({ currentUserId }) => {
  const { toast } = useToast();
  const [requests, setRequests] = useState<CaseReopenRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await closureService.getPendingReopenRequests();
      setRequests(data);
    } catch (err: any) {
      toast({ title: "Failed to load reopen requests", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("reopen-requests-panel")
      .on("postgres_changes", { event: "*", schema: "public", table: "case_reopen_requests" }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const handleReview = async (requestId: string, decision: "APPROVED" | "REJECTED") => {
    const reason = reviewReason[requestId];
    if (!reason?.trim()) {
      toast({ title: "Review reason required", variant: "destructive" });
      return;
    }
    setReviewing(requestId);
    try {
      await closureService.reviewReopenRequest(requestId, decision, reason, currentUserId);
      toast({
        title: decision === "APPROVED" ? "Reopen approved — Case reopened" : "Reopen rejected",
        description: decision === "APPROVED" ? "Departments have been notified." : "Request has been closed.",
      });
      load();
    } catch (err: any) {
      toast({ title: "Review failed", description: err.message, variant: "destructive" });
    } finally {
      setReviewing(null);
    }
  };

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="flex items-center gap-3 py-6">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Loading reopen requests...</span>
        </CardContent>
      </Card>
    );
  }

  if (requests.length === 0) {
    return (
      <Card className="border-border/50">
        <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
          <CheckCircle2 className="w-8 h-8 text-green-500/50" />
          <p className="text-sm font-medium text-muted-foreground">No pending reopen requests</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Pending Reopen Requests ({requests.length})
        </h3>
        <Button variant="ghost" size="sm" onClick={load}>
          <RefreshCw className="w-3 h-3" />
        </Button>
      </div>

      {requests.map((req) => (
        <Card key={req.id} className="border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <CardTitle className="text-sm">Case #{req.caseId.slice(0, 8)}…</CardTitle>
              </div>
              <Badge className={STATUS_COLORS[req.status] || ""}>
                {req.status}
              </Badge>
            </div>
            <CardDescription>
              {REASON_LABELS[req.reasonCode]} · Cycle {req.closureCycle} · Submitted {new Date(req.createdAt).toLocaleDateString()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{req.description}</p>

            {req.evidenceUrls.length > 0 && (
              <div className="text-xs text-primary">
                {req.evidenceUrls.length} evidence file(s) attached
              </div>
            )}

            {req.status === "PENDING" && (
              <div className="space-y-2">
                <textarea
                  value={reviewReason[req.id] || ""}
                  onChange={(e) => setReviewReason((prev) => ({ ...prev, [req.id]: e.target.value }))}
                  placeholder="Review decision reason..."
                  className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background resize-none h-16"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => handleReview(req.id, "APPROVED")}
                    disabled={reviewing === req.id}
                  >
                    {reviewing === req.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                    Approve Reopen
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                    onClick={() => handleReview(req.id, "REJECTED")}
                    disabled={reviewing === req.id}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
