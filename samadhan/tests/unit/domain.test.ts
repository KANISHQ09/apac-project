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
});
