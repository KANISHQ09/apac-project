import { supabase } from "@/integrations/supabase/client";
import {
  SLAInstance,
  Escalation,
  CommissionerIntervention,
  TaskBlocker,
  SLAExceptionRequest,
} from "@/shared/types/domain/Issue";
import {
  RawSLAInstance,
  RawEscalation,
  RawCommissionerIntervention,
  RawTaskBlocker,
  RawSLAExceptionRequest,
} from "@/shared/contracts/IssueResponse";
import { logger } from "@/shared/services/logger";

class SLAService {
  public mapSLAInstanceResponse(raw: RawSLAInstance): SLAInstance {
    return {
      id: raw.id,
      caseId: raw.case_id,
      entityType: raw.entity_type as any,
      entityId: raw.entity_id,
      policyId: raw.policy_id,
      clockType: raw.clock_type as any,
      startedAt: new Date(raw.started_at),
      dueAt: new Date(raw.due_at),
      pausedAt: raw.paused_at ? new Date(raw.paused_at) : null,
      resumedAt: raw.resumed_at ? new Date(raw.resumed_at) : null,
      completedAt: raw.completed_at ? new Date(raw.completed_at) : null,
      breachedAt: raw.breached_at ? new Date(raw.breached_at) : null,
      status: raw.status as any,
      pauseReason: raw.pause_reason,
      accumulatedPauseSeconds: raw.accumulated_pause_seconds,
      version: raw.version,
      createdAt: new Date(raw.created_at),
      updatedAt: new Date(raw.updated_at),
    };
  }

  public mapEscalationResponse(raw: RawEscalation): Escalation {
    return {
      id: raw.id,
      caseId: raw.case_id,
      sourceEntityType: raw.source_entity_type as any,
      sourceEntityId: raw.source_entity_id,
      slaInstanceId: raw.sla_instance_id,
      escalationPolicyId: raw.escalation_policy_id,
      currentLevel: raw.current_level,
      severity: raw.severity as any,
      escalationType: raw.escalation_type as any,
      status: raw.status as any,
      rootCauseDepartment: raw.root_cause_department,
      reasonCode: raw.reason_code,
      reasonDetail: raw.reason_detail,
      firstEscalatedAt: new Date(raw.first_escalated_at),
      lastEscalatedAt: new Date(raw.last_escalated_at),
      acknowledgedBy: raw.acknowledged_by,
      acknowledgedAt: raw.acknowledged_at ? new Date(raw.acknowledged_at) : null,
      resolvedBy: raw.resolved_by,
      resolvedAt: raw.resolved_at ? new Date(raw.resolved_at) : null,
      version: raw.version,
      createdAt: new Date(raw.created_at),
      updatedAt: new Date(raw.updated_at),
    };
  }

  public mapInterventionResponse(raw: RawCommissionerIntervention): CommissionerIntervention {
    return {
      id: raw.id,
      caseId: raw.case_id,
      escalationId: raw.escalation_id,
      interventionType: raw.intervention_type as any,
      targetTaskId: raw.target_task_id,
      targetDepartment: raw.target_department,
      initiatedBy: raw.initiated_by,
      reason: raw.reason,
      instruction: raw.instruction,
      previousState: raw.previous_state,
      resultingState: raw.resulting_state,
      status: raw.status,
      createdAt: new Date(raw.created_at),
      completedAt: raw.completed_at ? new Date(raw.completed_at) : null,
    };
  }

  public mapBlockerResponse(raw: RawTaskBlocker): TaskBlocker {
    return {
      id: raw.id,
      caseId: raw.case_id,
      taskId: raw.task_id,
      blockerType: raw.blocker_type as any,
      blockingDepartment: raw.blocking_department,
      externalReference: raw.external_reference,
      reason: raw.reason,
      status: raw.status as any,
      declaredBy: raw.declared_by,
      declaredAt: new Date(raw.declared_at),
      resolvedBy: raw.resolved_by,
      resolvedAt: raw.resolved_at ? new Date(raw.resolved_at) : null,
    };
  }

  public mapExceptionResponse(raw: RawSLAExceptionRequest): SLAExceptionRequest {
    return {
      id: raw.id,
      slaInstanceId: raw.sla_instance_id,
      requestedBy: raw.requested_by,
      reasonCode: raw.reason_code,
      justification: raw.justification,
      requestedExtensionMinutes: raw.requested_extension_minutes,
      status: raw.status as any,
      reviewedBy: raw.reviewed_by,
      reviewedAt: raw.reviewed_at ? new Date(raw.reviewed_at) : null,
      decisionNote: raw.decision_note,
    };
  }

  public async getSLAInstances(caseId: string): Promise<SLAInstance[]> {
    const { data, error } = await supabase
      .from("sla_instances")
      .select("*")
      .eq("case_id", caseId);

    if (error) {
      logger.error(`Failed to get SLA instances: ${error.message}`);
      return [];
    }
    return (data || []).map((d) => this.mapSLAInstanceResponse(d as any));
  }

  public async getEscalations(caseId?: string): Promise<Escalation[]> {
    let query = supabase.from("escalations").select("*");
    if (caseId) {
      query = query.eq("case_id", caseId);
    }

    const { data, error } = await query;
    if (error) {
      logger.error(`Failed to get escalations: ${error.message}`);
      return [];
    }
    return (data || []).map((d) => this.mapEscalationResponse(d as any));
  }

  public async getDownstreamImpact(taskId: string): Promise<any[]> {
    const { data, error } = await supabase.rpc("get_downstream_impact", {
      p_task_id: taskId,
    });

    if (error) {
      logger.error(`Failed to get downstream impact: ${error.message}`);
      return [];
    }
    return data || [];
  }

  public async declareTaskBlocker(payload: {
    caseId: string;
    taskId: string;
    blockerType: string;
    blockingDepartment?: string;
    reason: string;
    declaredBy: string;
  }): Promise<TaskBlocker | null> {
    const { data, error } = await supabase
      .from("task_blockers")
      .insert({
        case_id: payload.caseId,
        task_id: payload.taskId,
        blocker_type: payload.blockerType,
        blocking_department: payload.blockingDepartment || null,
        reason: payload.reason,
        declared_by: payload.declaredBy,
        status: "ACTIVE",
      })
      .select("*")
      .single();

    if (error) {
      logger.error(`Failed to declare task blocker: ${error.message}`);
      return null;
    }
    return this.mapBlockerResponse(data as any);
  }

  public async resolveTaskBlocker(blockerId: string, actorId: string): Promise<boolean> {
    const { error } = await supabase
      .from("task_blockers")
      .update({
        status: "RESOLVED",
        resolved_by: actorId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", blockerId);

    if (error) {
      logger.error(`Failed to resolve task blocker: ${error.message}`);
      return false;
    }
    return true;
  }

  public async submitSLAExceptionRequest(payload: {
    slaInstanceId: string;
    justification: string;
    extensionMinutes: number;
    requestedBy: string;
  }): Promise<SLAExceptionRequest | null> {
    const { data, error } = await supabase
      .from("sla_exception_requests")
      .insert({
        sla_instance_id: payload.slaInstanceId,
        justification: payload.justification,
        requested_extension_minutes: payload.extensionMinutes,
        requested_by: payload.requestedBy,
        status: "PENDING",
      })
      .select("*")
      .single();

    if (error) {
      logger.error(`Failed to submit SLA exception request: ${error.message}`);
      return null;
    }
    return this.mapExceptionResponse(data as any);
  }

  public async applyIntervention(payload: {
    caseId: string;
    escalationId?: string | null;
    type: string;
    targetTaskId?: string | null;
    targetDepartment?: string | null;
    reason: string;
    instruction: string;
    actorId: string;
  }): Promise<CommissionerIntervention | null> {
    const { data, error } = await supabase.rpc("apply_commissioner_intervention", {
      p_case_id: payload.caseId,
      p_escalation_id: payload.escalationId || null,
      p_type: payload.type,
      p_target_task_id: payload.targetTaskId || null,
      p_target_dept: payload.targetDepartment || null,
      p_reason: payload.reason,
      p_instruction: payload.instruction,
      p_actor_id: payload.actorId,
    });

    if (error) {
      logger.error(`Failed to apply commissioner intervention: ${error.message}`);
      return null;
    }
    return this.mapInterventionResponse(data as any);
  }

  public async triggerEvaluator(demoTimeOffsetMinutes: number): Promise<boolean> {
    const { error } = await supabase.rpc("evaluate_coordination_escalations", {
      p_demo_time_offset_minutes: demoTimeOffsetMinutes,
    });

    if (error) {
      logger.error(`Failed to trigger evaluator: ${error.message}`);
      return false;
    }
    return true;
  }
}

export const slaService = new SLAService();
