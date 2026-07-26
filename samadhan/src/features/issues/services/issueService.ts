import { issueRepository } from "../repositories/issueRepository";
import { Issue } from "@/shared/types/domain/Issue";
import { IssueResponse } from "@/shared/contracts/IssueResponse";
import { IssueStatus } from "@/shared/types/domain/IssueStatus";
import { CATEGORIES, CATEGORY_LABELS } from "@/shared/constants/categories";
import { STATUSES } from "@/shared/constants/statuses";
import { supabase } from "@/integrations/supabase/client";

export const issueService = {
  mapResponseToDomain(raw: IssueResponse): Issue {
    // Standardize status strings to domain enum
    let status = IssueStatus.REPORTED;
    const rawStatusNormalized = raw.status?.replace("-", "_").toLowerCase();
    if (Object.values(IssueStatus).includes(rawStatusNormalized as any)) {
      status = rawStatusNormalized as IssueStatus;
    }

    return {
      id: raw.id,
      userId: raw.user_id,
      title: raw.title,
      description: raw.description || "",
      category: raw.category, // Map raw category directly, client translates if needed
      location: raw.location || "",
      status,
      imageUrls: raw.image_urls || [],
      supportsCount: raw.supports_count || 0,
      masterIssueId: raw.master_issue_id || null,
      latitude: raw.latitude,
      longitude: raw.longitude,
      createdAt: new Date(raw.created_at),
      updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
      caseNumber: raw.case_number || undefined,
      coordinationType: raw.coordination_type || undefined,
      coordinationStatus: raw.coordination_status || undefined,
      leadDepartment: raw.lead_department || undefined,
      coordinationStartedAt: raw.coordination_started_at ? new Date(raw.coordination_started_at) : undefined,
      dataOrigin: raw.data_origin || null,
      aiProvider: raw.ai_provider || null,
      aiModel: raw.ai_model || null,
      aiAnalyzedAt: raw.ai_analyzed_at ? new Date(raw.ai_analyzed_at) : null,
      aiConfidence: raw.ai_confidence !== undefined ? Number(raw.ai_confidence) : null,
      aiStatus: (() => {
        const status = raw.ai_status || null;
        if (status === "pending" || status === "analyzing") {
          const startedAtStr = raw.ai_request_started_at || raw.created_at;
          const startedAt = startedAtStr ? new Date(startedAtStr).getTime() : 0;
          if (startedAt > 0 && (Date.now() - startedAt) > 15000) {
            return "failed";
          }
        }
        return status;
      })(),
      aiRequestStartedAt: raw.ai_request_started_at ? new Date(raw.ai_request_started_at) : null,
      aiResponseReceivedAt: raw.ai_response_received_at ? new Date(raw.ai_response_received_at) : undefined,
      aiPlanReadyAt: raw.ai_plan_ready_at ? new Date(raw.ai_plan_ready_at) : undefined,
      aiLatencyMs: raw.ai_latency_ms || undefined,
      aiDetectedIssue: raw.ai_detected_issue || null,
      aiReason: raw.ai_reason || null,
      aiRisk: raw.ai_risk || null,
      aiPriority: raw.ai_priority || null,
      aiObjects: raw.ai_objects || null,
      aiCategory: raw.ai_category || null,
      aiSupportingDepartments: raw.ai_supporting_departments || null,
      aiRequiresMultipleDepartments: raw.ai_requires_multiple_departments || null,
      aiEstimatedResponseTime: raw.ai_estimated_response_time || null,
      aiDetectionTimeMs: raw.ai_detection_time_ms || null,
      aiCitizenCorrected: raw.ai_citizen_corrected || null,
      participations: raw.case_participations
        ? raw.case_participations.map((p) => ({
            id: p.id,
            caseId: p.case_id,
            department: p.department,
            participationRole: p.participation_role as any,
            status: p.status as any,
            responsibilityReason: p.responsibility_reason,
            joinedAt: new Date(p.joined_at),
          }))
        : undefined,
      tasks: raw.department_tasks
        ? raw.department_tasks.map((t) => ({
            id: t.id,
            caseId: t.case_id,
            department: t.department,
            taskCode: t.task_code,
            title: t.title,
            description: t.description,
            taskStatus: t.task_status as any,
            priority: t.priority as any,
            assignedBy: t.assigned_by,
            assignedTo: t.assigned_to,
            acceptedBy: t.accepted_by,
            acceptedAt: t.accepted_at ? new Date(t.accepted_at) : null,
            startedAt: t.started_at ? new Date(t.started_at) : null,
            completedAt: t.completed_at ? new Date(t.completed_at) : null,
            blockedAt: t.blocked_at ? new Date(t.blocked_at) : null,
            blockedReason: t.blocked_reason,
            rejectionReason: t.rejection_reason,
            dueAt: t.due_at ? new Date(t.due_at) : null,
            version: t.version,
            createdAt: new Date(t.created_at),
            updatedAt: new Date(t.updated_at),
          }))
        : undefined,
      handoffs: raw.task_handoffs
        ? raw.task_handoffs.map((h) => ({
            id: h.id,
            caseId: h.case_id,
            sourceTaskId: h.source_task_id,
            targetTaskId: h.target_task_id,
            fromDepartment: h.from_department,
            toDepartment: h.to_department,
            handoffStatus: h.handoff_status as any,
            revisionNumber: h.revision_number,
            submissionNote: h.submission_note,
            acceptanceNote: h.acceptance_note,
            rejectionReason: h.rejection_reason,
            submittedBy: h.submitted_by,
            submittedAt: new Date(h.submitted_at),
            reviewedBy: h.reviewed_by,
            reviewedAt: h.reviewed_at ? new Date(h.reviewed_at) : null,
            supersedesHandoffId: h.supersedes_handoff_id,
            version: h.version,
            createdAt: new Date(h.created_at),
            updatedAt: new Date(h.updated_at),
            evidence: h.handoff_evidence
              ? h.handoff_evidence.map((ev) => ({
                  id: ev.id,
                  handoffId: ev.handoff_id,
                  evidenceType: ev.evidence_type as any,
                  storagePath: ev.storage_path,
                  publicUrl: ev.public_url,
                  latitude: ev.latitude,
                  longitude: ev.longitude,
                  capturedAt: ev.captured_at ? new Date(ev.captured_at) : null,
                  uploadedBy: ev.uploaded_by,
                  metadata: ev.metadata,
                  checksum: ev.checksum,
                  createdAt: new Date(ev.created_at),
                }))
              : [],
          }))
        : undefined,
      changeRequests: raw.coordination_change_requests
        ? raw.coordination_change_requests.map((cr) => ({
            id: cr.id,
            caseId: cr.case_id,
            requestedBy: cr.requested_by,
            requestingDepartment: cr.requesting_department,
            requestType: cr.request_type as any,
            proposedDepartment: cr.proposed_department,
            reason: cr.reason,
            status: cr.status as any,
            reviewedBy: cr.reviewed_by,
            reviewedAt: cr.reviewed_at ? new Date(cr.reviewed_at) : null,
            resolutionNote: cr.resolution_note,
            createdAt: new Date(cr.created_at),
            updatedAt: new Date(cr.updated_at),
          }))
        : undefined,
      transferRequests: raw.task_transfer_requests
        ? raw.task_transfer_requests.map((tr) => ({
            id: tr.id,
            caseId: tr.case_id,
            taskId: tr.task_id,
            fromDepartment: tr.from_department,
            proposedToDepartment: tr.proposed_to_department,
            reason: tr.reason,
            status: tr.status as any,
            requestedBy: tr.requested_by,
            reviewedBy: tr.reviewed_by,
            createdAt: new Date(tr.created_at),
            resolvedAt: tr.resolved_at ? new Date(tr.resolved_at) : null,
          }))
        : undefined,
      coordinationPlans: raw.ai_coordination_plans
        ? raw.ai_coordination_plans.map((cp: any) => ({
            id: cp.id,
            caseId: cp.case_id,
            status: cp.status,
            aiPlanParticipants: cp.ai_plan_participants,
            aiPlanTasks: cp.ai_plan_tasks,
          }))
        : undefined,
    };
  },

  getCategoryLabel(id: string, language: "en" | "hi"): string {
    const key = id.toLowerCase() as keyof typeof CATEGORY_LABELS;
    const label = CATEGORY_LABELS[key];
    return label ? label[language] : id;
  },

  async reportNewIssue(
    userId: string,
    input: { 
      title: string; 
      description: string; 
      category: string; 
      location: string; 
      latitude?: number | null; 
      longitude?: number | null;
      dataOrigin?: string | null;
      aiProvider?: string | null;
      aiModel?: string | null;
      aiConfidence?: number | null;
      aiReason?: string | null;
      aiRisk?: string | null;
      aiPriority?: string | null;
      aiCategory?: string | null;
      aiSupportingDepartments?: string[] | null;
      aiRequiresMultipleDepartments?: boolean | null;
      aiEstimatedResponseTime?: string | null;
      aiDetectionTimeMs?: number | null;
      aiCitizenCorrected?: boolean | null;
    },
    imageFile: File | null,
    activeLanguage: "en" | "hi"
  ): Promise<Issue> {
    let imageUrls: string[] = [];

    if (imageFile) {
      const publicUrl = await issueRepository.uploadIssueImage(userId, imageFile);
      imageUrls = [publicUrl];
    }

    // Standardize category storage in DB using canonical label regardless of active UI language
    const dbCategoryName = this.getCategoryLabel(input.category, "en");

    const raw = await issueRepository.insertIssue({
      user_id: userId,
      title: input.title,
      description: input.description,
      category: dbCategoryName,
      location: input.location,
      status: STATUSES.REPORTED,
      image_urls: imageUrls.length ? imageUrls : null,
      latitude: input.latitude || null,
      longitude: input.longitude || null,
      data_origin: input.dataOrigin || "citizen_live",
      ai_provider: input.aiProvider || null,
      ai_model: input.aiModel || null,
      ai_confidence: input.aiConfidence || null,
      ai_reason: input.aiReason || null,
      ai_risk: input.aiRisk || null,
      ai_priority: input.aiPriority || null,
      ai_category: input.aiCategory || null,
      ai_supporting_departments: input.aiSupportingDepartments || null,
      ai_requires_multiple_departments: input.aiRequiresMultipleDepartments || null,
      ai_estimated_response_time: input.aiEstimatedResponseTime || null,
      ai_detection_time_ms: input.aiDetectionTimeMs || null,
      ai_citizen_corrected: input.aiCitizenCorrected || null,
    });

    // Trigger AI classification asynchronously in the background so citizen submission is immediate
    supabase.functions.invoke("classify-issue", {
      body: { caseId: raw.id },
    }).then(async ({ data, error }) => {
      if (error) {
        console.error("Background AI classification failed:", error);
        await supabase
          .from("reported_issues")
          .update({ ai_status: "failed" })
          .eq("id", raw.id);
      } else {
        console.log("Background AI classification finished:", data);
      }
    }).catch(async (err) => {
      console.error("Background AI classification exception:", err);
      await supabase
        .from("reported_issues")
        .update({ ai_status: "failed" })
        .eq("id", raw.id);
    });

    return this.mapResponseToDomain(raw);
  },

  async toggleSupport(issueId: string, userId: string, currentlySupported: boolean): Promise<number> {
    if (currentlySupported) {
      await issueRepository.removeSupport(issueId, userId);
      return -1;
    } else {
      await issueRepository.addSupport(issueId, userId);
      return 1;
    }
  },

  async getIssueById(issueId: string): Promise<Issue> {
    const raw = await issueRepository.fetchIssueById(issueId);
    return this.mapResponseToDomain(raw);
  },

  async fetchAllIssuesForMap(): Promise<Issue[]> {
    const raw = await issueRepository.fetchAllIssuesForMap();
    return raw.map((r) => this.mapResponseToDomain(r));
  },
};
