import { describe, it, expect } from "vitest";
import { issueService } from "@/features/issues/services/issueService";
import { IssueResponse } from "@/shared/contracts/IssueResponse";
import { IssueStatus } from "@/shared/types/domain/IssueStatus";

describe("Domain Mappers", () => {
  it("should correctly map IssueResponse to Issue domain model", () => {
    const rawResponse: IssueResponse = {
      id: "test-id-123",
      user_id: "user-id-456",
      title: "Pothole on Main Road",
      description: "A huge pothole blocking traffic",
      category: "roads",
      location: "Sector 5",
      latitude: null,
      longitude: null,
      status: "reported",
      image_urls: ["https://example.com/image.jpg"],
      supports_count: 5,
      created_at: "2026-06-10T12:00:00Z",
      updated_at: "2026-06-10T12:05:00Z",
    };

    const domainIssue = issueService.mapResponseToDomain(rawResponse);

    expect(domainIssue.id).toBe("test-id-123");
    expect(domainIssue.userId).toBe("user-id-456");
    expect(domainIssue.title).toBe("Pothole on Main Road");
    expect(domainIssue.description).toBe("A huge pothole blocking traffic");
    expect(domainIssue.category).toBe("roads");
    expect(domainIssue.location).toBe("Sector 5");
    expect(domainIssue.status).toBe(IssueStatus.REPORTED);
    expect(domainIssue.imageUrls).toEqual(["https://example.com/image.jpg"]);
    expect(domainIssue.supportsCount).toBe(5);
    expect(domainIssue.createdAt).toBeInstanceOf(Date);
  });

  it("should map stale pending AI status to failed and preserve fresh ones", () => {
    const now = Date.now();
    
    // 1. Stale issue response
    const staleResponse: IssueResponse = {
      id: "stale-id",
      user_id: "user-1",
      title: "Water pipe leaked",
      category: "Water Supply",
      status: "reported",
      created_at: new Date(now - 20000).toISOString(), // 20s ago
      ai_status: "pending",
    };
    const staleIssue = issueService.mapResponseToDomain(staleResponse);
    expect(staleIssue.aiStatus).toBe("failed");

    // 2. Fresh issue response
    const freshResponse: IssueResponse = {
      id: "fresh-id",
      user_id: "user-1",
      title: "Water pipe leaked",
      category: "Water Supply",
      status: "reported",
      created_at: new Date(now - 2000).toISOString(), // 2s ago
      ai_status: "pending",
    };
    const freshIssue = issueService.mapResponseToDomain(freshResponse);
    expect(freshIssue.aiStatus).toBe("pending");
  });
});
