import { describe, it, expect, vi, beforeEach } from "vitest";
import { executionService } from "@/features/coordination/services/executionService";

// Mock supabase
vi.mock("@/integrations/supabase/client", () => {
  const mockSingle = vi.fn().mockImplementation(() => Promise.resolve({ data: { id: "t1", case_id: "c1", department: "water_supply", task_status: "ASSIGNED" }, error: null }));
  return {
    supabase: {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => ({
            order: vi.fn().mockImplementation(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
        insert: vi.fn().mockImplementation(() => ({
          select: vi.fn().mockImplementation(() => ({
            single: mockSingle,
          })),
        })),
        update: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => Promise.resolve({ error: null })),
        })),
      })),
      rpc: vi.fn().mockImplementation(() => Promise.resolve({ data: { id: "t1", task_status: "WORKING" }, error: null })),
    },
  };
});

describe("executionService unit tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("correctly maps database task response to domain representation", () => {
    const raw = {
      id: "t-123",
      case_id: "case-456",
      department: "water_supply",
      task_code: "T1",
      title: "Isolate leak",
      description: "Close main water valve",
      task_status: "WORKING",
      priority: "HIGH",
      assigned_by: "user-1",
      assigned_to: "user-2",
      accepted_by: "user-2",
      accepted_at: "2026-07-09T12:00:00Z",
      started_at: "2026-07-09T12:05:00Z",
      completed_at: null,
      blocked_at: null,
      blocked_reason: null,
      rejection_reason: null,
      due_at: null,
      version: 1,
      created_at: "2026-07-09T12:00:00Z",
      updated_at: "2026-07-09T12:05:00Z",
    };

    const domain = executionService.mapTaskResponse(raw);
    expect(domain.id).toBe("t-123");
    expect(domain.caseId).toBe("case-456");
    expect(domain.department).toBe("water_supply");
    expect(domain.taskCode).toBe("T1");
    expect(domain.title).toBe("Isolate leak");
    expect(domain.taskStatus).toBe("WORKING");
    expect(domain.priority).toBe("HIGH");
    expect(domain.createdAt).toBeInstanceOf(Date);
  });
});
