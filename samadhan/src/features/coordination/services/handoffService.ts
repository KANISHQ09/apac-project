import { supabase } from "@/integrations/supabase/client";
import { APIError } from "@/shared/errors/errors";
import { TaskHandoff, HandoffEvidence, CoordinationChangeRequest, TaskTransferRequest } from "@/shared/types/domain/Issue";

export interface SubmitHandoffInput {
  caseId: string;
  sourceTaskId: string;
  targetTaskId: string;
  note: string;
  actorId: string;
  evidenceFiles?: { file: File; type: string; lat?: number; lng?: number }[];
}

export const handoffService = {
  mapHandoffResponse(raw: any): TaskHandoff {
    return {
      id: raw.id,
      caseId: raw.case_id,
      sourceTaskId: raw.source_task_id,
      targetTaskId: raw.target_task_id,
      fromDepartment: raw.from_department,
      toDepartment: raw.to_department,
      handoffStatus: raw.handoff_status,
      revisionNumber: raw.revision_number,
      submissionNote: raw.submission_note,
      acceptanceNote: raw.acceptance_note,
      rejectionReason: raw.rejection_reason,
      submittedBy: raw.submitted_by,
      submittedAt: new Date(raw.submitted_at),
      reviewedBy: raw.reviewed_by,
      reviewedAt: raw.reviewed_at ? new Date(raw.reviewed_at) : null,
      supersedesHandoffId: raw.supersedes_handoff_id,
      version: raw.version,
      createdAt: new Date(raw.created_at),
      updatedAt: new Date(raw.updated_at),
      evidence: raw.handoff_evidence
        ? raw.handoff_evidence.map((ev: any) => this.mapEvidenceResponse(ev))
        : [],
    };
  },

  mapEvidenceResponse(raw: any): HandoffEvidence {
    return {
      id: raw.id,
      handoffId: raw.handoff_id,
      evidenceType: raw.evidence_type,
      storagePath: raw.storage_path,
      publicUrl: raw.public_url,
      latitude: raw.latitude ? Number(raw.latitude) : null,
      longitude: raw.longitude ? Number(raw.longitude) : null,
      capturedAt: raw.captured_at ? new Date(raw.captured_at) : null,
      uploadedBy: raw.uploaded_by,
      metadata: raw.metadata,
      checksum: raw.checksum,
      createdAt: new Date(raw.created_at),
    };
  },

  mapChangeRequestResponse(raw: any): CoordinationChangeRequest {
    return {
      id: raw.id,
      caseId: raw.case_id,
      requestedBy: raw.requested_by,
      requestingDepartment: raw.requesting_department,
      requestType: raw.request_type,
      proposedDepartment: raw.proposed_department,
      reason: raw.reason,
      status: raw.status,
      reviewedBy: raw.reviewed_by,
      reviewedAt: raw.reviewed_at ? new Date(raw.reviewed_at) : null,
      resolutionNote: raw.resolution_note,
      createdAt: new Date(raw.created_at),
      updatedAt: new Date(raw.updated_at),
    };
  },

  mapTransferRequestResponse(raw: any): TaskTransferRequest {
    return {
      id: raw.id,
      caseId: raw.case_id,
      taskId: raw.task_id,
      fromDepartment: raw.from_department,
      proposedToDepartment: raw.proposed_to_department,
      reason: raw.reason,
      status: raw.status,
      requestedBy: raw.requested_by,
      reviewedBy: raw.reviewed_by,
      createdAt: new Date(raw.created_at),
      resolvedAt: raw.resolved_at ? new Date(raw.resolved_at) : null,
    };
  },

  async submitHandoff(input: SubmitHandoffInput): Promise<TaskHandoff> {
    // 1. Submit handoff database record
    const { data: handoffData, error: handoffError } = await supabase
      .rpc("submit_task_handoff", {
        p_case_id: input.caseId,
        p_source_task_id: input.sourceTaskId,
        p_target_task_id: input.targetTaskId,
        p_note: input.note,
        p_actor_id: input.actorId,
      });

    if (handoffError) throw new APIError(handoffError.message, undefined, handoffError);

    const handoff = this.mapHandoffResponse(handoffData);

    // 2. Upload any evidence files to bucket and insert metadata records
    if (input.evidenceFiles && input.evidenceFiles.length > 0) {
      for (const item of input.evidenceFiles) {
        const fileExt = item.file.name.split(".").pop();
        const filePath = `handoff-evidence/${handoff.id}/${crypto.randomUUID()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("issue-images") // Re-use issue-images bucket as it's preconfigured
          .upload(filePath, item.file);

        if (uploadError) {
          console.error("Evidence upload failed:", uploadError);
          continue;
        }

        const { data: publicUrlData } = supabase.storage
          .from("issue-images")
          .getPublicUrl(filePath);

        // Save evidence row
        await supabase.from("handoff_evidence").insert({
          handoff_id: handoff.id,
          evidence_type: item.type,
          storage_path: filePath,
          public_url: publicUrlData.publicUrl,
          latitude: item.lat || null,
          longitude: item.lng || null,
          captured_at: new Date().toISOString(),
          uploaded_by: input.actorId,
        });
      }
    }

    return handoff;
  },

  async acceptHandoff(handoffId: string, note: string, actorId: string): Promise<TaskHandoff> {
    const { data, error } = await supabase
      .rpc("accept_task_handoff", {
        p_handoff_id: handoffId,
        p_note: note,
        p_actor_id: actorId,
      });

    if (error) throw new APIError(error.message, undefined, error);
    return this.mapHandoffResponse(data);
  },

  async rejectHandoff(handoffId: string, reason: string, actorId: string): Promise<TaskHandoff> {
    const { data, error } = await supabase
      .rpc("reject_task_handoff", {
        p_handoff_id: handoffId,
        p_reason: reason,
        p_actor_id: actorId,
      });

    if (error) throw new APIError(error.message, undefined, error);
    return this.mapHandoffResponse(data);
  },

  async getCaseHandoffs(caseId: string): Promise<TaskHandoff[]> {
    const { data, error } = await supabase
      .from("task_handoffs")
      .select("*, handoff_evidence(*)")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false });

    if (error) throw new APIError(error.message, undefined, error);
    return (data || []).map((r) => this.mapHandoffResponse(r));
  },

  async createChangeRequest(input: {
    caseId: string;
    requestedBy: string;
    requestingDepartment: string;
    requestType: "ADD_DEPARTMENT" | "REMOVE_DEPARTMENT" | "CHANGE_LEAD" | "ADD_TASK" | "RESEQUENCE" | "EMERGENCY_SUPPORT";
    proposedDepartment?: string;
    reason: string;
  }): Promise<CoordinationChangeRequest> {
    const { data, error } = await supabase
      .from("coordination_change_requests")
      .insert({
        case_id: input.caseId,
        requested_by: input.requestedBy,
        requesting_department: input.requestingDepartment,
        request_type: input.requestType,
        proposed_department: input.proposedDepartment || null,
        reason: input.reason,
        status: "PENDING",
      })
      .select()
      .single();

    if (error) throw new APIError(error.message, undefined, error);

    // Timeline event
    await supabase.from("workflow_events").insert({
      case_id: input.caseId,
      actor_id: input.requestedBy,
      event_type: "PRIVILEGED_OVERRIDE",
      metadata: { reason: `Coordination change requested: ${input.requestType} - ${input.reason}` },
    });

    return this.mapChangeRequestResponse(data);
  },

  async approveChangeRequest(requestId: string, reviewerId: string, note?: string): Promise<CoordinationChangeRequest> {
    const { data: request, error: fetchError } = await supabase
      .from("coordination_change_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (fetchError || !request) throw new APIError("Request not found", undefined, fetchError);

    // Apply the coordinate change dynamically
    if (request.request_type === "ADD_DEPARTMENT" && request.proposed_department) {
      // Add to case participations
      await supabase.from("case_participations").insert({
        case_id: request.case_id,
        department: request.proposed_department,
        participation_role: "SUPPORTING",
        status: "ACTIVE",
        responsibility_reason: request.reason,
      });
    } else if (request.request_type === "REMOVE_DEPARTMENT" && request.proposed_department) {
      await supabase
        .from("case_participations")
        .update({ status: "REMOVED" })
        .eq("case_id", request.case_id)
        .eq("department", request.proposed_department);
    }

    const { data, error } = await supabase
      .from("coordination_change_requests")
      .update({
        status: "APPROVED",
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        resolution_note: note || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .select()
      .single();

    if (error) throw new APIError(error.message, undefined, error);

    // Timeline event
    await supabase.from("workflow_events").insert({
      case_id: request.case_id,
      actor_id: reviewerId,
      event_type: "PRIVILEGED_OVERRIDE",
      metadata: { reason: `Coordination change request approved: ${request.request_type}` },
    });

    return this.mapChangeRequestResponse(data);
  },

  async rejectChangeRequest(requestId: string, reviewerId: string, note?: string): Promise<CoordinationChangeRequest> {
    const { data, error } = await supabase
      .from("coordination_change_requests")
      .update({
        status: "REJECTED",
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        resolution_note: note || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .select()
      .single();

    if (error) throw new APIError(error.message, undefined, error);
    return this.mapChangeRequestResponse(data);
  },

  async createTransferRequest(input: {
    caseId: string;
    taskId: string;
    fromDepartment: string;
    proposedToDepartment: string;
    reason: string;
    requestedBy: string;
  }): Promise<TaskTransferRequest> {
    const { data, error } = await supabase
      .from("task_transfer_requests")
      .insert({
        case_id: input.caseId,
        task_id: input.taskId,
        from_department: input.fromDepartment,
        proposed_to_department: input.proposedToDepartment,
        reason: input.reason,
        status: "PENDING",
        requested_by: input.requestedBy,
      })
      .select()
      .single();

    if (error) throw new APIError(error.message, undefined, error);
    return this.mapTransferRequestResponse(data);
  },

  async approveTransferRequest(transferId: string, reviewerId: string): Promise<TaskTransferRequest> {
    const { data: request, error: fetchError } = await supabase
      .from("task_transfer_requests")
      .select("*")
      .eq("id", transferId)
      .single();

    if (fetchError || !request) throw new APIError("Transfer request not found", undefined, fetchError);

    // Atomically transfer task ownership
    const { error: taskUpdateError } = await supabase
      .from("department_tasks")
      .update({
        department: request.proposed_to_department,
        task_status: "ASSIGNED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", request.task_id);

    if (taskUpdateError) throw new APIError(taskUpdateError.message, undefined, taskUpdateError);

    const { data, error } = await supabase
      .from("task_transfer_requests")
      .update({
        status: "ACCEPTED",
        reviewed_by: reviewerId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", transferId)
      .select()
      .single();

    if (error) throw new APIError(error.message, undefined, error);

    // Timeline event
    await supabase.from("workflow_events").insert({
      case_id: request.case_id,
      task_id: request.task_id,
      actor_id: reviewerId,
      event_type: "PRIVILEGED_OVERRIDE",
      metadata: { reason: `Task transferred from ${request.from_department} to ${request.proposed_to_department}` },
    });

    return this.mapTransferRequestResponse(data);
  },

  async rejectTransferRequest(transferId: string, reviewerId: string): Promise<TaskTransferRequest> {
    const { data, error } = await supabase
      .from("task_transfer_requests")
      .update({
        status: "REJECTED",
        reviewed_by: reviewerId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", transferId)
      .select()
      .single();

    if (error) throw new APIError(error.message, undefined, error);
    return this.mapTransferRequestResponse(data);
  }
};
