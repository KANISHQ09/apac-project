import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import AdminPage from "@/features/admin/pages/AdminPage";
import { UserRole } from "@/shared/types/domain/UserRole";
import { MemoryRouter } from "react-router-dom";

// 1. Mock useAuth
vi.mock("@/features/auth", () => ({
  useAuth: () => ({
    user: { id: "admin-123", email: "water@samadhan.gov.in" },
    loading: false,
    role: UserRole.DEPARTMENT_ADMIN,
    department: "water_supply",
  }),
}));

// 2. Mock useLanguage
vi.mock("@/app/providers/LanguageProvider", () => ({
  useLanguage: () => ({
    language: "en",
  }),
}));

// 3. Mock useAdminDashboard
const mockUpdateStatus = vi.fn();
const mockDeleteIssue = vi.fn();
const mockRefetch = vi.fn();

vi.mock("@/features/admin/hooks/useAdminDashboard", () => ({
  normalizeDepartmentKey: (key: string) => key,
  useAdminDashboard: () => ({
    isAdmin: true,
    userRole: UserRole.DEPARTMENT_ADMIN,
    userDepartment: "water_supply",
    filterDepartment: "water_supply",
    issues: [
      {
        id: "issue-1",
        title: "Main Water Leakage",
        description: "Large pipeline burst near market",
        category: "Water Supply",
        location: "Market Place",
        status: "in_progress",
        supportsCount: 15,
        createdAt: new Date(),
        dataOrigin: "seeded_demo",
        aiStatus: "done",
        aiModel: "nvidia/nemotron-3-nano-30b-a3be",
        coordinationType: "single_department",
        tasks: [],
        participations: [],
      },
    ],
    loading: false,
    error: null,
    updateStatus: mockUpdateStatus,
    deleteIssue: mockDeleteIssue,
    refetch: mockRefetch,
  }),
}));

// 4. Mock supabase client
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => Promise.resolve({ count: 0, error: null }),
          eq: () => Promise.resolve({ count: 0, error: null }),
          gte: () => ({
            lte: () => Promise.resolve({ count: 0, error: null }),
          }),
        }),
      }),
    }),
  },
}));

describe("AdminPage Runtime Mounting Test", () => {
  it("should mount the AdminPage component successfully without throwing ReferenceError or require errors", async () => {
    let container: HTMLElement;
    
    await act(async () => {
      const renderResult = render(
        <MemoryRouter>
          <AdminPage />
        </MemoryRouter>
      );
      container = renderResult.container;
    });

    expect(container!).toBeDefined();

    // Verify main components are present in DOM
    await waitFor(() => {
      expect(screen.getByText("Main Water Leakage")).toBeInTheDocument();
      expect(screen.getByText("Demo Issue")).toBeInTheDocument();
      expect(screen.getByText("Response plan ready")).toBeInTheDocument();
    });
  });
});
