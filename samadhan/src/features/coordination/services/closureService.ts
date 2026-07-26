import { supabase } from "@/integrations/supabase/client";
import { APIError } from "@/shared/errors/errors";
import type {
  ClosureEligibilityResult,
  CaseResolutionSignoff,
  CaseResolutionPackage,
  CaseCitizenConfirmation,
  CaseReopenRequest,
  CoordinationMetrics,
} from "@/shared/types/domain/Issue";

// ============================================================
// Mapper helpers
// ============================================================

/**
 * Normalize the raw JSONB payload from evaluate_case_closure_eligibility RPC.
 *
 * The RPC returns snake_case keys. The frontend type (ClosureEligibilityResult)
 * uses camelCase. This mapper bridges that gap and guards against:
 *   - null / undefined payload
 *   - array-wrapped single-row responses
 *   - missing optional arrays (legacy cases with no policy)
 *   - snake_case vs camelCase field name mismatch
 */
function mapEligibility(raw: any): ClosureEligibilityResult {
  // Guard: unwrap array if RPC returned [{...}] instead of {...}
  const r: any = Array.isArray(raw) ? (raw[0] ?? {}) : (raw ?? {});

  // Helper: safely pull an array from either snake_case or camelCase key
  const safeArray = (snakeKey: string, camelKey: string): any[] => {
    const val = r[snakeKey] ?? r[camelKey];
    return Array.isArray(val) ? val : [];
  };

  // Normalize active_blockers — RPC emits snake_case sub-keys
  const rawBlockers = safeArray("active_blockers", "activeBlockers");
  const activeBlockers = rawBlockers.map((b: any) => ({
    id: b.id ?? "",
    taskId: b.task_id ?? b.taskId ?? "",
    blockerType: b.blocker_type ?? b.blockerType ?? "",
    reason: b.reason ?? "",
    declaredAt: b.declared_at ?? b.declaredAt ?? new Date().toISOString(),
  }));

  // Normalize active_escalations — RPC emits snake_case sub-keys
  const rawEscalations = safeArray("active_escalations", "activeEscalations");
  const activeEscalations = rawEscalations.map((e: any) => ({
    id: e.id ?? "",
    severity: e.severity ?? "",
    escalationType: e.escalation_type ?? e.escalationType ?? "",
    status: e.status ?? "",
    rootCauseDepartment: e.root_cause_department ?? e.rootCauseDepartment,
  }));

  return {
    eligible: r.eligible ?? false,
    caseId: r.case_id ?? r.caseId ?? "",
    caseNumber: r.case_number ?? r.caseNumber ?? "",
    coordinationType: r.coordination_type ?? r.coordinationType ?? "single_department",
    policyUsed: r.policy_used ?? r.policyUsed ?? "UNKNOWN",
    missingRequirements: safeArray("missing_requirements", "missingRequirements"),
    completedRequirements: safeArray("completed_requirements", "completedRequirements"),
    activeBlockers,
    activeEscalations,
    evaluatedAt: r.evaluated_at ?? r.evaluatedAt ?? new Date().toISOString(),
  };
}

function mapSignoff(raw: any): CaseResolutionSignoff {
  return {
    id: raw.id,
    caseId: raw.case_id,
    participationId: raw.participation_id,
    department: raw.department,
    signoffRole: raw.signoff_role,
    status: raw.status,
    signedBy: raw.signed_by ?? null,
    signedAt: new Date(raw.signed_at),
    statement: raw.statement,
    evidenceSummary: raw.evidence_summary ?? null,
    revokedAt: raw.revoked_at ? new Date(raw.revoked_at) : null,
    revocationReason: raw.revocation_reason ?? null,
    closureCycle: raw.closure_cycle,
    createdAt: new Date(raw.created_at),
    updatedAt: new Date(raw.updated_at),
  };
}

function mapPackage(raw: any): CaseResolutionPackage {
  return {
    id: raw.id,
    caseId: raw.case_id,
    version: raw.version,
    closureCycle: raw.closure_cycle,
    status: raw.status,
    generatedAt: new Date(raw.generated_at),
    generatedBy: raw.generated_by ?? null,
    summary: raw.summary,
    rootCause: raw.root_cause ?? null,
    departmentsInvolved: raw.departments_involved ?? [],
    completedTasksSnapshot: raw.completed_tasks_snapshot ?? [],
    acceptedHandoffsSnapshot: raw.accepted_handoffs_snapshot ?? [],
    evidenceSnapshot: raw.evidence_snapshot ?? [],
    slaSnapshot: raw.sla_snapshot ?? {},
    escalationSnapshot: raw.escalation_snapshot ?? [],
    signoffSnapshot: raw.signoff_snapshot ?? [],
    citizenSafeSummary: raw.citizen_safe_summary,
    policyUsed: raw.policy_used ?? null,
    supersedesPackageId: raw.supersedes_package_id ?? null,
    closedBy: raw.closed_by ?? null,
    closedAt: raw.closed_at ? new Date(raw.closed_at) : null,
    createdAt: new Date(raw.created_at),
  };
}

function mapReopenRequest(raw: any): CaseReopenRequest {
  return {
    id: raw.id,
    caseId: raw.case_id,
    requestedBy: raw.requested_by,
    requestSource: raw.request_source,
    reasonCode: raw.reason_code,
    description: raw.description,
    evidenceUrls: raw.evidence_urls ?? [],
    status: raw.status,
    reviewedBy: raw.reviewed_by ?? null,
    reviewedAt: raw.reviewed_at ? new Date(raw.reviewed_at) : null,
    reviewReason: raw.review_reason ?? null,
    closureCycle: raw.closure_cycle,
    createdAt: new Date(raw.created_at),
    updatedAt: new Date(raw.updated_at),
  };
}

// ============================================================
// Closure Service
// ============================================================

export const closureService = {
  // ──────────────────────────────────────────────────────────
  // 1. Evaluate Closure Eligibility
  // ──────────────────────────────────────────────────────────
  async evaluateClosureEligibility(caseId: string): Promise<ClosureEligibilityResult> {
    const { data, error } = await supabase.rpc("evaluate_case_closure_eligibility", {
      p_case_id: caseId,
    });
    if (error) throw new APIError(error.message, undefined, error);
    // RPC returns snake_case JSONB — normalize to camelCase domain contract
    return mapEligibility(data);
  },

  // ──────────────────────────────────────────────────────────
  // 2. Department Sign-Off
  // ──────────────────────────────────────────────────────────
  async submitResolutionSignoff(
    caseId: string,
    participationId: string,
    statement: string,
    evidenceSummary: string,
    actorId: string
  ): Promise<CaseResolutionSignoff> {
    const { data, error } = await supabase.rpc("submit_resolution_signoff", {
      p_case_id: caseId,
      p_participation_id: participationId,
      p_statement: statement,
      p_evidence_summary: evidenceSummary,
      p_actor_id: actorId,
    });
    if (error) throw new APIError(error.message, undefined, error);
    return mapSignoff(data);
  },

  async revokeResolutionSignoff(
    signoffId: string,
    reason: string,
    actorId: string
  ): Promise<void> {
    const { error } = await supabase.rpc("revoke_resolution_signoff", {
      p_signoff_id: signoffId,
      p_reason: reason,
      p_actor_id: actorId,
    });
    if (error) throw new APIError(error.message, undefined, error);
  },

  async getCaseSignoffs(caseId: string): Promise<CaseResolutionSignoff[]> {
    const { data, error } = await supabase
      .from("case_resolution_signoffs")
      .select("*")
      .eq("case_id", caseId)
      .order("signed_at", { ascending: false });
    if (error) throw new APIError(error.message, undefined, error);
    return (data || []).map(mapSignoff);
  },

  // ──────────────────────────────────────────────────────────
  // 3. Atomic Joint Closure
  // ──────────────────────────────────────────────────────────
  async closeCoordinatedCase(
    caseId: string,
    actorId: string
  ): Promise<CaseResolutionPackage> {
    const { data, error } = await supabase.rpc("close_coordinated_case", {
      p_case_id: caseId,
      p_actor_id: actorId,
    });
    if (error) throw new APIError(error.message, undefined, error);
    return mapPackage(data);
  },

  // ──────────────────────────────────────────────────────────
  // 4. Resolution Package
  // ──────────────────────────────────────────────────────────
  async getResolutionPackage(caseId: string): Promise<CaseResolutionPackage | null> {
    const { data, error } = await supabase
      .from("case_resolution_packages")
      .select("*")
      .eq("case_id", caseId)
      .eq("status", "ACTIVE")
      .order("closure_cycle", { ascending: false })
      .maybeSingle();
    if (error) throw new APIError(error.message, undefined, error);
    return data ? mapPackage(data) : null;
  },

  async getResolutionPackageHistory(caseId: string): Promise<CaseResolutionPackage[]> {
    const { data, error } = await supabase
      .from("case_resolution_packages")
      .select("*")
      .eq("case_id", caseId)
      .order("closure_cycle", { ascending: false });
    if (error) throw new APIError(error.message, undefined, error);
    return (data || []).map(mapPackage);
  },

  // ──────────────────────────────────────────────────────────
  // 5. Citizen Confirmation
  // ──────────────────────────────────────────────────────────
  async submitCitizenConfirmation(
    caseId: string,
    citizenId: string,
    response: CaseCitizenConfirmation["response"],
    comment?: string,
    reasonCode?: string
  ): Promise<CaseCitizenConfirmation> {
    // Get current closure cycle from active package
    const { data: pkg } = await supabase
      .from("case_resolution_packages")
      .select("closure_cycle")
      .eq("case_id", caseId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    const closureCycle = pkg?.closure_cycle ?? 1;

    const { data, error } = await supabase
      .from("case_citizen_confirmations")
      .insert({
        case_id: caseId,
        citizen_id: citizenId,
        response,
        comment: comment ?? null,
        reason_code: reasonCode ?? null,
        closure_cycle: closureCycle,
      })
      .select()
      .single();

    if (error) throw new APIError(error.message, undefined, error);
    return {
      id: data.id,
      caseId: data.case_id,
      citizenId: data.citizen_id,
      response: data.response,
      reasonCode: data.reason_code ?? null,
      comment: data.comment ?? null,
      closureCycle: data.closure_cycle,
      createdAt: new Date(data.created_at),
    };
  },

  async getCitizenConfirmation(
    caseId: string,
    citizenId: string
  ): Promise<CaseCitizenConfirmation | null> {
    const { data, error } = await supabase
      .from("case_citizen_confirmations")
      .select("*")
      .eq("case_id", caseId)
      .eq("citizen_id", citizenId)
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (error) throw new APIError(error.message, undefined, error);
    if (!data) return null;
    return {
      id: data.id,
      caseId: data.case_id,
      citizenId: data.citizen_id,
      response: data.response,
      reasonCode: data.reason_code ?? null,
      comment: data.comment ?? null,
      closureCycle: data.closure_cycle,
      createdAt: new Date(data.created_at),
    };
  },

  // ──────────────────────────────────────────────────────────
  // 6. Reopen Requests
  // ──────────────────────────────────────────────────────────
  async requestReopen(
    caseId: string,
    requestedById: string,
    reasonCode: CaseReopenRequest["reasonCode"],
    description: string,
    evidenceUrls?: string[]
  ): Promise<CaseReopenRequest> {
    // Get current cycle
    const { data: pkg } = await supabase
      .from("case_resolution_packages")
      .select("closure_cycle")
      .eq("case_id", caseId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    const closureCycle = pkg?.closure_cycle ?? 1;

    const { data, error } = await supabase
      .from("case_reopen_requests")
      .insert({
        case_id: caseId,
        requested_by: requestedById,
        request_source: "CITIZEN_PORTAL",
        reason_code: reasonCode,
        description,
        evidence_urls: evidenceUrls ?? [],
        status: "PENDING",
        closure_cycle: closureCycle,
      })
      .select()
      .single();

    if (error) throw new APIError(error.message, undefined, error);
    return mapReopenRequest(data);
  },

  async reviewReopenRequest(
    requestId: string,
    decision: "APPROVED" | "REJECTED",
    reason: string,
    actorId: string
  ): Promise<void> {
    const { error } = await supabase.rpc("review_case_reopen_request", {
      p_request_id: requestId,
      p_decision: decision,
      p_reason: reason,
      p_actor_id: actorId,
    });
    if (error) throw new APIError(error.message, undefined, error);
  },

  async getPendingReopenRequests(): Promise<CaseReopenRequest[]> {
    const { data, error } = await supabase
      .from("case_reopen_requests")
      .select("*")
      .eq("status", "PENDING")
      .order("created_at", { ascending: true });
    if (error) throw new APIError(error.message, undefined, error);
    return (data || []).map(mapReopenRequest);
  },

  async getCaseReopenRequests(caseId: string): Promise<CaseReopenRequest[]> {
    const { data, error } = await supabase
      .from("case_reopen_requests")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false });
    if (error) throw new APIError(error.message, undefined, error);
    return (data || []).map(mapReopenRequest);
  },

  // ──────────────────────────────────────────────────────────
  // 7. Coordination Metrics
  // ──────────────────────────────────────────────────────────
  async getCoordinationMetrics(
    dateFrom?: string,
    dateTo?: string
  ): Promise<CoordinationMetrics> {
    const params: any = {};
    if (dateFrom) params.p_from = dateFrom;
    if (dateTo) params.p_to = dateTo;

    const { data, error } = await supabase.rpc("get_coordination_metrics", params);
    if (error) throw new APIError(error.message, undefined, error);

    const raw = data as any;
    return {
      periodFrom: raw.period_from,
      periodTo: raw.period_to,
      totalMultiDeptCases: raw.total_multi_dept_cases ?? 0,
      totalHandoffs: raw.total_handoffs ?? 0,
      reworkRatePct: raw.rework_rate_pct ?? 0,
      avgHandoffAcceptanceMinutes: raw.avg_handoff_acceptance_minutes ?? 0,
      slaBreachRatePct: raw.sla_breach_rate_pct ?? 0,
      totalEscalations: raw.total_escalations ?? 0,
      reopenRatePct: raw.reopen_rate_pct ?? 0,
      firstTimeResolutionRatePct: raw.first_time_resolution_rate_pct ?? 0,
      totalClosed: raw.total_closed ?? 0,
    };
  },

  // ──────────────────────────────────────────────────────────
  // 8. Closure Policies (for UI)
  // ──────────────────────────────────────────────────────────
  async getClosurePolicies() {
    const { data, error } = await supabase
      .from("case_closure_policies")
      .select("*")
      .eq("active", true)
      .order("coordination_type");
    if (error) throw new APIError(error.message, undefined, error);
    return data || [];
  },
};
