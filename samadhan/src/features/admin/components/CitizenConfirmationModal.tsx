import React, { useState } from "react";
import { closureService } from "@/features/coordination";
import { useToast } from "@/shared/hooks/use-toast";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import type { CaseReopenRequest } from "@/shared/types/domain/Issue";

type ReasonCode = CaseReopenRequest["reasonCode"];

const REASON_OPTIONS: { value: ReasonCode; label: string; desc: string }[] = [
  { value: "ISSUE_PERSISTS", label: "Issue Still Present", desc: "The problem has not been fixed" },
  { value: "ISSUE_RECURRED", label: "Problem Came Back", desc: "The issue was fixed but recurred" },
  { value: "PARTIAL_RESOLUTION", label: "Partially Fixed", desc: "Only part of the problem was resolved" },
  { value: "UNSAFE_CONDITION", label: "Unsafe Condition", desc: "There is a safety hazard remaining" },
  { value: "WRONG_LOCATION_FIXED", label: "Wrong Location", desc: "The wrong area or address was worked on" },
  { value: "EVIDENCE_DISPUTE", label: "Evidence Dispute", desc: "Claimed completion evidence is inaccurate" },
  { value: "OTHER", label: "Other", desc: "Other reason not listed above" },
];

interface CitizenConfirmationModalProps {
  caseId: string;
  caseNumber: string;
  citizenId: string;
  onClose: () => void;
  onReopenSubmitted: () => void;
}

export const CitizenConfirmationModal: React.FC<CitizenConfirmationModalProps> = ({
  caseId,
  caseNumber,
  citizenId,
  onClose,
  onReopenSubmitted,
}) => {
  const { toast } = useToast();
  const [step, setStep] = useState<"initial" | "reopen_form">("initial");
  const [reasonCode, setReasonCode] = useState<ReasonCode>("ISSUE_PERSISTS");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleConfirmResolved = async () => {
    setSubmitting(true);
    try {
      await closureService.submitCitizenConfirmation(caseId, citizenId, "CONFIRMED_RESOLVED");
      toast({
        title: "Thank you for confirming",
        description: "Your confirmation has been recorded. The case is marked as resolved.",
      });
      onClose();
    } catch (err: any) {
      toast({ title: "Confirmation failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReopen = async () => {
    if (!description.trim()) {
      toast({ title: "Description required", description: "Please describe the issue.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await closureService.submitCitizenConfirmation(caseId, citizenId, "STILL_NOT_FIXED", description, reasonCode);
      await closureService.requestReopen(caseId, citizenId, reasonCode, description);
      toast({
        title: "Reopen request submitted",
        description: "A coordinator will review your request and take action if warranted.",
      });
      onReopenSubmitted();
      onClose();
    } catch (err: any) {
      toast({ title: "Submission failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            {step === "initial" ? (
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            ) : (
              <RefreshCw className="w-5 h-5 text-amber-500" />
            )}
            <div>
              <h3 className="font-semibold">
                {step === "initial" ? "Is your issue resolved?" : "Submit Reopen Request"}
              </h3>
              <p className="text-xs text-muted-foreground">{caseNumber}</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {step === "initial" && (
            <>
              <p className="text-sm text-muted-foreground">
                The municipal team has jointly closed your case. Please tell us if your issue
                has actually been resolved.
              </p>
              <div className="grid gap-3">
                <Button
                  onClick={handleConfirmResolved}
                  disabled={submitting}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  ✓ Yes, my issue is resolved
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setStep("reopen_form")}
                  className="w-full border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                >
                  ✗ No, still not fixed — request reopen
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                "Still not fixed" creates a reviewed reopen request. A coordinator will evaluate it.
              </p>
            </>
          )}

          {step === "reopen_form" && (
            <>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Reason for reopen request</label>
                <Select
                  value={reasonCode}
                  onValueChange={(v) => setReasonCode(v as ReasonCode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REASON_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div>
                          <div className="font-medium">{opt.label}</div>
                          <div className="text-xs text-muted-foreground">{opt.desc}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Describe the remaining problem *</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe exactly what is still wrong, where the problem is, and any changes since the original report..."
                  className="resize-none"
                  rows={4}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleSubmitReopen}
                  disabled={submitting}
                  className="flex-1 bg-amber-600 hover:bg-amber-700"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Submit Request
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setStep("initial")}
                  disabled={submitting}
                >
                  Back
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
