import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, renderHook } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/features/auth/hooks/useAuth";
import { adminService } from "@/features/admin/services/adminService";
import { authService } from "@/features/auth/services/authService";
import { AdminGuard } from "@/app/routes/guards/AdminGuard";
import { CitizenGuard } from "@/app/routes/guards/CitizenGuard";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { UserRole } from "@/shared/types/domain/UserRole";

// Mock authService
vi.mock("@/features/auth/services/authService", () => ({
  authService: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({
      unsubscribe: vi.fn(),
    })),
    signOut: vi.fn(),
  },
}));

// Mock adminService
vi.mock("@/features/admin/services/adminService", () => ({
  adminService: {
    getUserRole: vi.fn(),
  },
}));

describe("Authentication Hydration & Role Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("should start with loading = true and resolve when session & role are fetched", async () => {
    const mockSession = { user: { id: "user-admin", email: "admin@samadhan.gov.in" } };
    vi.mocked(authService.getSession).mockResolvedValue(mockSession as any);
    vi.mocked(adminService.getUserRole).mockResolvedValue({
      role: UserRole.DEPARTMENT_ADMIN,
      department: "water_supply",
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Initial state
    expect(result.current.loading).toBe(true);

    // Wait for resolution
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user?.id).toBe("user-admin");
    expect(result.current.role).toBe(UserRole.DEPARTMENT_ADMIN);
    expect(result.current.department).toBe("water_supply");

    // Local storage should be updated
    const cached = localStorage.getItem("samadhan_role_data_user-admin");
    expect(cached).toBeDefined();
    expect(JSON.parse(cached!)).toEqual({
      role: UserRole.DEPARTMENT_ADMIN,
      department: "water_supply",
    });
  });

  it("should load role synchronously from cache if present, preventing layout flash", async () => {
    const mockSession = { user: { id: "user-cached", email: "cached@samadhan.gov.in" } };
    vi.mocked(authService.getSession).mockResolvedValue(mockSession as any);
    vi.mocked(adminService.getUserRole).mockResolvedValue({
      role: UserRole.DEPARTMENT_ADMIN,
      department: "water_supply",
    });

    // Populate cache beforehand
    localStorage.setItem(
      "samadhan_role_data_user-cached",
      JSON.stringify({ role: UserRole.DEPARTMENT_ADMIN, department: "water_supply" })
    );

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.role).toBe(UserRole.DEPARTMENT_ADMIN);
    });
    expect(result.current.loading).toBe(false);
  });

  it("should redirect admin user away from citizen page in CitizenGuard", async () => {
    const mockSession = { user: { id: "user-admin", email: "admin@samadhan.gov.in" } };
    
    vi.mocked(authService.getSession).mockResolvedValue(mockSession as any);
    
    const testHookResult = {
      user: mockSession.user,
      role: UserRole.DEPARTMENT_ADMIN,
      department: "water_supply",
      loading: false,
      signOut: vi.fn(),
      session: mockSession,
    };

    const useAuthSpy = vi.spyOn(await import("@/features/auth/hooks/useAuth"), "useAuth");
    useAuthSpy.mockReturnValue(testHookResult as any);

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <CitizenGuard>
                <div>Citizen Content</div>
              </CitizenGuard>
            }
          />
          <Route path="/admin" element={<div>Admin Ops Panel</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Should redirect to admin operations page
    expect(screen.queryByText("Citizen Content")).toBeNull();
    expect(screen.getByText("Admin Ops Panel")).toBeInTheDocument();
  });
});
