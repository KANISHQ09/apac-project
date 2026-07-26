import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { ChangeRequestPanel } from "@/features/admin/components/ChangeRequestPanel";

// Mock supabase client integration statically to prevent actual API calls and configuration errors
vi.mock("@/integrations/supabase/client", () => {
  const mockSelect = vi.fn().mockReturnThis();
  const mockEq = vi.fn().mockReturnThis();
  const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null });
  const mockFrom = vi.fn().mockReturnValue({
    select: mockSelect,
    eq: mockEq,
    order: mockOrder,
  });
  return {
    supabase: {
      from: mockFrom,
    },
  };
});

// Mock coordination handoff service
vi.mock("@/features/coordination", () => ({
  handoffService: {
    mapChangeRequestResponse: (r: any) => r,
    mapTransferRequestResponse: (r: any) => r,
    createChangeRequest: vi.fn(),
    createTransferRequest: vi.fn(),
  },
}));

describe("ChangeRequestPanel Component Evaluation", () => {
  const mockIssue = {
    id: "case-123",
    title: "Water clogging issue",
    description: "Water clogging in main square",
    category: "water_supply",
    status: "in_progress",
    tasks: [
      {
        id: "task-1",
        title: "Isolate Water Valve",
        department: "water_supply",
        taskStatus: "READY",
        priority: "HIGH",
      },
    ],
  } as any;

  it("renders without ReferenceError or throwing require", async () => {
    let container: HTMLElement;
    
    await act(async () => {
      const renderResult = render(
        <ChangeRequestPanel
          issue={mockIssue}
          isSuperAdmin={false}
          userDepartment="water_supply"
          userId="user-admin-123"
          activeLanguage="en"
          onRefresh={() => {}}
        />
      );
      container = renderResult.container;
    });

    expect(container!).toBeDefined();

    // Wait for async state loading to finish to avoid un-acted state warnings
    await waitFor(() => {
      expect(screen.getByText(/Request Coordination Rerouting/i)).toBeInTheDocument();
    });
  });
});
