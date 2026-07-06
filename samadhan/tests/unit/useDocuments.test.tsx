import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDocuments } from "@/features/documents/hooks/useDocuments";
import { documentService } from "@/features/documents/services/documentService";

const mockUser = { id: "user-123", email: "citizen@samadhan.gov.in" };

// Mock useAuth hook
vi.mock("@/features/auth/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
  }),
}));

// Mock supabase client
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: () => ({
      on: () => ({
        subscribe: () => ({}),
      }),
    }),
    removeChannel: vi.fn(),
  },
}));

// Mock documentService
vi.mock("@/features/documents/services/documentService", () => ({
  documentService: {
    getLockerDetails: vi.fn().mockResolvedValue({
      totalFiles: 1,
      totalSizeMb: 1.5,
      documents: [
        { id: "doc-1", name: "Aadhaar Card", status: "verified", file_path: "user-123/aadhaar.pdf" }
      ],
    }),
    uploadAndAnalyze: vi.fn(),
    deleteDocument: vi.fn(),
  },
}));

describe("useDocuments Hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads locker details on initialization", async () => {
    const { result } = renderHook(() => useDocuments());

    // Initially loading is true
    expect(result.current.loading).toBe(true);

    // Wait for effect to resolve locker details
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.lockerDetails).not.toBeNull();
    expect(result.current.lockerDetails?.totalFiles).toBe(1);
    expect(result.current.lockerDetails?.documents[0].name).toBe("Aadhaar Card");
  });

  it("handles document upload and transitions progress steps", async () => {
    const { result } = renderHook(() => useDocuments());

    const mockFile = new File(["dummy content"], "pan.jpg", { type: "image/jpeg" });
    
    vi.mocked(documentService.uploadAndAnalyze).mockImplementation(
      async (userId, file, onProgress) => {
        onProgress("uploading");
        onProgress("reading");
        onProgress("extracting");
        onProgress("saving");
        onProgress("complete");
        return {} as any;
      }
    );

    await act(async () => {
      await result.current.uploadDocument(mockFile);
    });

    expect(documentService.uploadAndAnalyze).toHaveBeenCalledWith(
      "user-123",
      mockFile,
      expect.any(Function)
    );
  });

  it("performs deletion of selected document", async () => {
    const { result } = renderHook(() => useDocuments());

    await act(async () => {
      await result.current.deleteDocument("doc-1", "user-123/aadhaar.pdf");
    });

    expect(documentService.deleteDocument).toHaveBeenCalledWith(
      "doc-1",
      "user-123/aadhaar.pdf"
    );
  });
});
