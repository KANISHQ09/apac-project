import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getTimeAgo } from "@/shared/utils/time";

describe("getTimeAgo", () => {
  beforeEach(() => {
    // Mock system time to make time calculations deterministic
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-16T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return correct time ago in English", () => {
    const justNow = new Date("2026-06-16T11:59:00Z");
    const hoursAgo = new Date("2026-06-16T09:00:00Z");
    const daysAgo = new Date("2026-06-14T12:00:00Z");

    expect(getTimeAgo(justNow, "en")).toBe("Just now");
    expect(getTimeAgo(hoursAgo, "en")).toBe("3 hours ago");
    expect(getTimeAgo(daysAgo, "en")).toBe("2 days ago");
  });

  it("should return correct time ago in Hindi", () => {
    const justNow = new Date("2026-06-16T11:59:00Z");
    const hoursAgo = new Date("2026-06-16T09:00:00Z");
    const daysAgo = new Date("2026-06-14T12:00:00Z");

    expect(getTimeAgo(justNow, "hi")).toBe("अभी");
    expect(getTimeAgo(hoursAgo, "hi")).toBe("3 घंटे पहले");
    expect(getTimeAgo(daysAgo, "hi")).toBe("2 दिन पहले");
  });
});
