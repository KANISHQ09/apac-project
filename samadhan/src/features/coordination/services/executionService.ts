import { supabase } from "@/integrations/supabase/client";
import { DepartmentTask, TaskDependency, WorkflowEvent } from "@/shared/types/domain/Issue";
import { APIError } from "@/shared/errors/errors";

export interface CreateTaskInput {
  caseId: string;
  department: string;
  taskCode: string;
  title: string;
  description?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  assignedBy: string;
}

export const executionService = {
  mapTaskResponse(raw: any): DepartmentTask {
    return {
      id: raw.id,
      caseId: raw.case_id,
      department: raw.department,
      taskCode: raw.task_code,
      title: raw.title,
      description: raw.description,
      taskStatus: raw.task_status,
      priority: raw.priority,
      assignedBy: raw.assigned_by,
      assignedTo: raw.assigned_to,
      acceptedBy: raw.accepted_by,
      acceptedAt: raw.accepted_at ? new Date(raw.accepted_at) : null,
      startedAt: raw.started_at ? new Date(raw.started_at) : null,
      completedAt: raw.completed_at ? new Date(raw.completed_at) : null,
      blockedAt: raw.blocked_at ? new Date(raw.blocked_at) : null,
      blockedReason: raw.blocked_reason,
      rejectionReason: raw.rejection_reason,
      dueAt: raw.due_at ? new Date(raw.due_at) : null,
      version: raw.version,
      completionEvidenceRules: raw.completion_evidence_rules,
      createdAt: new Date(raw.created_at),
      updatedAt: new Date(raw.updated_at),
    };
  },

  mapDependencyResponse(raw: any): TaskDependency {
    return {
      id: raw.id,
      caseId: raw.case_id,
      predecessorTaskId: raw.predecessor_task_id,
      successorTaskId: raw.successor_task_id,
      dependencyType: raw.dependency_type,
      createdBy: raw.created_by,
      createdAt: new Date(raw.created_at),
    };
  },

  mapWorkflowEventResponse(raw: any): WorkflowEvent {
    return {
      id: raw.id,
      caseId: raw.case_id,
      taskId: raw.task_id,
      actorId: raw.actor_id,
      actorDepartment: raw.actor_department,
      eventType: raw.event_type,
      fromStatus: raw.from_status,
      toStatus: raw.to_status,
      metadata: raw.metadata,
      createdAt: new Date(raw.created_at),
    };
  },

  async createDepartmentTask(input: CreateTaskInput): Promise<DepartmentTask> {
    const { data, error } = await supabase
      .from("department_tasks")
      .insert({
        case_id: input.caseId,
        department: input.department,
        task_code: input.taskCode,
        title: input.title,
        description: input.description || null,
        priority: input.priority || "MEDIUM",
        assigned_by: input.assignedBy,
        task_status: "ASSIGNED",
      })
      .select()
      .single();

    if (error) throw new APIError(error.message, undefined, error);

    // Log event
    await supabase.from("workflow_events").insert({
      case_id: input.caseId,
      task_id: data.id,
      actor_id: input.assignedBy,
      event_type: "TASK_CREATED",
      to_status: "ASSIGNED",
      metadata: { reason: "Task created manually" },
    });

    return this.mapTaskResponse(data);
  },

  async getCaseTasks(caseId: string): Promise<DepartmentTask[]> {
    const { data, error } = await supabase
      .from("department_tasks")
      .select("*")
      .eq("case_id", caseId)
      .order("task_code", { ascending: true });

    if (error) throw new APIError(error.message, undefined, error);
    return (data || []).map((r) => this.mapTaskResponse(r));
  },

  async getCaseDependencies(caseId: string): Promise<TaskDependency[]> {
    const { data, error } = await supabase
      .from("task_dependencies")
      .select("*")
      .eq("case_id", caseId);

    if (error) throw new APIError(error.message, undefined, error);
    return (data || []).map((r) => this.mapDependencyResponse(r));
  },

  async getWorkflowEvents(caseId: string): Promise<WorkflowEvent[]> {
    const { data, error } = await supabase
      .from("workflow_events")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: true });

    if (error) throw new APIError(error.message, undefined, error);
    return (data || []).map((r) => this.mapWorkflowEventResponse(r));
  },

  async addDependency(caseId: string, predecessorId: string, successorId: string, actorId: string): Promise<TaskDependency> {
    const { data, error } = await supabase
      .from("task_dependencies")
      .insert({
        case_id: caseId,
        predecessor_task_id: predecessorId,
        successor_task_id: successorId,
        dependency_type: "FINISH_TO_START",
        created_by: actorId,
      })
      .select()
      .single();

    if (error) throw new APIError(error.message, undefined, error);

    // After adding dependency, update successor task status to WAITING_DEPENDENCY if predecessor is not complete
    const { data: predecessor } = await supabase
      .from("department_tasks")
      .select("task_status")
      .eq("id", predecessorId)
      .single();

    const { data: successor } = await supabase
      .from("department_tasks")
      .select("task_status")
      .eq("id", successorId)
      .single();

    if (predecessor && successor && predecessor.task_status !== "COMPLETED" && successor.task_status === "READY") {
      await supabase
        .from("department_tasks")
        .update({ task_status: "WAITING_DEPENDENCY" })
        .eq("id", successorId);
    }

    // Log event
    await supabase.from("workflow_events").insert({
      case_id: caseId,
      actor_id: actorId,
      event_type: "DEPENDENCY_ADDED",
      metadata: { predecessor_id: predecessorId, successor_id: successorId },
    });

    return this.mapDependencyResponse(data);
  },

  async removeDependency(caseId: string, dependencyId: string, actorId: string): Promise<void> {
    const { data: dep } = await supabase
      .from("task_dependencies")
      .select("predecessor_task_id, successor_task_id")
      .eq("id", dependencyId)
      .single();

    const { error } = await supabase
      .from("task_dependencies")
      .delete()
      .eq("id", dependencyId);

    if (error) throw new APIError(error.message, undefined, error);

    if (dep) {
      // Recompute successor status
      const { data: successor } = await supabase
        .from("department_tasks")
        .select("id, task_status")
        .eq("id", dep.successor_task_id)
        .single();

      if (successor && successor.task_status === "WAITING_DEPENDENCY") {
        // Check if there are other incomplete predecessors
        const { data: activeDeps } = await supabase
          .from("task_dependencies")
          .select("predecessor_task_id")
          .eq("successor_task_id", successor.id);

        let allCompleted = true;
        if (activeDeps && activeDeps.length > 0) {
          const predIds = activeDeps.map(d => d.predecessor_task_id);
          const { data: incompletePreds } = await supabase
            .from("department_tasks")
            .select("id")
            .in("id", predIds)
            .neq("task_status", "COMPLETED");
          if (incompletePreds && incompletePreds.length > 0) {
            allCompleted = false;
          }
        }

        if (allCompleted) {
          await supabase
            .from("department_tasks")
            .update({ task_status: "READY" })
            .eq("id", successor.id);
        }
      }
    }

    // Log event
    await supabase.from("workflow_events").insert({
      case_id: caseId,
      actor_id: actorId,
      event_type: "DEPENDENCY_REMOVED",
      metadata: { dependency_id: dependencyId },
    });
  },

  async transitionTask(taskId: string, targetStatus: string, actorId: string, reason?: string): Promise<DepartmentTask> {
    const { data, error } = await supabase
      .rpc("transition_department_task", {
        p_task_id: taskId,
        p_new_status: targetStatus,
        p_actor_id: actorId,
        p_reason: reason || null,
      });

    if (error) throw new APIError(error.message, undefined, error);
    return this.mapTaskResponse(data);
  }
};
