import { describe, it, expect, vi, beforeEach } from "vitest";
import { analyzeFormDirect } from "../aiService";

describe("analyzeFormDirect", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects files above 10MB", async () => {
    const hugeFile = new File(["a".repeat(11 * 1024 * 1024)], "huge.pdf", { type: "application/pdf" });
    await expect(analyzeFormDirect(hugeFile)).rejects.toThrow("File size must be under 10MB");
  });

  it("rejects unsupported MIME types", async () => {
    const badFile = new File(["hello"], "document.txt", { type: "text/plain" });
    await expect(analyzeFormDirect(badFile)).rejects.toThrow("Only PDF, JPEG, PNG, or WebP files are accepted");
  });

  it("calls the correct endpoint and returns the result shape on success", async () => {
    // Mock File
    const mockFile = new File(["dummy file content"], "form.jpg", { type: "image/jpeg" });

    // Mock global fetch
    const mockResponse = {
      status: "success",
      form_code: "PMAY-U",
      form_name: "Pradhan Mantri Awas Yojana — Urban",
      confidence: 0.95,
      guidance: {
        summary: "This is a form for subsidized housing.",
        scheme_benefit: "Get up to 2.67 lakh subsidy.",
        eligibility: ["No permanent house", "Income below 18L"],
        required_documents: [{ name: "Aadhaar Card", details: "For identification" }],
        filling_steps: [{ step: 1, field: "Full Name", instruction: "Fill as in Aadhaar", example: "John Doe" }],
        submission: {
          where: "Local Municipal Office",
          online_portal: "https://pmaymis.gov.in",
          deadline: "December 2026",
          fee: "Free"
        },
        important_notes: ["House must be in woman's name or joint"]
      }
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as any);

    // Call service
    const result = await analyzeFormDirect(mockFile, "What are the rules?");

    // Assertions
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [callUrl, callInit] = fetchSpy.mock.calls[0];
    expect(callUrl).toContain("/functions/v1/analyze-form");
    expect(callInit?.method).toBe("POST");
    
    const parsedBody = JSON.parse(callInit?.body as string);
    expect(parsedBody.mimeType).toBe("image/jpeg");
    expect(parsedBody.userQuery).toBe("What are the rules?");
    
    expect(result.status).toBe("success");
    expect(result.form_code).toBe("PMAY-U");
    expect(result.guidance?.summary).toBe("This is a form for subsidized housing.");
  });
});
