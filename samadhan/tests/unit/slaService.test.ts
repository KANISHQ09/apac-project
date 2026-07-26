import { describe, it, expect, vi, beforeEach } from "vitest";
import { slaService } from "@/features/coordination/services/slaService";

// Mock supabase
vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => Promise.resolve({ data: [], error: null })),
        })),
        insert: vi.fn().mockImplementation(() => ({
          select: vi.fn().mockImplementation(() => ({
            single: vi.fn().mockImplementation(() => Promise.resolve({ data: {}, error: null })),
          })),
        })),
        update: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => ({
            select: vi.fn().mockImplementation(() => ({
              single: vi.fn().mockImplementation(() => Promise.resolve({ data: {}, error: null })),
            })),
          })),
        })),
      })),
      rpc: vi.fn().mockImplementation((fnName) => {
        if (fnName === "get_downstream_impact") {
          return Promise.resolve({ data: [{ id: "t-2", department: "roads" }], error: null });
        }
        return Promise.resolve({ data: { success: true }, error: null });
      }),
    },
  };
});

describe("slaService unit tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("correctly maps database SLA Instance response to domain representation", () => {
    const raw = {
      id: "sla-1",
      case_id: "c-1",
      entity_type: "TASK",
      entity_id: "t-1",
      policy_id: "p-1",
      clock_type: "TICKING",
      started_at: "2026-07-09T12:00:00Z",
      due_at: "2026-07-10T12:00:00Z",
      paused_at: null,
      resumed_at: null,
      completed_at: null,
      breached_at: null,
      status: "ACTIVE",
      pause_reason: null,
      accumulated_pause_seconds: 0,
      version: 1,
      created_at: "2026-07-09T12:00:00Z",
      updated_at: "2026-07-09T12:00:00Z",
    };

    const domain = slaService.mapSLAInstanceResponse(raw as any);
    expect(domain.id).toBe("sla-1");
    expect(domain.caseId).toBe("c-1");
    expect(domain.entityType).toBe("TASK");
    expect(domain.clockType).toBe("TICKING");
    expect(domain.status).toBe("ACTIVE");
    expect(domain.startedAt.toISOString()).toBe("2026-07-09T12:00:00.000Z");
  });

  it("correctly maps database Escalation response to domain representation", () => {
    const raw = {
      id: "esc-1",
      case_id: "c-1",
      source_entity_type: "TASK",
      source_entity_id: "t-1",
      sla_instance_id: "sla-1",
      escalation_policy_id: "ep-1",
      current_level: 2,
      severity: "CRITICAL",
      escalation_type: "DEADLOCK",
      status: "TRIGGERED",
      root_cause_department: "water_supply",
      reason_code: "BLOCKER",
      reason_detail: "Blocked by dependency",
      first_escalated_at: "2026-07-09T12:00:00Z",
      last_escalated_at: "2026-07-09T12:00:00Z",
      acknowledged_by: "user-1",
      acknowledged_at: "2026-07-09T12:05:00Z",
      resolved_by: null,
      resolved_at: null,
      version: 1,
      created_at: "2026-07-09T12:00:00Z",
      updated_at: "2026-07-09T12:05:00Z",
    };

    const domain = slaService.mapEscalationResponse(raw as any);
    expect(domain.id).toBe("esc-1");
    expect(domain.severity).toBe("CRITICAL");
    expect(domain.escalationType).toBe("DEADLOCK");
    expect(domain.status).toBe("TRIGGERED");
    expect(domain.rootCauseDepartment).toBe("water_supply");
    expect(domain.acknowledgedAt?.toISOString()).toBe("2026-07-09T12:05:00.000Z");
  });

  it("correctly maps database Commissioner Intervention response to domain", () => {
    const raw = {
      id: "int-1",
      case_id: "c-1",
      escalation_id: "esc-1",
      intervention_type: "OVERRIDE_SEQUENCE",
      target_task_id: "t-1",
      target_department: "roads",
      initiated_by: "comm-1",
      reason: "Emergency override",
      instruction: "Do it now",
      previous_state: "BLOCKED",
      resulting_state: "IN_PROGRESS",
      status: "COMPLETED",
      created_at: "2026-07-09T12:00:00Z",
      completed_at: "2026-07-09T12:10:00Z",
    };

    const domain = slaService.mapInterventionResponse(raw as any);
    expect(domain.id).toBe("int-1");
    expect(domain.interventionType).toBe("OVERRIDE_SEQUENCE");
    expect(domain.previousState).toBe("BLOCKED");
    expect(domain.completedAt?.toISOString()).toBe("2026-07-09T12:10:00.000Z");
  });

  it("correctly maps database Task Blocker response to domain representation", () => {
    const raw = {
      id: "blk-1",
      case_id: "c-1",
      task_id: "t-1",
      blocker_type: "DEPENDENCY",
      blocking_department: "water_supply",
      external_reference: "leak-1",
      reason: "Water pipe leaking",
      status: "ACTIVE",
      declared_by: "user-1",
      declared_at: "2026-07-09T12:00:00Z",
      resolved_by: null,
      resolved_at: null,
    };

    const domain = slaService.mapBlockerResponse(raw as any);
    expect(domain.id).toBe("blk-1");
    expect(domain.blockerType).toBe("DEPENDENCY");
    expect(domain.blockingDepartment).toBe("water_supply");
    expect(domain.status).toBe("ACTIVE");
  });
});
