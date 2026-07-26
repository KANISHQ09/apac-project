/**
 * Regression tests for P0 runtime defects:
 *
 * DEFECT 1 — evaluateClosureEligibility crashes when RPC returns snake_case
 *            keys (missing_requirements) while frontend expects camelCase
 *            (missingRequirements).
 *
 * DEFECT 2 — CoordinationPlanReview.fetchPlan leaves loading=true forever
 *            when a sub-query errors or the case has no plan.
 *
 * Tests cover:
 *  1. missingRequirements undefined — must not crash
 *  2. snake_case missing_requirements mapping
 *  3. null eligibility RPC response — safe fallback
 *  4. empty missingRequirements — renders 0-length array
 *  5. issue with no coordination plan — EMPTY state
 *  6. coordination query error — ERROR state, not eternal loading
 *  7. loading state always terminates (via finally)
 *  8. legacy single-department issue — returns mapped result
 *  9. array-wrapped RPC response — unwrapped correctly
 * 10. valid coordinated case — full camelCase contract
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { closureService } from "@/features/coordination/services/closureService";
import { issueService } from "@/features/issues/services/issueService";
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

// ── Helpers ──────────────────────────────────────────────────
/** Minimal valid snake_case RPC payload */
const makeRawEligibility = (overrides: Record<string, any> = {}) => ({
  eligible: true,
  case_id: "case-abc",
  case_number: "SAM-2026-001",
  coordination_type: "multi_department",
  policy_used: "MULTI_MED",
  missing_requirements: [],
  completed_requirements: [{ code: "TASKS_COMPLETE", message: "All done" }],
  active_blockers: [],
  active_escalations: [],
  evaluated_at: new Date().toISOString(),
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────

describe("DEFECT 1 — Eligibility snake_case → camelCase mapping", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // Test 1
  it("maps snake_case missing_requirements to missingRequirements without crash", async () => {
    const raw = makeRawEligibility({
      eligible: false,
      missing_requirements: [
        { code: "TASKS_INCOMPLETE", message: "3 tasks still open", count: 3 },
      ],
    });
    mockRpc.mockResolvedValueOnce({ data: raw, error: null });

    const result = await closureService.evaluateClosureEligibility("case-abc");

    // Must not throw — the critical P0 guard
    expect(result.missingRequirements).toBeDefined();
    expect(Array.isArray(result.missingRequirements)).toBe(true);
    expect(result.missingRequirements).toHaveLength(1);
    expect(result.missingRequirements[0].code).toBe("TASKS_INCOMPLETE");
    expect(result.missingRequirements[0].count).toBe(3);
  });

  // Test 2 — Explicit snake_case key test
  it("correctly bridges snake_case keys for all top-level fields", async () => {
    const raw = makeRawEligibility();
    mockRpc.mockResolvedValueOnce({ data: raw, error: null });

    const result = await closureService.evaluateClosureEligibility("case-abc");

    expect(result.caseId).toBe("case-abc");
    expect(result.caseNumber).toBe("SAM-2026-001");
    expect(result.coordinationType).toBe("multi_department");
    expect(result.policyUsed).toBe("MULTI_MED");
    expect(result.evaluatedAt).toBeDefined();
  });

  // Test 3 — null RPC response
  it("returns safe fallback when RPC returns null data (no policy row)", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    // Must not throw — historically crashed at null.missingRequirements.length
    const result = await closureService.evaluateClosureEligibility("case-no-policy");

    expect(result.eligible).toBe(false);
    expect(result.missingRequirements).toEqual([]);
    expect(result.completedRequirements).toEqual([]);
    expect(result.activeBlockers).toEqual([]);
    expect(result.activeEscalations).toEqual([]);
  });

  // Test 4 — empty missingRequirements
  it("handles empty missing_requirements (eligible=true case)", async () => {
    const raw = makeRawEligibility({ eligible: true, missing_requirements: [] });
    mockRpc.mockResolvedValueOnce({ data: raw, error: null });

    const result = await closureService.evaluateClosureEligibility("case-ready");

    expect(result.eligible).toBe(true);
    expect(result.missingRequirements).toHaveLength(0);
    // Must not crash when UI does .length on this
    expect(result.missingRequirements.length).toBe(0);
  });

  // Test 9 — array-wrapped response (some Supabase versions return [{...}])
  it("unwraps array-wrapped single-object RPC response", async () => {
    const raw = [makeRawEligibility({
      eligible: false,
      missing_requirements: [{ code: "LEAD_SIGNOFF_MISSING", message: "Lead not signed" }],
    })];
    mockRpc.mockResolvedValueOnce({ data: raw, error: null });

    const result = await closureService.evaluateClosureEligibility("case-arr");

    expect(result.eligible).toBe(false);
    expect(result.missingRequirements).toHaveLength(1);
    expect(result.missingRequirements[0].code).toBe("LEAD_SIGNOFF_MISSING");
  });

  // Test 10 — full coordinated case
  it("maps a valid fully-populated coordinated case response", async () => {
    const raw = makeRawEligibility({
      eligible: false,
      missing_requirements: [
        { code: "TASKS_INCOMPLETE", message: "2 tasks still open", count: 2 },
        { code: "LEAD_SIGNOFF_MISSING", message: "Lead (water_supply) not signed", department: "water_supply" },
      ],
      completed_requirements: [
        { code: "NO_BLOCKERS", message: "No active blockers" },
      ],
      active_blockers: [
        {
          id: "blocker-1",
          task_id: "task-1",
          blocker_type: "INFRASTRUCTURE",
          reason: "Road works blocking access",
          declared_at: new Date().toISOString(),
        },
      ],
      active_escalations: [
        {
          id: "esc-1",
          severity: "HIGH",
          escalation_type: "SLA_BREACH",
          status: "OPEN",
          root_cause_department: "roads",
        },
      ],
    });
    mockRpc.mockResolvedValueOnce({ data: raw, error: null });

    const result = await closureService.evaluateClosureEligibility("case-full");

    expect(result.eligible).toBe(false);
    expect(result.missingRequirements).toHaveLength(2);
    expect(result.completedRequirements).toHaveLength(1);

    // Blockers — sub-keys must also be normalized
    expect(result.activeBlockers).toHaveLength(1);
    expect(result.activeBlockers[0].taskId).toBe("task-1");
    expect(result.activeBlockers[0].blockerType).toBe("INFRASTRUCTURE");

    // Escalations
    expect(result.activeEscalations).toHaveLength(1);
    expect(result.activeEscalations[0].escalationType).toBe("SLA_BREACH");
    expect(result.activeEscalations[0].rootCauseDepartment).toBe("roads");
  });

  // Test 8 — legacy single-department case
  it("handles legacy single_department case (no cross-dept plan)", async () => {
    const raw = makeRawEligibility({
      coordination_type: "single_department",
      policy_used: "SINGLE_STD",
      eligible: true,
      missing_requirements: [],
      completed_requirements: [{ code: "TASKS_COMPLETE", message: "All tasks completed" }],
    });
    mockRpc.mockResolvedValueOnce({ data: raw, error: null });

    const result = await closureService.evaluateClosureEligibility("case-legacy");

    expect(result.coordinationType).toBe("single_department");
    expect(result.policyUsed).toBe("SINGLE_STD");
    expect(result.eligible).toBe(true);
    // No crash
    expect(result.missingRequirements.length).toBe(0);
  });

  // Test — RPC returns error
  it("throws APIError when RPC returns an error", async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Case not found: nonexistent" },
    });

    await expect(
      closureService.evaluateClosureEligibility("nonexistent")
    ).rejects.toThrow("Case not found");
  });
});

describe("DEFECT 2 — getAICoordinationPlan must never hang", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  function buildChain(result: any, chainOverrides: Record<string, any> = {}) {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue(result),
      ...chainOverrides,
    };
    // Make chained calls return the same chain object
    chain.select.mockReturnThis();
    chain.eq.mockReturnThis();
    return chain;
  }

  // Test 5 — issue has no coordination plan
  it("returns null (not hanging promise) when ai_coordination_plans has 0 rows", async () => {
    // coordinationService.getAICoordinationPlan does: .select('*').eq('case_id', ...).order(...)
    // When no plan exists, query returns { data: [], error: null }
    const { coordinationService } = await import(
      "@/features/coordination/services/coordinationService"
    );

    const emptyChain = buildChain({ data: [], error: null });
    mockFrom.mockReturnValue(emptyChain);

    const result = await coordinationService.getAICoordinationPlan("case-no-plan");

    // Must resolve to null — not hang
    expect(result).toBeNull();
  });

  // Test 6 — coordination query error → resolved to null / throws (not eternal loading)
  it("throws when the main ai_coordination_plans query errors", async () => {
    const { coordinationService } = await import(
      "@/features/coordination/services/coordinationService"
    );

    const errorChain = buildChain({ data: null, error: { message: "RLS denied" } });
    mockFrom.mockReturnValue(errorChain);

    // Should throw, not hang
    await expect(
      coordinationService.getAICoordinationPlan("case-rls-error")
    ).rejects.toThrow("RLS denied");
  });

  // Test 7 — loading state always terminates (Promise.all resolves even with empty sub-tables)
  it("resolves with plan when sub-tables return empty arrays", async () => {
    const { coordinationService } = await import(
      "@/features/coordination/services/coordinationService"
    );

    const planRow = {
      id: "plan-1",
      case_id: "case-1",
      status: "DRAFT",
      explanation: "Test plan",
    };

    // First call: main plan table returns one row
    const mainChain = buildChain({ data: [planRow], error: null });
    // Subsequent calls: sub-tables return empty arrays
    const emptyChain = buildChain({ data: [], error: null });

    mockFrom
      .mockReturnValueOnce(mainChain)   // ai_coordination_plans
      .mockReturnValue(emptyChain);     // ai_plan_participants, tasks, dependencies, edit_events

    const result = await coordinationService.getAICoordinationPlan("case-1");

    // Must resolve — not hang
    expect(result).not.toBeNull();
    expect(result.id).toBe("plan-1");
    expect(result.participants).toEqual([]);
    expect(result.tasks).toEqual([]);
    expect(result.dependencies).toEqual([]);
  });
});

describe("Phase 4 — AI Provenance & Data Origin Mapping", () => {
  it("maps new database columns to domain camelCase properties correctly", () => {
    const rawResponse = {
      id: "issue-123",
      user_id: "user-456",
      title: "Water Leakage",
      description: "Leaking pipe near main road",
      category: "Water Supply",
      status: "reported",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      data_origin: "citizen_live",
      ai_provider: "nvidia",
      ai_model: "nvidia/nemotron-3-nano-30b-a3be",
      ai_analyzed_at: new Date().toISOString(),
      ai_confidence: 0.925,
      ai_status: "done",
    };

    const domainIssue = issueService.mapResponseToDomain(rawResponse as any);

    expect(domainIssue.dataOrigin).toBe("citizen_live");
    expect(domainIssue.aiProvider).toBe("nvidia");
    expect(domainIssue.aiModel).toBe("nvidia/nemotron-3-nano-30b-a3be");
    expect(domainIssue.aiAnalyzedAt).toBeInstanceOf(Date);
    expect(domainIssue.aiConfidence).toBe(0.925);
    expect(domainIssue.aiStatus).toBe("done");
  });
});
