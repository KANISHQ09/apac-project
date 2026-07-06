import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useReportIssue } from "@/features/issues/hooks/useReportIssue";
import { issueService } from "@/features/issues/services/issueService";

// Mock react-router-dom
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

// Mock useToast
vi.mock("@/shared/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Mock issueService
vi.mock("@/features/issues/services/issueService", () => ({
  issueService: {
    reportNewIssue: vi.fn(),
  },
}));

describe("useReportIssue Hook state management & submission", () => {
  const mockUser = { id: "user-123", email: "test@user.com" } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("holds location selection state and submits successfully", async () => {
    const { result } = renderHook(() => useReportIssue(mockUser, "en"));

    // 1. Manually update coordinates and address (simulates LocationPicker calling onChange)
    act(() => {
      result.current.setLocation("Gaur City, Delhi");
      result.current.setLatitude(28.6139);
      result.current.setLongitude(77.2090);
      result.current.setGeocodeStatus("success");
    });

    expect(result.current.location).toBe("Gaur City, Delhi");
    expect(result.current.latitude).toBe(28.6139);
    expect(result.current.longitude).toBe(77.2090);
    expect(result.current.geocodeStatus).toBe("success");

    // 2. Set other valid form fields
    act(() => {
      result.current.setTitle("Pothole on Main Road");
      result.current.setDescription("Large pothole causing traffic jams.");
      result.current.setSelectedCategory("roads");
    });

    // 3. Submit
    const preventDefault = vi.fn();
    await act(async () => {
      await result.current.handleSubmit({ preventDefault } as any);
    });

    // Verify reportNewIssue was called with selected coordinates and address
    expect(issueService.reportNewIssue).toHaveBeenCalledWith(
      "user-123",
      expect.objectContaining({
        title: "Pothole on Main Road",
        description: "Large pothole causing traffic jams.",
        category: "roads",
        location: "Gaur City, Delhi",
        latitude: 28.6139,
        longitude: 77.2090,
      }),
      null,
      "en"
    );
  });

  it("rejects files larger than 10MB in handleImageChange", async () => {
    const { result } = renderHook(() => useReportIssue(mockUser, "en"));
    const largeFile = new File(["a".repeat(11 * 1024 * 1024)], "too_large.jpg", { type: "image/jpeg" });
    
    const event = {
      target: {
        files: [largeFile],
      },
    } as any;

    await act(async () => {
      await result.current.handleImageChange(event);
    });

    expect(result.current.imagePreview).toBeNull();
  });
});
