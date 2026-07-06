import { describe, it, expect, vi } from "vitest";
import { gamificationService } from "@/features/profile/services/gamificationService";
import { Issue } from "@/shared/types/domain/Issue";
import { IssueStatus } from "@/shared/types/domain/IssueStatus";

describe("gamificationService", () => {
  const mockIssues: Issue[] = [
    {
      id: "issue1",
      title: "Pothole on Main St",
      description: "Severe pothole causing traffic issues.",
      category: "Roads",
      location: "Indore, MP",
      latitude: 22.7196,
      longitude: 75.8577,
      status: IssueStatus.REPORTED,
      supportsCount: 2,
      createdAt: new Date("2026-06-25T10:00:00Z"),
      updatedAt: new Date("2026-06-25T10:00:00Z"),
      userId: "user123",
      mediaUrl: null,
      masterIssueId: null,
    },
    {
      id: "issue2",
      title: "Broken pipeline water leak",
      description: "Drinking water flooding the street.",
      category: "Water Supply",
      location: "Indore, MP",
      latitude: 22.7196,
      longitude: 75.8577,
      status: IssueStatus.RESOLVED,
      supportsCount: 5,
      createdAt: new Date("2026-06-20T10:00:00Z"),
      updatedAt: new Date("2026-06-21T10:00:00Z"),
      userId: "user123",
      mediaUrl: null,
      masterIssueId: null,
    }
  ];

  const mockSupported: Issue[] = [
    {
      id: "issue3",
      title: "Garbage pile in park",
      description: "Debris accumulating in sector D.",
      category: "Sanitation",
      location: "Indore, MP",
      latitude: 22.7196,
      longitude: 75.8577,
      status: IssueStatus.IN_PROGRESS,
      supportsCount: 15,
      createdAt: new Date("2026-06-28T10:00:00Z"),
      updatedAt: new Date("2026-06-28T10:00:00Z"),
      userId: "other_user",
      mediaUrl: null,
      masterIssueId: null,
    }
  ];

  it("calculates XP and level progress correctly", () => {
    // 2 reported (200 XP), 1 resolved (+150 XP), 1 supported (+25 XP), 0 votes (0 XP)
    // Total XP = 375 XP
    // Level = Math.floor(375 / 300) + 1 = 2
    // Current level XP = 375 % 300 = 75 XP
    const progress = gamificationService.computeProgress(mockIssues, mockSupported);

    expect(progress.xp).toBe(375);
    expect(progress.level).toBe(2);
    expect(progress.currentLevelXp).toBe(75);
    expect(progress.xpProgressPercent).toBe(25);
    expect(progress.impactScore).toBe(37); // (2*10) + (1*2) + (0*5) + (1*15) = 37
  });

  it("unlocks category-based achievements accurately", () => {
    const progress = gamificationService.computeProgress(mockIssues, mockSupported);

    // "first_report" should be unlocked
    const firstReport = progress.achievements.find(a => a.id === "first_report");
    expect(firstReport?.unlocked).toBe(true);

    // "road_guardian" should be unlocked since issue1 is in category "Roads"
    const roadGuardian = progress.achievements.find(a => a.id === "road_guardian");
    expect(roadGuardian?.unlocked).toBe(true);

    // "water_warrior" should be unlocked since issue2 is in category "Water Supply"
    const waterWarrior = progress.achievements.find(a => a.id === "water_warrior");
    expect(waterWarrior?.unlocked).toBe(true);

    // "clean_city" should be locked because mockIssues doesn't contain category "Sanitation"
    // (Sanitation is in supported issues, but clean_city achievement requires the user to *report* it)
    const cleanCity = progress.achievements.find(a => a.id === "clean_city");
    expect(cleanCity?.unlocked).toBe(false);
  });

  it("calculates contribution streak correctly", () => {
    const streakData = gamificationService.calculateStreak(mockIssues);
    // last issue reported is on 2026-06-25, which is within 2 weeks.
    // issue2 is on 2026-06-20, which is in the same/consecutive week range.
    expect(streakData.streakCount).toBeGreaterThanOrEqual(1);
    expect(streakData.lastContributionDate).toBe(new Date("2026-06-25T10:00:00Z").toLocaleDateString());
  });

  it("generates leaderboard and inserts current user in sorted rank order", () => {
    const progress = gamificationService.computeProgress(mockIssues, mockSupported); // Impact: 37
    const leaderboard = gamificationService.getDemoLeaderboard(progress, "Test User");

    // Rajesh (145), Priya (98), Amit (62), Test User (37), Sunita (28)
    const currentUserEntry = leaderboard.find(e => e.isCurrentUser);
    expect(currentUserEntry).toBeDefined();
    expect(currentUserEntry?.rank).toBe(4); // Test User (37) should rank 4th, ahead of Sunita (28)
  });

  it("dispatches gamification_updated custom event correctly", () => {
    const spy = vi.fn();
    window.addEventListener("gamification_updated", spy);
    gamificationService.dispatchGamificationUpdate();
    expect(spy).toHaveBeenCalled();
    window.removeEventListener("gamification_updated", spy);
  });
});
