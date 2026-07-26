import { describe, it, expect, vi, beforeEach } from "vitest";
import { handoffService } from "@/features/coordination/services/handoffService";

// Mock supabase
vi.mock("@/integrations/supabase/client", () => {
  const mockSingle = vi.fn().mockImplementation(() => Promise.resolve({ data: { id: "cr1", case_id: "c1", request_type: "ADD_DEPARTMENT", status: "PENDING" }, error: null }));
  return {
    supabase: {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => ({
            order: vi.fn().mockImplementation(() => Promise.resolve({ data: [], error: null })),
            single: vi.fn().mockImplementation(() => Promise.resolve({ data: { id: "cr1", case_id: "c1", request_type: "ADD_DEPARTMENT" }, error: null })),
          })),
        })),
        insert: vi.fn().mockImplementation(() => ({
          select: vi.fn().mockImplementation(() => ({
            single: mockSingle,
          })),
        })),
        update: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => ({
            select: vi.fn().mockImplementation(() => ({
              single: vi.fn().mockImplementation(() => Promise.resolve({ data: { id: "cr1", status: "APPROVED" }, error: null })),
            })),
          })),
        })),
      })),
      rpc: vi.fn().mockImplementation(() => Promise.resolve({ data: { id: "h1", handoff_status: "SUBMITTED" }, error: null })),
    },
  };
});

describe("handoffService unit tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("correctly maps database handoff response to domain representation", () => {
    const raw = {
      id: "h-123",
      case_id: "case-456",
      source_task_id: "t-1",
      target_task_id: "t-2",
      from_department: "water_supply",
      to_department: "roads",
      handoff_status: "SUBMITTED",
      revision_number: 1,
      submission_note: "Pipe leak repaired.",
      acceptance_note: null,
      rejection_reason: null,
      submitted_by: "user-1",
      submitted_at: "2026-07-09T12:00:00Z",
      reviewed_by: null,
      reviewed_at: null,
      supersedes_handoff_id: null,
      version: 1,
      created_at: "2026-07-09T12:00:00Z",
      updated_at: "2026-07-09T12:00:00Z",
    };

    const domain = handoffService.mapHandoffResponse(raw);
    expect(domain.id).toBe("h-123");
    expect(domain.caseId).toBe("case-456");
    expect(domain.sourceTaskId).toBe("t-1");
    expect(domain.targetTaskId).toBe("t-2");
    expect(domain.fromDepartment).toBe("water_supply");
    expect(domain.toDepartment).toBe("roads");
    expect(domain.handoffStatus).toBe("SUBMITTED");
    expect(domain.revisionNumber).toBe(1);
    expect(domain.submissionNote).toBe("Pipe leak repaired.");
  });

  it("correctly maps database evidence response to domain representation", () => {
    const raw = {
      id: "ev-1",
      handoff_id: "h-1",
      evidence_type: "PHOTO",
      storage_path: "path/to/evidence.jpg",
      public_url: "http://supabase.com/evidence.jpg",
      latitude: "26.12345",
      longitude: "78.54321",
      captured_at: "2026-07-09T12:00:00Z",
      uploaded_by: "user-1",
      metadata: null,
      checksum: null,
      created_at: "2026-07-09T12:00:00Z",
    };

    const domain = handoffService.mapEvidenceResponse(raw);
    expect(domain.id).toBe("ev-1");
    expect(domain.evidenceType).toBe("PHOTO");
    expect(domain.publicUrl).toBe("http://supabase.com/evidence.jpg");
    expect(domain.latitude).toBe(26.12345);
    expect(domain.longitude).toBe(78.54321);
  });

  it("correctly maps database coordination change request response", () => {
    const raw = {
      id: "cr-1",
      case_id: "case-1",
      requested_by: "user-1",
      requesting_department: "water_supply",
      request_type: "ADD_DEPARTMENT",
      proposed_department: "electricity",
      reason: "Exposed live cable found",
      status: "PENDING",
      reviewed_by: null,
      reviewed_at: null,
      resolution_note: null,
      created_at: "2026-07-09T12:00:00Z",
      updated_at: "2026-07-09T12:00:00Z",
    };

    const domain = handoffService.mapChangeRequestResponse(raw);
    expect(domain.id).toBe("cr-1");
    expect(domain.requestType).toBe("ADD_DEPARTMENT");
    expect(domain.proposedDepartment).toBe("electricity");
    expect(domain.reason).toBe("Exposed live cable found");
    expect(domain.status).toBe("PENDING");
  });
});
