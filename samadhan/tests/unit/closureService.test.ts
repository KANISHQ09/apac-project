import { describe, it, expect, vi, beforeEach } from "vitest";
import { closureService } from "@/features/coordination/services/closureService";
import type { ClosureEligibilityResult } from "@/shared/types/domain/Issue";

// ── Mock Supabase ────────────────────────────────────────────
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    from: (...args: any[]) => mockFrom(...args),
  },
}));

// ── Build mock Supabase chain ────────────────────────────────
function buildChain(result: any) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

describe("closureService — Eligibility Result Mapping", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns eligible=true when all requirements are met", async () => {
    const mockResult: ClosureEligibilityResult = {
      eligible: true,
      caseId: "case-1",
      caseNumber: "SAM-2026-000001",
      coordinationType: "multi_department",
      policyUsed: "MULTI_MED",
      missingRequirements: [],
      completedRequirements: [
        { code: "TASKS_COMPLETE", message: "All tasks completed or cancelled" },
        { code: "HANDOFFS_ACCEPTED", message: "All handoffs accepted" },
        { code: "NO_BLOCKERS", message: "No active blockers" },
        { code: "LEAD_SIGNOFF_PRESENT", message: "Lead department (water_supply) has signed off" },
      ],
      activeBlockers: [],
      activeEscalations: [],
      evaluatedAt: new Date().toISOString(),
    };

    mockRpc.mockResolvedValueOnce({ data: mockResult, error: null });

    const result = await closureService.evaluateClosureEligibility("case-1");
    expect(result.eligible).toBe(true);
    expect(result.missingRequirements).toHaveLength(0);
    expect(result.completedRequirements).toHaveLength(4);
    expect(mockRpc).toHaveBeenCalledWith("evaluate_case_closure_eligibility", { p_case_id: "case-1" });
  });

  it("returns eligible=false when mandatory tasks are incomplete", async () => {
    const mockResult: ClosureEligibilityResult = {
      eligible: false,
      caseId: "case-2",
      caseNumber: "SAM-2026-000002",
      coordinationType: "multi_department",
      policyUsed: "MULTI_MED",
      missingRequirements: [
        { code: "TASKS_INCOMPLETE", message: "3 task(s) are still incomplete", count: 3 },
      ],
      completedRequirements: [],
      activeBlockers: [],
      activeEscalations: [],
      evaluatedAt: new Date().toISOString(),
    };

    mockRpc.mockResolvedValueOnce({ data: mockResult, error: null });

    const result = await closureService.evaluateClosureEligibility("case-2");
    expect(result.eligible).toBe(false);
    expect(result.missingRequirements[0].code).toBe("TASKS_INCOMPLETE");
    expect(result.missingRequirements[0].count).toBe(3);
  });

  it("throws APIError when RPC returns error", async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Case not found: nonexistent-id" },
    });

    await expect(closureService.evaluateClosureEligibility("nonexistent-id")).rejects.toThrow(
      "Case not found"
    );
  });
});

describe("closureService — Signoff Rules", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("submits resolution signoff through RPC", async () => {
    const mockSignoff = {
      id: "signoff-1",
      case_id: "case-1",
      participation_id: "part-1",
      department: "water_supply",
      signoff_role: "LEAD",
      status: "SIGNED",
      signed_by: "user-1",
      signed_at: new Date().toISOString(),
      statement: "Pipeline fully repaired and tested",
      evidence_summary: "Photo ref: WS-001",
      revoked_at: null,
      revocation_reason: null,
      closure_cycle: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    mockRpc.mockResolvedValueOnce({ data: mockSignoff, error: null });

    const result = await closureService.submitResolutionSignoff(
      "case-1", "part-1", "Pipeline fully repaired and tested", "Photo ref: WS-001", "user-1"
    );

    expect(result.department).toBe("water_supply");
    expect(result.status).toBe("SIGNED");
    expect(result.closureCycle).toBe(1);
    expect(mockRpc).toHaveBeenCalledWith("submit_resolution_signoff", {
      p_case_id: "case-1",
      p_participation_id: "part-1",
      p_statement: "Pipeline fully repaired and tested",
      p_evidence_summary: "Photo ref: WS-001",
      p_actor_id: "user-1",
    });
  });

  it("calls revoke_resolution_signoff RPC with correct params", async () => {
    mockRpc.mockResolvedValueOnce({ error: null });

    await closureService.revokeResolutionSignoff("signoff-1", "Rework required", "user-1");

    expect(mockRpc).toHaveBeenCalledWith("revoke_resolution_signoff", {
      p_signoff_id: "signoff-1",
      p_reason: "Rework required",
      p_actor_id: "user-1",
    });
  });

  it("throws error when signoff from unauthorized department", async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "UNAUTHORIZED: You can only sign off for your own department (roads). Your department: water_supply" },
    });

    await expect(
      closureService.submitResolutionSignoff("case-1", "part-roads", "Roads done", null!, "water-user")
    ).rejects.toThrow("UNAUTHORIZED");
  });
});

describe("closureService — Atomic Closure", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("calls close_coordinated_case RPC and returns resolution package", async () => {
    const mockPackage = {
      id: "pkg-1",
      case_id: "case-1",
      version: 1,
      closure_cycle: 1,
      status: "ACTIVE",
      generated_at: new Date().toISOString(),
      generated_by: "user-1",
      summary: "Joint closure for SAM-2026-000001",
      root_cause: null,
      departments_involved: [{ department: "water_supply", participation_role: "LEAD" }],
      completed_tasks_snapshot: [],
      accepted_handoffs_snapshot: [],
      evidence_snapshot: [],
      sla_snapshot: { total_sla_instances: 3, breached: 1, completed: 2 },
      escalation_snapshot: [],
      signoff_snapshot: [],
      citizen_safe_summary: "Resolved through coordinated action by 2 departments.",
      policy_used: "MULTI_MED",
      supersedes_package_id: null,
      closed_by: "user-1",
      closed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    mockRpc.mockResolvedValueOnce({ data: mockPackage, error: null });

    const result = await closureService.closeCoordinatedCase("case-1", "user-1");

    expect(result.id).toBe("pkg-1");
    expect(result.citizenSafeSummary).toBe("Resolved through coordinated action by 2 departments.");
    expect(result.status).toBe("ACTIVE");
    expect(mockRpc).toHaveBeenCalledWith("close_coordinated_case", {
      p_case_id: "case-1",
      p_actor_id: "user-1",
    });
  });

  it("throws PREMATURE_CLOSURE error when case not eligible", async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: {
        message: "CLOSURE_DENIED: Case does not meet closure requirements. Missing: [{\"code\":\"TASKS_INCOMPLETE\"}]",
      },
    });

    await expect(closureService.closeCoordinatedCase("case-bad", "user-1")).rejects.toThrow(
      "CLOSURE_DENIED"
    );
  });
});

describe("closureService — Reopen Engine", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("creates reopen request for a citizen", async () => {
    // Mock maybeSingle (pkg) + insert
    const chain1 = buildChain({ data: { closure_cycle: 1 }, error: null });
    const chain2 = {
      ...buildChain(null),
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "reopen-1",
          case_id: "case-1",
          requested_by: "citizen-1",
          request_source: "CITIZEN_PORTAL",
          reason_code: "ISSUE_PERSISTS",
          description: "The pipe is still leaking",
          evidence_urls: [],
          status: "PENDING",
          reviewed_by: null,
          reviewed_at: null,
          review_reason: null,
          closure_cycle: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        error: null,
      }),
    };

    mockFrom
      .mockReturnValueOnce(chain1)  // case_resolution_packages for cycle
      .mockReturnValueOnce(chain2); // case_reopen_requests insert

    const req = await closureService.requestReopen(
      "case-1", "citizen-1", "ISSUE_PERSISTS", "The pipe is still leaking"
    );

    expect(req.reasonCode).toBe("ISSUE_PERSISTS");
    expect(req.status).toBe("PENDING");
    expect(req.requestSource).toBe("CITIZEN_PORTAL");
  });

  it("calls review_case_reopen_request RPC with APPROVED decision", async () => {
    mockRpc.mockResolvedValueOnce({ error: null });

    await closureService.reviewReopenRequest("reopen-1", "APPROVED", "Issue confirmed persisting", "admin-1");

    expect(mockRpc).toHaveBeenCalledWith("review_case_reopen_request", {
      p_request_id: "reopen-1",
      p_decision: "APPROVED",
      p_reason: "Issue confirmed persisting",
      p_actor_id: "admin-1",
    });
  });
});

describe("closureService — Coordination Metrics", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("maps RPC response to CoordinationMetrics domain shape", async () => {
    const rawMetrics = {
      period_from: "2026-06-01T00:00:00Z",
      period_to: "2026-07-01T00:00:00Z",
      total_multi_dept_cases: 42,
      total_handoffs: 118,
      rework_rate_pct: 12.5,
      avg_handoff_acceptance_minutes: 47.3,
      sla_breach_rate_pct: 8.2,
      total_escalations: 6,
      reopen_rate_pct: 4.8,
      first_time_resolution_rate_pct: 87.5,
      total_closed: 38,
    };

    mockRpc.mockResolvedValueOnce({ data: rawMetrics, error: null });

    const metrics = await closureService.getCoordinationMetrics("2026-06-01", "2026-07-01");

    expect(metrics.totalMultiDeptCases).toBe(42);
    expect(metrics.reworkRatePct).toBe(12.5);
    expect(metrics.firstTimeResolutionRatePct).toBe(87.5);
    expect(metrics.slaBreachRatePct).toBe(8.2);
    expect(metrics.totalHandoffs).toBe(118);
  });

  it("defaults numeric values to 0 when null in response", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        period_from: "2026-01-01",
        period_to: "2026-01-31",
        total_multi_dept_cases: null,
        total_handoffs: null,
        rework_rate_pct: null,
        avg_handoff_acceptance_minutes: null,
        sla_breach_rate_pct: null,
        total_escalations: null,
        reopen_rate_pct: null,
        first_time_resolution_rate_pct: null,
        total_closed: null,
      },
      error: null,
    });

    const metrics = await closureService.getCoordinationMetrics();

    expect(metrics.totalMultiDeptCases).toBe(0);
    expect(metrics.reworkRatePct).toBe(0);
    expect(metrics.totalEscalations).toBe(0);
  });
});
