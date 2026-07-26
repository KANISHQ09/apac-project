import { describe, it, expect, vi, beforeEach } from "vitest";
import { coordinationService } from "@/features/coordination/services/coordinationService";

// Mock supabase client
const mockSingle = vi.fn().mockImplementation(() => Promise.resolve({ data: { id: "p1", case_id: "c1", department: "water_supply", participation_role: "LEAD", status: "ACTIVE" }, error: null }));
const mockMaybeSingle = vi.fn().mockImplementation(() => Promise.resolve({ data: null, error: null }));

const mockSelect = vi.fn().mockImplementation(() => ({
  eq: vi.fn().mockImplementation(() => ({
    eq: vi.fn().mockImplementation(() => ({
      order: vi.fn().mockImplementation(() => Promise.resolve({ data: [], error: null })),
      maybeSingle: mockMaybeSingle,
      single: mockSingle,
    })),
    order: vi.fn().mockImplementation(() => Promise.resolve({ data: [], error: null })),
    single: mockSingle,
  })),
  order: vi.fn().mockImplementation(() => Promise.resolve({ data: [], error: null })),
}));

const mockInvoke = vi.fn().mockImplementation(() => Promise.resolve({ data: { status: "success", plan_id: "plan-123" }, error: null }));
const mockRpc = vi.fn().mockImplementation(() => Promise.resolve({ data: null, error: null }));

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      from: vi.fn().mockImplementation(() => ({
        select: mockSelect,
        insert: vi.fn().mockImplementation(() => ({
          select: vi.fn().mockImplementation(() => ({
            single: mockSingle,
          })),
        })),
        update: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => Promise.resolve({ error: null })),
        })),
        delete: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => Promise.resolve({ error: null })),
        })),
      })),
      functions: {
        invoke: (...args: any[]) => mockInvoke(...args),
      },
      rpc: (...args: any[]) => mockRpc(...args),
    },
  };
});

describe("coordinationService unit tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("correctly maps database participation response to domain representation", () => {
    const raw = {
      id: "p-123",
      case_id: "case-456",
      department: "water_supply",
      participation_role: "LEAD",
      status: "ACTIVE",
      responsibility_reason: "Initial assignment",
      joined_at: "2026-07-09T12:00:00Z",
    };

    const domain = coordinationService.mapResponseToDomain(raw);
    expect(domain.id).toBe("p-123");
    expect(domain.caseId).toBe("case-456");
    expect(domain.department).toBe("water_supply");
    expect(domain.participationRole).toBe("LEAD");
    expect(domain.status).toBe("ACTIVE");
    expect(domain.responsibilityReason).toBe("Initial assignment");
    expect(domain.joinedAt).toBeInstanceOf(Date);
  });

  it("triggers AI plan generation edge function", async () => {
    mockInvoke.mockResolvedValueOnce({ data: { status: "success", plan_id: "plan-123" }, error: null });
    const res = await coordinationService.generateAICoordinationPlan("case-123");
    expect(mockInvoke).toHaveBeenCalledWith("classify-issue", {
      body: { caseId: "case-123" }
    });
    expect(res.plan_id).toBe("plan-123");
  });

  it("triggers database transaction approval RPC", async () => {
    mockRpc.mockResolvedValueOnce({ error: null });
    await coordinationService.approveAndActivateCoordinationPlan("plan-123", "actor-123");
    expect(mockRpc).toHaveBeenCalledWith("approve_and_activate_coordination_plan", {
      p_plan_id: "plan-123",
      p_actor_id: "actor-123"
    });
  });

  it("creates a manual fallback proposal", async () => {
    mockSingle.mockResolvedValueOnce({ 
      data: { id: "plan-manual", case_id: "case-123", status: "REVIEW_REQUIRED", model_provider: "manual" },
      error: null 
    });
    const plan = await coordinationService.createManualCoordinationPlan("case-123");
    expect(plan.model_provider).toBe("manual");
  });
});
