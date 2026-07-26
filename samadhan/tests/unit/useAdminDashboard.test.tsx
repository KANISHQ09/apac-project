import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAdminDashboard } from "@/features/admin/hooks/useAdminDashboard";
import { adminService } from "@/features/admin/services/adminService";
import { supabase } from "@/integrations/supabase/client";
import { UserRole } from "@/shared/types/domain/UserRole";

// Mock react-router-dom
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

// Mock useToast
vi.mock("@/shared/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Mock adminService
vi.mock("@/features/admin/services/adminService", () => ({
  adminService: {
    fetchAllIssuesAdmin: vi.fn(),
  },
}));

// Mock supabase client
vi.mock("@/integrations/supabase/client", () => {
  const mockChannel = {
    on: vi.fn().mockImplementation(function (this: any) { return this; }),
    subscribe: vi.fn().mockImplementation(function (this: any) { return this; }),
    unsubscribe: vi.fn(),
  };

  return {
    supabase: {
      auth: {
        getSession: vi.fn(),
      },
      channel: vi.fn(() => mockChannel),
      removeChannel: vi.fn(),
    },
  };
});

describe("useAdminDashboard hook state, sequence, and timeout stability", () => {
  const mockUser = { id: "admin-123", email: "admin@samadhan.gov.in" } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("handles successful initial dashboard boot and loads issues", async () => {
    const mockIssues = [
      { id: "issue-1", title: "Water Line Leak", category: "Water Supply", status: "in_progress", leadDepartment: "water_supply" },
    ];
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: mockUser } },
      error: null,
    } as any);
    vi.mocked(adminService.fetchAllIssuesAdmin).mockResolvedValue(mockIssues as any);

    const { result } = renderHook(() =>
      useAdminDashboard(mockUser, false, "en", UserRole.DEPARTMENT_ADMIN, "water_supply")
    );

    // Initial loading is true
    expect(result.current.loading).toBe(true);

    // Let boot resolve
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.issues).toEqual(mockIssues);
  });

  it("handles critical database query timeout", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: mockUser } },
      error: null,
    } as any);

    // Query will hang (never resolves in the test timeframe)
    vi.mocked(adminService.fetchAllIssuesAdmin).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() =>
      useAdminDashboard(mockUser, false, "en", UserRole.DEPARTMENT_ADMIN, "water_supply", {
        queryTimeoutMs: 10,
        authTimeoutMs: 10,
      })
    );

    expect(result.current.loading).toBe(true);

    // Advance timers past the timeout
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toContain("Request timed out");
  });

  it("handles critical query failure", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: mockUser } },
      error: null,
    } as any);
    vi.mocked(adminService.fetchAllIssuesAdmin).mockRejectedValue(new Error("Database offline"));

    const { result } = renderHook(() =>
      useAdminDashboard(mockUser, false, "en", UserRole.DEPARTMENT_ADMIN, "water_supply")
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe("Database offline");
  });

  it("prevents stale/overlapping responses from corrupting state by deduplicating parallel requests", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: mockUser } },
      error: null,
    } as any);

    let callsCount = 0;
    let resolveFirst: any;

    const firstPromise = new Promise<any>((resolve) => { resolveFirst = resolve; });

    vi.mocked(adminService.fetchAllIssuesAdmin).mockImplementation(() => {
      callsCount++;
      if (callsCount === 1) {
        return Promise.resolve([]);
      } else {
        return firstPromise;
      }
    });

    const { result } = renderHook(() =>
      useAdminDashboard(mockUser, false, "en", UserRole.DEPARTMENT_ADMIN, "water_supply")
    );

    // Let boot resolve
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.loading).toBe(false);
    expect(callsCount).toBe(1);

    // Trigger request 1
    act(() => {
      result.current.refetch(true);
    });

    // Trigger request 2 (overlapping/duplicate)
    act(() => {
      result.current.refetch(true);
    });

    // Resolve request 1
    const firstData = [{ id: "issue-first", category: "Water Supply", leadDepartment: "water_supply" }];
    await act(async () => {
      resolveFirst(firstData);
      await vi.advanceTimersByTimeAsync(100);
    });

    // Fetch should only have been called twice total (1 for boot, 1 for refetch 1, refetch 2 reused refetch 1)
    expect(callsCount).toBe(2);
    expect(result.current.issues).toEqual(firstData);
  });

  it("handles duplicate auth SIGNED_IN events without hanging", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: mockUser } },
      error: null,
    } as any);
    vi.mocked(adminService.fetchAllIssuesAdmin).mockResolvedValue([]);

    const { result, rerender } = renderHook(
      ({ user }) => useAdminDashboard(user, false, "en", UserRole.DEPARTMENT_ADMIN, "water_supply"),
      { initialProps: { user: mockUser } }
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.loading).toBe(false);

    // Trigger duplicate event by changing the user instance reference
    const duplicateUser = { ...mockUser };
    await act(async () => {
      rerender({ user: duplicateUser });
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.loading).toBe(false);
  });

  it("handles component unmount cleanly and ignores subsequent promise resolutions", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: mockUser } },
      error: null,
    } as any);

    let resolveQuery: any;
    const pendingPromise = new Promise<any>((resolve) => { resolveQuery = resolve; });
    vi.mocked(adminService.fetchAllIssuesAdmin).mockReturnValue(pendingPromise);

    const { result, unmount } = renderHook(() =>
      useAdminDashboard(mockUser, false, "en", UserRole.DEPARTMENT_ADMIN, "water_supply")
    );

    expect(result.current.loading).toBe(true);

    // Unmount hook before promise resolves
    unmount();

    // Resolve the promise
    await act(async () => {
      resolveQuery([{ id: "late-resolved-issue" }]);
      await vi.advanceTimersByTimeAsync(100);
    });

    // The hook is unmounted and state updates are ignored safely without errors
  });

  it("handles window focus event and performs a non-blocking background refresh", async () => {
    const mockIssues = [
      { id: "issue-1", title: "Water Line Leak", category: "Water Supply", status: "in_progress", leadDepartment: "water_supply" },
    ];
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: mockUser } },
      error: null,
    } as any);
    vi.mocked(adminService.fetchAllIssuesAdmin).mockResolvedValue(mockIssues as any);

    const { result } = renderHook(() =>
      useAdminDashboard(mockUser, false, "en", UserRole.DEPARTMENT_ADMIN, "water_supply")
    );

    // Initial load
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.issues).toEqual(mockIssues);

    // Mock next fetch to fail
    vi.mocked(adminService.fetchAllIssuesAdmin).mockRejectedValue(new Error("Transient connection error"));

    // Simulate focus event
    await act(async () => {
      // Fast-forward fake time so rate limiter allows refetch (>10s)
      await vi.advanceTimersByTimeAsync(15000);
      window.dispatchEvent(new Event("focus"));
    });

    // Check that existing issues are preserved and fatal error is not set, but refreshError is set!
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.refreshError).toBe("Transient connection error");
    expect(result.current.issues).toEqual(mockIssues);
  });

  it("throttles duplicate focus events within 15 seconds", async () => {
    const mockIssues = [
      { id: "issue-1", title: "Water Line Leak", category: "Water Supply", status: "in_progress", leadDepartment: "water_supply" },
    ];
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: mockUser } },
      error: null,
    } as any);
    vi.mocked(adminService.fetchAllIssuesAdmin).mockResolvedValue(mockIssues as any);

    const { result } = renderHook(() =>
      useAdminDashboard(mockUser, false, "en", UserRole.DEPARTMENT_ADMIN, "water_supply")
    );

    // Initial load
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    
    // Clear mock calls
    vi.mocked(adminService.fetchAllIssuesAdmin).mockClear();

    // Trigger focus event (first time after 15s)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16000);
      window.dispatchEvent(new Event("focus"));
    });

    expect(adminService.fetchAllIssuesAdmin).toHaveBeenCalledTimes(1);
    vi.mocked(adminService.fetchAllIssuesAdmin).mockClear();

    // Trigger duplicate focus event immediately (throttled)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000); // Only 1s later
      window.dispatchEvent(new Event("focus"));
    });

    expect(adminService.fetchAllIssuesAdmin).not.toHaveBeenCalled();
  });

  it("deduplicates parallel loadIssues calls by reusing the active promise", async () => {
    const mockIssues = [
      { id: "issue-1", title: "Water Line Leak", category: "Water Supply", status: "in_progress", leadDepartment: "water_supply" },
    ];
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: mockUser } },
      error: null,
    } as any);
    
    let resolveQuery: any;
    const pendingPromise = new Promise<any>((resolve) => { resolveQuery = resolve; });
    vi.mocked(adminService.fetchAllIssuesAdmin).mockReturnValue(pendingPromise);

    const { result } = renderHook(() =>
      useAdminDashboard(mockUser, false, "en", UserRole.DEPARTMENT_ADMIN, "water_supply")
    );

    // Let boot complete and start the initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // We are currently in loading = true state and the fetch is pending.
    expect(result.current.loading).toBe(true);
    expect(adminService.fetchAllIssuesAdmin).toHaveBeenCalledTimes(1);

    // Call refetch in background twice simultaneously
    act(() => {
      result.current.refetch(false);
      result.current.refetch(false);
    });

    // The fetch repository should NOT have been called again because the active promise was reused
    expect(adminService.fetchAllIssuesAdmin).toHaveBeenCalledTimes(1);

    // Resolve the promise
    await act(async () => {
      resolveQuery(mockIssues);
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.issues).toEqual(mockIssues);
  });
});
