import { supabase } from "@/integrations/supabase/client";
import { CaseParticipation } from "@/shared/types/domain/Issue";
import { APIError } from "@/shared/errors/errors";

export interface AddParticipationInput {
  caseId: string;
  department: string;
  participationRole: "LEAD" | "RESPONSIBLE" | "SUPPORTING" | "CONSULTED" | "OBSERVER";
  responsibilityReason?: string;
  addedBy?: string;
  addedSource: "INITIAL_CATEGORY" | "HUMAN_COORDINATOR" | "SUPER_ADMIN" | "SYSTEM_BACKFILL";
}

export const coordinationService = {
  mapResponseToDomain(raw: any): CaseParticipation {
    return {
      id: raw.id,
      caseId: raw.case_id,
      department: raw.department,
      participationRole: raw.participation_role,
      status: raw.status,
      responsibilityReason: raw.responsibility_reason,
      joinedAt: new Date(raw.joined_at),
    };
  },

  async getCaseParticipations(caseId: string): Promise<CaseParticipation[]> {
    const { data, error } = await supabase
      .from("case_participations")
      .select("*")
      .eq("case_id", caseId)
      .eq("status", "ACTIVE")
      .order("joined_at", { ascending: true });

    if (error) throw new APIError(error.message, undefined, error);
    return (data || []).map((r) => this.mapResponseToDomain(r));
  },

  async addCaseParticipation(input: AddParticipationInput): Promise<CaseParticipation> {
    // 1. If the added role is LEAD, check if there's already an active LEAD and change it atomically
    if (input.participationRole === "LEAD") {
      const activeParticipations = await this.getCaseParticipations(input.caseId);
      const existingLead = activeParticipations.find(p => p.participationRole === "LEAD");
      if (existingLead) {
        // Demote existing lead to RESPONSIBLE atomically before adding new lead
        // Or perform this in a transaction or call RPC.
        // We will call the RPC if defined, or execute updates. Let's do it in database client sequence.
        const { error: demoteError } = await supabase
          .from("case_participations")
          .update({ participation_role: "RESPONSIBLE" })
          .eq("id", existingLead.id);
        if (demoteError) throw new APIError(demoteError.message, undefined, demoteError);
      }
    }

    const { data, error } = await supabase
      .from("case_participations")
      .insert({
        case_id: input.caseId,
        department: input.department,
        participation_role: input.participationRole,
        responsibility_reason: input.responsibilityReason || null,
        added_by: input.addedBy || null,
        added_source: input.addedSource,
        status: "ACTIVE"
      })
      .select()
      .single();

    if (error) throw new APIError(error.message, undefined, error);

    // Sync reported_issues lead_department if role is LEAD
    if (input.participationRole === "LEAD") {
      const activeParts = await this.getCaseParticipations(input.caseId);
      const isMulti = activeParts.length > 1;
      const { error: updateIssueError } = await supabase
        .from("reported_issues")
        .update({ 
          lead_department: input.department,
          coordination_type: isMulti ? "multi_department" : "single_department"
        })
        .eq("id", input.caseId);
      if (updateIssueError) throw new APIError(updateIssueError.message, undefined, updateIssueError);
    }

    return this.mapResponseToDomain(data);
  },

  async updateParticipationRole(
    participationId: string, 
    role: "LEAD" | "RESPONSIBLE" | "SUPPORTING" | "CONSULTED" | "OBSERVER",
    reason?: string
  ): Promise<CaseParticipation> {
    // If setting to LEAD, we must demote existing lead on the same case
    if (role === "LEAD") {
      const { data: currentPart } = await supabase
        .from("case_participations")
        .select("case_id")
        .eq("id", participationId)
        .single();
      
      if (currentPart?.case_id) {
        const activeParts = await this.getCaseParticipations(currentPart.case_id);
        const existingLead = activeParts.find(p => p.participationRole === "LEAD" && p.id !== participationId);
        if (existingLead) {
          const { error: demoteError } = await supabase
            .from("case_participations")
            .update({ participation_role: "RESPONSIBLE" })
            .eq("id", existingLead.id);
          if (demoteError) throw new APIError(demoteError.message, undefined, demoteError);
        }
      }
    }

    const { data, error } = await supabase
      .from("case_participations")
      .update({ 
        participation_role: role,
        responsibility_reason: reason || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", participationId)
      .select()
      .single();

    if (error) throw new APIError(error.message, undefined, error);

    // Sync reported_issues lead_department if role is LEAD
    if (role === "LEAD") {
      const { error: updateIssueError } = await supabase
        .from("reported_issues")
        .update({ lead_department: data.department })
        .eq("id", data.case_id);
      if (updateIssueError) throw new APIError(updateIssueError.message, undefined, updateIssueError);
    }

    return this.mapResponseToDomain(data);
  },

  async removeCaseParticipation(participationId: string, reason?: string): Promise<void> {
    const { data: partData, error: fetchError } = await supabase
      .from("case_participations")
      .select("case_id, participation_role, department")
      .eq("id", participationId)
      .single();

    if (fetchError) throw new APIError(fetchError.message, undefined, fetchError);

    if (partData.participation_role === "LEAD") {
      throw new Error("Cannot remove the LEAD department. Transfer the LEAD role to another department first.");
    }

    const { error } = await supabase
      .from("case_participations")
      .update({ 
        status: "REMOVED",
        responsibility_reason: reason || "Removed from case",
        removed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", participationId);

    if (error) throw new APIError(error.message, undefined, error);
  },

  async getLeadDepartment(caseId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from("case_participations")
      .select("department")
      .eq("case_id", caseId)
      .eq("participation_role", "LEAD")
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (error) throw new APIError(error.message, undefined, error);
    return data?.department || null;
  },

  async generateAICoordinationPlan(caseId: string): Promise<any> {
    const { data, error } = await supabase.functions.invoke("classify-issue", {
      body: { caseId },
    });
    if (error) throw new APIError(error.message || "Failed to generate AI plan", undefined, error);
    return data;
  },

  async getAICoordinationPlan(caseId: string): Promise<any> {
    const { data: plans, error: planError } = await supabase
      .from("ai_coordination_plans")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false });

    if (planError) throw new APIError(planError.message, undefined, planError);
    if (!plans || plans.length === 0) return null;

    const plan = plans[0];

    // Fetch details
    const [pRes, tRes, dRes, eRes] = await Promise.all([
      supabase.from("ai_plan_participants").select("*").eq("plan_id", plan.id),
      supabase.from("ai_plan_tasks").select("*").eq("plan_id", plan.id),
      supabase.from("ai_plan_dependencies").select("*").eq("plan_id", plan.id),
      supabase.from("ai_plan_edit_events").select("*").eq("plan_id", plan.id).order("created_at", { ascending: false }),
    ]);

    return {
      ...plan,
      participants: pRes.data || [],
      tasks: tRes.data || [],
      dependencies: dRes.data || [],
      editEvents: eRes.data || [],
    };
  },

  async approveAndActivateCoordinationPlan(planId: string, actorId: string): Promise<void> {
    const { error } = await supabase.rpc("approve_and_activate_coordination_plan", {
      p_plan_id: planId,
      p_actor_id: actorId,
    });
    if (error) throw new APIError(error.message, undefined, error);
  },

  async saveAICoordinationPlanEdits(
    planId: string,
    actorId: string,
    participants: any[],
    tasks: any[],
    dependencies: any[],
    editEvent?: { entityType: string; entityId: string; action: string; beforeState: any; afterState: any; reason: string }
  ): Promise<void> {
    // 1. Delete and insert participants
    const { error: delPErr } = await supabase.from("ai_plan_participants").delete().eq("plan_id", planId);
    if (delPErr) throw new APIError(delPErr.message, undefined, delPErr);

    if (participants.length > 0) {
      const { error: insPErr } = await supabase.from("ai_plan_participants").insert(
        participants.map((p) => ({
          plan_id: planId,
          department: p.department,
          participation_role: p.participationRole || p.participation_role,
          responsibility_reason: p.responsibilityReason || p.responsibility_reason,
        }))
      );
      if (insPErr) throw new APIError(insPErr.message, undefined, insPErr);
    }

    // 2. Delete and insert tasks
    const { error: delTErr } = await supabase.from("ai_plan_tasks").delete().eq("plan_id", planId);
    if (delTErr) throw new APIError(delTErr.message, undefined, delTErr);

    if (tasks.length > 0) {
      const { error: insTErr } = await supabase.from("ai_plan_tasks").insert(
        tasks.map((t) => ({
          plan_id: planId,
          temp_id: t.tempId || t.temp_id,
          department: t.department,
          title: t.title,
          description: t.description,
          priority: t.priority,
          sla_duration_minutes: t.slaDurationMinutes || t.sla_duration_minutes || 1440,
          completion_evidence_rules: t.completion_evidence_rules || t.completionEvidenceRules || null,
        }))
      );
      if (insTErr) throw new APIError(insTErr.message, undefined, insTErr);
    }

    // 3. Delete and insert dependencies
    const { error: delDErr } = await supabase.from("ai_plan_dependencies").delete().eq("plan_id", planId);
    if (delDErr) throw new APIError(delDErr.message, undefined, delDErr);

    if (dependencies.length > 0) {
      const { error: insDErr } = await supabase.from("ai_plan_dependencies").insert(
        dependencies.map((d) => ({
          plan_id: planId,
          predecessor_temp_id: d.predecessorTempId || d.predecessor_temp_id,
          successor_temp_id: d.successorTempId || d.successor_temp_id,
          reason: d.reason,
        }))
      );
      if (insDErr) throw new APIError(insDErr.message, undefined, insDErr);
    }

    // 4. Log edit event if provided
    if (editEvent) {
      const { error: logErr } = await supabase.from("ai_plan_edit_events").insert({
        plan_id: planId,
        actor_id: actorId,
        entity_type: editEvent.entityType,
        entity_id: editEvent.entityId,
        action: editEvent.action,
        before_state: editEvent.beforeState,
        after_state: editEvent.afterState,
        reason: editEvent.reason,
      });
      if (logErr) throw new APIError(logErr.message, undefined, logErr);
    }

    // 5. Update plan timestamp and status to REVIEW_REQUIRED
    const { error: planUpErr } = await supabase
      .from("ai_coordination_plans")
      .update({
        status: "REVIEW_REQUIRED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", planId);
    if (planUpErr) throw new APIError(planUpErr.message, undefined, planUpErr);
  },

  async createManualCoordinationPlan(caseId: string): Promise<any> {
    const { data, error } = await supabase
      .from("ai_coordination_plans")
      .insert({
        case_id: caseId,
        status: "REVIEW_REQUIRED",
        model_provider: "manual",
        model_name: "human_fallback",
        prompt_version: "1.0",
        explanation: "Manual coordination plan created by human coordinator.",
        confidence: 1.0,
        risk_level: "MEDIUM",
      })
      .select()
      .single();

    if (error) throw new APIError(error.message, undefined, error);
    return data;
  },

  async getCaseWorkOrders(caseId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from("case_work_orders")
      .select("*")
      .eq("case_id", caseId)
      .order("department_key");
    if (error) throw new APIError(error.message, undefined, error);
    return data || [];
  },

  async generateWorkOrderPDF(planId: string, departmentKey: string): Promise<any> {
    const { data, error } = await supabase.functions.invoke("generate-work-order-pdf", {
      body: { planId, departmentKey }
    });
    if (error) throw new APIError(error.message || "Failed to generate work order PDF", undefined, error);
    return data;
  },

  async getWorkOrderDownloadUrl(storagePath: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from("case-work-orders")
      .createSignedUrl(storagePath, 300); // 5 minutes validity
    if (error) throw new APIError(error.message, undefined, error);
    return data.signedUrl;
  },
};

