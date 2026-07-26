import React from "react";
import { Issue } from "@/shared/types/domain/Issue";
import { CoordinationPlanReview } from "./CoordinationPlanReview";
import { PanelErrorBoundary } from "@/shared/components/PanelErrorBoundary";

interface CoordinationSectionProps {
  issue: Issue;
  isSuperAdmin: boolean;
  activeLanguage: "en" | "hi";
  onRefresh: () => void;
}

export const CoordinationSection: React.FC<CoordinationSectionProps> = ({
  issue,
  onRefresh,
}) => {
  const showSection =
    issue.coordinationType === "multi_department" ||
    issue.coordinationType === "emergency" ||
    issue.aiStatus === "done" ||
    ["reported", "triage", "accepted", "plan_review", "plan_approved"].includes(issue.status);

  if (!showSection) {
    return null;
  }

  return (
    <div className="mt-6 border-t pt-6">
      <PanelErrorBoundary panelName="Coordination Blueprint">
        <CoordinationPlanReview caseId={issue.id} onPlanActivated={onRefresh} />
      </PanelErrorBoundary>
    </div>
  );
};
