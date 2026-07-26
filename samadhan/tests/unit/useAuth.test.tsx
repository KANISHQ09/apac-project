import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/features/auth/hooks/useAuth";
import { adminService } from "@/features/admin/services/adminService";
import { authService } from "@/features/auth/services/authService";
import { UserRole } from "@/shared/types/domain/UserRole";

// Mock authService
vi.mock("@/features/auth/services/authService", () => ({
  authService: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({
      unsubscribe: vi.fn(),
    })),
    signIn: vi.fn(),
    signOut: vi.fn(),
  },
}));

// Mock adminService
vi.mock("@/features/admin/services/adminService", () => ({
  adminService: {
    getUserRole: vi.fn(),
  },
}));

describe("AuthProvider State Machine & Decoupled Role Loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

  it("settles to SIGNED_OUT when no session is found", async () => {
    vi.mocked(authService.getSession).mockResolvedValue(null);
    let authCallback: any;
    vi.mocked(authService.onAuthStateChange).mockImplementation((cb: any) => {
      authCallback = cb;
      return { unsubscribe: vi.fn() } as any;
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.status).toBe("BOOTSTRAPPING");
    expect(result.current.loading).toBe(true);

    // Simulate INITIAL_SESSION callback
    await act(async () => {
      await authCallback("INITIAL_SESSION", null);
    });

    expect(result.current.status).toBe("SIGNED_OUT");
    expect(result.current.loading).toBe(false);
    expect(result.current.roleLoading).toBe(false);
  });

  it("settles to SIGNED_IN and resolves role for valid session", async () => {
    const mockUser = { id: "user-123", email: "user@samadhan.gov.in" };
    const mockSession = { user: mockUser };
    
    vi.mocked(authService.getSession).mockResolvedValue(mockSession as any);
    
    let resolveUserRole: any;
    const userRolePromise = new Promise<any>((resolve) => {
      resolveUserRole = resolve;
    });
    vi.mocked(adminService.getUserRole).mockReturnValue(userRolePromise);

    let authCallback: any;
    vi.mocked(authService.onAuthStateChange).mockImplementation((cb: any) => {
      authCallback = cb;
      return { unsubscribe: vi.fn() } as any;
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.status).toBe("BOOTSTRAPPING");

    // Simulate INITIAL_SESSION callback
    act(() => {
      authCallback("INITIAL_SESSION", mockSession);
    });
    await vi.runAllTimersAsync();

    // Core auth should settle immediately
    expect(result.current.status).toBe("SIGNED_IN");
    expect(result.current.loading).toBe(false);
    expect(result.current.roleLoading).toBe(true); // Role loading in background

    // Now resolve the role query
    await act(async () => {
      resolveUserRole({
        role: UserRole.USER,
        department: null,
      });
    });
    await vi.runAllTimersAsync();

    expect(result.current.roleLoading).toBe(false);
    expect(result.current.role).toBe(UserRole.USER);
  });

  it("handles getSession failure gracefully and stops loading", async () => {
    vi.mocked(authService.getSession).mockRejectedValue(new Error("Network Error"));
    vi.mocked(authService.onAuthStateChange).mockReturnValue({ unsubscribe: vi.fn() } as any);

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Advance past watchdog timer which forces getSession
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(result.current.status).toBe("ERROR");
    expect(result.current.loading).toBe(false);
    expect(result.current.roleLoading).toBe(false);
  });

  it("handles TOKEN_REFRESHED events silently for the same user identity", async () => {
    const mockUser = { id: "user-123", email: "user@samadhan.gov.in" };
    const mockSession = { user: mockUser };
    
    vi.mocked(authService.getSession).mockResolvedValue(mockSession as any);
    vi.mocked(adminService.getUserRole).mockResolvedValue({
      role: UserRole.USER,
      department: null,
    });

    let authCallback: any;
    vi.mocked(authService.onAuthStateChange).mockImplementation((cb: any) => {
      authCallback = cb;
      return { unsubscribe: vi.fn() } as any;
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await authCallback("INITIAL_SESSION", mockSession);
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.status).toBe("SIGNED_IN");
    expect(result.current.roleLoading).toBe(false);

    // Trigger TOKEN_REFRESHED event
    await act(async () => {
      await authCallback("TOKEN_REFRESHED", { user: mockUser, access_token: "new-token" });
    });

    // Loading states and role must remain untouched
    expect(result.current.status).toBe("SIGNED_IN");
    expect(result.current.loading).toBe(false);
    expect(result.current.roleLoading).toBe(false);
    expect(result.current.role).toBe(UserRole.USER);
  });
});
